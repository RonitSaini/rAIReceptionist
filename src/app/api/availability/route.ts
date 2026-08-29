import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAvailableTimes } from "@/lib/availability";
import { isValidDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/availability?date=YYYY-MM-DD&partySize=2[&exclude=reservationId] */
export async function GET(req: NextRequest) {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  const partySize = Number.parseInt(req.nextUrl.searchParams.get("partySize") ?? "2", 10);
  const exclude = req.nextUrl.searchParams.get("exclude") ?? undefined;
  if (!isValidDateString(date) || !Number.isFinite(partySize) || partySize < 1) {
    return NextResponse.json({ error: "Invalid date or party size" }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const result = await getAvailableTimes(account, date, partySize, { excludeReservationId: exclude });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
