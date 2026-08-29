import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countUnread } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Polled by the notification bell (no realtime/push dependency). */
export async function GET() {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ count: 0 }, { status: 401 });
  const count = await countUnread(accountId);
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
