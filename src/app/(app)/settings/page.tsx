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
import { GoogleCalendarCard } from "@/components/google-calendar-card";
import { VoiceForm } from "@/components/forms/voice-form";
import { PhoneStep } from "@/components/forms/phone-step";
import { PaymentStep } from "@/components/forms/payment-step";
import { PortalButton } from "@/components/forms/billing-buttons";
import { InvoicesCard } from "@/components/billing-invoices";
import { AccountActions } from "@/components/account-actions";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/forms/account-credentials";
import { SegmentedLinks } from "@/components/segmented-links";
import { getGoogleCalendarView } from "@/lib/google-calendar-view";
import { calendarBlurbFor } from "@/lib/calendar-sync-ui";
import { verticalFor } from "@/verticals";
import { serializeServiceOffering } from "@/lib/serialize";
import { ServiceAreaForm } from "@/components/forms/service-area-form";
import { ServicesForm } from "@/components/forms/services-form";
import { EmergenciesForm } from "@/components/forms/emergencies-form";
import { DispatchForm } from "@/components/forms/dispatch-form";
import { ShopHandoffForm } from "@/components/forms/shop-handoff-form";

export const metadata = { title: "Settings" };

const RESTAURANT_TABS = [
  { key: "business", label: "Business" },
  { key: "hours", label: "Hours" },
  { key: "menu", label: "Menu & policies" },
  { key: "reservations", label: "Reservations" },
  { key: "voice", label: "Voice" },
  { key: "phone", label: "Phone" },
  { key: "billing", label: "Billing" },
  { key: "account", label: "Account" },
] as const;

/**
 * A trade has no menu and no reservation book; it has a patch it will drive to, a price list and
 * a definition of what counts as an emergency. Same three settings the onboarding steps collect,
 * reachable again afterwards - which is the whole point of Settings.
 */
const SHOP_TABS = [
  { key: "business", label: "Business" },
  { key: "hours", label: "Hours" },
  { key: "services", label: "Services & pricing" },
  { key: "handoffs", label: "Urgent & referrals" },
  { key: "calendar", label: "Calendar" },
  { key: "voice", label: "Voice" },
  { key: "phone", label: "Phone" },
  { key: "billing", label: "Billing" },
  { key: "account", label: "Account" },
] as const;

const FIELD_SERVICE_TABS = [
  { key: "business", label: "Business" },
  { key: "hours", label: "Hours" },
  { key: "area", label: "Service area" },
  { key: "dispatch", label: "Dispatch" },
  { key: "services", label: "Services & pricing" },
  { key: "emergencies", label: "Emergencies" },
  { key: "calendar", label: "Calendar" },
  { key: "voice", label: "Voice" },
  { key: "phone", label: "Phone" },
  { key: "billing", label: "Billing" },
  { key: "account", label: "Account" },
] as const;

