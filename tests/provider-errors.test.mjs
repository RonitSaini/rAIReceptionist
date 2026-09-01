import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Notification bodies and queue banners never show raw provider error text. The mapper turns real
 * Twilio/Retell/Google failures into one plain owner-facing clause; the raw text lives on the
 * diagnostic record (SmsMessage.error, Call.managerCallError, GoogleCalendarConnection.lastError).
 */

const { friendlyProviderError } = await import("../src/lib/provider-errors.ts");

// Real-shaped raw errors, the kind that used to land verbatim in an owner's notification.
const RAW = {
  trial: "The number +12125550143 is unverified. Trial accounts cannot send messages to unverified numbers; verify +12125550143 at twilio.com/user/account/phone-numbers/verified",
  a2p: "Message delivery failed: error 30034 - US A2P 10DLC - Message from an Unregistered Number",
  invalidFrom: "The 'From' number +1212555 is not a valid, SMS-capable inbound phone number or short code for your account.",
  trialDest: "No Twilio trial phone number is assigned for messaging to this destination", // the exact string this account produces today
  filtered: "Error 30007: Message filtered by carrier",
  network: "ETIMEDOUT: connect timed out after 15000ms",
  googleGrant: 'invalid_grant: Token has been expired or revoked. {"error":"invalid_grant"}',
  mystery: "Error 99999: something entirely unexpected happened (request req_8f2ab)",
};

test("common failures map to plain owner-facing language", () => {
  assert.equal(friendlyProviderError("sms", RAW.trial), "your account's phone service isn't fully set up yet");
  assert.equal(friendlyProviderError("sms", RAW.a2p), "your account's phone service isn't fully set up yet");
  assert.equal(friendlyProviderError("call", RAW.invalidFrom), "your account's phone service isn't fully set up yet");
  assert.equal(friendlyProviderError("sms", RAW.trialDest), "your account's phone service isn't fully set up yet");
  assert.equal(friendlyProviderError("sms", RAW.filtered), "their carrier or opt-out settings blocked it");
  assert.equal(friendlyProviderError("call", RAW.network), "the phone network was briefly unavailable");
  assert.equal(friendlyProviderError("calendar", RAW.googleGrant), "the Google connection needs to be reconnected");
});

test("unknown failures still come out plain, per channel", () => {
  assert.equal(friendlyProviderError("sms", RAW.mystery), "the text couldn't be delivered");
  assert.equal(friendlyProviderError("call", RAW.mystery), "the call couldn't be placed");
  assert.equal(friendlyProviderError("calendar", RAW.mystery), "the calendar didn't accept the update");
  assert.equal(friendlyProviderError("sms", null), "the text couldn't be delivered");
});

test("the raw text never leaks into the mapped clause", () => {
  for (const raw of Object.values(RAW)) {
    for (const channel of ["sms", "call", "calendar"]) {
      const mapped = friendlyProviderError(channel, raw);
      // No error codes, no phone numbers, no URLs, no JSON — nothing from the provider's mouth.
      assert.ok(!/\d{4,}|twilio|retell|http|json|\{|\+1/i.test(mapped), `leaked provider text for ${channel}: ${mapped}`);
      assert.ok(mapped.length < 80, "owner-facing clause stays one plain phrase");
    }
  }
});
