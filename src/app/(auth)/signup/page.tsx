import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { SignupForm } from "./signup-form";
import { VERTICAL_CATALOG } from "@/verticals";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { BackToHome } from "@/components/back-to-home";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui";
import { isReferralCodeShape, normalizeReferralCode } from "@/lib/referrals";

export const metadata = { title: "Sign up" };

// Render on demand: next-auth/react reads NEXTAUTH_URL at import time, which is not
// reliably available during the build's static prerender on Vercel.
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ deleted?: string; ref?: string }> }) {
  const { deleted, ref } = await searchParams;
  // Normalized here so a mangled link (a trailing bracket, a copied space) still lands, and so junk
  // never reaches the form dressed as a real code.
  const raw = normalizeReferralCode(ref ?? "");
  const referralCode = isReferralCodeShape(raw) ? raw : null;
  return (
    // Guided arrival (motion spec §8): the step line, then the card, then the footer; the logo and the
    // corner controls are the room the page arrives into and never move.
    <main className="guided mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <BackToHome />
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo href="/" size="lg" />
        <p data-guided="1" className="mt-2 text-gray-500">
          Step 1 of 8 · Create your account
        </p>
      </div>
      <div data-guided="2">
        {deleted ? (
          <div className="mb-4">
            <Alert kind="info">Your account and all of its data were deleted. You can sign up again any time.</Alert>
          </div>
        ) : null}
        <SignupForm googleEnabled={googleEnabled} catalog={VERTICAL_CATALOG} referralCode={referralCode} />
      </div>
      <p data-guided="3" className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
