import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Auth middleware.
 *
 * Public paths (always allowed without a session):
 *   - "/"            landing/dashboard read-only view
 *   - "/signin"      the GitHub sign-in screen itself
 *   - "/api/auth/*"  NextAuth callbacks
 *
 * Everything else requires a NextAuth session. Unauthenticated requests are
 * redirected to `/signin?callbackUrl=<original-url>` so the GitHub flow returns
 * the user to where they tried to go.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    pathname === "/signin" ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/signin", req.nextUrl);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search ?? ""}`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

/**
 * Skip Next.js internals and static assets so the middleware doesn't run on
 * every image / font / chunk request. Everything else (pages and API) hits
 * the auth check above.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
