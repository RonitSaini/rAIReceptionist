"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { planImport, type ImportPlan, type RawRow } from "@/lib/portfolio-import";

/**
 * The importer, in two halves: look, then commit.
 *
 * The file is parsed in the browser and only the parsed rows are sent, which keeps the raw upload
 * off the server entirely. Nothing here logs a row: an import of somebody's tenant list must not
 * end up in a log aggregator because a phone number failed a regex.
 *
 * Commit re-validates from scratch rather than trusting the preview it was handed. The preview is a
 * courtesy to the person clicking; it is not an authorisation token.
 */

export async function previewImport(rows: RawRow[]): Promise<ImportPlan> {
  await requireAccount();
  return planImport(rows);
}

export type ImportOutcome = { ok: boolean; error?: string; created: { properties: number; units: number; tenants: number }; skipped: number; invalid: number };

export async function commitImport(rows: RawRow[]): Promise<ImportOutcome> {
  const { account } = await requireAccount();
  const plan = planImport(rows);
  const valid = plan.rows.flatMap((r) => (r.ok ? [r.value] : []));
  const created = { properties: 0, units: 0, tenants: 0 };
  let skipped = 0;

  if (valid.length === 0) {
    return { ok: false, error: "Nothing in this file could be imported. Fix the rows listed above and try again.", created, skipped: 0, invalid: plan.invalid };
  }

  for (const row of valid) {
    // Dedupe against what is already there, on the same key the plan used within the file.
    let property = await prisma.property.findFirst({ where: { accountId: account.id, name: { equals: row.property, mode: "insensitive" } } });
    if (!property) {
      property = await prisma.property.create({ data: { accountId: account.id, name: row.property, address: row.address } });
      created.properties++;
    } else if (row.address && !property.address) {
      await prisma.property.update({ where: { id: property.id }, data: { address: row.address } });
    }

    let unit = await prisma.unit.findFirst({ where: { propertyId: property.id, label: { equals: row.unit, mode: "insensitive" } } });
    if (!unit) {
      unit = await prisma.unit.create({ data: { propertyId: property.id, label: row.unit } });
      created.units++;
    }

    if (!row.tenantPhone || !row.tenantName) continue;

    const customer = await prisma.customer.upsert({
      where: { accountId_phone: { accountId: account.id, phone: row.tenantPhone } },
      update: { name: row.tenantName },
      create: { accountId: account.id, phone: row.tenantPhone, name: row.tenantName },
    });

    const existing = await prisma.tenant.findUnique({ where: { unitId_customerId: { unitId: unit.id, customerId: customer.id } } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.tenant.create({
      data: {
        unitId: unit.id,
        customerId: customer.id,
        leaseStart: row.leaseStart,
        leaseEnd: row.leaseEnd,
        permissionToEnter: row.permissionToEnter,
        petOnPremises: row.petOnPremises,
      },
    });
    created.tenants++;
  }

  revalidatePath("/properties");
  revalidatePath("/tenants");
  return { ok: true, created, skipped, invalid: plan.invalid };
}
