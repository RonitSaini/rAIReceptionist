import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

/**
 * The sad path for a veterinary account's emergency referral number.
 *
 * Onboarding will not finish without it. This is about afterwards: someone opening Settings and
 * clearing the box. The prompt does degrade honestly when the number is missing — that fallback is
 * tested separately — but that is the safety net, not a reason to let the field be emptied.
 */

const base = { referralName: undefined, emergencyTypes: [], jobSlotMinutes: 30, maxJobsPerDay: "" };

async function validate(input, slug = "veterinary") {
  const { validateShopHandoffs } = await import("../src/lib/shop-validation.ts");
  const { verticalFor } = await import("../src/verticals/index.ts");
  const definition = verticalFor(slug);
  return validateShopHandoffs({ ...base, ...input }, definition.referral, definition.emergencyTypes.map((e) => e.key));
}

test("a vet cannot clear the emergency referral number", async () => {
  for (const empty of ["", "   ", "\t"]) {
    const r = await validate({ referralPhone: empty });
    assert.equal(r.ok, false, `"${empty}" should be rejected`);
    assert.match(r.error, /required and cannot be removed/i);
    // The reason has to be in the message: someone reading this is about to argue with it.
    assert.match(r.error, /answers an emergency with nothing/i);
  }
});

test("a vet cannot save a referral number that is not a phone number", async () => {
  for (const junk of ["call us", "911", "+44 20 7946 0000", "12345"]) {
    const r = await validate({ referralPhone: junk });
    assert.equal(r.ok, false, `"${junk}" should be rejected`);
  }
});

test("a valid referral number saves, in any of the shapes people type", async () => {
  for (const good of ["+12125550188", "212-555-0188", "(212) 555-0188", "2125550188"]) {
    const r = await validate({ referralPhone: good });
    assert.equal(r.ok, true, `"${good}" should be accepted`);
    assert.equal(r.value.referralPhone, "+12125550188");
  }
});

test("a garage may leave its towing partner blank, because it may genuinely not have one", async () => {
  const r = await validate({ referralPhone: "", jobSlotMinutes: 60 }, "auto_repair");
  assert.equal(r.ok, true, "auto repair's referral is optional");
  assert.equal(r.value.referralPhone, null);
});

test("the required flag comes from the definition, not from a hardcoded slug", async () => {
  const { verticalFor } = await import("../src/verticals/index.ts");
  assert.equal(verticalFor("veterinary").referral.required, true);
  assert.equal(verticalFor("auto_repair").referral.required, false);
});
