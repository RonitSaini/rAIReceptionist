import type { JobStatus } from "@prisma/client";
import type { Archetype } from "@/verticals/types";

/**
 * Presentation for Job status, kept out of the pages so the schedule, the list and the detail view
 * cannot drift apart on what a job's next step looks like.
 */

/** Every value the column can hold, left to right — including the two field service no longer uses. */
export const JOB_STATUS_ORDER: JobStatus[] = ["requested", "scheduled", "dispatched", "en_route", "in_progress", "completed", "cancelled"];

/** Badge tones, matching the names <Badge tone="..."> accepts. */
export const JOB_STATUS_TONE: Record<JobStatus, string> = {
  requested: "amber",
  scheduled: "blue",
  dispatched: "brand",
  en_route: "brand",
  in_progress: "green",
  completed: "green",
  cancelled: "red",
};

/**
 * The statuses a new job of this archetype can actually reach.
 *
 * Field service stops at three live ones. `dispatched` and `en_route` are legacy there — real rows
 * still sit in them, so they stay in `JOB_STATUS_ORDER` and keep their tones, but nothing new
 * arrives and a filter tab reading "Dispatched 0" forever is just debris on the screen.
 */
export function jobStatusOrder(archetype: Archetype): JobStatus[] {
  return archetype === "field_service" ? JOB_STATUS_ORDER.filter((s) => s !== "dispatched" && s !== "en_route") : JOB_STATUS_ORDER;
}

type Transition = { status: JobStatus; label: string; tone?: "primary" | "secondary" | "danger" };

const START: Transition = { status: "in_progress", label: "Start", tone: "primary" };
const COMPLETED: Transition = { status: "completed", label: "Completed", tone: "primary" };
const SCHEDULE: Transition = { status: "scheduled", label: "Schedule" };
const CANCEL: Transition = { status: "cancelled", label: "Cancel", tone: "danger" };

/**
 * Field service: one button to start the work, one to finish it.
 *
 * The chain that used to sit here — Dispatch, then On the way, then Arrived — is gone as of
 * 2026-09-06 at the owner's request. A two-van plumbing outfit already knows the van left; four
 * taps to record a journey nobody is watching is four taps of nothing, and every one of them was
 * another chance for the board to say something untrue about where somebody was.
 *
 * `Schedule` survives: it is the step BEFORE the old chain, not part of it, and it is what puts a
 * job on the calendar. `Cancel` survives everywhere for obvious reasons.
 *
 * `dispatched` and `en_route` keep entries because rows are still sitting in them — 3 in dev when
 * this was written, and production has its own. Nothing new can arrive there (the buttons that led
 * there are gone, and no AI handler ever set them), but a job left mid-flight must not become a
 * dead end on somebody's board. They offer both ends of the new flow so one tap closes them out.
 */
const FIELD_SERVICE_TRANSITIONS: Record<JobStatus, Transition[]> = {
  requested: [START, SCHEDULE, CANCEL],
  scheduled: [START, CANCEL],
  dispatched: [START, COMPLETED, CANCEL],
  en_route: [START, COMPLETED, CANCEL],
  in_progress: [COMPLETED, CANCEL],
  completed: [],
  cancelled: [],
};

/**
 * Every other archetype that books a Job: shop visits (auto repair, veterinary) and
 * property-management work orders. Unchanged — a work order really does get handed to somebody and
 * really is worth tracking on its way, and a shop's own simplification is not this one to make.
 */
const STAGED_TRANSITIONS: Record<JobStatus, Transition[]> = {
  requested: [
    { status: "scheduled", label: "Schedule", tone: "primary" },
    { status: "dispatched", label: "Dispatch now", tone: "primary" },
    CANCEL,
  ],
  scheduled: [
    { status: "dispatched", label: "Dispatch", tone: "primary" },
    { status: "in_progress", label: "Start" },
    CANCEL,
  ],
  dispatched: [
    { status: "en_route", label: "On the way", tone: "primary" },
    { status: "in_progress", label: "Start" },
    CANCEL,
  ],
  en_route: [
    { status: "in_progress", label: "Arrived", tone: "primary" },
    CANCEL,
  ],
  in_progress: [
    { status: "completed", label: "Complete", tone: "primary" },
    CANCEL,
  ],
  completed: [],
  cancelled: [],
};

/**
 * What a human can move this job to next.
 *
 * Takes the archetype rather than reading a global table, because the answer genuinely differs by
 * the shape of the work — and because a call site that has to name the archetype cannot forget
 * that it matters. The first entry is the primary action: the dashboard card shows only that one.
 */
export function jobTransitions(archetype: Archetype, status: JobStatus): Transition[] {
  return (archetype === "field_service" ? FIELD_SERVICE_TRANSITIONS : STAGED_TRANSITIONS)[status];
}
