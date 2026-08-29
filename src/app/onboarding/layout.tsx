import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/dashboard" className="text-lg font-black tracking-tight text-brand-700">
            CallCover
          </Link>
          <div className="flex items-center gap-3">
            <AnimatedThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-6 pb-24">{children}</main>
    </div>
  );
}
