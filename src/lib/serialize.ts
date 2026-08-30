import type { Account, MenuItem } from "@prisma/client";

/** Plain-object versions of Prisma rows (Decimal -> number) safe to pass to client components. */

export type AccountView = Omit<Account, "largePartyDepositFee" | "deliveryRadiusMiles" | "lastSeenAt" | "createdAt" | "updatedAt" | "subscriptionCurrentPeriodEnd" | "setupFeePaidAt"> & {
  largePartyDepositFee: number | null;
  deliveryRadiusMiles: number | null;
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
    deliveryRadiusMiles: a.deliveryRadiusMiles == null ? null : Number(a.deliveryRadiusMiles),
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
