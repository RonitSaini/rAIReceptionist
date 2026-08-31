import type { Account, MenuItem, ServiceOffering } from "@prisma/client";

/** Plain-object versions of Prisma rows (Decimal -> number) safe to pass to client components. */

export type AccountView = Omit<Account, "largePartyDepositFee" | "serviceAreaRadiusMiles" | "calloutFeeMicros" | "lastSeenAt" | "createdAt" | "updatedAt" | "subscriptionCurrentPeriodEnd" | "setupFeePaidAt"> & {
  largePartyDepositFee: number | null;
  serviceAreaRadiusMiles: number | null;
  /** BigInt cannot cross to a client component, so the call-out fee travels as whole micro-units. */
  calloutFeeMicros: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  subscriptionCurrentPeriodEnd: string | null;
  setupFeePaidAt: string | null;
};

export function serializeAccount(a: Account): AccountView {
  return {
    ...a,
    largePartyDepositFee: a.largePartyDepositFee == null ? null : Number(a.largePartyDepositFee),
    serviceAreaRadiusMiles: a.serviceAreaRadiusMiles == null ? null : Number(a.serviceAreaRadiusMiles),
    calloutFeeMicros: a.calloutFeeMicros == null ? null : Number(a.calloutFeeMicros),
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    subscriptionCurrentPeriodEnd: a.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    setupFeePaidAt: a.setupFeePaidAt?.toISOString() ?? null,
  };
}

export type MenuItemView = {
  id: string;
  name: string;
  category: string;
  price: number | null;
  description: string;
  dietaryTags: string[];
  enabled: boolean;
};

export function serializeMenuItem(m: MenuItem): MenuItemView {
  return {
    id: m.id,
    name: m.name,
    category: m.category ?? "",
    price: m.price == null ? null : Number(m.price),
    description: m.description ?? "",
    dietaryTags: m.dietaryTags,
    enabled: m.enabled,
  };
}

/**
 * ServiceOffering for a client component. BigInt cannot cross the server/client boundary, so the
 * micro-unit price becomes a plain number of dollars here.
 */
export type ServiceOfferingView = {
  id: string;
  name: string;
  category: string | null;
  enabled: boolean;
  canQuote: boolean;
  priceFrom: number | null;
  sortOrder: number;
};

export function serializeServiceOffering(s: ServiceOffering): ServiceOfferingView {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    enabled: s.enabled,
    canQuote: s.canQuote,
    priceFrom: s.priceFromMicros == null ? null : Number(s.priceFromMicros) / 1_000_000,
    sortOrder: s.sortOrder,
  };
}
