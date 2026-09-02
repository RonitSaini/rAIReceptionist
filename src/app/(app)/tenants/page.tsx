import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDate, nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Residents" };

/**
 * Who lives where, and what they have called about.
 *
 * Searchable because two hundred units is the whole premise. The per-resident history is the reason
 * this page exists rather than a bare list: when someone rings about a leak, the useful question is
 * whether they rang about the same leak last month.
 */
export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { account } = await requireAccount();
  const { q } = await searchParams;
  const words = vocabularyFor(account);
  const query = (q ?? "").trim();
  const now = nowUtc();

  const tenants = await prisma.tenant.findMany({
    where: {
      unit: { property: { accountId: account.id } },
      ...(query
        ? {
            OR: [
              { customer: { name: { contains: query, mode: "insensitive" } } },
              { customer: { phone: { contains: query } } },
              { unit: { label: { contains: query, mode: "insensitive" } } },
              { unit: { property: { name: { contains: query, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: { customer: true, unit: { include: { property: true } } },
    orderBy: [{ unit: { property: { name: "asc" } } }, { unit: { label: "asc" } }],
    take: 300,
  });

  const histories = tenants.length
    ? await prisma.job.findMany({
        where: { accountId: account.id, unitId: { in: tenants.map((t) => t.unitId) } },
        orderBy: { createdAt: "desc" },
        select: { id: true, unitId: true, description: true, status: true, isEmergency: true, createdAt: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <PageHeader title={words.customer.Many} subtitle={`${tenants.length} on file`} />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, phone, unit or property"
          className="w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-600 focus:outline-none"
        />
      </form>

      {tenants.length === 0 ? (
        <EmptyState title={query ? "Nobody matches that" : `No ${words.customer.many} yet`} body="Add units under Properties, or import a spreadsheet." />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {tenants.map((t) => {
            const history = histories.filter((h) => h.unitId === t.unitId).slice(0, 4);
            return (
              <li key={t.id} className="rounded-2xl border border-gray-200 bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{t.customer.name}</p>
                    <p className="truncate text-sm text-gray-600">
                      {t.unit.property.name} · {t.unit.label}
                      <span className="text-gray-500"> · {formatUsPhone(t.customer.phone)}</span>
                    </p>
                    {t.leaseStart || t.leaseEnd ? (
                      <p className="text-xs text-gray-500">
                        Lease {t.leaseStart ? formatDate(t.leaseStart, account.timeZone) : "?"} to {t.leaseEnd ? formatDate(t.leaseEnd, account.timeZone) : "open"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {t.petOnPremises ? <Badge tone="amber">Pet</Badge> : null}
                    {t.permissionToEnter ? <Badge tone="green">Entry OK</Badge> : <Badge tone="gray">Ask first</Badge>}
                  </div>
                </div>

                {history.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2">
                    {history.map((h) => (
                      <li key={h.id} className="flex items-start justify-between gap-2 text-xs">
                        <Link href={`/jobs/${h.id}`} className="line-clamp-1 flex-1 text-gray-700">
                          {h.isEmergency ? "! " : ""}
                          {h.description ?? "Work order"}
                        </Link>
                        <span className="shrink-0 text-gray-400">
                          {humanize(h.status)} · {timeAgo(h.createdAt, now)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">Nothing reported yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
