import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { TERMS_EFFECTIVE } from "./terms-version";

export const metadata: Metadata = {
  title: "Terms of Service — FrontDesk AI",
  description: "The plain-language terms for using FrontDesk AI: what the service does, what it costs, and who is responsible for what.",
};

/**
 * Public, and written the way the product talks: plainly. The load-bearing sections are the ones
 * about recording consent and SMS rules — an AI that answers a business's phone puts legal duties
 * on that business, and hiding them in boilerplate would be the dishonest version of this page.
 */

const CONTACT = "mintchilled553@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <header className="mb-10">
        <Logo href="/" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500">Effective {TERMS_EFFECTIVE}</p>
      </header>

      <div className="space-y-10 text-[15px] leading-7 text-gray-700">
        <Section title="What FrontDesk AI is">
          <p>
            FrontDesk AI answers your business&apos;s phone line with an AI receptionist: it takes calls, books reservations, service visits, appointments and work orders, sends text
            confirmations, and alerts you when something needs a human. By creating an account you agree to these terms and to the{" "}
            <Link href="/privacy" className="font-semibold text-brand-700 underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Your account">
          <p>
            Keep your sign-in details to yourself, give us accurate business information, and use one account per business. You are responsible for what happens under your account.
          </p>
        </Section>

        <Section title="What the AI does — and what it doesn't promise">
          <ul className="list-disc space-y-2 pl-5">
            <li>The AI answers and acts on calls in real time. It is good, and it is not perfect: it can mishear, misclassify, or fail to book. Review your notifications and your schedule; the built-in book in your dashboard is the record that counts.</li>
            <li>It is not an emergency service. It escalates urgent calls to you and, where configured, tells callers honestly when nobody could be reached — but calling 911 is always the caller&apos;s job, and the AI says so in the situations that warrant it.</li>
            <li>Calendar sync, SMS delivery and telephony depend on Google, Twilio and Retell. When one of them has a bad day, parts of the service degrade; bookings in your built-in schedule remain the source of truth.</li>
          </ul>
        </Section>

        <Section title="Your legal responsibilities">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-ink">Call recording.</span> Calls answered by the AI may be recorded and transcribed so you can review them. Recording-consent laws differ by
              state and province, and some require every party&apos;s consent. It is your responsibility to know the rules where you and your callers are, and to configure your greeting or
              practices accordingly.
            </li>
            <li>
              <span className="font-semibold text-ink">Text messages.</span> The service sends transactional texts (confirmations, follow-ups, cancellations) to people who called you.
              Recipients can reply STOP to opt out, and we honor it. Don&apos;t use the service to send marketing or anything the recipient didn&apos;t ask for.
            </li>
            <li>
              <span className="font-semibold text-ink">Lawful use.</span> No illegal, deceptive or abusive use, and nothing that would get a phone number shut down by carriers. We can suspend
              accounts that put the platform&apos;s numbers at risk.
            </li>
          </ul>
        </Section>

        <Section title="Billing, cancellation and refunds">
          <p>
            The service is a paid monthly subscription plus a one-time setup fee, billed through Stripe. Subscriptions bill monthly in advance, and once a monthly payment has been charged it is
            not refundable. You can cancel any time from the billing portal: cancelling stops all future charges, and the service stays active through the end of the period you already paid
            for. The setup fee is non-refundable once onboarding work has begun.
          </p>
          <p>
            Deleting your account is different from cancelling: deletion takes effect immediately — it ends the service, releases your phone number and removes your data as described in the
            Privacy Policy — and the remainder of any paid period is forfeited. We may make exceptions to any of the above at our sole discretion, but we are not
            obliged to. Prices can change; we&apos;ll tell you before a change affects you.
          </p>
        </Section>

        <Section title="Phone numbers">
          <p>
            Your FrontDesk AI number is provisioned through Twilio for your use while your subscription is active. It is released when you delete your account, and we may reclaim it after
            extended non-payment.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            The service is provided as-is. To the maximum extent the law allows, we are not liable for indirect or consequential losses — including a missed call, a missed booking, or an
            appointment the AI got wrong — and our total liability for any claim is capped at the fees you paid us in the three months before the claim arose. Nothing here limits liability
            that cannot lawfully be limited.
          </p>
        </Section>

        <Section title="Ending things">
          <p>
            You can stop using the service and delete your account whenever you like. We can suspend or terminate accounts for non-payment or for breaking these terms, and we&apos;ll say why.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there, and any dispute between us goes exclusively to the courts of
            Ontario.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If these terms change materially we&apos;ll update the effective date here and let you know. Questions:{" "}
            <a href={`mailto:${CONTACT}`} className="font-semibold text-brand-700 underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>

      <footer className="mt-14 border-t border-gray-200 pt-6 text-sm text-gray-500">
        <div className="flex flex-wrap items-center gap-4">
          <span>© 2026 FrontDesk AI</span>
          <Link href="/" className="font-semibold text-gray-600 hover:text-ink">
            Home
          </Link>
          <Link href="/privacy" className="font-semibold text-gray-600 hover:text-ink">
            Privacy Policy
          </Link>
          <Link href="/login" className="font-semibold text-gray-600 hover:text-ink">
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
