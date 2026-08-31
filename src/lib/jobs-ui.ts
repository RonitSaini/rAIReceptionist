import type { JobStatus } from "@prisma/client";

/**
 * Presentation for Job status, kept out of the pages so the schedule, the list and the detail view
 * cannot drift apart on what "en route" looks like.
 */

/** Left to right, the order work actually moves through. */
export const JOB_STATUS_ORDER: JobStatus[] = ["requested", "scheduled", "dispatched", "en_route", "in_progress", "completed", "cancelled"];

/** Badge tones, matching the names <Badge tone="..."> accepts. */
export const JOB_STATUS_TONE: Record<JobStatus, string> = {
  requested: "amber",
  scheduled: "blue",
  dispatched: "brand",
  en_route: "brand",
  in_progress: "green",
  completed: "gray",
  cancelled: "red",
};

/**
 * What a human can move a job to next.
 *
 * `requested` is the state the AI leaves an emergency in — somebody has to look at it — so it can
 * go straight to dispatched. Terminal states offer nothing.
 */
type Transition = { status: JobStatus; label: string; tone?: "primary" | "secondary" | "danger" };

export const JOB_TRANSITIONS: Record<JobStatus, Transition[]> = {
  requested: [
    { status: "scheduled", label: "Schedule", tone: "primary" },
    { status: "dispatched", label: "Dispatch now", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  scheduled: [
    { status: "dispatched", label: "Dispatch", tone: "primary" },
    { status: "in_progress", label: "Start" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  dispatched: [
    { status: "en_route", label: "On the way", tone: "primary" },
    { status: "in_progress", label: "Start" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  en_route: [
    { status: "in_progress", label: "Arrived", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  in_progress: [
    { status: "completed", label: "Complete", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "danger" },
  ],
  completed: [],
  cancelled: [],
};
