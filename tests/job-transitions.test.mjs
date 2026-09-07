import { test } from "node:test";
import assert from "node:assert/strict";
import { JOB_STATUS_ORDER, jobStatusOrder, jobTransitions } from "@/lib/jobs-ui";

/**
 * Field service moves a job with two buttons: Start, then Completed.
 *
 * The dispatch chain (Dispatch -> On the way -> Arrived) was removed on 2026-09-06. These tests
 * exist because the removal has to hold in three places at once — the dashboard card, the dispatch
 * queue and the job detail page all render from this one table — and because the two dropped
 * statuses still exist in the database enum, so nothing about the schema stops them creeping back.
 *
 * The other archetypes keep the chain, so the table is checked from both sides: a regression that
 * simplified everything would be as wrong as one that simplified nothing.
 */

const LIVE = ["requested", "scheduled", "dispatched", "en_route", "in_progress"];
const TERMINAL = ["completed", "cancelled"];
const targets = (archetype, status) => jobTransitions(archetype, status).map((t) => t.status);
const labels = (archetype, status) => jobTransitions(archetype, status).map((t) => t.label);

test("field service never sends a job to dispatched or en route", () => {
  for (const status of JOB_STATUS_ORDER) {
    for (const target of targets("field_service", status)) {
      assert.ok(!["dispatched", "en_route"].includes(target), `${status} still offers ${target}`);
    }
  }
});

test("Start, then Completed", () => {
  // The first entry is the primary action, and the dashboard card shows only that one.
  assert.deepEqual(labels("field_service", "requested"), ["Start", "Schedule", "Cancel"]);
  assert.deepEqual(labels("field_service", "scheduled"), ["Start", "Cancel"]);
  assert.deepEqual(labels("field_service", "in_progress"), ["Completed", "Cancel"]);
  assert.equal(targets("field_service", "scheduled")[0], "in_progress");
  assert.equal(targets("field_service", "in_progress")[0], "completed");
});

test("a job parked in a retired status is not a dead end", () => {
  // Real rows sit in these; the buttons that put them there are gone, so the ones that remain have
  // to lead somewhere or the job is stuck on the board forever.
  for (const status of ["dispatched", "en_route"]) {
    const next = targets("field_service", status);
    assert.ok(next.includes("in_progress"), `${status} cannot be started`);
    assert.ok(next.includes("completed"), `${status} cannot be finished`);
  }
});

test("terminal states stay terminal", () => {
  for (const archetype of ["field_service", "shop_appointment", "property_management"]) {
    for (const status of TERMINAL) assert.deepEqual(jobTransitions(archetype, status), []);
  }
});

test("shop visits and work orders keep the staged chain", () => {
  for (const archetype of ["shop_appointment", "property_management"]) {
    assert.ok(targets(archetype, "scheduled").includes("dispatched"), `${archetype} lost Dispatch`);
    assert.ok(targets(archetype, "dispatched").includes("en_route"), `${archetype} lost On the way`);
    assert.deepEqual(labels(archetype, "in_progress"), ["Complete", "Cancel"]);
  }
});

test("every transition points at a status the column can actually hold", () => {
  for (const archetype of ["field_service", "shop_appointment", "property_management"]) {
    for (const status of JOB_STATUS_ORDER) {
      for (const target of targets(archetype, status)) {
        assert.ok(JOB_STATUS_ORDER.includes(target), `${archetype}/${status} -> ${target} is not a JobStatus`);
        assert.notEqual(target, status, `${archetype}/${status} offers itself`);
      }
    }
  }
});

test("every live status can still be cancelled", () => {
  for (const archetype of ["field_service", "shop_appointment", "property_management"]) {
    for (const status of LIVE) assert.ok(targets(archetype, status).includes("cancelled"), `${archetype}/${status}`);
  }
});

test("the retired statuses drop out of the field-service filter row", () => {
  assert.deepEqual(jobStatusOrder("field_service"), ["requested", "scheduled", "in_progress", "completed", "cancelled"]);
  for (const archetype of ["shop_appointment", "property_management"]) {
    assert.deepEqual(jobStatusOrder(archetype), JOB_STATUS_ORDER);
  }
});
