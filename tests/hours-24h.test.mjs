import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * A day that never closes.
 *
 * The 24-hour toggle in Settings -> Hours does not add a column; it writes the one pair of times
 * every engine in the app already reads as "runs past midnight" — 00:00 to 00:00 — and this pins
 * that the convention holds where it matters: the clock arithmetic that decides whether a business
 * is open right now, and the strings the agent reads out loud.
 */

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { ALL_DAY_CLOSE, ALL_DAY_OPEN, formatHourRange, isAllDay } = await import("../src/lib/time.ts");
const { periodsForDay, todayServiceStatus } = await import("../src/lib/availability.ts");

const row = (dayOfWeek, open, close, extra = {}) => ({
  id: `h${dayOfWeek}`,
  accountId: "acct_test",
  dayOfWeek,
  periodName: "Open 24 hours",
  open,
  close,
  isClosed: false,
  sortOrder: 0,
  ...extra,
});

/** Every day the same, so the assertions hold whatever day the suite runs on. */
const everyDay = (open, close, extra) => Array.from({ length: 7 }, (_, d) => row(d, open, close, extra));

test("only midnight-to-midnight counts as all day", () => {
  assert.equal(ALL_DAY_OPEN, "00:00");
  assert.equal(ALL_DAY_CLOSE, "00:00");
  assert.equal(isAllDay(ALL_DAY_OPEN, ALL_DAY_CLOSE), true);
  // A same-time pair that is NOT the canonical one stays a mistake the save action rejects, rather
  // than silently becoming a 24-hour day.
  assert.equal(isAllDay("09:00", "09:00"), false);
  assert.equal(isAllDay("11:00", "21:00"), false);
  assert.equal(isAllDay("00:00", "23:59"), false);
});

test("a round-the-clock day never renders as 12:00 AM-12:00 AM", () => {
  assert.equal(formatHourRange(ALL_DAY_OPEN, ALL_DAY_CLOSE), "24 hours");
  // Spoken down a phone line, "12:00 AM to 12:00 AM" is worse than wrong, it is confusing.
  assert.ok(!formatHourRange(ALL_DAY_OPEN, ALL_DAY_CLOSE).includes("12:00"));
  // Ordinary and overnight ranges are untouched.
  assert.equal(formatHourRange("11:00", "21:00"), "11:00 AM–9:00 PM");
  assert.equal(formatHourRange("18:00", "02:00"), "6:00 PM–2:00 AM");
  // The prompts join with a hyphen rather than an en dash.
  assert.equal(formatHourRange("11:00", "21:00", "-"), "11:00 AM-9:00 PM");
  assert.equal(formatHourRange(ALL_DAY_OPEN, ALL_DAY_CLOSE, "-"), "24 hours");
});

test("a 24-hour day is open right now, whenever now is", () => {
  const status = todayServiceStatus(everyDay(ALL_DAY_OPEN, ALL_DAY_CLOSE), "America/New_York");
  assert.equal(status.openNow, true, "a business that never closes is open at this moment");
  assert.equal(status.periods.length, 1);
  assert.equal(status.periods[0].open, ALL_DAY_OPEN);
});

test("a closed day and an ordinary day still behave", () => {
  // Closed rows are filtered out entirely, so no period and never open.
  const closed = todayServiceStatus(everyDay("00:00", "00:00", { isClosed: true, periodName: "Closed" }), "America/New_York");
  assert.equal(closed.periods.length, 0);
  assert.equal(closed.openNow, false);

  // A one-minute window is open for exactly one minute a day, so it is almost certainly shut now —
  // the point being that `openNow` is not simply true for everything after this change.
  const sliver = todayServiceStatus(everyDay("03:00", "03:01"), "America/New_York");
  assert.equal(sliver.periods.length, 1);
});

test("periodsForDay hands the all-day period straight through", () => {
  const periods = periodsForDay(everyDay(ALL_DAY_OPEN, ALL_DAY_CLOSE), 3);
  assert.equal(periods.length, 1);
  assert.deepEqual(
    { open: periods[0].open, close: periods[0].close },
    { open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE },
    "the engines do their own midnight wrap; nothing is normalized away before they see it",
  );
});
