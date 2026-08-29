import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { requireAccount } from "@/lib/current-account";
import { countUnread } from "@/lib/notifications";
import { ONBOARDING_DONE } from "@/lib/constants";
import { AppNav } from "@/components/app-nav";
import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { account } = await requireAccount();
  const unread = await countUnread(account.id);
  const setupIncomplete = account.onboardingStep < ONBOARDING_DONE;

  return (
    <div className="min-h-dvh bg-paper md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200 bg-surface md:flex 2xl:w-64">
        <div className="flex h-14 items-center px-5">
          <Link href="/dashboard" className="text-lg font-black tracking-tight text-brand-700">
            CallCover
          </Link>
        </div>
        <AppNav variant="sidebar" />
        <div className="mt-auto border-t border-gray-100 p-4">
          <p className="truncate text-sm font-semibold">{account.restaurantName}</p>
          <SignOutButton className="mt-1 text-sm text-gray-500 hover:text-ink" />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 3xl:max-w-[1680px]">
            <Link href="/dashboard" className="truncate text-base font-bold md:hidden">
              {account.restaurantName}
            </Link>
            <span className="hidden text-sm text-gray-500 md:block">{account.restaurantName}</span>
            <div className="flex items-center gap-1">
              <AnimatedThemeToggle />
              <NotificationBell initialCount={unread} />
            </div>
          </div>
        </header>

        {setupIncomplete ? (
          <Link href={`/onboarding/${account.onboardingStep}`} className="flex items-center justify-center gap-1 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            Setup is {account.onboardingStep - 1} of 8 steps done — tap to continue <ArrowRightIcon size={16} />
          </Link>
        ) : null}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 md:pb-8 xl:max-w-6xl 2xl:max-w-7xl 2xl:px-8 2xl:py-8 3xl:max-w-[1680px]">{children}</main>

        {/* Mobile bottom tabs */}
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-surface safe-bottom md:hidden">
          <AppNav variant="tabs" />
        </nav>
      </div>
    </div>
  );
}
