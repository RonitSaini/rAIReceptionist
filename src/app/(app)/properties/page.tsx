import { requireAccount } from "@/lib/current-account";
import { prisma } from "@/lib/prisma";
import { deleteProperty, deleteUnit, saveProperty, saveUnit } from "@/actions/property";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { MotionList } from "@/components/motion-list";
import { PortfolioImporter } from "@/components/forms/portfolio-importer";

export const metadata = { title: "Properties" };

/** The portfolio: buildings, their doors, and who is behind each one. */
export default async function PropertiesPage() {
  const { account } = await requireAccount();

  const properties = await prisma.property.findMany({
    where: { accountId: account.id },
    orderBy: { name: "asc" },
    include: { units: { orderBy: { label: "asc" }, include: { tenants: { include: { customer: true } } } } },
  });

  const unitCount = properties.reduce((n, p) => n + p.units.length, 0);
  const tenantCount = properties.reduce((n, p) => n + p.units.reduce((m, u) => m + u.tenants.length, 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Properties" subtitle={`${properties.length} properties · ${unitCount} units · ${tenantCount} residents`} />

      <PortfolioImporter />

      <Card title="Add a property">
        <form action={saveProperty} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input name="name" placeholder="Oakwood Court" required className="rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm" />
          <input name="address" placeholder="12 Oak Street, Newark NJ" className="rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm sm:col-span-2" />
          <button type="submit" className="press rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </form>
      </Card>

      {properties.length === 0 ? (
        <EmptyState title="No properties yet" body="Add one above, or import a spreadsheet if you have more than a handful." />
      ) : (
        <MotionList as="div" className="space-y-4">
          {properties.map((p) => (
          <div key={p.id}>
            <Card
              title={p.name}
              action={
                <form action={deleteProperty}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="press-soft text-xs font-semibold text-red-600">
                    Delete
                  </button>
                </form>
              }
            >
              {p.address ? <p className="-mt-1 mb-3 text-sm text-gray-500">{p.address}</p> : null}

              <MotionList className="divide-y divide-gray-100">
                {p.units.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{u.label}</p>
                      <p className="text-sm text-gray-500">{u.tenants.length === 0 ? "No resident on file" : u.tenants.map((t) => t.customer.name).join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.tenants.some((t) => t.petOnPremises) ? <Badge tone="amber">Pet</Badge> : null}
                      {u.tenants.some((t) => t.permissionToEnter) ? <Badge tone="green">Entry OK</Badge> : null}
                      <form action={deleteUnit}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="press-soft text-xs font-semibold text-red-600">
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </MotionList>

              <form action={saveUnit} className="mt-3 flex gap-2">
                <input type="hidden" name="propertyId" value={p.id} />
                <input name="label" placeholder="Add a unit, e.g. 3B" required className="flex-1 rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm" />
                <button type="submit" className="press rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold">
                  Add unit
                </button>
              </form>
            </Card>
          </div>
          ))}
        </MotionList>
      )}
    </div>
  );
}
