import { test } from "node:test";
import assert from "node:assert/strict";
import { createFixture, env as devEnv } from "./dev-fixture.mjs";

/**
 * Texts to US numbers are paused until the A2P campaign is approved (2026-09-08, spec rule 8).
 * With no messaging service a US-bound send is not attempted: the row is recorded as skipped with a
 * plain reason, no alert is filed, and Home carries one dismissable line. A Canadian-bound send is
 * unchanged. The day TWILIO_MESSAGING_SERVICE_SID is set, none of this applies.
 */

const { smsPausedFor, showSmsPauseBanner, SMS_PAUSE_REASON, SMS_PAUSE_TITLE } = await import("@/lib/sms-pause");

function withService(value, fn) {
  const before = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (value === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  else process.env.TWILIO_MESSAGING_SERVICE_SID = value;
  const done = () => {
    if (before === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    else process.env.TWILIO_MESSAGING_SERVICE_SID = before;
  };
  try {
    const r = fn();
    return r && typeof r.then === "function" ? r.finally(done) : (done(), r);
  } catch (e) {
    done();
    throw e;
  }
}

const US = "+12125550142";
const CA = "+14165550142";

test("without a messaging service only US-bound and unplaceable recipients are paused", () => {
  withService(undefined, () => {
    assert.equal(smsPausedFor(US), true);
    assert.equal(smsPausedFor("+442071234567"), true);
    assert.equal(smsPausedFor(CA), false);
  });
  withService("MGtest000000000000000000000000000", () => {
    assert.equal(smsPausedFor(US), false);
    assert.equal(smsPausedFor(CA), false);
  });
});

test("Home's banner: paused, has a number, not dismissed for this account in this browser", () => {
  const acct = { id: "acct_1", twilioNumber: "+12125550199" };
  withService(undefined, () => {
    assert.equal(showSmsPauseBanner(acct, undefined), true);
    assert.equal(showSmsPauseBanner(acct, "acct_1"), false, "dismissed for this account");
    assert.equal(showSmsPauseBanner(acct, "acct_other"), true, "a dismissal is per account");
    assert.equal(showSmsPauseBanner({ id: "acct_1", twilioNumber: null }, undefined), false, "nothing is paused for an account with no number");
  });
  withService("MGtest000000000000000000000000000", () => assert.equal(showSmsPauseBanner(acct, undefined), false, "gone the day the service is set"));
  assert.equal(SMS_PAUSE_TITLE, "Text confirmations to US numbers are paused until carrier registration completes");
  assert.match(SMS_PAUSE_REASON, /^[\x20-\x7E]+$/, "the row's reason stays inside GSM-7");
});

test("a US-bound send is recorded as skipped with the plain reason and raises no alert; a Canadian-bound send is attempted", async () => {
  const fixture = await createFixture({ twilioNumber: "+12125550188" });
  const { prisma, account } = fixture;
  const { sendGuestSms, notifyUndeliveredSms } = await import("@/lib/sms");
  try {
    await withService(undefined, async () => {
      const paused = await sendGuestSms(account, US, "Test", { purpose: "job_confirmation" });
      assert.equal(paused.ok, false);
      assert.equal(paused.reason, "paused");
      assert.equal(paused.skipped, true);
      const row = await prisma.smsMessage.findFirst({ where: { accountId: account.id, toNumber: US } });
      assert.equal(row.status, "skipped");
      assert.equal(row.error, SMS_PAUSE_REASON);
      assert.equal(row.numSegments, 0);
      assert.match(row.messageSid, /^paused:/);
      const before = await prisma.notification.count({ where: { accountId: account.id } });
      await notifyUndeliveredSms(account, paused, { name: "Sweep Caller", phone: US, what: "Their visit is booked here, but the confirmation text did not arrive" });
      assert.equal(await prisma.notification.count({ where: { accountId: account.id } }), before, "no alert for a paused text");

      // Canadian-bound: attempted. With Twilio configured locally the fake number is refused by Twilio,
      // which is the unchanged provider-failure path; without credentials it is skipped as not configured.
      const ca = await sendGuestSms(account, CA, "Test", { purpose: "job_confirmation" });
      assert.notEqual(ca.reason, "paused", "a Canadian recipient is never paused");
      if (devEnv.TWILIO_ACCOUNT_SID && devEnv.TWILIO_AUTH_TOKEN) {
        const caRow = await prisma.smsMessage.findFirst({ where: { accountId: account.id, toNumber: CA } });
        assert.ok(caRow, "the attempt is recorded");
        assert.notEqual(caRow.status, "skipped");
      }
    });
  } finally {
    await fixture.remove();
  }
});
