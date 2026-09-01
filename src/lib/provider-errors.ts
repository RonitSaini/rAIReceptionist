/**
 * Owner-facing translations of provider failures (Twilio, Retell, Google).
 *
 * A raw provider error — "The 'From' number is not a valid, SMS-capable phone number", error 30034,
 * an invalid_grant JSON blob — is noise to a business owner and sometimes alarming. The raw text
 * stays on the diagnostic record (SmsMessage.error, Call.managerCallError, Job.googleSyncError,
 * GoogleCalendarConnection.lastError); what the owner sees in a notification or on a queue is one
 * plain clause about what happened. Nothing returned here ever contains the raw text.
 *
 * Returned clauses are lowercase sentence fragments meant to complete a sentence the call site
 * writes, e.g. "We couldn't ring your cell — {clause}."
 */

export type ProviderChannel = "sms" | "call" | "calendar";

export function friendlyProviderError(channel: ProviderChannel, raw?: string | null): string {
  const r = (raw ?? "").toLowerCase();

  // Google auth failures first — "invalid_grant: Token has been expired" would otherwise trip the
  // phone-setup bucket below on the bare word "to" hiding inside "Token".
  if (channel === "calendar" && /invalid_grant|unauthoriz|revoked|expired|401|403/.test(r)) {
    return "the Google connection needs to be reconnected";
  }
  // The account can't send yet: Twilio trial limits, unverified destination, unregistered A2P
  // campaign, missing or SMS-incapable number. All of them read as "finish setting up".
  if (/unverified|\btrial\b|not.*regist|10dlc|a2p|campaign|is not a valid|invalid.*\b(to|from|number)\b|sms.?capable|no .{0,20}phone number|21211|21606|21608|21610|21408|63018|30034|30038/.test(r)) {
    return "your account's phone service isn't fully set up yet";
  }
  // The other side said no: carrier filtering, an opted-out recipient, a blocked destination.
  if (/blacklist|block|filter|opt.?ed?.?out|unsubscrib|violat|30007|30006|21612|21614/.test(r)) {
    return "their carrier or opt-out settings blocked it";
  }
  // Transient: network trouble, provider hiccups, rate limits. Trying again later usually works.
  if (/timeout|timed out|network|econn|socket|gateway|too many|rate.?limit|429|50[234]|internal server|temporar|unavailable/.test(r)) {
    return channel === "calendar" ? "Google was briefly unreachable" : "the phone network was briefly unavailable";
  }

  // Unknown failure: still honest, still plain, never the raw text.
  if (channel === "sms") return "the text couldn't be delivered";
  if (channel === "call") return "the call couldn't be placed";
  return "the calendar didn't accept the update";
}
