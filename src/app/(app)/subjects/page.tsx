import Link from "next/link";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime, nowUtc, timeAgo } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { subjectLabel } from "@/lib/shop-handlers";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { JOB_STATUS_TONE } from "@/lib/jobs-ui";

export const metadata = { title: "Records" };

/**
 * The vehicles, or the pets.
 *
 * Read-only and derived: there is no Vehicle table and no Patient table. A subject is whatever the
 * intake schema recorded on a Job, grouped under the Customer who brought it in — which is what the
 * person answering the phone actually wants. A vet opening a client sees their animals and when
 * each was last in, without anyone having had to maintain a second list that would drift out of
 * date the first time someone booked over the phone.
 *
 * The cost of that is that a subject only exists once it has been booked in at least once. That is
 * the right trade: a record nobody has visited is a record nobody needs.
 */
export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { account } = await requireAccount();
  const { q } = await searchParams;
  const words = vocabularyFor(account);
  const now = nowUtc();
  const query = (q ?? "").trim();

  const jobs = await prisma.job.findMany({
    where: {
      accountId: account.id,
      ...(query
        ? {
            OR: [
              { customerName: { contains: query, mode: "insensitive" } },
              { customerPhone: { contains: query } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 400,
    include: { customer: true },
  });

  /** One row per (caller, subject). The same client with two dogs is two rows, which is the point. */
  type Row = { key: string; owner: string; phone: string | null; customerId: string | null; subject: string; visits: number; last: Date; lastStatus: string };
  const rows = new Map<string, Row>();
  for (const job of jobs) {
    const subject = subjectLabel(job.details as Record<string, unknown> | null) ?? "Not recorded";
    const key = `${job.customerPhone ?? job.customerName}::${subject.toLowerCase()}`;
    const existing = rows.get(key);
    if (existing) {
      existing.visits += 1;
      continue;
    }
    rows.set(key, {
      key,
      owner: job.customer?.name ?? job.customerName,
      phone: job.customerPhone,
      customerId: job.customerId,
      subject,
      visits: 1,
      last: job.scheduledStart ?? job.createdAt,
      lastStatus: job.status,
    });
  }
  const list = [...rows.values()].sort((a, b) => b.last.getTime() - a.last.getTime());

  return (
    <div className="space-y-4">
      <PageHeader title={words.subject?.Many ?? "Records"} subtitle={`${list.length} on file`} />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder={`Search by ${words.customer.one}, phone or ${words.subject?.one ?? "record"}`}
          className="w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-600 focus:outline-none"
        />
      </form>

      {list.length === 0 ? (
        <EmptyState
          title={query ? `No ${words.subject?.many ?? "records"} match that` : `No ${words.subject?.many ?? "records"} yet`}
          body={`A ${words.subject?.one ?? "record"} appears here the first time it is booked in. Nothing to maintain by hand.`}
        />
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {list.map((r, i) => (
            <Reveal as="li" index={i} key={r.key} className="rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.subject}</p>
                  <p className="truncate text-sm text-gray-600">
                    {r.customerId ? (
                      <Link href={`/customers?q=${encodeURIComponent(r.phone ?? r.owner)}`} className="font-semibold text-brand-700">
                        {r.owner}
                      </Link>
                    ) : (
                      r.owner
                    )}
                    {r.phone ? <span className="text-gray-500"> · {formatUsPhone(r.phone)}</span> : null}
                  </p>
                </div>
                <Badge tone={JOB_STATUS_TONE[r.lastStatus as keyof typeof JOB_STATUS_TONE] ?? "gray"}>{humanize(r.lastStatus)}</Badge>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {r.visits} {r.visits === 1 ? words.booking.one : words.booking.many} · last {formatDateTime(r.last, account.timeZone)} ({timeAgo(r.last, now)})
              </p>
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
}
