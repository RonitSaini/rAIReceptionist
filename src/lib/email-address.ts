import { Resolver } from "node:dns/promises";
import { emailDomain } from "./form";

/**
 * Does this address's domain actually take mail?
 *
 * Sign-up asks two questions of an address. The first — is it even shaped like one — is `isEmail`,
 * pure and instant. The second is this one, and only DNS can answer it: `owner@gmial.com` is
 * perfectly well-formed and quietly unreachable, and an account whose owner never receives the
 * welcome email, the receipts, or a password reset is worse than no account at all.
 *
 * What this cannot tell you is whether a MAILBOX exists. Nothing short of an SMTP conversation can,
 * and every large provider answers "maybe" to that one on purpose. Confirming a person actually
 * reads the inbox is a verification email's job; this is the check that stops the typo and the
 * made-up domain before an account, a phone number and a subscription are created behind them.
 *
 * Ambiguity is always resolved in the applicant's favour: a resolver that times out, refuses, or
 * SERVFAILs is our problem, not theirs, and a real customer must never lose a sign-up to it. Only
 * a domain that answers — "no such domain", or "I take no mail" — is turned away.
 */

/** Hard ceiling on the whole check. Sign-up must not sit behind a sulking resolver. */
const DNS_DEADLINE_MS = 3_000;
/** Per attempt; two attempts per query type, which stays inside the deadline above. */
const DNS_TIMEOUT_MS = 1_200;
const DNS_TRIES = 2;

type Verdict = "deliverable" | "undeliverable" | "unknown";

export type DomainCheck = { ok: true } | { ok: false; error: string };

const errorCode = (e: unknown): string => (typeof e === "object" && e !== null ? String((e as { code?: string }).code ?? "") : "");

/**
 * NXDOMAIN ("no such domain") and NODATA ("that domain publishes no record of this type") are
 * answers. Everything else — ETIMEOUT, ESERVFAIL, ECONNREFUSED, the ECANCELLED from our own
 * deadline — is the network failing to answer, and gets the benefit of the doubt.
 */
const isAnswer = (code: string) => code === "ENOTFOUND" || code === "ENODATA";

/**
 * The two-step rule mail servers themselves follow: MX first, then the domain's address record.
 *
 * The fallback is not a nicety — RFC 5321 §5.1 makes an A/AAAA record a valid mail route, and
 * plenty of small businesses run exactly that way. Skipping it would reject working addresses.
 */
async function domainAcceptsMail(domain: string): Promise<Verdict> {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: DNS_TRIES });
  // One clock over the whole thing: cancel() makes every query in flight give up at once, so the
  // A/AAAA fallback can never quietly add a second helping of timeouts to someone's sign-up.
  const deadline = setTimeout(() => resolver.cancel(), DNS_DEADLINE_MS);
  deadline.unref?.();

  try {
    try {
      const mx = await resolver.resolveMx(domain);
      // An MX answer is final either way. A single empty exchange is RFC 7505's "null MX": the
      // domain saying in the record itself that it accepts no mail, which is a no, not a gap to
      // fall through. Anything with a real exchange is a yes.
      return mx.some((record) => record.exchange && record.exchange !== ".") ? "deliverable" : "undeliverable";
    } catch (e) {
      const code = errorCode(e);
      if (code === "ENOTFOUND") return "undeliverable"; // NXDOMAIN: the domain does not exist
      if (code !== "ENODATA") return unknown(domain, e); // no MX answer at all, for reasons of ours
    }

    // NODATA: the domain exists but publishes no MX, so mail goes to its address record instead.
    for (const query of [() => resolver.resolve4(domain), () => resolver.resolve6(domain)]) {
      try {
        if ((await query()).length > 0) return "deliverable";
      } catch (e) {
        if (!isAnswer(errorCode(e))) return unknown(domain, e);
      }
    }
    return "undeliverable";
  } finally {
    clearTimeout(deadline);
  }
}

/** Logged rather than silent: an inconclusive check accepts the address, so the reason should be findable. */
function unknown(domain: string, e: unknown): Verdict {
  console.warn(`[email] domain check inconclusive for ${domain}`, errorCode(e) || e);
  return "unknown";
}

/**
 * The gate the sign-up and change-email actions call, once an address has passed `isEmail`.
 *
 * The message names the domain rather than the whole address, because the domain is where the
 * mistake almost always is and seeing "gmial.com" quoted back is what makes someone spot it.
 */
export async function checkEmailDomain(email: string): Promise<DomainCheck> {
  const domain = emailDomain(email);
  const verdict = await domainAcceptsMail(domain);
  if (verdict === "undeliverable") {
    return { ok: false, error: `"${domain}" doesn't accept email, so we can't reach you there. Check the spelling of your address.` };
  }
  return { ok: true };
}
