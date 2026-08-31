import type { ReactNode } from "react";
import Link from "next/link";
import type { Account } from "@prisma/client";
import { vocabularyFor } from "@/verticals";
import { ArrowRightIcon } from "@/components/icons";
import { formatDateTime, formatDuration, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { callSeriesFor, type loadDashboard } from "@/lib/dashboard";
import { Badge, Card, classificationTone } from "@/components/ui";
import { NotificationList } from "@/components/notification-list";
import { Reveal } from "@/components/reveal";
import { CountUp } from "@/components/count-up";
import { StackedColumns } from "@/components/charts";

/**
 * The parts of the home page that are the same whatever the business is: what happened since you
 * last signed in, who is owed a call back, and how the phone has been this week. None of it is
 * reservation-shaped, so both archetypes render it from here rather than keeping two copies that
 * drift. The markup is deliberately unchanged from the single-vertical version it was lifted out
 * of — a restaurant's rendered page has to stay byte-for-byte what it was.
 */

type Dash = Awaited<ReturnType<typeof loadDashboard>>;
type Notification = Parameters<typeof NotificationList>[0]["items"][number];

/** Quiet text link used for card actions — the page keeps a single primary button (the header CTA). */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
      {children} <ArrowRightIcon size={16} />
    </Link>
  );
}

export function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-500">{children}</p>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-black tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

/** "Needs your attention" / "Since you last signed in" plus callbacks owed. Renders nothing to act on as a single line. */
export function NeedsYou({
  unacknowledged,
  fresh,
  callbacks,
  previousSeenAt,
  now,
  tz,
  account,
}: {
  unacknowledged: Notification[];
  fresh: Notification[];
  callbacks: Dash["callbacks"];
  previousSeenAt: Date | null;
  now: Date;
  tz: string;
  account: Account;
}) {
  const hasNews = unacknowledged.length > 0 || fresh.length > 0;
  const hasCallbacks = callbacks.length > 0;

  if (!hasNews && !hasCallbacks) {
    return (
      <Reveal index={1}>
        <p className="text-sm text-gray-500">
          Nothing new since you last signed in{previousSeenAt ? ` (${formatDateTime(previousSeenAt, tz)})` : ""}.{" "}
          <Link href="/notifications" className="font-semibold text-brand-700">
            Inbox
          </Link>
        </p>
      </Reveal>
    );
  }

  return (
    <div className={`grid gap-5 ${hasNews && hasCallbacks ? "lg:grid-cols-2 lg:items-start" : ""}`}>
      {hasNews ? (
        <Reveal index={1}>
          <Card title={unacknowledged.length > 0 ? "Needs your attention" : "Since you last signed in"} className={unacknowledged.length > 0 ? "border-red-200" : undefined} action={<CardLink href="/notifications">Inbox</CardLink>}>
            <NotificationList items={[...unacknowledged, ...fresh].slice(0, 6)} compact words={vocabularyFor(account)} />
            {unacknowledged.length + fresh.length > 6 ? (
              <Link href="/notifications" className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700">
                See all {unacknowledged.length + fresh.length} <ArrowRightIcon size={16} />
              </Link>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {hasCallbacks ? (
        <Reveal index={hasNews ? 2 : 1}>
          <Card
            title={
              <>
                Callbacks owed · <CountUp to={callbacks.length} />
              </>
            }
            action={<CardLink href="/calls?type=message">Messages</CardLink>}
          >
            <ul className="divide-y divide-gray-100">
              {callbacks.map((c, i) => (
                <Reveal as="li" index={i + 1} key={c.id} className="py-2.5">
                  <Link href={`/calls/${c.id}`} className="lift -mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-1 hover:bg-gray-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {c.callerName ?? "Unknown caller"}
                        {c.callerPhone ? <span className="font-normal text-gray-500"> · {formatUsPhone(c.callerPhone)}</span> : null}
                      </span>
                      {c.messageText ? <span className="line-clamp-1 text-sm text-gray-600">{c.messageText}</span> : null}
                      <span className="text-xs text-gray-500">{timeAgo(c.startedAt, now)}</span>
                    </span>
                    <Badge tone={c.escalationReason ? "red" : classificationTone[c.classification]} className="shrink-0">
                      {c.escalationReason ? humanize(c.escalationReason) : humanize(c.classification)}
                    </Badge>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </Card>
        </Reveal>
      ) : null}
    </div>
  );
}

/** Calls per day for the last week, with the AI's performance underneath. */
export function CallsThisWeek({ account, dash }: { account: Account; dash: Dash }) {
  const s = dash.ai.sentiment;
  const sentimentTotal = s.positive + s.neutral + s.negative;
  const mood = sentimentTotal === 0 ? null : s.positive >= s.neutral && s.positive >= s.negative ? "Positive" : s.negative > s.neutral ? "Negative" : "Neutral";
  const moodPct = mood ? Math.round(((mood === "Positive" ? s.positive : mood === "Negative" ? s.negative : s.neutral) / sentimentTotal) * 100) : null;
  const fmtHour = (hr: number) => `${hr % 12 === 0 ? 12 : hr % 12} ${hr < 12 ? "AM" : "PM"}`;

  return (
    <Card title="Calls this week" action={<span className="text-xs text-gray-500">Last 7 days · by outcome</span>}>
      <StackedColumns days={dash.callsByDay} series={[...callSeriesFor(account)]} title="Calls per day, last 7 days, by outcome" />
      {dash.ai.answered > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-4">
          <Stat label={`${account.hostName} answered`} value={<CountUp to={dash.ai.answered} />} />
          <Stat label="Handled solo" value={dash.ai.handledPct != null ? `${dash.ai.handledPct}%` : "—"} sub="no callback needed" />
          <Stat label="Avg length" value={formatDuration(dash.ai.avgDuration)} />
          <Stat label="Caller mood" value={mood ?? "—"} sub={[moodPct != null ? `${moodPct}% of calls` : null, dash.ai.peakHour != null ? `busiest ${fmtHour(dash.ai.peakHour)}` : null].filter(Boolean).join(" · ") || undefined} />
        </div>
      ) : null}
    </Card>
  );
}
