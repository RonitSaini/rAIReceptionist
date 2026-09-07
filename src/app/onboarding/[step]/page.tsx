import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAccount } from "@/lib/current-account";
import { hasAcceptedCurrentTerms } from "@/lib/terms-acceptance";
import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals";
import { serializeAccount, serializeMenuItem, serializeServiceOffering } from "@/lib/serialize";
import { MAX_ONBOARDING_STEPS, VERTICAL_CATALOG, onboardingStepsFor, verticalFor } from "@/verticals";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { getGoogleCalendarView } from "@/lib/google-calendar-view";
import { onboardingStepHref } from "@/lib/onboarding-flow";
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

/**
 * Every step shares this frame: the progress block first, then the form as the second group of the
 * guided arrival (motion spec §8; the title inside the progress block is group one, the footer inside
 * the form is group three). `wide` is the voice step's two-column layout.
 */
function Frame({ progress, wide = false, children }: { progress: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "mx-auto max-w-6xl" : "mx-auto max-w-2xl 2xl:max-w-3xl"}>
      {progress}
      <div data-guided="2">{children}</div>
    </div>
  );
}

export default async function OnboardingStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ checkout?: string; google?: string; message?: string; ref?: string }> }) {
  const { step: stepParam } = await params;
  const { google: googleStatus, message: googleMessage, ref } = await searchParams;
  // A referral code carried here by the invite link (see signup-form.tsx). Only step 1 reads it:
  // after that the account exists, and the code is typed on the payment step instead.
  const rawRef = normalizeReferralCode(ref ?? "");
  const referralCode = isReferralCodeShape(rawRef) ? rawRef : null;
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
      <Frame progress={<OnboardingProgress step={1} />}>
        <CreateAccountForm catalog={VERTICAL_CATALOG} needsTerms={!accepted} referralCode={referralCode} />
      </Frame>
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
        <Frame progress={progress}>
          <BusinessBasicsForm account={view} mode="onboarding" />
        </Frame>
      );
    case "hours": {
      const hours = await prisma.businessHours.findMany({ where: { accountId: account.id }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] });
      return (
        <Frame progress={progress}>
          <HoursForm hours={hours} mode="onboarding" backHref={backHref} nextHref={nextHref} />
        </Frame>
      );
    }
    case "menu-policies": {
      const items = await prisma.menuItem.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <Frame progress={progress}>
          <MenuPoliciesForm account={view} menu={items.map(serializeMenuItem)} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    }
    case "reservations":
      return (
        <Frame progress={progress}>
          <ReservationSettingsForm account={view} mode="onboarding" google={await getGoogleCalendarView(account.id)} googleStatus={googleStatus} googleMessage={googleMessage} backHref={backHref} />
        </Frame>
      );
    case "service-area":
      return (
        <Frame progress={progress}>
          <ServiceAreaForm account={view} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    case "services": {
      const services = await prisma.serviceOffering.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <Frame progress={progress}>
          <ServicesForm account={view} services={services.map(serializeServiceOffering)} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    }
    case "appointments": {
      const services = await prisma.serviceOffering.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <Frame progress={progress}>
          <ServicesForm account={view} services={services.map(serializeServiceOffering)} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    }
    case "handoffs":
      return (
        <Frame progress={progress}>
          <ShopHandoffForm
            account={view}
            emergencyTypes={verticalFor(account).emergencyTypes}
            referral={verticalFor(account).referral!}
            defaultSlotMinutes={verticalFor(account).defaults.slotMinutes}
            mode="onboarding"
            backHref={backHref}
          />
        </Frame>
      );
    case "dispatch":
      return (
        <Frame progress={progress}>
          <DispatchForm
            account={view}
            defaultResponse={null}
            defaultAckMinutes={verticalFor(account).ackMinutes ?? 5}
            defaultUnacknowledged={verticalFor(account).smsTemplates.unacknowledged?.(account).replace(`${account.businessName}: `, "") ?? ""}
            mode="onboarding"
            backHref={backHref}
          />
        </Frame>
      );
    case "emergencies":
      return (
        <Frame progress={progress}>
          <EmergenciesForm account={view} emergencyTypes={verticalFor(account).emergencyTypes} defaultSlotMinutes={verticalFor(account).defaults.slotMinutes} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    case "voice":
      return (
        <Frame progress={progress} wide>
          <VoiceForm account={view} mode="onboarding" backHref={backHref} />
        </Frame>
      );
    case "phone":
      // Payment precedes this step, so the panel assumes billing is active and provisions directly.
      // The way back to payment is only for the edge case where it did not go through.
      return (
        <Frame progress={progress}>
          <PhoneStep account={view} mode="onboarding" backHref={backHref} paymentHref={onboardingStepHref(account, "payment")} />
        </Frame>
      );
    case "payment": {
      const { checkout } = await searchParams;
      return (
        <Frame progress={progress}>
          <PaymentStep account={view} mode="onboarding" checkout={parseCheckoutResult(checkout)} backHref={backHref} />
        </Frame>
      );
    }
    default:
      notFound();
  }
}
