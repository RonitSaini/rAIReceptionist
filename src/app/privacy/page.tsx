import type { Metadata } from "next";
import Link from "next/link";
import { BackToHome } from "@/components/back-to-home";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";

export const metadata: Metadata = {
  title: "Privacy Policy — FrontDesk AI",
  description: "What FrontDesk AI collects, why, and what it will never do with it — including exactly how connected Google Calendars are used.",
};

/**
 * Public. Written to be read, and to satisfy Google's OAuth verification requirements for the
 * calendar scopes: what Google data is accessed, what it is used for, the Limited Use commitment,
 * and the no-AI-training statement all live in the "Connected Google Calendars" section.
 */

const EFFECTIVE = "August 31, 2026";
const CONTACT = "ssaibusiness101@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>
      <header className="mb-10">
        <div className="mb-6">
          <BackToHome inline />
        </div>
        <Logo href="/" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Effective {EFFECTIVE}</p>
      </header>

      <div className="space-y-10 text-[15px] leading-7 text-gray-700">
        <Section title="Who we are">
          <p>
            FrontDesk AI is an AI phone receptionist for small businesses — restaurants, trades, clinics and property managers. When we say &quot;you&quot; below we mostly mean the business that
            signed up. Where a section is about the people who call a business, it says so.
          </p>
        </Section>

        <Section title="What we collect, and why">
          <p>We collect only what the product needs to answer a business&apos;s phone and keep its book:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-ink">Business account details.</span> Name, email, business name, address, hours, services and settings — everything entered at sign-up or in
              Settings, used to run the receptionist for that business.
            </li>
            <li>
              <span className="font-semibold text-ink">Calls.</span> Calls answered by the AI may be recorded and transcribed. We store the recording, transcript, summary and outcome of each
              call so the business can see who called and what was agreed.
            </li>
            <li>
              <span className="font-semibold text-ink">Caller details.</span> A caller&apos;s name, phone number, and what they book or report (a reservation, a service visit, a work order) are
              stored in that business&apos;s account so returning callers are recognized and bookings can be honored.
            </li>
            <li>
              <span className="font-semibold text-ink">Text messages.</span> Confirmation and follow-up texts we send, and replies we receive (such as CANCEL), with delivery metadata.
            </li>
            <li>
              <span className="font-semibold text-ink">Billing.</span> Payments are processed by Stripe. We store Stripe&apos;s identifiers and subscription status; card numbers never touch our
              servers.
            </li>
          </ul>
        </Section>

        <Section title="Connected Google Calendars">
          <p>
            A business can optionally connect a Google Calendar. If it does, here is exactly what happens — this section covers all data received from Google APIs:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-ink">What we access.</span> The list of calendars on the connected Google account (names only, to offer a picker), events on the one calendar
              the business chooses (to add, update and remove the events that mirror its bookings, and to read busy times), and the Google account&apos;s email address (shown in Settings so the
              business can see which account is connected).
            </li>
            <li>
              <span className="font-semibold text-ink">What we do with it.</span> Bookings made through FrontDesk AI are written to the chosen calendar, and existing events on that calendar are
              treated as busy time so the AI does not double-book. That is the entire use.
            </li>
            <li>
              <span className="font-semibold text-ink">What we never do with it.</span> Google Calendar data is never sold, never used for advertising, never shared with third parties except as
              needed to provide this one feature, and never read by humans except with the business&apos;s explicit permission (for support), for security, or where the law requires it.
            </li>
            <li>
              <span className="font-semibold text-ink">No AI training.</span> We do not use any data received from Google APIs to develop, improve or train generalized artificial-intelligence or
              machine-learning models.
            </li>
            <li>
              <span className="font-semibold text-ink">Storage and revocation.</span> Google access tokens are stored encrypted (AES-256-GCM) and used only server-side over TLS. Disconnecting in
              Settings deletes our copy of the tokens and asks Google to revoke them; access can also be revoked any time at{" "}
              <a href="https://myaccount.google.com/permissions" className="font-semibold text-brand-700 underline">
                myaccount.google.com/permissions
              </a>
              .
            </li>
          </ul>
          <p>
            FrontDesk AI&apos;s use and transfer to any other application of information received from Google APIs will adhere to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="font-semibold text-brand-700 underline">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="Who processes data for us">
          <p>We use a small set of service providers, each only for what it says on the tin:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Twilio — phone numbers, calls and SMS delivery.</li>
            <li>Retell — real-time voice AI on calls (audio and transcripts pass through it to power the conversation).</li>
            <li>Stripe — payments and subscriptions.</li>
            <li>Vercel — application hosting.</li>
            <li>Neon — the database, encrypted at rest.</li>
            <li>Google — only when a business connects its calendar, as described above.</li>
          </ul>
          <p>We do not sell personal information, and we do not share it with anyone for advertising.</p>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Data is kept while the business&apos;s account is active, because a booking history is the product. Deleting the account deletes its data — calls, customers, bookings, messages and
            any Google connection — and cancels billing. Callers who want their details removed from a specific business&apos;s records should contact that business, or contact us and we will
            help.
          </p>
        </Section>

        <Section title="Cookies">
          <p>We set a session cookie to keep you signed in. There are no advertising or analytics cookies.</p>
        </Section>

        <Section title="Children">
          <p>FrontDesk AI is a business tool and is not directed at children under 13. We do not knowingly collect their information.</p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If this policy changes materially we will note the new effective date here. Questions, or a deletion request:{" "}
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
          <Link href="/terms" className="font-semibold text-gray-600 hover:text-ink">
            Terms of Service
          </Link>
          <Link href="/login" className="font-semibold text-gray-600 hover:text-ink">
            Log in
          </Link>
        </div>
      </footer>
    </main>
  );
}
