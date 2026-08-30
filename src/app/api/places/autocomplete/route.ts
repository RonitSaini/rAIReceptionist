import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { googleMapsConfigured } from "@/lib/env";
import { autocompleteAddresses } from "@/lib/places";

export const dynamic = "force-dynamic";

/** GET /api/places/autocomplete?q=123+Main&session=<uuid> — signed-in only; the Google key never reaches the browser. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!googleMapsConfigured()) return NextResponse.json({ error: "not_configured", suggestions: [] }, { status: 503 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const token = req.nextUrl.searchParams.get("session") ?? undefined;
  const suggestions = await autocompleteAddresses(q.slice(0, 200), token);
  return NextResponse.json({ suggestions });
}
