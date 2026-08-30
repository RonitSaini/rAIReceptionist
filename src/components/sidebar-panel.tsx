import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { liveCallCutoff } from "@/lib/calls";
import { todayServiceStatus } from "@/lib/availability";
import { dayBoundsUtc, formatClock, formatTime, nowUtc, timeAgo, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { stripeConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import { humanize } from "@/lib/constants";
import { Badge, LinkButton, StatusDot, classificationTone } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { DrawIcon } from "@/components/draw-icon";
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
    prisma.call.findMany({ where: { accountId: account.id }, orderBy: { startedAt: "desc" }, take: 8, select: { id: true, callerName: true, callerPhone: true, classification: true, startedAt: true } }),
  ]);
  const covers = todayRes.reduce((s, r) => s + r.partySize, 0);
  const service = todayServiceStatus(hours, tz);

  // `live`: values that change while the layout stays mounted (after actions refresh it) — animate the digits, not a re-tween.
  const stats: { label: string; value: number; href: string; live?: boolean; dot?: boolean }[] = [
    { label: "Reservations", value: todayRes.length, href: "/reservations" },
    { label: "Covers", value: covers, href: "/reservations" },
    { label: "Open orders", value: openOrders, href: "/takeout" },
    { label: "Unread", value: unread, href: "/notifications", live: true },
    { label: "Calls today", value: callsToday, href: "/calls", live: true },
    { label: "Live now", value: liveCalls, href: "/calls", live: true, dot: liveCalls > 0 },
  ];

  return (
    <div className="flex h-full flex-col gap-3 px-3 pt-2 short:gap-2 short:pt-1">
      <Reveal index={1} className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5">
        <SectionTitle>Today</SectionTitle>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 short:mt-1 short:grid-cols-3 short:gap-y-1">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="group rounded-lg px-1 py-0.5 transition-colors hover:bg-gray-50">
              <dd className="flex items-center gap-1.5 text-lg font-bold leading-tight text-ink short:text-base">
                <CountUp to={s.value} live={s.live} />
                {s.dot ? <StatusDot className="text-green-500" label="Live" /> : null}
              </dd>
              <dt className="text-[11px] text-gray-500 group-hover:text-gray-700">{s.label}</dt>
            </Link>
          ))}
        </dl>
      </Reveal>

      <Reveal index={2} className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 micro:hidden">
        <SectionTitle href={`/reservations?date=${today}`}>Next up</SectionTitle>
        {nextUp.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No more reservations today.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {nextUp.map((r, i) => (
              <li key={r.id} className={i >= 2 ? "tiny:hidden" : ""}>
                <Link href={`/reservations/${r.id}`} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm transition-colors hover:bg-gray-50">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold tabular-nums">{formatTime(r.startTime, tz)}</span> <span className="text-gray-700">{r.guestName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">×{r.partySize}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal index={3} className="space-y-2 short:flex short:gap-2 short:space-y-0">
        <div className="short:hidden">
          <SectionTitle>Quick actions</SectionTitle>
        </div>
        <LinkButton href="/reservations/new" variant="secondary" size="sm" full className="justify-start short:flex-1 short:justify-center" title="New reservation">
          <DrawIcon name="calendar" size={16} draw={false} /> <span className="short:sr-only">New </span>reservation
        </LinkButton>
        <LinkButton href="/takeout/new" variant="secondary" size="sm" full className="justify-start short:flex-1 short:justify-center" title="New takeout order">
          <DrawIcon name="bag" size={16} draw={false} /> <span className="short:sr-only">New </span>takeout
        </LinkButton>
      </Reveal>

      <Reveal index={4} className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 micro:hidden">
        <SectionTitle href="/settings?tab=hours">Hours today</SectionTitle>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
          {service.openNow ? (
            <>
              <StatusDot className="text-green-500" /> Open now{service.current && service.periods.length > 1 ? ` · ${service.current}` : ""}
            </>
          ) : (
            <>
              {/* Steady dot: closed is the expected state, not a live one — ripple would say the opposite. */}
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" /> {service.periods.length === 0 ? "Closed today" : "Closed right now"}
            </>
          )}
        </p>
        {service.periods.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-gray-600 tiny:hidden">
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

      <Reveal index={5} className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5">
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
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <StatusDot className="text-amber-500" /> {account.hostName} isn&apos;t on a line yet
            </p>
            {!stripeConfigured() || subscriptionActive(account) ? (
              <Link href="/settings?tab=phone" className="text-sm font-semibold text-brand-700">
                Connect a number
              </Link>
            ) : (
              <Link href="/settings?tab=billing" className="text-sm font-semibold text-brand-700">
                Subscribe to connect a number
              </Link>
            )}
          </>
        )}
        <Link href="/settings?tab=voice" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-ink tiny:hidden">
          <DrawIcon name="headphones" size={14} draw={false} /> Test call in browser
        </Link>
      </Reveal>

      <Reveal index={6} className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 tiny:hidden">
        <SectionTitle href="/calls">Recent calls</SectionTitle>
        {recentCalls.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No calls yet.</p>
        ) : (
          <ul className="fade-bottom relative mt-2 grid min-h-0 flex-1 auto-rows-[44px] content-start overflow-hidden pb-7">
            {recentCalls.map((c, i) => (
              <Reveal as="li" index={i + 1} key={c.id} className="min-h-0 min-w-0">
                <Link href={`/calls/${c.id}`} className="lift flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-700">{c.callerName ?? (c.callerPhone ? formatUsPhone(c.callerPhone) : "Unknown caller")}</span>
                    <span className="block text-[11px] text-gray-500">{timeAgo(c.startedAt, now)}</span>
                  </span>
                  <Badge tone={classificationTone[c.classification]} className="shrink-0 px-2 text-[10px]">
                    {humanize(c.classification)}
                  </Badge>
                </Link>
              </Reveal>
            ))}
          </ul>
        )}
      </Reveal>
    </div>
  );
}
