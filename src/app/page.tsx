import type { Metadata } from "next";
import Link from "next/link";
import type { Vertical } from "@prisma/client";
import { auth } from "@/lib/auth";
import { VERTICAL_CATALOG } from "@/verticals";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { LinkButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DrawIcon } from "@/components/draw-icon";
import type { IconName } from "@/components/icon-paths";
import { HeroBeams } from "@/components/landing/beams";
import { WordCarousel } from "@/components/landing/word-carousel";
import { CallDemo } from "@/components/landing/call-demo";
import { Faq } from "@/components/landing/faq";

export const metadata: Metadata = {
  title: "FrontDesk AI — the AI receptionist that answers your business phone",
  description:
    "FrontDesk AI answers your business line 24/7: it books reservations, service calls and appointments, rings a human immediately for emergencies, texts confirmations, and syncs to Google Calendar. Built for ten professions.",
};

/**
 * The public homepage — also what Google's OAuth verification reviewers assess, so the product
 * description, the professions, the calendar section and the Privacy Policy link stay prominent
 * and readable with or without JavaScript or motion.
 *
 * Signed-in visitors see the page too; only the CTAs swap to "Go to dashboard".
 *
 * Honesty rules for this page: no testimonials, ratings, customer counts or logo walls (there are
 * no customers yet), no pricing, and every capability claim maps to shipped code — feature copy was
 * written against the implementation (see the revamp notes in docs/frontdesk-motion-spec.md §6).
 * Professions render from the vertical registry, never a hardcoded list.
 */

const VERTICAL_ICONS: Partial<Record<Vertical, IconName>> = {
  restaurant: "utensils",
  plumbing: "wrench",
  hvac: "thermometer",
  electrical: "zap",
  roofing: "home",
  locksmith: "key",
  towing: "truck",
  auto_repair: "car",
  veterinary: "paw",
  property_management: "building",
};

const STEPS = [
  { title: "Tell us about your business", body: "Pick your profession, set your hours, services and rules. Ten minutes, no new hardware." },
  { title: "Get your phone number", body: "We give you a number to forward your line to — or to print on the van." },
  { title: "Every call gets answered", body: "The AI books work into your schedule, texts the caller a confirmation, and wakes a human the moment something is urgent." },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "siren",
    title: "Emergencies ring a human",
    body: "A flooded kitchen skips the calendar: FrontDesk AI calls your cell and reads you the details — press 1 to acknowledge. If nobody does within minutes, the caller is texted the truth instead of being left waiting.",
  },
  {
    icon: "audio-lines",
    title: "Every call, on the record",
    body: "A recording, a transcript, and an AI summary with the caller's sentiment — on every call's page in your dashboard.",
  },
  {
    icon: "message",
    title: "Texts customers automatically",
    body: "Booking confirmations by SMS, and replying CANCEL actually cancels — with a numbered picker when several bookings qualify. No app for your customers to install.",
  },
  {
    icon: "calendar",
    title: "Google Calendar, both directions",
    body: "Optional: every booking appears on your calendar, and anything already there blocks those times from being offered by phone. The built-in schedule stays the source of truth.",
  },
  {
    icon: "settings",
    title: "It runs on your rules",
    body: "Your hours, your services, your service area — checked with real geocoding — and profession-specific guardrails, like never quoting a price it can't know.",
  },
];

