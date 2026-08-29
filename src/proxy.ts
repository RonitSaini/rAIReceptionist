import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Route protection. Signed-out users are sent to /login; signed-in users
 * visiting /login or /signup are sent to the dashboard.
 */
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (isAuthPage) {
    if (token) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/notifications/:path*",
    "/calls/:path*",
    "/reservations/:path*",
    "/takeout/:path*",
    "/settings/:path*",
    "/api/notifications/:path*",
    "/api/availability",
  ],
};
