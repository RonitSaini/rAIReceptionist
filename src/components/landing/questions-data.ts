/**
 * "Questions, answered": the questions a skeptical owner asks first. Server-safe data, shared by
 * the section (questions.tsx) and the FAQPage JSON-LD, so the structured data can never drift from
 * what the page shows.
 *
 * Each answer opens with a short answer (its first sentence or two) and continues with the
 * elaboration; the page sets them at two sizes, the structured data joins them back into one text.
 *
 * Honesty: each answer is written against the code and the legal pages (the recorded-line check
 * in src/actions/onboarding.ts; SHARED_GUARDRAILS and the end_call tool in src/verticals; the
 * escalation path in src/lib/outcomes.ts; the forwarding copy in the phone panel; and the
 * cancellation and calendar wording on /terms, which the cancellation answer mirrors verbatim).
 */

export type Segment = string | { href: string; label: string };
export type Question = { id: string; q: string; short: string; rest: Segment[] };

export const QUESTIONS: Question[] = [
  {
    id: "recording",
    q: "Is it legal to record calls?",
    short: "The greeting discloses it.",
    rest: [
      "Every FrontDesk AI greeting includes “this call may be recorded”, and setup refuses a greeting without that phrase. Recording-consent laws differ by state and province, and some require every party's consent. The ",
      { href: "/terms", label: "Terms of Service" },
      " put the duty on your business to know the rules where you and your callers are, and to set your greeting or practices accordingly.",
    ],
  },
  {
    id: "unknown",
    q: "What happens when it doesn't know something?",
    short: "It says so and takes a message.",
    rest: [
      "It never invents a price, a service, a menu item, a policy or a time it can't see. If something behind it fails mid-call, it apologizes, takes the caller's name and number and promises a call back instead of guessing. And it never hangs up on a caller: the call ends only after the caller says they're done and it has said goodbye.",
    ],
  },
  {
    id: "emergency",
    q: "What happens in an emergency?",
    short: "It triages before anything else.",
    rest: [
      "Each profession has its own emergency list (a burst pipe, a carbon monoxide alarm, a child locked inside), and a call that matches it skips the booking flow: you get an urgent alert in the app and, inside the hours you marked reachable, a call to your cell with the details read out. Press 1 to acknowledge. If nobody acknowledges in time, the caller is texted honestly instead of being left waiting. It is not an emergency service: where a life is at risk it tells the caller to call 911 first.",
    ],
  },
  {
    id: "number",
    q: "Do I keep my phone number?",
    short: "Yes. Your number stays yours.",
    rest: [
      "You get a FrontDesk AI number and forward your line to it: on most carriers, dial *72 then the number to turn forwarding on and *73 to turn it off, or ask your carrier for forward-when-busy so you still answer when you can. You can also print the FrontDesk number directly. US and Canadian numbers.",
    ],
  },
  {
    id: "cancel",
    q: "Can I cancel?",
    short: "Any time, from the billing portal.",
    rest: [
      "Cancelling stops all future charges, and the service stays active through the end of the period you already paid for. Subscriptions bill monthly in advance, and once a monthly payment has been charged it is not refundable. The setup fee is non-refundable once onboarding work has begun. The ",
      { href: "/terms", label: "Terms of Service" },
      " say the same, in the same words.",
    ],
  },
  {
    id: "calendar",
    q: "Is Google Calendar required?",
    short: "No.",
    rest: [
      "The built-in book in your dashboard is the record that counts, with or without a calendar. Connect a Google Calendar if you want every booking mirrored to it as an event, and busy events already on it kept off the phone. You can disconnect at any time, and exactly what we access and why is in the ",
      { href: "/privacy", label: "Privacy Policy" },
      ".",
    ],
  },
];

const plain = (a: Segment[]) => a.map((s) => (typeof s === "string" ? s : s.label)).join("");

/** FAQPage structured data, built from the same list the section renders. */
export function faqJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: QUESTIONS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: `${item.short} ${plain(item.rest)}` },
    })),
  };
  // Per the Next.js JSON-LD guide: a native <script>, with "<" escaped so no string can close it.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
