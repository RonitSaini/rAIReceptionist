"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncRetellAgentQuietly } from "@/lib/agent-sync";
import { listVoices } from "@/lib/retell";
import { retellConfigured } from "@/lib/env";
import { requireAccount } from "@/lib/current-account";
import { bool, int, isZip, json, list, normalizeUsPhone, optDecimal, optInt, optStr, str, type ActionState } from "@/lib/form";
import { greetingHasDisclosure } from "@/lib/greeting";
import { DIETARY_TAGS, ESCALATION_TYPES, ONBOARDING_DONE, US_TIME_ZONES, VOICES } from "@/lib/constants";
import { isValidTimeString, timeToMinutes } from "@/lib/time";

type Mode = "onboarding" | "settings";

function modeOf(fd: FormData): Mode {
  return str(fd, "mode") === "settings" ? "settings" : "onboarding";
}

/** Advance onboarding (never move backwards) and route to the next screen, or stay put in Settings. */
async function finish(accountId: string, currentStep: number, completedStep: number, mode: Mode): Promise<ActionState> {
  const nextStep = completedStep + 1;
  if (currentStep < nextStep) {
    await prisma.account.update({ where: { id: accountId }, data: { onboardingStep: nextStep } });
  }
  // Keep the Retell agent in step with the settings (no-op until the agent exists). Runs after the response.
  after(() => syncRetellAgentQuietly(accountId));
  revalidatePath("/", "layout");
  if (mode === "onboarding") {
    redirect(nextStep >= ONBOARDING_DONE ? "/dashboard" : `/onboarding/${nextStep}`);
  }
  return { ok: true, message: "Saved." };
}

// ---------- Step 2: Business basics ----------

export async function saveBusinessBasics(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const restaurantName = str(fd, "restaurantName") || account.restaurantName;
  const ownerName = optStr(fd, "ownerName");
  const cellRaw = str(fd, "cellPhone");
  const cellPhone = cellRaw ? normalizeUsPhone(cellRaw) : null;
  const zip = str(fd, "zip");
  const timeZone = str(fd, "timeZone");

  if (cellRaw && !cellPhone) return { ok: false, error: "Enter a valid 10-digit US cell number." };
  if (zip && !isZip(zip)) return { ok: false, error: "Enter a valid 5-digit ZIP code." };
  if (!US_TIME_ZONES.some((t) => t.id === timeZone)) return { ok: false, error: "Choose a time zone." };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      restaurantName,
      ownerName,
      cellPhone,
      addressLine1: optStr(fd, "addressLine1"),
      addressLine2: optStr(fd, "addressLine2"),
      city: optStr(fd, "city"),
      state: optStr(fd, "state"),
      zip: zip || null,
      timeZone,
      cuisineType: optStr(fd, "cuisineType"),
      priceRange: optStr(fd, "priceRange"),
    },
  });
  return finish(account.id, account.onboardingStep, 2, modeOf(fd));
}

// ---------- Step 3: Hours + escalation ----------

type HoursRow = { dayOfWeek: number; periodName: string; open: string; close: string; isClosed: boolean };
type ManagerRow = { dayOfWeek: number; start: string; end: string };

