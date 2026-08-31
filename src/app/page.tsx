import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { VERTICAL_CATALOG } from "@/verticals";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "FrontDesk AI — the AI receptionist that answers your business phone",
  description:
    "FrontDesk AI answers your business line 24/7: it books reservations, service calls and appointments, dispatches emergencies to a human immediately, texts confirmations, and syncs to Google Calendar. Built for ten professions.",
};

/**
 * The public homepage. Signed-in users still land on their dashboard; everyone else gets the
 * product explained — which is also what Google's OAuth verification reviewers come here to see,
 * so the calendar feature and the privacy policy link are both above the fold of the footer.
 * Motion: only the existing `Reveal` entrance — no new animated classes.
 */

const STEPS = [
  { title: "Tell us about your business", body: "Pick your profession, set your hours, services and rules. Ten minutes, no new hardware." },
  { title: "Get your phone number", body: "We give you a number to forward your line to — or to print on the van." },
  { title: "Every call gets answered", body: "The AI books work into your schedule, texts the caller a confirmation, and wakes a human the moment something is urgent." },
];

const FEATURES = [
  { title: "Books real work, not just messages", body: "Reservations, service calls, estimates, appointments and work orders go straight into your built-in schedule, with double-booking checked before a time is ever offered." },
  { title: "Emergencies reach a human now", body: "A flooded kitchen or a caller stranded on the shoulder skips the calendar: the owner's phone rings, and if nobody acknowledges in minutes, the caller is told the truth instead of being left waiting." },
  { title: "Texts customers automatically", body: "Confirmations and follow-ups by SMS, and replying CANCEL actually cancels — no app for your customers to install." },
  { title: "Google Calendar, both directions", body: "Optionally connect a calendar: every booking appears on it, and anything already on it blocks those times for phone bookings. Your FrontDesk schedule stays the source of truth." },
  { title: "A live dispatch queue", body: "Tow operators and locksmiths see active requests oldest-first with one-tap status changes, and it's obvious when a caller couldn't be notified." },
  { title: "Privacy where it matters", body: "For property managers, the AI never confirms or denies who lives at an address — to anyone, in any direction." },
];

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <main className="min-h-dvh">
      <div className="fixed right-4 top-4 z-10">
        <AnimatedThemeToggle />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo href="/" />
        <nav className="flex items-center gap-3 pr-12">
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16 pt-12 sm:pt-20">
        <Reveal className="max-w-2xl">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Your phone, answered. Every time.</h1>
          <p className="mt-4 text-lg text-gray-600">
            FrontDesk AI is an AI receptionist that answers your business line 24/7 — it books the work, texts the customer, and gets a human moving the moment a call is an emergency.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
              Create your account
            </Link>
            <Link href="/login" className="rounded-xl border border-gray-300 bg-surface px-5 py-3 text-sm font-semibold text-gray-700 hover:text-ink">
              Log in
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16">
        <h2 className="text-xl font-bold">Built for ten professions</h2>
        <p className="mt-1 text-sm text-gray-500">Each one gets its own vocabulary, its own booking rules, and its own guardrails — not a generic answering bot.</p>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICAL_CATALOG.map((v, i) => (
            <Reveal as="li" index={i} key={v.slug} className="rounded-2xl border border-gray-200 bg-surface p-4">
              <p className="font-semibold">{v.label}</p>
              <p className="mt-1 text-sm text-gray-500">{v.blurb}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-16">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" index={i} key={s.title} className="rounded-2xl border border-gray-200 bg-surface p-4">
              <p className="text-sm font-bold text-brand-700">Step {i + 1}</p>
              <p className="mt-1 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-gray-500">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 pb-20">
        <h2 className="text-xl font-bold">What it does all day</h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal as="li" index={i} key={f.title} className="rounded-2xl border border-gray-200 bg-surface p-4">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-gray-500">{f.body}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-5 py-8 text-sm text-gray-500">
          <span>© 2026 FrontDesk AI</span>
          <Link href="/privacy" className="font-semibold text-gray-600 hover:text-ink">
            Privacy Policy
          </Link>
          <Link href="/terms" className="font-semibold text-gray-600 hover:text-ink">
            Terms of Service
          </Link>
          <Link href="/login" className="font-semibold text-gray-600 hover:text-ink">
            Log in
          </Link>
          <Link href="/signup" className="font-semibold text-gray-600 hover:text-ink">
            Create account
          </Link>
        </div>
      </footer>
    </main>
  );
}
