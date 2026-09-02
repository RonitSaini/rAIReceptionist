import Link from "next/link";
import type { Account } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayServiceStatus } from "@/lib/availability";
import { formatClock, nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { stripeConfigured } from "@/lib/env";
import { subscriptionActive } from "@/lib/billing-ui";
import { humanize } from "@/lib/constants";
import { Badge, StatusDot, classificationTone } from "@/components/ui";
import { DrawIcon } from "@/components/draw-icon";

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

/** Desktop sidebar content below the nav: hours, host status, recent calls. */
export async function SidebarPanel({ account }: { account: Account }) {
  const tz = account.timeZone;
  const now = nowUtc();

  const [hours, recentCalls] = await Promise.all([
    prisma.businessHours.findMany({ where: { accountId: account.id } }),
    prisma.call.findMany({ where: { accountId: account.id }, orderBy: { startedAt: "desc" }, take: 8, select: { id: true, callerName: true, callerPhone: true, classification: true, startedAt: true } }),
  ]);
  const service = todayServiceStatus(hours, tz);

  return (
    <div className="flex h-full flex-col gap-3 px-3 pt-2 short:gap-2 short:pt-1">
      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 micro:hidden">
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
      </div>

      <div className="rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5">
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-200 bg-surface p-3 short:p-2.5 tiny:hidden">
        <SectionTitle href="/calls">Recent calls</SectionTitle>
        {recentCalls.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No calls yet.</p>
        ) : (
          <ul className="fade-bottom relative mt-2 grid min-h-0 flex-1 auto-rows-[44px] content-start overflow-hidden pb-7">
            {recentCalls.map((c) => (
              <li key={c.id} className="min-h-0 min-w-0">
                <Link href={`/calls/${c.id}`} className="lift flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-700">{c.callerName ?? (c.callerPhone ? formatUsPhone(c.callerPhone) : "Unknown caller")}</span>
                    <span className="block text-[11px] text-gray-500">{timeAgo(c.startedAt, now)}</span>
                  </span>
                  <Badge tone={classificationTone[c.classification]} className="shrink-0 px-2 text-[10px]">
                    {humanize(c.classification)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
