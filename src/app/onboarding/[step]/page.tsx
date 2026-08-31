import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAccount } from "@/lib/current-account";
import { serializeAccount, serializeMenuItem } from "@/lib/serialize";
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
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { accountId: true } });
    if (user?.accountId) redirect("/onboarding/2");
    return (
      <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
        <OnboardingProgress step={1} />
        <CreateAccountForm catalog={VERTICAL_CATALOG} />
      </div>
    );
  }

  const { account } = await requireAccount();
  const view = serializeAccount(account);

  // The step NUMBER is only a position in this vertical's ordered list; the step ID decides what
  // renders. A restaurant's list is unchanged, so its numbering is exactly what it always was.
  const stepDef = onboardingStepsFor(account)[step - 1];
  if (!stepDef) notFound();
  const progress = <OnboardingProgress step={step} vertical={account.vertical} />;

  switch (stepDef.id) {
    case "business-basics":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <BusinessBasicsForm account={view} mode="onboarding" />
        </div>
      );
    case "hours": {
      const [hours, manager] = await Promise.all([
        prisma.businessHours.findMany({ where: { accountId: account.id }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] }),
        prisma.managerAvailability.findMany({ where: { accountId: account.id }, orderBy: { dayOfWeek: "asc" } }),
      ]);
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <HoursForm account={view} hours={hours} managerHours={manager} mode="onboarding" escalationTypes={verticalFor(account).escalationTriggers} />
        </div>
      );
    }
    case "menu-policies": {
      const items = await prisma.menuItem.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <MenuPoliciesForm account={view} menu={items.map(serializeMenuItem)} mode="onboarding" />
        </div>
      );
    }
    case "reservations":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <ReservationSettingsForm account={view} mode="onboarding" google={await getGoogleCalendarView(account.id)} googleStatus={googleStatus} googleMessage={googleMessage} />
        </div>
      );
    case "voice":
      return (
        <div className="mx-auto max-w-6xl">
          {progress}
          <VoiceForm account={view} mode="onboarding" />
        </div>
      );
    case "phone":
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <PhoneStep account={view} mode="onboarding" />
        </div>
      );
    case "payment": {
      const { checkout } = await searchParams;
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          {progress}
          <PaymentStep account={view} mode="onboarding" checkout={parseCheckoutResult(checkout)} />
        </div>
      );
    }
    default:
      notFound();
  }
}
