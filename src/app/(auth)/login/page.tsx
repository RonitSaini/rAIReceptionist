import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { BackToHome } from "@/components/back-to-home";
import { Logo } from "@/components/logo";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  return (
    // A returning owner's page: the logo stays put and the card and its footer settle once, together
    // (guided arrival, one group — motion spec §8.1's exception).
    <main className="guided mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <BackToHome />
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo href="/" size="lg" />
        <p className="mt-2 text-gray-500">Your AI phone receptionist</p>
      </div>
      <div data-guided="1">
        <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} initialError={error ?? null} googleEnabled={googleEnabled} />
      </div>
      <p data-guided="1" className="mt-6 text-center text-sm text-gray-600">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 underline">
          Create your account
        </Link>
      </p>
    </main>
  );
}
