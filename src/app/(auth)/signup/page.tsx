import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { SignupForm } from "./signup-form";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

export const metadata = { title: "Sign up" };

// Render on demand: next-auth/react reads NEXTAUTH_URL at import time, which is not
// reliably available during the build's static prerender on Vercel.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <div className="mb-6 text-center">
        <p className="text-3xl font-black tracking-tight text-brand-700">CallCover</p>
        <p className="mt-1 text-gray-500">Step 1 of 8 · Create your account</p>
      </div>
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
