import { redirect } from "next/navigation";
import { requireSession } from "@/lib/current-account";
import { hasAcceptedCurrentTerms } from "@/lib/terms-acceptance";
import { TERMS_EFFECTIVE } from "@/app/terms/terms-version";
import { Alert } from "@/components/ui";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { AcceptTermsForm } from "./accept-terms-form";

export const metadata = { title: "Terms of Service" };

/**
 * The one-time blocking interstitial for accounts that predate the current terms version. The
 * (app) layout redirects here before any dashboard page renders; accepting records the same
 * TermsAcceptance row a signup would, and a future material change re-prompts everyone by bumping
 * TERMS_VERSION.
 */
export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  if (await hasAcceptedCurrentTerms(session.user.id)) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    // Guided arrival (motion spec §8): the heading, then the card; the logo stays put.
    <main className="guided mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo href="/" size="lg" />
        <h1 data-guided="1" className="mt-6 text-xl font-bold">
          One thing before your dashboard
        </h1>
        <p data-guided="1" className="mt-2 text-sm text-gray-500">
          Our Terms of Service (effective {TERMS_EFFECTIVE}) apply to every account. Please read and agree to continue — you&apos;ll only be asked again if the terms materially change.
        </p>
      </div>
      <div data-guided="2">
        {error ? (
          <div className="mb-4">
            <Alert>Tick the box to agree before continuing.</Alert>
          </div>
        ) : null}
        <div className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
          <AcceptTermsForm />
        </div>
      </div>
    </main>
  );
}