const ALSO_SHIPPED = [
  "Missed-call alerts",
  "Waitlist for full nights",
  "Returning-caller recognition",
  "In-browser test call",
  "Post-call summaries",
  "Tenant-privacy guardrails",
];

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const professionWords = VERTICAL_CATALOG.map((v) => v.label);

  const faqItems = [
    {
      q: "Do I need new hardware or a new number?",
      a: (
        <>
          <p>
            No. You get a FrontDesk number to forward your existing line to — or to print directly. Setup is a guided flow that takes about ten
            minutes, and you can try your receptionist with an in-browser test call before your phone line is live.
          </p>
        </>
      ),
    },
    {
      q: "What happens when a call is a real emergency?",
      a: (
        <>
          <p>
            The AI recognizes it and skips the booking flow: your cell rings with a spoken summary — press 1 to acknowledge. If nobody
            acknowledges within minutes, the caller is texted honestly instead of being left waiting for help that isn&apos;t coming.
          </p>
        </>
      ),
    },
    {
      q: "What does it do with my Google Calendar?",
      a: (
        <>
          <p>
            Nothing, unless you choose to connect one. If you do: every booking is mirrored to your calendar as an event, and busy events
            already on it block those times from being offered to callers. Exactly what we access and why is spelled out in the{" "}
            <Link href="/privacy" className="font-semibold text-brand-700 underline">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      ),
    },
    {
      q: "Do my customers need an app?",
      a: (
        <>
          <p>They just call your number like they always have. Confirmations arrive by text, and replying CANCEL cancels.</p>
        </>
      ),
    },
    {
      q: "Which professions does it support?",
      a: (
        <>
          <p>
            Ten today: {professionWords.join(", ")} — each with its own vocabulary, booking rules, and guardrails.
          </p>
        </>
      ),
    },
    {
      q: "Are calls recorded?",
      a: (
        <>
          <p>
            Yes — each call&apos;s recording, transcript and AI summary live in your dashboard. Consent disclosure rules vary by region; the{" "}
            <Link href="/terms" className="font-semibold text-brand-700 underline">
              Terms of Service
            </Link>{" "}
            spells out what your business is responsible for.
          </p>
        </>
      ),
    },
  ];

  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-[color-mix(in_oklab,var(--color-paper)_82%,transparent)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-2.5">
          <Logo href="/" />
          <nav className="flex items-center gap-3">
            {signedIn ? (
              <LinkButton href="/dashboard">Go to dashboard</LinkButton>
            ) : (
              <>
                <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:text-ink">
                  Log in
                </Link>
                <LinkButton href="/signup">Get started</LinkButton>
              </>
            )}
            <AnimatedThemeToggle />
          </nav>
        </div>
      </header>

      <section className="landing-glow relative overflow-hidden">
        {/* Hidden on small screens: at phone widths the beams cross the hero text. */}
        <HeroBeams className="hidden md:block" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-20">
          {/* Not a <Reveal>: opacity-0 content is excluded from LCP, and the h1 here IS the LCP
              element — .hero-enter lifts and un-blurs without ever hiding it. */}
          <div className="hero-enter">
            <p className="inline-flex flex-wrap items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800">
              {/* The rotating word goes LAST: the word-stack reserves the widest label's width, and at
                  the end of the line that reads as pill padding instead of a mid-sentence hole. */}
              <span aria-hidden="true">
                Ten professions — built for <WordCarousel words={professionWords} className="font-bold" />
              </span>
              <span className="sr-only">Built for ten professions.</span>
            </p>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Your phone, answered. <span className="text-brand-600">Every time.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-gray-600">
              FrontDesk AI is an AI receptionist that answers your business line 24/7 — it books the work, texts the customer a confirmation,
              and lets you know the moment something needs a human.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {signedIn ? (
                <LinkButton href="/dashboard" size="lg">
                  Go to dashboard
                </LinkButton>
              ) : (
                <>
                  <LinkButton href="/signup" size="lg">
                    Create your account
                  </LinkButton>
                  <LinkButton href="/login" variant="secondary" size="lg">
                    Log in
                  </LinkButton>
                </>
              )}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
              {["Answers 24/7", "Books into a real schedule", "US & Canada"].map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <DrawIcon name="check" size={14} draw={false} className="text-brand-500" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <Reveal index={2}>
            <CallDemo />
          </Reveal>
        </div>
      </section>

      <section id="professions" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">Built for ten professions</h2>
        <p className="mt-1 max-w-2xl text-gray-500">
          Each one gets its own vocabulary, its own booking rules, and its own guardrails — not a generic answering bot.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {VERTICAL_CATALOG.map((v, i) => {
            const inner = (
              <>
                <DrawIcon name={VERTICAL_ICONS[v.slug] ?? "phone"} size={20} draw={false} className="text-gray-400 transition-colors group-hover:text-brand-700" />
                <p className="mt-2.5 font-semibold">{v.label}</p>
                <p className="mt-1 text-sm text-gray-500">{v.blurb}</p>
                {!v.available && <p className="mt-2 text-xs font-semibold text-gray-400">Coming soon</p>}
              </>
            );
            return (
              <Reveal as="li" index={i} key={v.slug}>
                {v.available && !signedIn ? (
                  <Link href="/signup" className="lift group block h-full rounded-2xl border border-gray-200 bg-surface p-4">
                    {inner}
                  </Link>
                ) : (
                  <div className="group h-full rounded-2xl border border-gray-200 bg-surface p-4">{inner}</div>
                )}
              </Reveal>
            );
          })}
        </ul>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">What it does all day</h2>
        <p className="mt-1 max-w-2xl text-gray-500">Every claim below is a shipped feature, not a roadmap item.</p>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Reveal as="section" className="rounded-2xl border border-gray-200 bg-surface p-5 md:col-span-2">
            <h3 className="font-semibold">Books real work into a real schedule</h3>
            <p className="mt-1 text-sm text-gray-500">
              Reservations, service calls, estimates, appointments and work orders go straight into your built-in schedule. The AI can only
              offer times the engine reports free — and the slot is re-checked at the moment of booking, so it never offers a taken slot.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-400 line-through">
                Today 1:00
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800">
                <DrawIcon name="check" size={14} draw={false} />
                Today 2:00 — booked
              </span>
              <span className="rounded-full border border-gray-200 bg-surface px-3 py-1.5 text-xs font-semibold text-gray-600">Today 4:30</span>
            </div>
          </Reveal>
          {FEATURES.map((f, i) => (
            <Reveal as="section" index={i + 1} key={f.title} className="rounded-2xl border border-gray-200 bg-surface p-5 transition-colors hover:border-brand-300">
              <DrawIcon name={f.icon} size={20} draw={false} className="text-gray-400" />
              <h3 className="mt-2.5 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{f.body}</p>
            </Reveal>
          ))}
          <Reveal as="section" index={6} className="rounded-2xl border border-gray-200 bg-surface p-5 transition-colors hover:border-brand-300 lg:col-span-2">
            <DrawIcon name="truck" size={20} draw={false} className="text-gray-400" />
            <h3 className="mt-2.5 font-semibold">A live dispatch queue</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tow and locksmith requests land in a queue, oldest first, with one-tap status changes — and a loud alarm when a waiting caller
              couldn&apos;t be texted an update.
            </p>
          </Reveal>
        </div>
        <Reveal index={2} className="mt-5">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
            <li className="font-semibold text-gray-600">Also in the box:</li>
            {ALSO_SHIPPED.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <DrawIcon name="check" size={14} draw={false} className="text-brand-500" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" index={i} key={s.title} className="rounded-2xl border border-gray-200 bg-surface p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
              <p className="mt-3 font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-gray-500">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="faq" className="mx-auto w-full max-w-3xl px-5 py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight">Questions, answered</h2>
        <div className="mt-6">
          <Faq items={faqItems} />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 pt-4">
        {/* Gradient stops and button label use brand-500/600 only — the tokens the dark theme does
            NOT remap — so the banner stays deep emerald with readable text in both themes. */}
        <Reveal className="rounded-3xl bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-600))] px-6 py-12 text-center sm:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Stop losing the calls you can&apos;t pick up.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            About ten minutes to set up. No new hardware, and you can hear your receptionist in a test call before your line goes live.
          </p>
          <div className="mt-7">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="press inline-flex items-center rounded-xl bg-white px-6 py-3.5 font-semibold text-brand-600"
            >
              {signedIn ? "Go to your dashboard" : "Create your account"}
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>© 2026 FrontDesk AI</span>
            <Link href="/privacy" className="font-semibold text-gray-600 transition-colors hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="font-semibold text-gray-600 transition-colors hover:text-ink">
              Terms of Service
            </Link>
            <Link href="/login" className="font-semibold text-gray-600 transition-colors hover:text-ink">
              Log in
            </Link>
            <Link href="/signup" className="font-semibold text-gray-600 transition-colors hover:text-ink">
              Create account
            </Link>
          </div>
          <a href="mailto:ssaibusiness101@gmail.com" className="font-semibold text-gray-600 transition-colors hover:text-ink">
            ssaibusiness101@gmail.com
          </a>
        </div>
      </footer>
    </main>
  );
}
