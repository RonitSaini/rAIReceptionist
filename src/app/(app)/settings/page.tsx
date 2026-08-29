import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { serializeAccount, serializeMenuItem } from "@/lib/serialize";
import { humanize } from "@/lib/constants";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { BusinessBasicsForm } from "@/components/forms/business-basics-form";
import { HoursForm } from "@/components/forms/hours-form";
import { MenuPoliciesForm } from "@/components/forms/menu-policies-form";
import { ReservationSettingsForm } from "@/components/forms/reservation-settings-form";
import { VoiceForm } from "@/components/forms/voice-form";
import { PhoneStep } from "@/components/forms/phone-step";
import { PaymentStep } from "@/components/forms/payment-step";
import { SignOutButton } from "@/components/sign-out-button";
import { Reveal } from "@/components/reveal";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "business", label: "Business" },
  { key: "hours", label: "Hours" },
  { key: "menu", label: "Menu & policies" },
  { key: "reservations", label: "Reservations" },
  { key: "voice", label: "Voice" },
  { key: "phone", label: "Phone" },
  { key: "billing", label: "Billing" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { account } = await requireAccount();
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "business";
  const view = serializeAccount(account);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Everything your AI host knows about your restaurant." />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/settings?tab=${t.key}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === t.key ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-surface text-gray-700"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <Reveal key={tab} className={tab === "voice" ? "mx-auto max-w-6xl" : "mx-auto max-w-2xl 2xl:max-w-3xl"}>
        {tab === "business" ? (
          <Card title="Business basics">
            <BusinessBasicsForm account={view} mode="settings" />
          </Card>
        ) : null}

        {tab === "hours" ? <HoursTab accountId={account.id} view={view} /> : null}

        {tab === "menu" ? <MenuTab accountId={account.id} view={view} /> : null}

        {tab === "reservations" ? (
          <Card title="Reservation book">
            <ReservationSettingsForm account={view} mode="settings" googleConnected={false} />
          </Card>
        ) : null}

        {tab === "voice" ? (
          <Card title="Voice & greeting">
            <VoiceForm account={view} mode="settings" />
          </Card>
        ) : null}

        {tab === "phone" ? <PhoneStep account={view} mode="settings" /> : null}

        {tab === "billing" ? (
          <div className="space-y-4">
            <PaymentStep account={view} mode="settings" />
            <Card title="Billing portal">
              <p className="text-sm text-gray-500">Update your card, download invoices, or cancel from the Stripe billing portal.</p>
              <div className="mt-3 flex items-center gap-3">
                <Button type="button" variant="secondary" disabled>
                  Open billing portal (coming soon)
                </Button>
                <Badge tone={account.subscriptionStatus === "active" ? "green" : "gray"}>{humanize(account.subscriptionStatus)}</Badge>
              </div>
            </Card>
            <Card title="Account">
              <SignOutButton className="font-semibold text-red-600" />
            </Card>
          </div>
        ) : null}
      </Reveal>
    </div>
  );
}

async function HoursTab({ accountId, view }: { accountId: string; view: ReturnType<typeof serializeAccount> }) {
  const [hours, manager] = await Promise.all([
    prisma.businessHours.findMany({ where: { accountId }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] }),
    prisma.managerAvailability.findMany({ where: { accountId }, orderBy: { dayOfWeek: "asc" } }),
  ]);
  return (
    <Card title="Hours & escalation">
      <HoursForm account={view} hours={hours} managerHours={manager} mode="settings" />
    </Card>
  );
}

async function MenuTab({ accountId, view }: { accountId: string; view: ReturnType<typeof serializeAccount> }) {
  const items = await prisma.menuItem.findMany({ where: { accountId }, orderBy: { sortOrder: "asc" } });
  return (
    <Card title="Menu & policies">
      <MenuPoliciesForm account={view} menu={items.map(serializeMenuItem)} mode="settings" />
    </Card>
  );
}
