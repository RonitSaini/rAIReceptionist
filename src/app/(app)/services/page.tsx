import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { serializeAccount, serializeServiceOffering } from "@/lib/serialize";
import { Card, PageHeader } from "@/components/ui";
import { ServicesForm } from "@/components/forms/services-form";

export const metadata = { title: "Services" };

/** The same editor the onboarding step uses, in settings mode so it saves and stays put. */
export default async function ServicesPage() {
  const { account } = await requireAccount();
  const services = await prisma.serviceOffering.findMany({ where: { accountId: account.id }, orderBy: { sortOrder: "asc" } });

  return (
    <div className="mx-auto max-w-2xl space-y-4 2xl:max-w-3xl">
      <PageHeader title="Services" subtitle="What you offer, and what the AI may say about price." />
      <Card>
        <ServicesForm account={serializeAccount(account)} services={services.map(serializeServiceOffering)} mode="settings" />
      </Card>
    </div>
  );
}