type TabKey = (typeof RESTAURANT_TABS)[number]["key"] | (typeof FIELD_SERVICE_TABS)[number]["key"] | (typeof SHOP_TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; checkout?: string; google?: string; message?: string }> }) {
  const { account, userId } = await requireAccount();
  const { tab: tabParam, checkout, google: googleStatus, message: googleMessage } = await searchParams;
  const definition = verticalFor(account);
  // Dispatch settings only exist for a trade that dispatches. A plumber's tab list is unchanged.
  const TABS: readonly { key: TabKey; label: string }[] =
    definition.archetype === "restaurant"
      ? RESTAURANT_TABS
      : definition.archetype === "shop_appointment"
        ? SHOP_TABS
        : FIELD_SERVICE_TABS.filter((t) => t.key !== "dispatch" || definition.dispatchFirst);
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "business";
  const view = serializeAccount(account);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle={`Everything your AI host knows about your ${definition.vocabulary.business.one}.`} />

      <SegmentedLinks
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        itemClass="shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold"
        activeClass="border-brand-600 bg-brand-600 text-white"
        inactiveClass="border-gray-300 bg-surface text-gray-700"
        items={TABS.map((t) => ({ key: t.key, href: `/settings?tab=${t.key}`, label: t.label, active: tab === t.key }))}
      />

      <div className={tab === "voice" ? "mx-auto max-w-6xl" : "mx-auto max-w-2xl 2xl:max-w-3xl"}>
        {tab === "business" ? (
          <Card title="Business basics">
            <BusinessBasicsForm account={view} mode="settings" />
          </Card>
        ) : null}

        {tab === "hours" ? <HoursTab accountId={account.id} /> : null}

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

        {tab === "area" ? (
          <Card title="Service area">
            <ServiceAreaForm account={view} mode="settings" />
          </Card>
        ) : null}

        {tab === "dispatch" ? (
          <Card title="Dispatch & response">
            <DispatchForm
              account={view}
              defaultResponse={null}
              defaultAckMinutes={verticalFor(account).ackMinutes ?? 10}
              defaultUnacknowledged={verticalFor(account).smsTemplates.unacknowledged?.(account).replace(`${account.businessName}: `, "") ?? ""}
              mode="settings"
            />
          </Card>
        ) : null}

        {tab === "handoffs" ? (
          <Card title="Urgent cases & referrals">
            <ShopHandoffForm
              account={view}
              emergencyTypes={definition.emergencyTypes}
              referral={definition.referral!}
              defaultSlotMinutes={definition.defaults.slotMinutes}
              mode="settings"
            />
          </Card>
        ) : null}

        {tab === "services" ? <ServicesTab accountId={account.id} view={view} /> : null}

        {tab === "emergencies" ? (
          <Card title="Emergencies">
            <EmergenciesForm account={view} emergencyTypes={verticalFor(account).emergencyTypes} defaultSlotMinutes={verticalFor(account).defaults.slotMinutes} mode="settings" />
          </Card>
        ) : null}

        {tab === "calendar" ? (
          <Card title="Connected calendar">
            <GoogleCalendarCard
              google={await getGoogleCalendarView(account.id)}
              googleStatus={googleStatus}
              googleMessage={googleMessage}
              returnTo="/settings?tab=calendar"
              itemsLabel={definition.vocabulary.booking.many}
              blurb={calendarBlurbFor(definition.archetype)}
            />
          </Card>
        ) : null}

        {tab === "phone" ? <PhoneStep account={view} mode="settings" /> : null}

        {tab === "billing" ? <BillingTab account={account} view={view} checkout={parseCheckoutResult(checkout)} /> : null}

        {tab === "account" ? <AccountTab userId={userId} businessName={account.businessName} /> : null}
      </div>
    </div>
  );
}

async function HoursTab({ accountId }: { accountId: string }) {
  const hours = await prisma.businessHours.findMany({ where: { accountId }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] });
  return (
    <Card title="Hours">
      <HoursForm hours={hours} mode="settings" />
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
    </div>
  );
}

/** Login credentials + the delete-account action. The credential forms only render for password logins. */
async function AccountTab({ userId, businessName }: { userId: string; businessName: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  const hasPassword = Boolean(user?.passwordHash);
  return (
    <div className="space-y-4">
      {user && hasPassword ? (
        <>
          <Card title="Email">
            <p className="mb-3 text-sm text-gray-500">You log in as {user.email}.</p>
            <ChangeEmailForm />
          </Card>
          <Card title="Password">
            <ChangePasswordForm />
          </Card>
        </>
      ) : (
        <Card title="Login">
          <p className="text-sm text-gray-500">
            You sign in with Google{user ? ` (${user.email})` : ""}. Your email and password are managed in your Google account, so there is nothing to change here.
          </p>
        </Card>
      )}
      <Card title="Delete account">
        <AccountActions businessName={businessName} />
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

async function ServicesTab({ accountId, view }: { accountId: string; view: AccountView }) {
  const services = await prisma.serviceOffering.findMany({ where: { accountId }, orderBy: { sortOrder: "asc" } });
  return (
    <Card title="Services & pricing">
      <ServicesForm account={view} services={services.map(serializeServiceOffering)} mode="settings" />
    </Card>
  );
}
