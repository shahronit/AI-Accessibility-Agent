import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminAuth } from "@/lib/firebase/admin";
import { createUser } from "@/lib/db";

/**
 * Firebase session cookie endpoint.
 *
 * Why session cookies (not raw ID tokens)?
 *   - Firebase ID tokens expire every hour. Trading them for a long-lived
 *     session cookie keeps `__session` valid for up to 14 days while still
 *     supporting server-side revocation via `revokeRefreshTokens(uid)`.
 *   - The cookie is HttpOnly so JS-side XSS cannot exfiltrate it; raw
 *     localStorage-stored ID tokens would not have that protection.
 *   - Server routes verify the cookie with `verifySessionCookie(_, true)`
 *     which also checks the user's revocation timestamp — so signing
 *     out forces all other tabs/devices to drop guest-mode immediately.
 *
 * Cookie name `__session` is intentional: Firebase Hosting / Cloud Run
 * strips every other cookie when serving cached responses, so any other
 * name silently drops the auth state under those CDNs.
 */

export const runtime = "nodejs";

const SESSION_COOKIE = "__session";
const FOURTEEN_DAYS_MS = 60 * 60 * 24 * 14 * 1000;

const PostBodySchema = z.object({
  idToken: z.string().min(20, "idToken is required"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const auth = getAdminAuth();

  // Verify the ID token first so we can reject obviously bad input
  // before paying the cost of cookie minting. `checkRevoked: true`
  // also catches sign-outs that revoked the user's refresh tokens.
  let decoded;
  try {
    decoded = await auth.verifyIdToken(parsed.data.idToken, true);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not verify Firebase ID token. Sign in again from a fresh tab.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 401 },
    );
  }

  let sessionCookie: string;
  try {
    sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
      expiresIn: FOURTEEN_DAYS_MS,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not mint session cookie.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Provision the user document on first sign-in. We don't await this on
  // the critical path — even if Firestore is slow, the cookie has been
  // minted and the user shouldn't wait at the spinner.
  void createUser(
    decoded.email ?? "",
    "",
    (decoded.name as string | undefined) ?? undefined,
    decoded.uid,
  ).catch((err) => {
    console.error("[session] createUser provisioning failed:", err);
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: FOURTEEN_DAYS_MS / 1000,
    path: "/",
  });

  return NextResponse.json({
    ok: true,
    user: { uid: decoded.uid, email: decoded.email ?? null },
  });
}

export async function DELETE() {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;

  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie);
      // Revoking refresh tokens forces all other tabs/devices to drop
      // their session as soon as they next call verifySessionCookie
      // with checkRevoked=true.
      await getAdminAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      /* cookie is already invalid — nothing to revoke */
    }
  }

  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
