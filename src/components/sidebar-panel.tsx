import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { liveCallCutoff } from "@/lib/calls";
import { todayServiceStatus } from "@/lib/availability";
import { dayBoundsUtc, formatClock, formatTime, nowUtc, timeAgo, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { Badge, LinkButton, StatusDot, classificationTone } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";
  return (
    <div className="flex items-center justify-between">
      <p className={cls}>{children}</p>
      {href ? (
        <Link href={href} className="text-[11px] font-semibold text-brand-700">
          All
        </Link>
      ) : null}
    </div>
  );
}

/** Desktop sidebar content below the nav: today's numbers, what's next, quick actions, hours, host status, recent calls. */
export async function SidebarPanel({ account }: { account: Account }) {
  const tz = account.timeZone;
  const today = todayString(tz);
  const { start, end } = dayBoundsUtc(today, tz);
  const now = nowUtc();
  const twoHoursAgo = liveCallCutoff();
  const nowCutoff = new Date(now.getTime() - 30 * 60_000); // 30-minute grace so a party being seated still shows

  const [todayRes, openOrders, unread, liveCalls, callsToday, nextUp, hours, recentCalls] = await Promise.all([
    prisma.reservation.findMany({ where: { accountId: account.id, startTime: { gte: start, lt: end }, isWaitlist: false, status: { notIn: ["cancelled", "no_show"] } }, select: { partySize: true } }),
    prisma.takeoutOrder.count({ where: { accountId: account.id, status: { in: ["new", "confirmed", "ready"] } } }),
    prisma.notification.count({ where: { accountId: account.id, readAt: null } }),
    prisma.call.count({ where: { accountId: account.id, callStatus: { in: ["ongoing", "registered"] }, startedAt: { gte: twoHoursAgo } } }),
    prisma.call.count({ where: { accountId: account.id, startedAt: { gte: start, lt: end } } }),
    prisma.reservation.findMany({
      where: { accountId: account.id, startTime: { gte: nowCutoff, lt: end }, isWaitlist: false, status: { in: ["booked", "confirmed"] } },
      orderBy: { startTime: "asc" },
      take: 3,
      select: { id: true, guestName: true, partySize: true, startTime: true, status: true },
    }),
    prisma.businessHours.findMany({ where: { accountId: account.id } }),
    prisma.call.findMany({ where: { accountId: account.id }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, callerName: true, callerPhone: true, classification: true, startedAt: true } }),
  ]);
  const covers = todayRes.reduce((s, r) => s + r.partySize, 0);
  const service = todayServiceStatus(hours, tz);

  const stats: { label: string; value: number; href: string; live?: boolean }[] = [
    { label: "Reservations", value: todayRes.length, href: "/reservations" },
    { label: "Covers", value: covers, href: "/reservations" },
    { label: "Open orders", value: openOrders, href: "/takeout" },
    { label: "Unread", value: unread, href: "/notifications" },
    { label: "Calls today", value: callsToday, href: "/calls" },
    { label: "Live now", value: liveCalls, href: "/calls", live: liveCalls > 0 },
  ];

  return (
    <div className="mt-2 space-y-3 px-3">
      <Reveal index={1} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <SectionTitle>Today</SectionTitle>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group rounded-lg px-1 py-0.5 transition-colors hover:bg-gray-50">
              <dd className="flex items-center gap-1.5 text-lg font-bold leading-tight text-ink">
                <CountUp to={s.value} />
                {s.live ? <StatusDot className="text-green-500" label="Live" /> : null}
              </dd>
              <dt className="text-[11px] text-gray-500 group-hover:text-gray-700">{s.label}</dt>
            </Link>
          ))}
        </dl>
      </Reveal>

      <Reveal index={2} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <SectionTitle href={`/reservations?date=${today}`}>Next up</SectionTitle>
        {nextUp.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No more reservations today.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {nextUp.map((r) => (
              <li key={r.id}>
                <Link href={`/reservations/${r.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm transition-colors hover:bg-gray-50">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold tabular-nums">{formatTime(r.startTime, tz)}</span> <span className="text-gray-700">{r.guestName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">×{r.partySize}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal index={3} className="space-y-2">
        <SectionTitle>Quick actions</SectionTitle>
        <LinkButton href="/reservations/new" variant="secondary" size="sm" full className="justify-start">
          📅 New reservation
        </LinkButton>
        <LinkButton href="/takeout/new" variant="secondary" size="sm" full className="justify-start">
          🥡 New takeout order
        </LinkButton>
      </Reveal>

      <Reveal index={4} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <SectionTitle href="/settings?tab=hours">Hours today</SectionTitle>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
          {service.openNow ? (
            <>
              <StatusDot className="text-green-500" /> Open now{service.current && service.periods.length > 1 ? ` · ${service.current}` : ""}
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" /> {service.periods.length === 0 ? "Closed today" : "Closed right now"}
            </>
          )}
        </p>
        {service.periods.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
            {service.periods.map((p) => (
              <li key={`${p.periodName}-${p.open}`} className="flex justify-between gap-2">
                <span>{p.periodName}</span>
                <span className="tabular-nums">
                  {formatClock(p.open)}–{formatClock(p.close)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Reveal>

      <Reveal index={5} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <SectionTitle>AI host</SectionTitle>
        {account.twilioNumber ? (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <StatusDot className="text-green-500" /> {account.hostName} is answering
            </p>
            <p className="text-sm text-gray-600">{formatUsPhone(account.twilioNumber)}</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm font-semibold">{account.hostName} isn&apos;t on a line yet</p>
            <Link href="/settings?tab=phone" className="text-sm font-semibold text-brand-700">
              Connect a number
            </Link>
          </>
        )}
        <Link href="/settings?tab=voice" className="mt-2 block text-xs font-semibold text-gray-500 hover:text-ink">
          🎧 Test call in browser
        </Link>
      </Reveal>

      <Reveal index={6} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <SectionTitle href="/calls">Recent calls</SectionTitle>
        {recentCalls.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No calls yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {recentCalls.map((c) => (
              <li key={c.id}>
                <Link href={`/calls/${c.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-700">{c.callerName ?? (c.callerPhone ? formatUsPhone(c.callerPhone) : "Unknown caller")}</span>
                    <span className="block text-[11px] text-gray-500">{timeAgo(c.startedAt, now)}</span>
                  </span>
                  <Badge tone={classificationTone[c.classification]} className="shrink-0">
                    {humanize(c.classification)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </div>
  );
}
