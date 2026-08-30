import Link from "next/link";
import type { Account } from "@prisma/client";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { serializeAccount, serializeMenuItem, type AccountView } from "@/lib/serialize";
import { stripeConfigured } from "@/lib/env";
import { parseCheckoutResult, type CheckoutResult } from "@/lib/billing-ui";
import { Card, PageHeader } from "@/components/ui";
import { BusinessBasicsForm } from "@/components/forms/business-basics-form";
import { HoursForm } from "@/components/forms/hours-form";
import { MenuPoliciesForm } from "@/components/forms/menu-policies-form";
import { ReservationSettingsForm } from "@/components/forms/reservation-settings-form";
import { VoiceForm } from "@/components/forms/voice-form";
import { PhoneStep } from "@/components/forms/phone-step";
import { PaymentStep } from "@/components/forms/payment-step";
import { PortalButton } from "@/components/forms/billing-buttons";
import { InvoicesCard } from "@/components/billing-invoices";
import { AccountActions } from "@/components/account-actions";
import { Reveal } from "@/components/reveal";
import { getGoogleCalendarView } from "@/lib/google-calendar-view";

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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; checkout?: string; google?: string; message?: string }> }) {
  const { account } = await requireAccount();
  const { tab: tabParam, checkout, google: googleStatus, message: googleMessage } = await searchParams;
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
            <ReservationSettingsForm account={view} mode="settings" google={await getGoogleCalendarView(account.id)} googleStatus={googleStatus} googleMessage={googleMessage} />
          </Card>
        ) : null}

        {tab === "voice" ? (
          <Card title="Voice & greeting">
            <VoiceForm account={view} mode="settings" />
          </Card>
        ) : null}

        {tab === "phone" ? <PhoneStep account={view} mode="settings" /> : null}

        {tab === "billing" ? <BillingTab account={account} view={view} checkout={parseCheckoutResult(checkout)} /> : null}
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

async function BillingTab({ account, view, checkout }: { account: Account; view: AccountView; checkout: CheckoutResult }) {
  return (
    <div className="space-y-4">
      <PaymentStep account={view} mode="settings" checkout={checkout} />
      <Card title="Billing portal">
        <p className="text-sm text-gray-500">Update your card, download invoices, or cancel from the Stripe billing portal.</p>
        <div className="mt-3">
          <PortalButton disabled={!stripeConfigured() || !account.stripeCustomerId} />
        </div>
      </Card>
      <InvoicesCard customerId={account.stripeCustomerId} timeZone={account.timeZone} />
      <Card title="Account">
        <AccountActions restaurantName={account.restaurantName} />
      </Card>
    </div>
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
