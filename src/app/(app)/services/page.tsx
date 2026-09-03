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
      {/* An editor is a control, not a set: it crossfades in place rather than cascading, and nothing
          inside it travels — a field that slides is a field a password manager measures wrong (§8.4
          rule 25). The header above is chrome and is instant. */}
      <div data-arrival="fade">
        <Card>
          <ServicesForm account={serializeAccount(account)} services={services.map(serializeServiceOffering)} mode="settings" />
        </Card>
      </div>
    </div>
  );
}
