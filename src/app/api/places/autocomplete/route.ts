import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { googleMapsConfigured } from "@/lib/env";
import { autocompleteAddresses, type PlacesBias } from "@/lib/places";
import { asCountry } from "@/lib/locale";

export const dynamic = "force-dynamic";

/**
 * GET /api/places/autocomplete?q=123+Main&session=<uuid>[&country=US][&bias=account]
 *
 * Signed-in only; the Google key never reaches the browser. `bias=account` leans suggestions toward the
 * account's own location and service radius — read from the ACCOUNT here rather than accepted from the
 * caller, so a client cannot steer someone else's billed autocomplete session at coordinates of its
 * choosing. An account with no pinned location or no radius simply gets no bias.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleMapsConfigured()) return NextResponse.json({ error: "not_configured", suggestions: [] }, { status: 503 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const token = req.nextUrl.searchParams.get("session") ?? undefined;
  const country = asCountry(req.nextUrl.searchParams.get("country")) ?? undefined;

  let bias: PlacesBias | null = null;
  if (req.nextUrl.searchParams.get("bias") === "account" && session.user.accountId) {
    const a = await prisma.account.findUnique({
      where: { id: session.user.accountId },
      select: { latitude: true, longitude: true, serviceAreaRadiusMiles: true },
    });
    if (a?.latitude != null && a.longitude != null) {
      const radius = a.serviceAreaRadiusMiles != null ? Number(a.serviceAreaRadiusMiles) : null;
      bias = { lat: a.latitude, lng: a.longitude, radiusMiles: radius && radius > 0 ? radius : 25 };
    }
  }

  const suggestions = await autocompleteAddresses(q.slice(0, 200), token, country, bias);
  return NextResponse.json({ suggestions });
}
