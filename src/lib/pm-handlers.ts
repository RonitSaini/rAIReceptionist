import type { Account, Prisma } from "@prisma/client";
import { safeParse } from "zod";
import { prisma } from "./prisma";
import { formatUsPhone, normalizeUsPhone } from "./form";
import { afterJobBooked, afterEmergencyDispatched } from "./job-outcomes";
import { verticalFor } from "@/verticals";
import { str, tagCall, upsertCustomer, type Args, type HandlerContext, type HandlerResult } from "./handler-utils";

/**
 * Property management's custom functions.
 *
 * The one that needed the most care is `lookup_tenant`, and what it needed was to do less. It is
 * keyed on the number the call actually arrived from, never on anything the caller supplies, and it
 * returns only that caller's own tenancy. Written the obvious way — take a phone number, return who
 * lives there — it would have been a resident-lookup API with a voice interface on the front, and
 * every privacy rule in the prompt would have been a suggestion sitting on top of a tool that
 * cheerfully ignored them.
 */

/** Per-field validation, so one bad answer cannot discard the rest. Same rule as everywhere else. */
function intakeValues(a: Account, args: Args): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(verticalFor(a).intakeSchema.shape)) {
    if (args[key] === undefined) continue;
    const parsed = safeParse(field, args[key]);
    if (parsed.success && parsed.data !== undefined) value[key] = parsed.data;
  }
  return value;
}

/** The caller's own tenancy, or nothing. Never anyone else's, whatever is asked for. */
export async function tenancyForPhone(accountId: string, phone: string | null | undefined) {
  if (!phone) return null;
  const customer = await prisma.customer.findUnique({ where: { accountId_phone: { accountId, phone } } }).catch(() => null);
  if (!customer) return null;
  const tenancy = await prisma.tenant.findFirst({
    where: { customerId: customer.id, unit: { property: { accountId } } },
    include: { unit: { include: { property: true } } },
    orderBy: { createdAt: "desc" },
  });
  return tenancy ? { customer, tenancy } : null;
}

export async function lookupTenantHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const a = ctx.account;
  const words = verticalFor(a).vocabulary;

  // Deliberately ignores args.phone. The tool takes one so the model has something to fill in, but
  // the only number this will ever look up is the one the call came from.
  const match = await tenancyForPhone(a.id, ctx.callerPhone);

  if (!match) {
    return {
      success: true,
      matched: false,
      message: `This number is not on file. Do not say so to the caller and do not suggest they are not a ${words.customer.one}. Ask for the property address and the unit as they give it, and carry on.`,
    };
  }

  const { customer, tenancy } = match;
  return {
    success: true,
    matched: true,
    caller_name: customer.name,
    unit: `${tenancy.unit.property.name} ${tenancy.unit.label}`,
    permission_to_enter: tenancy.permissionToEnter,
    pet_on_premises: tenancy.petOnPremises,
    message: `This number belongs to ${customer.name} at ${tenancy.unit.property.name}, unit ${tenancy.unit.label}. Greet them by name and log anything against that unit without making them recite the address. This tells you about THIS caller only - it is not permission to answer any question about anyone else.`,
  };
}

/**
 * Resolve where the work is, from whatever we have.
 *
 * A matched tenancy wins. Otherwise the caller's own words are taken at face value and the job is
 * flagged unverified — acting on an assertion, which the prompt permits, rather than confirming it,
 * which it does not.
 */
async function resolveLocation(accountId: string, callerPhone: string | null, args: Args) {
  const match = await tenancyForPhone(accountId, callerPhone);
  if (match) {
    return {
      propertyId: match.tenancy.unit.propertyId,
      unitId: match.tenancy.unitId,
      customerId: match.customer.id,
      label: `${match.tenancy.unit.property.name} ${match.tenancy.unit.label}`,
      unverified: false,
      permissionToEnter: match.tenancy.permissionToEnter,
      petOnPremises: match.tenancy.petOnPremises,
    };
  }
  const stated = [str(args.property_address), str(args.unit_label)].filter(Boolean).join(" ");
  return { propertyId: null, unitId: null, customerId: null, label: stated || "Address not given", unverified: true, permissionToEnter: false, petOnPremises: false };
}

