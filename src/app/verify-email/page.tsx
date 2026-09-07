import Link from "next/link";
import { confirmEmailVerification } from "@/actions/auth";
import { readVerificationToken, type ConfirmOutcome } from "@/lib/email-verification";
import { Button } from "@/components/ui";
import { Logo } from "@/components/logo";

export const metadata = { title: "Confirm your email" };

/**
 * Where the link in the email lands.
 *
 * A button, not an automatic confirmation. Mail scanners and link previewers fetch every URL in an
 * email; a GET that verified would let Outlook's Safe Links confirm an address nobody clicked.
 * The page only READS the token (is it well-formed, whose is it, has it expired) and the write is
 * the form's server action - which also keeps the reads-never-write rule intact (AGENTS.md).
 */
const OUTCOME: Record<ConfirmOutcome, { title: string; body: string }> = {
  verified: { title: "Email confirmed", body: "Thanks - we can reach you there now." },
  already: { title: "Already confirmed", body: "This address was verified earlier. Nothing more to do." },
  stale: { title: "This link is for an older address", body: "You changed your email after we sent it. Log in and use Resend to get a link for the new address." },
  invalid: { title: "This link has expired", body: "Verification links work for 48 hours. Log in and use Resend at the top of the page to get a fresh one." },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; result?: string }> }) {
  const { token, result } = await searchParams;
  const outcome = result && result in OUTCOME ? OUTCOME[result as ConfirmOutcome] : null;
  const claim = outcome ? null : readVerificationToken(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 py-12">
      <Logo />
      <div className="w-full space-y-4 rounded-2xl border border-gray-200 bg-surface p-6 shadow-sm">
        {outcome ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">{outcome.title}</h1>
            <p className="text-sm text-gray-600">{outcome.body}</p>
            <Link href="/dashboard" className="inline-block font-semibold text-brand-700">
              Continue to FrontDesk AI →
            </Link>
          </>
        ) : claim ? (
          <form action={confirmEmailVerification} className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight">Confirm your email</h1>
            <p className="text-sm text-gray-600">
              This confirms <span className="font-semibold text-ink">{claim.email}</span> as the address for your FrontDesk AI account.
            </p>
            <input type="hidden" name="token" value={token ?? ""} />
            <Button type="submit" size="lg" full>
              Confirm {claim.email}
            </Button>
          </form>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight">{OUTCOME.invalid.title}</h1>
            <p className="text-sm text-gray-600">{OUTCOME.invalid.body}</p>
            <Link href="/login" className="inline-block font-semibold text-brand-700">
              Log in →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
