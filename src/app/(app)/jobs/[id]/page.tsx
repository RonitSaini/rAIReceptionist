import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/time";
import { formatUsPhone } from "@/lib/form";
import { humanize } from "@/lib/constants";
import { vocabularyFor } from "@/verticals";
import { setJobStatus } from "@/actions/field-service";
import { Badge, Card, PageHeader } from "@/components/ui";
import { StatusButtons } from "@/components/status-buttons";
import { JOB_STATUS_TONE, JOB_TRANSITIONS } from "@/lib/jobs-ui";

export const metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { account } = await requireAccount();
  const words = vocabularyFor(account);

  const job = await prisma.job.findFirst({ where: { id, accountId: account.id }, include: { customer: true } });
  if (!job) notFound();

  const details = (job.details ?? {}) as Record<string, unknown>;
  const detailRows = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="mx-auto max-w-2xl space-y-4 2xl:max-w-3xl">
      <PageHeader
        title={job.customerName}
        subtitle={job.scheduledStart ? formatDateTime(job.scheduledStart, account.timeZone) : `${words.booking.One} requested, no time yet`}
        action={
          <Badge tone={job.isEmergency ? "red" : JOB_STATUS_TONE[job.status]}>{job.isEmergency ? "Emergency" : humanize(job.status)}</Badge>
        }
      />

      <Card title="Details">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {job.customerPhone ? (
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-semibold">
                <a href={`tel:${job.customerPhone}`}>{formatUsPhone(job.customerPhone)}</a>
              </dd>
            </div>
          ) : null}
          {job.address ? (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Address</dt>
              <dd className="font-semibold">{job.address}</dd>
            </div>
          ) : null}
          {job.description ? (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">What they said</dt>
              <dd>{job.description}</dd>
            </div>
          ) : null}
          {job.assignedTo ? (
            <div>
              <dt className="text-gray-500">{words.staff.One}</dt>
              <dd className="font-semibold">{job.assignedTo}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-gray-500">Booked by</dt>
            <dd className="font-semibold">{job.source === "ai" ? account.hostName : "Staff"}</dd>
          </div>
          {detailRows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-gray-500">{humanize(k)}</dt>
              <dd className="font-semibold">{typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Move it along">
        <StatusButtons id={job.id} current={job.status} transitions={JOB_TRANSITIONS[job.status]} action={setJobStatus} returnTo={`/jobs/${job.id}`} />
        {JOB_TRANSITIONS[job.status].length === 0 ? <p className="text-sm text-gray-500">This {words.booking.one} is {humanize(job.status).toLowerCase()}.</p> : null}
      </Card>

      {job.customer ? (
        <p className="text-sm text-gray-500">
          <Link href={`/customers?q=${encodeURIComponent(job.customer.phone)}`} className="font-semibold text-brand-700">
            See everything for {job.customer.name}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
