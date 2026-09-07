import { test } from "node:test";
import assert from "node:assert/strict";
import { AVAILABLE_VERTICALS, ONBOARDING_DONE, hasFinishedOnboarding, nextOnboardingStepId, onboardingDoneStep, onboardingPosition, onboardingResumeHref, onboardingStepsFor } from "@/verticals";

/**
 * Onboarding progress is a step ID, and payment comes before phone (2026-09-06).
 *
 * The order matters because a number is only issued to a paying account: the step that takes the
 * payment has to run before the step that hands out the number, or every new signup meets a locked
 * step. The ID matters because it is what makes that reorder - and the next one - a one-line
 * change to a list instead of a data migration.
 */

test("payment precedes phone in every vertical, and they are the last two steps", () => {
  for (const slug of AVAILABLE_VERTICALS) {
    const ids = onboardingStepsFor(slug).map((s) => s.id);
    assert.deepEqual(ids.slice(-2), ["payment", "phone"], `${slug}: ${ids.join(" > ")}`);
    assert.equal(ids[0], "account", slug);
    assert.equal(new Set(ids).size, ids.length, `${slug} repeats a step id`);
  }
});

test("a position is just where an id sits in this vertical's list", () => {
  assert.equal(onboardingPosition("restaurant", "account"), 1);
  assert.equal(onboardingPosition("restaurant", "payment"), 7);
  assert.equal(onboardingPosition("restaurant", "phone"), 8);
  assert.equal(onboardingPosition("restaurant", ONBOARDING_DONE), 9);
  assert.equal(onboardingPosition("restaurant", ONBOARDING_DONE), onboardingDoneStep("restaurant"));
  // The dispatch-first trades have two more steps in front; the same ids sit two places later.
  assert.equal(onboardingPosition("towing", "payment"), 9);
  assert.equal(onboardingPosition("towing", "phone"), 10);
  assert.equal(onboardingPosition("towing", ONBOARDING_DONE), 11);
});

test("an id this vertical does not have lands on a step that renders, never on nothing", () => {
  // A row written before a step was removed, or a hand edit: the owner is sent to business basics.
  assert.equal(onboardingPosition("restaurant", "service-area"), 2);
  assert.equal(onboardingResumeHref({ vertical: "restaurant", onboardingStepId: "no-such-step" }), "/onboarding/2");
});

test("finishing a step stores the next id, and finishing the last stores done", () => {
  assert.equal(nextOnboardingStepId("restaurant", "voice"), "payment");
  assert.equal(nextOnboardingStepId("restaurant", "payment"), "phone");
  assert.equal(nextOnboardingStepId("restaurant", "phone"), ONBOARDING_DONE);
  assert.equal(nextOnboardingStepId("plumbing", "emergencies"), "voice");
  assert.throws(() => nextOnboardingStepId("restaurant", "service-area"), /not part of the restaurant onboarding flow/);
});

test("done is done, whatever the vertical", () => {
  assert.equal(hasFinishedOnboarding({ onboardingStepId: ONBOARDING_DONE }), true);
  assert.equal(hasFinishedOnboarding({ onboardingStepId: "phone" }), false);
  assert.equal(onboardingResumeHref({ vertical: "hvac", onboardingStepId: "phone" }), "/onboarding/9");
});
