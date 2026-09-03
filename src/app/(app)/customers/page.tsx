import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { vocabularyFor } from "@/verticals";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Customers" };

/**
 * Everyone who has called, keyed on their number.
 *
 * The Customer table is shared by every vertical — a plumber's customer, a vet's client, a
 * property manager's tenant are the same row with a different label — so this page is labelled
 * from the vocabulary rather than hardcoded.
 */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { account } = await requireAccount();
  const { q } = await searchParams;
  const words = vocabularyFor(account);
  const query = (q ?? "").trim();

  const customers = await prisma.customer.findMany({
    where: {
      accountId: account.id,
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { phone: { contains: query } }, { address: { contains: query, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { jobs: true } }, jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, createdAt: true, description: true } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader title={words.customer.Many} subtitle={`Everyone who has called ${account.businessName}.`} />

      <form className="flex gap-2" action="/customers">
        <input
          name="q"
          defaultValue={query}
          placeholder={`Search by name, number or address`}
          aria-label={`Search ${words.customer.many}`}
          className="min-h-11 w-full rounded-xl border border-gray-300 bg-surface px-4 text-base text-ink placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      </form>

      {customers.length === 0 ? (
        <EmptyState title={query ? `No ${words.customer.many} match "${query}"` : `No ${words.customer.many} yet`} body={query ? undefined : `They're added automatically the first time someone calls.`} />
      ) : (
        <ul data-arrival="cascade" className="grid gap-3 xl:grid-cols-2">
          {customers.map((c) => (
            <li key={c.id} className="lift rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-sm text-gray-600">{formatUsPhone(c.phone)}</p>
                  {c.address ? <p className="truncate text-sm text-gray-500">{c.address}</p> : null}
                  {c.jobs[0] ? (
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                      Last: {c.jobs[0].description || "no description"} · {formatDateTime(c.jobs[0].createdAt, account.timeZone)}
                    </p>
                  ) : null}
                </div>
                <Link href={`/jobs?status=&q=${encodeURIComponent(c.phone)}`} className="shrink-0 text-sm font-semibold text-brand-700">
                  {c._count.jobs} {c._count.jobs === 1 ? words.booking.one : words.booking.many}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
