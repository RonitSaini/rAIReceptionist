import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { SignupForm } from "./signup-form";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui";

export const metadata = { title: "Sign up" };

// Render on demand: next-auth/react reads NEXTAUTH_URL at import time, which is not
// reliably available during the build's static prerender on Vercel.
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo href="/" size="lg" />
        <p className="mt-2 text-gray-500">Step 1 of 8 · Create your account</p>
      </div>
      {deleted ? (
        <div className="mb-4">
          <Alert kind="info">Your account and all of its data were deleted. You can sign up again any time.</Alert>
        </div>
      ) : null}
      <SignupForm googleEnabled={googleEnabled} />
      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
