import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificationHref } from "@/lib/notifications";

/** Marks the notification read, then sends the user to the related reservation / order / call. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.redirect(new URL("/login", req.url));

  const n = await prisma.notification.findFirst({ where: { id, accountId } });
  if (!n) return NextResponse.redirect(new URL("/notifications", req.url));

  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return NextResponse.redirect(new URL(notificationHref(n), req.url));
}
