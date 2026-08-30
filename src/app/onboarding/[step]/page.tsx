import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAccount } from "@/lib/current-account";
import { serializeAccount, serializeMenuItem } from "@/lib/serialize";
import { ONBOARDING_LAST_STEP } from "@/lib/constants";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { CreateAccountForm } from "@/components/forms/create-account-form";
import { BusinessBasicsForm } from "@/components/forms/business-basics-form";
import { HoursForm } from "@/components/forms/hours-form";
import { MenuPoliciesForm } from "@/components/forms/menu-policies-form";
import { ReservationSettingsForm } from "@/components/forms/reservation-settings-form";
import { VoiceForm } from "@/components/forms/voice-form";
import { PhoneStep } from "@/components/forms/phone-step";
import { PaymentStep, parseCheckoutResult } from "@/components/forms/payment-step";

export const metadata = { title: "Setup" };

export default async function OnboardingStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { step: stepParam } = await params;
  const step = Number.parseInt(stepParam, 10);
  if (!Number.isInteger(step) || step < 1 || step > ONBOARDING_LAST_STEP) notFound();

  // Step 1 is only for signed-in users who don't have an Account yet (e.g. Google sign-up).
  if (step === 1) {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { accountId: true } });
    if (user?.accountId) redirect("/onboarding/2");
    return (
      <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
        <OnboardingProgress step={1} />
        <CreateAccountForm />
      </div>
    );
  }

  const { account } = await requireAccount();
  const view = serializeAccount(account);

  switch (step) {
    case 2:
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={2} />
          <BusinessBasicsForm account={view} mode="onboarding" />
        </div>
      );
    case 3: {
      const [hours, manager] = await Promise.all([
        prisma.businessHours.findMany({ where: { accountId: account.id }, orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] }),
        prisma.managerAvailability.findMany({ where: { accountId: account.id }, orderBy: { dayOfWeek: "asc" } }),
      ]);
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={3} />
          <HoursForm account={view} hours={hours} managerHours={manager} mode="onboarding" />
        </div>
      );
    }
    case 4: {
      const items = await prisma.menuItem.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={4} />
          <MenuPoliciesForm account={view} menu={items.map(serializeMenuItem)} mode="onboarding" />
        </div>
      );
    }
    case 5:
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={5} />
          <ReservationSettingsForm account={view} mode="onboarding" />
        </div>
      );
    case 6:
      return (
        <div className="mx-auto max-w-6xl">
          <OnboardingProgress step={6} />
          <VoiceForm account={view} mode="onboarding" />
        </div>
      );
    case 7:
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={7} />
          <PhoneStep account={view} mode="onboarding" />
        </div>
      );
    case 8: {
      const { checkout } = await searchParams;
      return (
        <div className="mx-auto max-w-2xl 2xl:max-w-3xl">
          <OnboardingProgress step={8} />
          <PaymentStep account={view} mode="onboarding" checkout={parseCheckoutResult(checkout)} />
        </div>
      );
    }
    default:
      notFound();
  }
}