export async function saveHours(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const rows = json<HoursRow[]>(fd, "hours", []);
  const managerRows = json<ManagerRow[]>(fd, "managerHours", []);
  const escalatesToManager = bool(fd, "escalatesToManager");
  const allowed = new Set(ESCALATION_TYPES.map((e) => e.key));
  const escalationTypes = list(fd, "escalationTypes").filter((k) => allowed.has(k));

  const cleanHours: HoursRow[] = [];
  for (const r of rows) {
    const dayOfWeek = Number(r.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
    if (r.isClosed) {
      cleanHours.push({ dayOfWeek, periodName: "Closed", open: "00:00", close: "00:00", isClosed: true });
      continue;
    }
    if (!isValidTimeString(r.open) || !isValidTimeString(r.close)) return { ok: false, error: "Every service period needs an open and close time." };
    if (timeToMinutes(r.open) === timeToMinutes(r.close)) return { ok: false, error: "Open and close times can't be the same." };
    cleanHours.push({ dayOfWeek, periodName: (r.periodName || "Service").trim().slice(0, 40), open: r.open, close: r.close, isClosed: false });
  }

  const cleanManager: ManagerRow[] = [];
  for (const r of managerRows) {
    const dayOfWeek = Number(r.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
    if (!isValidTimeString(r.start) || !isValidTimeString(r.end)) continue;
    cleanManager.push({ dayOfWeek, start: r.start, end: r.end });
  }

  await prisma.$transaction([
    prisma.businessHours.deleteMany({ where: { accountId: account.id } }),
    prisma.businessHours.createMany({ data: cleanHours.map((h, i) => ({ ...h, accountId: account.id, sortOrder: i })) }),
    prisma.managerAvailability.deleteMany({ where: { accountId: account.id } }),
    prisma.managerAvailability.createMany({ data: cleanManager.map((m) => ({ ...m, accountId: account.id })) }),
    prisma.account.update({ where: { id: account.id }, data: { escalatesToManager, escalationTypes } }),
  ]);
  return finish(account.id, account.onboardingStep, 3, modeOf(fd));
}

// ---------- Step 4: Menu + policies ----------

type MenuRow = { id?: string; name: string; category: string; price: string | number | null; description: string; dietaryTags: string[]; enabled: boolean };

export async function saveMenuPolicies(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const menu = json<MenuRow[]>(fd, "menu", []);
  const offersDelivery = bool(fd, "offersDelivery");
  const deliveryZip = optStr(fd, "deliveryZip");
  const deliveryRadiusMiles = optDecimal(fd, "deliveryRadiusMiles");
  const largePartyThreshold = int(fd, "largePartyThreshold", 8);

  if (largePartyThreshold < 2 || largePartyThreshold > 100) return { ok: false, error: "Large-party threshold must be between 2 and 100." };
  if (offersDelivery) {
    if (!deliveryZip || !isZip(deliveryZip)) return { ok: false, error: "Delivery needs a valid 5-digit ZIP code." };
    if (!deliveryRadiusMiles || Number(deliveryRadiusMiles) <= 0) return { ok: false, error: "Delivery needs a radius in miles." };
  }

  const tagSet = new Set(DIETARY_TAGS);
  const cleanMenu = menu
    .map((m, i) => ({
      name: String(m.name ?? "").trim().slice(0, 120),
      category: String(m.category ?? "").trim().slice(0, 60) || null,
      price: m.price === null || m.price === "" || m.price === undefined ? null : Number(String(m.price).replace(/[$,]/g, "")),
      description: String(m.description ?? "").trim().slice(0, 500) || null,
      dietaryTags: Array.isArray(m.dietaryTags) ? m.dietaryTags.filter((t) => tagSet.has(t)) : [],
      enabled: m.enabled !== false,
      sortOrder: i,
    }))
    .filter((m) => m.name.length > 0)
    .map((m) => ({ ...m, price: m.price != null && Number.isFinite(m.price) ? m.price.toFixed(2) : null }));

  await prisma.$transaction([
    prisma.menuItem.deleteMany({ where: { accountId: account.id } }),
    prisma.menuItem.createMany({ data: cleanMenu.map((m) => ({ ...m, accountId: account.id })) }),
    prisma.account.update({
      where: { id: account.id },
      data: {
        canQuotePrices: bool(fd, "canQuotePrices"),
        largePartyThreshold,
        largePartyDepositFee: optDecimal(fd, "largePartyDepositFee"),
        takesTakeoutOrders: bool(fd, "takesTakeoutOrders"),
        offersDelivery,
        deliveryZip: offersDelivery ? deliveryZip : null,
        deliveryRadiusMiles: offersDelivery ? deliveryRadiusMiles : null,
      },
    }),
  ]);
  return finish(account.id, account.onboardingStep, 4, modeOf(fd));
}

// ---------- Step 5: Reservations ----------

export async function saveReservationSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const tableTurnMinutes = int(fd, "tableTurnMinutes", 90);
  const reservationIntervalMinutes = int(fd, "reservationIntervalMinutes", 30);
  const seatingCapacity = optInt(fd, "seatingCapacity");
  const maxCoversPerSlot = optInt(fd, "maxCoversPerSlot");

  if (tableTurnMinutes < 15 || tableTurnMinutes > 360) return { ok: false, error: "Table turn should be between 15 and 360 minutes." };
  if (![15, 30, 45, 60].includes(reservationIntervalMinutes)) return { ok: false, error: "Choose a reservation interval." };
  if (seatingCapacity != null && seatingCapacity < 1) return { ok: false, error: "Seating capacity must be at least 1." };
  if (maxCoversPerSlot != null && maxCoversPerSlot < 1) return { ok: false, error: "Max covers per slot must be at least 1." };

  await prisma.account.update({
    where: { id: account.id },
    data: { tableTurnMinutes, reservationIntervalMinutes, seatingCapacity, maxCoversPerSlot },
  });
  return finish(account.id, account.onboardingStep, 5, modeOf(fd));
}

// ---------- Step 6: Voice + greeting ----------

async function isKnownVoice(voiceId: string): Promise<boolean> {
  if (VOICES.some((v) => v.id === voiceId)) return true;
  if (!retellConfigured()) return false;
  try {
    return (await listVoices()).some((v) => v.voice_id === voiceId);
  } catch {
    return false;
  }
}

/** Save just the voice the moment it's picked (no form submit needed) and rebuild the agent. */
export async function setVoiceQuick(voiceId: string): Promise<ActionState> {
  const { account } = await requireAccount();
  const id = String(voiceId ?? "").trim();
  if (!id) return { ok: false, error: "Choose a voice." };
  if (!(await isKnownVoice(id))) return { ok: false, error: "That voice isn't available. Choose one from the list." };
  if (account.voiceId !== id) {
    await prisma.account.update({ where: { id: account.id }, data: { voiceId: id } });
    after(() => syncRetellAgentQuietly(account.id));
    revalidatePath("/", "layout");
  }
  return { ok: true, message: "Voice saved." };
}

export async function saveVoice(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { account } = await requireAccount();
  const voiceId = str(fd, "voiceId");
  const hostName = str(fd, "hostName").slice(0, 40);
  const greeting = str(fd, "greeting").slice(0, 600);

  if (!voiceId) return { ok: false, error: "Choose a voice." };
  if (!(await isKnownVoice(voiceId))) return { ok: false, error: "That voice isn't available. Choose one from the list." };
  if (hostName.length < 1) return { ok: false, error: "Give your AI host a name." };
  if (greeting.length < 10) return { ok: false, error: "Enter a greeting." };
  if (!greetingHasDisclosure(greeting)) return { ok: false, error: 'The greeting must include the phrase "this call may be recorded".' };

  await prisma.account.update({ where: { id: account.id }, data: { voiceId, hostName, greeting } });
  return finish(account.id, account.onboardingStep, 6, modeOf(fd));
}

// ---------- Step 7 + 8: placeholders until Phase 2 / Phase 4 ----------

export async function completePhoneStep(): Promise<void> {
  const { account } = await requireAccount();
  await finish(account.id, account.onboardingStep, 7, "onboarding");
}

export async function completePaymentStep(): Promise<void> {
  const { account } = await requireAccount();
  await finish(account.id, account.onboardingStep, 8, "onboarding");
}
