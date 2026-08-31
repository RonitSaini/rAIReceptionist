import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { hasAcceptedCurrentTerms } from "@/lib/terms-acceptance";
import { countUnread, recentNotifications } from "@/lib/notifications";
import { onboardingDoneStep } from "@/verticals";
import { stripeConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import { AppNav } from "@/components/app-nav";
import { navItemsFor } from "@/lib/nav";
import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";
import { SidebarPanel } from "@/components/sidebar-panel";
import { SidebarPanelSkeleton } from "@/components/sidebar-panel-skeleton";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { account, userId } = await requireAccount();
  // Accounts that predate the current terms version are blocked here, before any page renders,
  // by the one-time interstitial. Read-only: the acceptance itself is an explicit action there.
  if (!(await hasAcceptedCurrentTerms(userId))) redirect("/accept-terms");
  const [unread, recent] = await Promise.all([countUnread(account.id), recentNotifications(account.id)]);
  const setupIncomplete = account.onboardingStep < onboardingDoneStep(account);
  // Billing nag only once setup is done and Stripe is actually wired up on this deployment.
  const billingLapsed = !setupIncomplete && stripeConfigured() && !subscriptionActive(account);
  const paymentFailed = account.subscriptionStatus === "past_due";

  return (
    <div className="min-h-dvh bg-paper md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-surface md:sticky md:top-0 md:flex md:h-dvh 2xl:w-64">
        <div className="flex h-16 shrink-0 items-center justify-center px-5 short:h-14 tiny:h-12">
          <Logo />
        </div>
        <AppNav variant="sidebar" items={navItemsFor(account, "sidebar")} />
        <div className="min-h-0 flex-1 overflow-hidden pb-2">
          {/* Streams: the shell (nav, header, page skeleton) paints while the panel's queries run. */}
          <Suspense fallback={<SidebarPanelSkeleton />}>
            <SidebarPanel account={account} />
          </Suspense>
        </div>
        <div className="shrink-0 border-t border-gray-100 p-4 short:px-4 short:py-2.5">
          <p className="truncate text-sm font-semibold">{account.businessName}</p>
          <SignOutButton className="mt-1 text-sm text-gray-500 hover:text-ink" />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 3xl:max-w-[1680px]">
            <Link href="/dashboard" className="truncate text-base font-bold md:hidden">
              {account.businessName}
            </Link>
            <span className="hidden text-sm text-gray-500 md:block">{account.businessName}</span>
            <div className="flex items-center gap-1">
              <AnimatedThemeToggle />
              <NotificationBell initialCount={unread} initialItems={recent} />
            </div>
          </div>
        </header>

        {setupIncomplete ? (
          <Link href={`/onboarding/${account.onboardingStep}`} className="flex items-center justify-center gap-1 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            Setup is {account.onboardingStep - 1} of 8 steps done — tap to continue <ArrowRightIcon size={16} />
          </Link>
        ) : null}

        {billingLapsed ? (
          <Link href="/settings?tab=billing" className={`flex items-center justify-center gap-1 px-4 py-2 text-center text-sm font-semibold ${paymentFailed ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
            {paymentFailed ? "Your last payment failed — update your card to keep the AI host answering" : "Set up billing to keep your AI host answering"} <ArrowRightIcon size={16} />
          </Link>
        ) : null}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 md:pb-8 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 2xl:py-8 3xl:max-w-[1680px]">{children}</main>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-surface safe-bottom md:hidden">
          <AppNav variant="tabs" items={navItemsFor(account, "tabs")} />
        </nav>
      </div>
    </div>
  );
}
