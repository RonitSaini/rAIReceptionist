import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { formatUsPhone } from "@/lib/form";
import { deleteVendor, saveVendor } from "@/actions/property";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MotionList } from "@/components/motion-list";

export const metadata = { title: "Vendors" };

/**
 * Who gets sent out.
 *
 * Deliberately a list of names and numbers and nothing more. There is no portal, no job board and
 * no automated messaging: assigning a vendor writes their name onto the work order so the office
 * knows who is going, and a human still makes the call. Twilio would refuse the text anyway, but
 * that is not the reason — sending a stranger to somebody's home is not a thing to automate on the
 * strength of a phone call the AI took.
 */
export default async function VendorsPage() {
  const { account } = await requireAccount();
  const vendors = await prisma.vendor.findMany({ where: { accountId: account.id }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-4">
      <PageHeader title="Vendors" subtitle={`${vendors.length} on file`} />

      <Card title="Add a vendor">
        <form action={saveVendor} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input name="name" placeholder="Ridgeway Plumbing" required className="rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm" />
          <input name="trade" placeholder="Plumbing" className="rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm" />
          <input name="phone" type="tel" placeholder="(555) 123-4567" className="rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm" />
          <button type="submit" className="press rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </form>
      </Card>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet" body="Add the trades you call most. They show up as options on a work order." />
      ) : (
        <MotionList className="grid gap-3 xl:grid-cols-2 3xl:grid-cols-3">
          {vendors.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-surface p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{v.name}</p>
                <p className="truncate text-sm text-gray-500">
                  {v.trade ?? "Trade not set"}
                  {v.phone ? ` · ${formatUsPhone(v.phone)}` : ""}
                </p>
              </div>
              <form action={deleteVendor}>
                <input type="hidden" name="id" value={v.id} />
                <button type="submit" className="press-soft shrink-0 text-xs font-semibold text-red-600">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </MotionList>
      )}
    </div>
  );
}
