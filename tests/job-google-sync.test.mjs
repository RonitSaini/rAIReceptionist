import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * The one rule of Phase 6, pinned: any Job with a time on it becomes a calendar event, and a
 * dispatch without one becomes an event covering the response window from the moment of the
 * request. Everything else about the sync is plumbing; this is the part that decides what a tow
 * operator's calendar actually shows at 2am.
 */

process.env.DATABASE_URL ??= "postgresql://snapshot:snapshot@localhost:5432/snapshot";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { jobEventWindow, jobEventGone } = await import("../src/lib/google-calendar.ts");

const T0 = new Date("2026-09-02T14:00:00.000Z");
const at = (min) => new Date(T0.getTime() + min * 60_000);
const account = (over = {}) => ({ jobSlotMinutes: 120, responseTimeMaxMinutes: null, ...over });
const job = (over = {}) => ({ kind: "service_call", status: "scheduled", scheduledStart: null, scheduledEnd: null, createdAt: T0, ...over });

test("scheduled work uses its slot", () => {
  const w = jobEventWindow(job({ scheduledStart: at(60), scheduledEnd: at(180) }), account());
  assert.deepEqual(w, { start: at(60), end: at(180) });
});

test("a schedule with no end falls back to the account's slot length", () => {
  const w = jobEventWindow(job({ scheduledStart: at(60) }), account({ jobSlotMinutes: 90 }));
  assert.deepEqual(w, { start: at(60), end: at(150) });
});

test("a dispatch gets the response window from the moment of the request", () => {
  const w = jobEventWindow(job({ kind: "dispatch" }), account({ responseTimeMaxMinutes: 45 }));
  assert.deepEqual(w, { start: T0, end: at(45) });
});

test("a dispatch with no configured response time shows an hour", () => {
  const w = jobEventWindow(job({ kind: "dispatch" }), account());
  assert.deepEqual(w, { start: T0, end: at(60) });
});

test("a dispatch that was later given a slot uses the slot, not the request window", () => {
  const w = jobEventWindow(job({ kind: "dispatch", scheduledStart: at(120), scheduledEnd: at(150) }), account({ responseTimeMaxMinutes: 45 }));
  assert.deepEqual(w, { start: at(120), end: at(150) });
});

test("a work order with no scheduled time occupies no calendar", () => {
  assert.equal(jobEventWindow(job({ kind: "work_order" }), account()), null);
  assert.equal(jobEventWindow(job(), account()), null);
});

test("completing a job KEEPS its calendar event — deliberate, do not 'fix'", () => {
  // The visit happened. The calendar is the record of the day; marking work done must never make
  // the afternoon vanish from it. Only cancellation (or losing the time entirely) removes an event.
  assert.equal(jobEventGone(job({ status: "completed", scheduledStart: at(60), scheduledEnd: at(120) }), account()), false);
  assert.equal(jobEventGone(job({ kind: "dispatch", status: "completed" }), account()), false);
  assert.equal(jobEventGone(job({ status: "cancelled", scheduledStart: at(60), scheduledEnd: at(120) }), account()), true);
  // Losing the window is the other way out: a completed but never-scheduled work order has no event to keep.
  assert.equal(jobEventGone(job({ kind: "work_order", status: "completed" }), account()), true);
});
