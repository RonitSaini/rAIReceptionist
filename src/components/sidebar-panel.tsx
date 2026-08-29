import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayBoundsUtc, todayString } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { LinkButton, StatusDot } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";

/** Desktop sidebar content below the nav: today's numbers, quick actions, and AI host status. */
export async function SidebarPanel({ account }: { account: Account }) {
  const { start, end } = dayBoundsUtc(todayString(account.timeZone), account.timeZone);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);

  const [todayRes, openOrders, unread, liveCalls, callsToday] = await Promise.all([
    prisma.reservation.findMany({ where: { accountId: account.id, startTime: { gte: start, lt: end }, isWaitlist: false, status: { notIn: ["cancelled", "no_show"] } }, select: { partySize: true } }),
    prisma.takeoutOrder.count({ where: { accountId: account.id, status: { in: ["new", "confirmed", "ready"] } } }),
    prisma.notification.count({ where: { accountId: account.id, readAt: null } }),
    prisma.call.count({ where: { accountId: account.id, callStatus: { in: ["ongoing", "registered"] }, startedAt: { gte: twoHoursAgo } } }),
    prisma.call.count({ where: { accountId: account.id, startedAt: { gte: start, lt: end } } }),
  ]);
  const covers = todayRes.reduce((s, r) => s + r.partySize, 0);

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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Today</p>
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

      <Reveal index={2} className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Quick actions</p>
        <LinkButton href="/reservations/new" variant="secondary" size="sm" full className="justify-start">
          📅 New reservation
        </LinkButton>
        <LinkButton href="/takeout/new" variant="secondary" size="sm" full className="justify-start">
          🥡 New takeout order
        </LinkButton>
      </Reveal>

      <Reveal index={3} className="rounded-2xl border border-gray-200 bg-surface p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">AI host</p>
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
    </div>
  );
}
