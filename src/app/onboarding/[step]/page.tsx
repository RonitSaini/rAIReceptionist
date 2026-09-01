import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAccount } from "@/lib/current-account";
import { hasAcceptedCurrentTerms } from "@/lib/terms-acceptance";
import { serializeAccount, serializeMenuItem, serializeServiceOffering } from "@/lib/serialize";
import { MAX_ONBOARDING_STEPS, VERTICAL_CATALOG, onboardingStepsFor, verticalFor } from "@/verticals";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { getGoogleCalendarView } from "@/lib/google-calendar-view";
import { CreateAccountForm } from "@/components/forms/create-account-form";
import { BusinessBasicsForm } from "@/components/forms/business-basics-form";
import { HoursForm } from "@/components/forms/hours-form";
import { MenuPoliciesForm } from "@/components/forms/menu-policies-form";
import { ReservationSettingsForm } from "@/components/forms/reservation-settings-form";
import { VoiceForm } from "@/components/forms/voice-form";
import { PhoneStep } from "@/components/forms/phone-step";
import { PaymentStep, parseCheckoutResult } from "@/components/forms/payment-step";
import { ServiceAreaForm } from "@/components/forms/service-area-form";
import { ServicesForm } from "@/components/forms/services-form";
import { EmergenciesForm } from "@/components/forms/emergencies-form";
import { DispatchForm } from "@/components/forms/dispatch-form";
import { ShopHandoffForm } from "@/components/forms/shop-handoff-form";

export const metadata = { title: "Setup" };

export default async function OnboardingStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ checkout?: string; google?: string; message?: string }> }) {
  const { step: stepParam } = await params;
  const { google: googleStatus, message: googleMessage } = await searchParams;
  const step = Number.parseInt(stepParam, 10);
  if (!Number.isInteger(step) || step < 1 || step > MAX_ONBOARDING_STEPS) notFound();

  // Step 1 is only for signed-in users who don't have an Account yet (e.g. Google sign-up).
  if (step === 1) {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");
    // Ask for consent here only when there is none on file: a Google user who signed in from the
    // login page never passed a checkbox, and the (app) re-consent interstitial cannot reach them
    // because they have no account yet.
    const [user, accepted] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { accountId: true } }),
      hasAcceptedCurrentTerms(session.user.id),
    ]);
    if (user?.accountId) redirect("/onboarding/2");
    return (
      <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
        <OnboardingProgress step={1} />
        <CreateAccountForm catalog={VERTICAL_CATALOG} needsTerms={!accepted} />
      </div>
    );
  }

  const { account } = await requireAccount();
  const view = serializeAccount(account);

  // The step NUMBER is only a position in this vertical's ordered list; the step ID decides what
  // renders. A restaurant's list is unchanged, so its numbering is exactly what it always was.
  const steps = onboardingStepsFor(account);
  const stepDef = steps[step - 1];
  if (!stepDef) notFound();
  const progress = <OnboardingProgress step={step} vertical={account.vertical} />;

  // Back goes to the previous position in THIS vertical's list, which is the only thing a step
  // number means. The steps used to name their own back link as a literal ("/onboarding/4"), which
  // was wrong for every profession whose list is ordered differently — a vet's Appointments step
  // linked back to itself, and voice, emergencies and payment all pointed a step short for the
  // trades. Step 2 gets none: step 1 created the account and redirects straight back here.
  const backHref = step > 2 ? `/onboarding/${step - 1}` : undefined;
  const nextHref = step < steps.length ? `/onboarding/${step + 1}` : undefined;

  switch (stepDef.id) {
    case "business-basics":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <BusinessBasicsForm account={view} mode="onboarding" />
        </div>
      );
    case "hours": {
      const hours = await prisma.businessHours.findMany({ where: { accountId: account.id }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <HoursForm hours={hours} mode="onboarding" backHref={backHref} nextHref={nextHref} />
        </div>
      );
    }
    case "menu-policies": {
      const items = await prisma.menuItem.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <MenuPoliciesForm account={view} menu={items.map(serializeMenuItem)} mode="onboarding" backHref={backHref} />
        </div>
      );
    }
    case "reservations":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ReservationSettingsForm account={view} mode="onboarding" google={await getGoogleCalendarView(account.id)} googleStatus={googleStatus} googleMessage={googleMessage} backHref={backHref} />
        </div>
      );
    case "service-area":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ServiceAreaForm account={view} mode="onboarding" backHref={backHref} />
        </div>
      );
    case "services": {
      const services = await prisma.serviceOffering.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ServicesForm account={view} services={services.map(serializeServiceOffering)} mode="onboarding" backHref={backHref} />
        </div>
      );
    }
    case "appointments": {
      const services = await prisma.serviceOffering.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ServicesForm account={view} services={services.map(serializeServiceOffering)} mode="onboarding" backHref={backHref} />
        </div>
      );
    }
    case "handoffs":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ShopHandoffForm
            account={view}
            emergencyTypes={verticalFor(account).emergencyTypes}
            referral={verticalFor(account).referral!}
            defaultSlotMinutes={verticalFor(account).defaults.slotMinutes}
            mode="onboarding"
            backHref={backHref}
          />
        </div>
      );
    case "dispatch":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <DispatchForm
            account={view}
            defaultResponse={null}
            defaultAckMinutes={verticalFor(account).ackMinutes ?? 5}
            defaultUnacknowledged={verticalFor(account).smsTemplates.unacknowledged?.(account).replace(`${account.businessName}: `, "") ?? ""}
            mode="onboarding"
            backHref={backHref}
          />
        </div>
      );
    case "emergencies":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <EmergenciesForm account={view} emergencyTypes={verticalFor(account).emergencyTypes} defaultSlotMinutes={verticalFor(account).defaults.slotMinutes} mode="onboarding" backHref={backHref} />
        </div>
      );
    case "voice":
      return (
        <div className="mx-auto max-w-6xl">
          {progress}
          <VoiceForm account={view} mode="onboarding" backHref={backHref} />
        </div>
      );
    case "phone":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <PhoneStep account={view} mode="onboarding" backHref={backHref} nextHref={nextHref} />
        </div>
      );
    case "payment": {
      const { checkout } = await searchParams;
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <PaymentStep account={view} mode="onboarding" checkout={parseCheckoutResult(checkout)} backHref={backHref} />
        </div>
      );
    }
    default:
      notFound();
  }
}
