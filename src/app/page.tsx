import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { HERO_TIMING, beatVars } from "@/lib/motion";
import { VERTICAL_CATALOG } from "@/verticals";
import { Logo } from "@/components/logo";
import { AnimatedThemeToggle } from "@/components/ui/animated-theme-toggle";
import { LinkButton } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DrawIcon } from "@/components/draw-icon";
import { HeroBeams } from "@/components/landing/beams";
import { WordCarousel } from "@/components/landing/word-carousel";
import { CallDemo } from "@/components/landing/call-demo";
import { ProfessionSwitcher } from "@/components/landing/profession-switcher";
import { DayTimeline } from "@/components/landing/day-timeline";
import { CallAnatomy } from "@/components/landing/call-anatomy";
import { Questions } from "@/components/landing/questions";
import { faqJsonLd } from "@/components/landing/questions-data";
import { CALL_ADDRESS, callExhibits, cancelReplyParts, professionVoices } from "@/components/landing/voice-data";

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

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const professionWords = VERTICAL_CATALOG.map((v) => v.label);
  const exhibits = callExhibits();

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

      {/* The hero owns the first screen: .hero-fill is the viewport minus the sticky header (min-height,
          so short viewports grow and scroll rather than clip), and the grid centers itself in that
          space with my-auto. Columns top-align so the demo sits level with the headline block. */}
      <section className="landing-glow hero-fill relative flex flex-col overflow-hidden">
        {/* Hidden on small screens: at phone widths the beams cross the hero text. */}
        <HeroBeams className="hidden md:block" />
        {/* The entrance is one CSS-timed sequence on the sequence clock, tuned in ONE place: HERO_TIMING in
            src/lib/motion.ts hands every block its start and duration (--seq / --dur, via beatVars).
            One thing moves at a time, in reading order: pill, headline line one, line two, subhead,
            CTAs with the check-row, the phone, then the conversation and, last, the cue. Everything is
            in the DOM at its final position from first paint and only opacity and transform animate;
            the sequence needs no JavaScript and plays once per page load. Timeline: motion spec, pass 8. */}
        <div className="relative mx-auto my-auto grid w-full max-w-6xl items-start gap-10 px-5 pb-14 pt-8 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div>
            {/* The left-entrance group: pill, headline line one, headline line two. Each is hidden at
                first paint behind this wrapper's left clip edge and slides into place along the reading
                direction on its beat (HERO_TIMING.pill / lineOne / lineTwo; .hero-slide). Transform
                only. A deliberate trade, recorded in the motion spec: a headline hidden at first paint
                is not the LCP element in Chromium, so LCP is credited to the logo. Clip is horizontal
                only, so descenders are never cut. */}
            <div className="overflow-x-clip">
              <p
                className="hero-slide inline-flex flex-wrap items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800"
                style={beatVars(HERO_TIMING.pill)}
              >
                {/* The rotating word goes LAST: the word-stack reserves the widest label's width, and at
                    the end of the line that reads as pill padding instead of a mid-sentence hole. */}
                <span aria-hidden="true">
                  Ten professions — built for <WordCarousel words={professionWords} className="font-bold" />
                </span>
                <span className="sr-only">Built for ten professions.</span>
              </p>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
                <span className="hero-slide block" style={beatVars(HERO_TIMING.lineOne)}>
                  Your phone, answered.
                </span>{" "}
                <span className="hero-slide block text-brand-600" style={beatVars(HERO_TIMING.lineTwo)}>
                  Every time.
                </span>
              </h1>
            </div>
            <p className="hero-seq mt-4 max-w-xl text-lg text-gray-600" style={beatVars(HERO_TIMING.subhead)}>
              FrontDesk AI is an AI receptionist that answers your business line 24/7 — it books the work, texts the customer a confirmation,
              and lets you know the moment something needs a human.
            </p>
            <div className="hero-seq" style={beatVars(HERO_TIMING.ctas)}>
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
          </div>
          <div className="hero-seq" style={beatVars(HERO_TIMING.phone)}>
            <CallDemo />
          </div>
        </div>
        {/* A quiet cue at the bottom edge, last to arrive, since the section claims the whole first
            screen. Only where the hero actually ends at the fold (lg and up). */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-gray-400 lg:block" aria-hidden="true">
          <div className="hero-seq" style={beatVars(HERO_TIMING.cue)}>
            <span className="hero-cue">
              <DrawIcon name="arrow-down" size={18} draw={false} />
            </span>
          </div>
        </div>
      </section>

      <section id="professions" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">Built for ten professions</h2>
        <p className="mt-1 max-w-2xl text-gray-500">
          Pick one. The bookings, the questions and the hard rules below come from that profession&apos;s shipped definition, the same one its
          receptionist runs on.
        </p>
        <ProfessionSwitcher professions={professionVoices()} className="mt-6" />
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">What it does all day</h2>
        <p className="mt-1 max-w-2xl text-gray-500">One day, morning to close. Every moment below is shipped behavior, not a roadmap item.</p>
        <DayTimeline cancelReply={cancelReplyParts()} className="mt-8" />
        <p className="mt-10 max-w-3xl text-sm text-gray-500">
          And in between: missed-call alerts, a waitlist for full nights, returning-caller recognition, tenant-privacy guardrails, and an
          in-browser test call before your line goes live.
        </p>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <p className="mt-1 max-w-2xl text-gray-500">
          One call, start to finish: a plumbing line, nine at night. The call reads down the page; the margin says what the system did at each beat.
        </p>
        <CallAnatomy greeting={exhibits.greeting} sms={exhibits.sms} notificationTitle={exhibits.notificationTitle} address={CALL_ADDRESS} className="mt-6" />
      </section>

      <section id="faq" className="mx-auto w-full max-w-6xl px-5 py-16">
        <h2 className="text-2xl font-bold tracking-tight">Questions, answered</h2>
        <p className="mt-1 max-w-2xl text-gray-500">The ones a careful owner asks first, answered from what the product does and what the Terms say.</p>
        <Questions className="mt-6" />
        {/* FAQPage structured data: the answers are public and fully visible, and they are built from the same list. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
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
