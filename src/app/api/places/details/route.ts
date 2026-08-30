import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { googleMapsConfigured } from "@/lib/env";
import { placeAddress } from "@/lib/places";

export const dynamic = "force-dynamic";

/** GET /api/places/details?id=<placeId>&session=<uuid> — structured address + coordinates for a suggestion. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleMapsConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const token = req.nextUrl.searchParams.get("session") ?? undefined;
  const address = await placeAddress(id, token);
  if (!address) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ address });
}
