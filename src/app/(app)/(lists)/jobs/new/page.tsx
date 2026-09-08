import { requireAccount } from "@/lib/current-account";
import { serializeAccount } from "@/lib/serialize";
import { vocabularyFor } from "@/verticals";
import { Card, PageHeader } from "@/components/ui";
import { JobForm } from "@/components/forms/job-form";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { account } = await requireAccount();
  const { date } = await searchParams;
  const words = vocabularyFor(account);

  return (
    <div className="mx-auto max-w-2xl space-y-4 2xl:max-w-3xl">
      <PageHeader title={`New ${words.booking.one}`} />
      <Card>
        <JobForm account={serializeAccount(account)} defaultDate={date ?? null} />
      </Card>
    </div>
  );
}
