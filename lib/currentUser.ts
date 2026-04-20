import { auth } from "@/auth";

/**
 * Sentinel user id for unauthenticated ("guest") sessions.
 *
 * The app is guest-default: every route works without signing in. All guest
 * traffic shares this single user_id so the SQLite FK on `scans.user_id` is
 * always satisfied. Signed-in GitHub users keep their own per-user bucket.
 *
 * The matching row is seeded by `ensureGuestUser()` in `lib/db.ts` the first
 * time the database is opened.
 */
export const GUEST_USER_ID = "guest";

/**
 * Returns the GitHub user id when a NextAuth session exists, otherwise
 * the sentinel guest id. Use this everywhere a server route used to do:
 *
 *     const session = await auth();
 *     if (!session?.user?.id) return 401;
 *     const userId = session.user.id;
 *
 * Replaced by:
 *
 *     const userId = await getCurrentUserId();
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  return session?.user?.id ?? GUEST_USER_ID;
}
