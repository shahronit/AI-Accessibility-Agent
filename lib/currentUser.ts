import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase/admin";

/**
 * Sentinel user id for unauthenticated ("guest") sessions.
 *
 * The app is guest-default: every route works without signing in. All guest
 * traffic shares this single user_id so Firestore queries on `user_id ==
 * "guest"` always return data. Signed-in Firebase users keep their own
 * per-uid bucket.
 *
 * The matching `users/guest` doc is seeded by `ensureGuestUser()` in
 * `lib/db.ts` the first time the data layer is touched.
 */
export const GUEST_USER_ID = "guest";

const SESSION_COOKIE = "__session";

/**
 * Returns the Firebase Auth uid when a `__session` cookie is present and
 * valid, otherwise the sentinel guest id.
 *
 * Use this everywhere a server route used to do:
 *
 *     const session = await auth();
 *     if (!session?.user?.id) return 401;
 *     const userId = session.user.id;
 *
 * Replaced by:
 *
 *     const userId = await getCurrentUserId();
 *
 * On any verification error (expired, revoked, malformed cookie, missing
 * Admin SDK config) we fall back to GUEST_USER_ID instead of throwing —
 * guest-default behaviour must never be broken by a misconfigured server.
 */
export async function getCurrentUserId(): Promise<string> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return GUEST_USER_ID;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    return decoded.uid || GUEST_USER_ID;
  } catch {
    return GUEST_USER_ID;
  }
}