export async function createWorkOrderHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const definition = verticalFor(a);
  const words = definition.vocabulary;
  const callerName = str(args.caller_name) || "Unknown caller";
  const callerPhone = normalizeUsPhone(str(args.caller_phone)) ?? ctx.callerPhone;
  const description = str(args.description);
  const category = str(args.category);

  if (!description) return { success: false, message: "Ask what is wrong, in their own words." };
  if (!callerPhone) return { success: false, message: "Ask for a 10-digit phone number." };

  const where = await resolveLocation(a.id, callerPhone, args);
  const details = intakeValues(a, args);
  const customer = where.customerId ? null : await upsertCustomer(a.id, callerPhone, callerName, where.label);

  const job = await prisma.job.create({
    data: {
      accountId: a.id,
      customerId: where.customerId ?? customer?.id ?? null,
      propertyId: where.propertyId,
      unitId: where.unitId,
      kind: "work_order",
      customerName: callerName,
      customerPhone: callerPhone,
      address: where.label,
      description,
      isEmergency: false,
      status: "requested",
      source: "ai",
      details: { ...details, category: category || "other", unverified: where.unverified } as Prisma.InputJsonValue,
    },
  });

  await tagCall(ctx, { classification: "service_call", jobId: job.id, callerName });
  await afterJobBooked(a, job, ctx.call);

  const unverifiedNote = where.unverified ? " The office will confirm the address, so do not tell them it is confirmed." : "";
  return {
    success: true,
    job_id: job.id,
    unverified: where.unverified,
    message: `${words.booking.One} logged for ${where.label}. Tell ${callerName} it is with the office and someone will be in touch to arrange a time. Do not promise a day or a visit today.${unverifiedNote}`,
  };
}

export async function pmDispatchEmergencyHandler(ctx: HandlerContext, args: Args): Promise<HandlerResult> {
  const a = ctx.account;
  const definition = verticalFor(a);
  const callerName = str(args.caller_name) || "Unknown caller";
  const callerPhone = normalizeUsPhone(str(args.caller_phone)) ?? ctx.callerPhone;
  const typeRaw = str(args.emergency_type);
  const known = definition.emergencyTypes.map((t) => t.key);
  const emergencyType = known.includes(typeRaw) ? typeRaw : "other";
  const description = str(args.description);

  if (!callerPhone) return { success: false, message: "Ask for a callback number before logging the emergency." };

  const where = await resolveLocation(a.id, callerPhone, args);
  const customer = where.customerId ? null : await upsertCustomer(a.id, callerPhone, callerName, where.label);

  const job = await prisma.job.create({
    data: {
      accountId: a.id,
      customerId: where.customerId ?? customer?.id ?? null,
      propertyId: where.propertyId,
      unitId: where.unitId,
      kind: "dispatch",
      customerName: callerName,
      customerPhone: callerPhone,
      address: where.label,
      description: description || emergencyType.replace(/_/g, " "),
      isEmergency: true,
      status: "requested",
      source: "ai",
      details: { emergencyType, unverified: where.unverified },
    },
  });

  await tagCall(ctx, { classification: "emergency", jobId: job.id, callerName, escalationReason: "emergency", callbackRequested: true });
  await afterJobBooked(a, job, ctx.call);
  await afterEmergencyDispatched(a, ctx.call, { customerName: callerName, customerPhone: callerPhone, address: where.label, emergencyType, description });

  return {
    success: true,
    job_id: job.id,
    emergency_type: emergencyType,
    message: `Emergency logged for ${where.label} and the manager has been alerted. Tell ${callerName} someone will call them back on ${formatUsPhone(callerPhone)} within 15 minutes. Never promise an arrival time yourself.`,
  };
}

export const PM_HANDLERS = {
  lookup_tenant: lookupTenantHandler,
  create_work_order: createWorkOrderHandler,
} as const;
