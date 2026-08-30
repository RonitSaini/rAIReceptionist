import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { countUnread, recentNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Polled by the notification bell: unread count plus the latest items for its popover (no realtime/push dependency). */
export async function GET() {
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ count: 0, items: [] }, { status: 401 });
  const [count, items] = await Promise.all([countUnread(accountId), recentNotifications(accountId)]);
  return NextResponse.json({ count, items }, { headers: { "Cache-Control": "no-store" } });
}
