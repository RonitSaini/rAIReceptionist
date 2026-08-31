"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/current-account";
import { redirect } from "next/navigation";
import { normalizeUsPhone, optStr, str } from "@/lib/form";

/**
 * These are plain <form action={...}> handlers rather than useActionState ones, because the pages
 * are lists with an add-row form on each and threading a separate state hook through every one of
 * them buys nothing. A validation failure comes back as ?error= on the same page, which the page
 * renders; the alternative was making three list pages into client components.
 */
const fail = (path: string, message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`);

/** CRUD for the portfolio and the vendor list. Deliberately plain: forms, no cleverness. */

export async function saveProperty(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = optStr(fd, "id");
  const name = str(fd, "name");
  if (!name) fail("/properties", "A property needs a name.");
  const data = { name, address: optStr(fd, "address"), notes: optStr(fd, "notes") };

  if (id) await prisma.property.updateMany({ where: { id, accountId: account.id }, data });
  else await prisma.property.create({ data: { ...data, accountId: account.id } });

  revalidatePath("/properties");
}

export async function deleteProperty(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  // Cascades to units and tenancies. The Customer rows survive, which is right: a person who moved
  // out is still someone who has called before.
  await prisma.property.deleteMany({ where: { id, accountId: account.id } });
  revalidatePath("/properties");
}

export async function saveUnit(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const propertyId = str(fd, "propertyId");
  const label = str(fd, "label");
  if (!label) fail("/properties", "A unit needs a label.");

  const property = await prisma.property.findFirst({ where: { id: propertyId, accountId: account.id } });
  if (!property) return fail("/properties", "That property is not yours.");

  const id = optStr(fd, "id");
  const data = { label, notes: optStr(fd, "notes") };
  try {
    if (id) await prisma.unit.updateMany({ where: { id, propertyId }, data });
    else await prisma.unit.create({ data: { ...data, propertyId } });
  } catch {
    fail("/properties", `${property.name} already has a unit called "${label}".`);
  }
  revalidatePath("/properties");
}

export async function deleteUnit(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const id = str(fd, "id");
  const unit = await prisma.unit.findFirst({ where: { id, property: { accountId: account.id } } });
  if (unit) await prisma.unit.delete({ where: { id } });
  revalidatePath("/properties");
}

export async function saveVendor(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const name = str(fd, "name");
  if (!name) fail("/vendors", "A vendor needs a name.");
  const rawPhone = str(fd, "phone");
  const phone = rawPhone ? normalizeUsPhone(rawPhone) : null;
  if (rawPhone && !phone) fail("/vendors", "That does not look like a 10-digit US or Canadian number.");

  const id = optStr(fd, "id");
  const data = { name, trade: optStr(fd, "trade"), phone };
  if (id) await prisma.vendor.updateMany({ where: { id, accountId: account.id }, data });
  else await prisma.vendor.create({ data: { ...data, accountId: account.id } });

  revalidatePath("/vendors");
}

export async function deleteVendor(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  await prisma.vendor.deleteMany({ where: { id: str(fd, "id"), accountId: account.id } });
  revalidatePath("/vendors");
}

/** Put a vendor's name on a work order. Nothing is sent to them: Twilio would refuse anyway. */
export async function assignVendor(fd: FormData): Promise<void> {
  const { account } = await requireAccount();
  const jobId = str(fd, "jobId");
  const vendorId = optStr(fd, "vendorId");
  const vendor = vendorId ? await prisma.vendor.findFirst({ where: { id: vendorId, accountId: account.id } }) : null;
  await prisma.job.updateMany({ where: { id: jobId, accountId: account.id }, data: { assignedTo: vendor?.name ?? null } });
  revalidatePath("/work-orders");
  revalidatePath(`/jobs/${jobId}`);
}
