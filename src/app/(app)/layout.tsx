import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { hasAcceptedCurrentTerms } from "@/lib/terms-acceptance";
import { countUnread, recentNotifications } from "@/lib/notifications";
import { hasFinishedOnboarding, lastOnboardingStep, onboardingPosition, onboardingResumeHref } from "@/verticals";
import { stripeConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import { billingState, graceDaysLeft } from "@/lib/billing-state";
import { currentUserVerification } from "@/lib/email-verification";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { AppNav } from "@/components/app-nav";
import { navItemsFor } from "@/lib/nav";
import { NavOrderProvider } from "@/components/nav-corridor";
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
  const [unread, recent, verification] = await Promise.all([countUnread(account.id), recentNotifications(account.id), currentUserVerification()]);
  const setupIncomplete = !hasFinishedOnboarding(account);
  const stepsDone = onboardingPosition(account, account.onboardingStepId) - 1;
  const stepsTotal = lastOnboardingStep(account);
  // Billing banners (docs/frontdesk-billing-spec.md): grace and paused are red and say exactly what
  // the agent is doing about it; billingState itself is exempt until setup is done. Not enforced on
  // this deployment but Stripe wired up: the old amber nudge to subscribe.
  const billing = billingState(account);
  const nudgeToSubscribe = billing === "exempt" && !setupIncomplete && !account.isInternal && stripeConfigured() && !subscriptionActive(account);
  // Resolved once and used twice: the rail renders it, and the page transition reads its ORDER to work
  // out which way the owner is walking (motion spec §10, beat two).
  const sidebarItems = navItemsFor(account, "sidebar");

  return (
    <div className="min-h-dvh bg-paper md:flex">
      {/* Desktop sidebar */}
      <aside className="relative hidden w-60 shrink-0 flex-col bg-surface md:sticky md:top-0 md:flex md:h-dvh 2xl:w-64">
        {/*
          The divider, drawn as a rule rather than the aside's border-r.
          A border runs the full height of its element, which put a stub of vertical line up the side
          of the header -- past the horizontal line the header already draws, with nothing on the
          other side of it to separate. This starts exactly where that line is (top-14 is the
          header's h-14, in rem so it still lands at the 17px root size the 3xl breakpoint sets) and
          runs to the bottom, so the two meet in a clean T instead of a cross.
          Out of flow, so the sidebar's own layout is untouched.
        */}
        <span aria-hidden="true" className="pointer-events-none absolute right-0 top-14 bottom-0 w-px bg-gray-400" />
        <div className="flex h-16 shrink-0 items-center justify-center px-5 short:h-14 tiny:h-12">
          <Logo />
        </div>
        <AppNav variant="sidebar" items={sidebarItems} />
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
        <header className="sticky top-0 z-20 border-b border-gray-400 bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 3xl:max-w-[1680px]">
            <Link href="/dashboard" className="truncate text-base font-bold md:hidden">
              {account.businessName}
            </Link>
            <span className="hidden text-[0.9375rem] font-semibold tracking-tight md:block">{account.businessName}</span>
            <div className="flex items-center gap-1">
              <AnimatedThemeToggle />
              <NotificationBell initialCount={unread} initialItems={recent} />
            </div>
          </div>
        </header>

        {setupIncomplete ? (
          <Link href={onboardingResumeHref(account)} className="flex items-center justify-center gap-1 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            Setup is {stepsDone} of {stepsTotal} steps done — tap to continue <ArrowRightIcon size={16} />
          </Link>
        ) : null}

        {verification && !verification.verified ? <VerifyEmailBanner email={verification.email} /> : null}

        {billing === "grace" ? (
          <Link href="/settings?tab=billing" className="flex items-center justify-center gap-1 bg-red-100 px-4 py-2 text-center text-sm font-semibold text-red-900">
            Your last payment failed — {graceDaysLeft(account)} {graceDaysLeft(account) === 1 ? "day" : "days"} left before {account.hostName} stops booking. Update your card <ArrowRightIcon size={16} />
          </Link>
        ) : billing === "paused" ? (
          <Link href="/settings?tab=billing" className="flex items-center justify-center gap-1 bg-red-100 px-4 py-2 text-center text-sm font-semibold text-red-900">
            {account.subscriptionStatus === "none" ? `Set up billing — ${account.hostName} is taking messages only until you subscribe` : `Billing paused — ${account.hostName} is taking messages only. Reactivate to book again`} <ArrowRightIcon size={16} />
          </Link>
        ) : nudgeToSubscribe ? (
          <Link href="/settings?tab=billing" className="flex items-center justify-center gap-1 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            Set up billing to keep your AI host answering <ArrowRightIcon size={16} />
          </Link>
        ) : null}

        {/* A flex column, so a page can stand something on the floor of the content area (the
            schedule keeps its footnotes there): the page wrapper fills main, and the page fills it. */}
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 pb-24 md:pb-8 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 2xl:py-8 3xl:max-w-[1680px]">
          <NavOrderProvider order={sidebarItems.map((it) => it.href)}>{children}</NavOrderProvider>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-400 bg-surface safe-bottom md:hidden">
          <AppNav variant="tabs" items={navItemsFor(account, "tabs")} />
        </nav>
      </div>
    </div>
  );
}
