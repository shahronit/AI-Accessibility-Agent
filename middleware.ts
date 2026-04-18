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
/**
 * Fix 8 - CI scan bypass.
 *
 * The GitHub Actions workflow (`.github/workflows/a11y-check.yml`) hits
 * `/api/scan` against a freshly-built ephemeral server that has no GitHub
 * OAuth flow available. When BOTH:
 *   - the request carries `X-A11y-CI-Token: <secret>`,
 *   - the matching `A11Y_CI_TOKEN` env var is set on the server, AND
 *   - the path is exactly `/api/scan`,
 * the middleware lets the request through unauthenticated. The token is a
 * GitHub repo secret; the env var is only present in the CI runner. In
 * production the env var is unset, so the bypass cannot fire even if a
 * caller happens to know the path.
 */
function isCiScanBypass(req: Request, pathname: string): boolean {
  if (pathname !== "/api/scan") return false;
  const expected = process.env.A11Y_CI_TOKEN;
  if (!expected) return false;
  const presented = req.headers.get("x-a11y-ci-token");
  if (!presented) return false;
  // Constant-time equality - both inputs are short, but avoid leaking
  // length/byte timing differences to a network observer.
  if (presented.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < presented.length; i++) {
    mismatch |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;

  const isPublic =
    pathname === "/" ||
    pathname === "/signin" ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  if (isCiScanBypass(req, pathname)) {
    return NextResponse.next();
  }

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
