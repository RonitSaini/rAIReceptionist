import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkServiceArea } from "@/lib/field-service-handlers";

export const dynamic = "force-dynamic";

/**
 * GET /api/service-area/check?address=... — is this address inside the account's service area?
 *
 * Calls `checkServiceArea` exactly as the AI's `check_service_area` tool does, so a dispatcher booking
 * by hand sees the determination the AI would have seen on a call: same geocoding, same radius, same
 * postcode fallback, same miles-or-kilometres wording. Deliberately not a reimplementation — if the
 * rule changes for calls it changes here in the same edit.
 *
 * Read-only and advisory. It never blocks a save: an out-of-area answer is information for the person
 * at the desk, who may still have a good reason to take the job.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const address = (req.nextUrl.searchParams.get("address") ?? "").slice(0, 300);
  if (!address.trim()) return NextResponse.json({ error: "no_address" }, { status: 400 });

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // No radius configured means there is nothing to tell the dispatcher; say so rather than
  // rendering the handler's "cannot be ruled out" phrasing, which is written to steer the model.
  if (account.serviceAreaRadiusMiles == null) return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } });

  const result = await checkServiceArea(account, address);
  return NextResponse.json({ configured: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
