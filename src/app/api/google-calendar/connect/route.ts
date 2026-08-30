import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildConnectUrl, googleCalendarConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow for the signed-in account (no state is written here). */
export async function GET(req: NextRequest) {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.redirect(new URL("/login", req.url));
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/settings?tab=reservations";
  if (!googleCalendarConfigured()) {
    const u = new URL(returnTo, req.url);
    u.searchParams.set("google", "not_configured");
    return NextResponse.redirect(u);
  }
  return NextResponse.redirect(buildConnectUrl(accountId, returnTo));
}
