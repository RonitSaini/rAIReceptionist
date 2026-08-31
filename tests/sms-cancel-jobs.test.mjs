import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Reply-CANCEL for jobs: the promise the confirmation texts have made since Phase 2, honored.
 * The stateless which-one exchange is the part worth pinning — the digit reply only works if both
 * texts are built from the same ordered list, so the wording and the ordering are both locked here.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { isCancelIntent } = await import("../src/app/api/twilio/sms/route.ts");
const { parseCancelChoice } = await import("../src/lib/job-cancel.ts");
const { jobCancelChoiceText, jobCancelledText, cancellationReplyText } = await import("../src/lib/sms.ts");
const { formatDateTime } = await import("../src/lib/time.ts");

const towing = { vertical: "towing", businessName: "Fast Tow", timeZone: "America/New_York", twilioNumber: "+12125550177" };
const plumbing = { vertical: "plumbing", businessName: "Drainworks", timeZone: "America/New_York", twilioNumber: "+12125550111" };
const WHEN = new Date("2026-09-02T18:00:00.000Z");

test("cancel intent covers every profession's nouns, old ones unchanged", () => {
  for (const s of ["CANCEL", "cancel please", "Cancel my reservation", "please cancel my appointment", "can you cancel the tow", "cancel our work order", "Cancel my service call"]) {
    assert.equal(isCancelIntent(s), true, s);
  }
  for (const s of ["1", "2.", "thanks", "running late", "call me back"]) {
    assert.equal(isCancelIntent(s), false, s);
  }
});

test("a bare digit is a choice, anything else is not", () => {
  assert.equal(parseCancelChoice("1"), 1);
  assert.equal(parseCancelChoice(" 2. "), 2);
  assert.equal(parseCancelChoice("cancel 3"), 3);
  assert.equal(parseCancelChoice("4"), null); // never listed more than three
  assert.equal(parseCancelChoice("12"), null);
  assert.equal(parseCancelChoice("CANCEL"), null);
  assert.equal(parseCancelChoice("1 for tuesday"), null);
});

test("scheduled work hands off to the vertical's own cancellation template", () => {
  const text = jobCancelledText(plumbing, { scheduledStart: WHEN });
  assert.equal(text, cancellationReplyText(plumbing, "job", WHEN));
  assert.ok(text.includes(formatDateTime(WHEN, plumbing.timeZone)));
});

test("work with no time on it gets the dateless line", () => {
  assert.equal(jobCancelledText(towing, { scheduledStart: null }), "Fast Tow: Your tow is cancelled. Call us any time if you still need us.");
});

test("the which-one prompt lists dispatches and scheduled visits in the query's order", () => {
  const text = jobCancelChoiceText(towing, [
    { scheduledStart: null, kind: "dispatch" },
    { scheduledStart: WHEN, kind: "service_call" },
  ]);
  assert.equal(text, `Fast Tow: You have 2 upcoming tows. Reply 1 for the tow in progress, 2 for ${formatDateTime(WHEN, towing.timeZone)}.`);
});
