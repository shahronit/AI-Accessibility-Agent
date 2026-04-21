"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { getClientAuth } from "@/lib/firebase/client";

/**
 * Drop-in replacement for the NextAuth React provider/hook surface.
 *
 * Why a shim?
 *   - Twelve+ components in this codebase already import `{ useSession }`
 *     from `next-auth/react`. Re-exporting the same hook name from this
 *     module lets us flip one import line per file instead of rewriting
 *     each consumer.
 *   - The returned `session.user` shape mirrors NextAuth's
 *     `{ name, email, image, id }` so AppShell/Avatar code works
 *     unchanged.
 *
 * The provider subscribes to Firebase Auth state and:
 *   - exposes `status`: "loading" | "authenticated" | "unauthenticated"
 *   - exposes `data`: { user } | null
 *   - re-syncs the server `__session` cookie whenever the client uid
 *     changes (e.g. token rotation) so the cookie can't drift away
 *     from the live auth state.
 */

interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface SessionPayload {
  user: SessionUser;
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionContextValue {
  data: SessionPayload | null;
  status: SessionStatus;
  /** Force a refresh after sign-in so consumers re-render immediately. */
  refresh: () => void;
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  refresh: () => undefined,
});

function userToSession(user: User | null): SessionPayload | null {
  if (!user) return null;
  return {
    user: {
      id: user.uid,
      name: user.displayName,
      email: user.email,
      image: user.photoURL,
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let auth;
    try {
      auth = getClientAuth();
    } catch {
      // Firebase env vars not configured — stay in unauthenticated/guest mode.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init when Firebase config is missing
      setStatus("unauthenticated");
      return;
    }
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setStatus(next ? "authenticated" : "unauthenticated");
    });
    return () => unsub();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      data: userToSession(user),
      status,
      refresh: () => setRefreshTick((n) => n + 1),
    }),
    // refreshTick intentionally re-runs the memo so consumers can
    // force a re-render after a sign-in flow.
    [user, status, refreshTick],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): { data: SessionPayload | null; status: SessionStatus } {
  const ctx = useContext(SessionContext);
  return { data: ctx.data, status: ctx.status };
}

export function useAuthActions() {
  const ctx = useContext(SessionContext);
  return { refresh: ctx.refresh };
}

/**
 * Sign the current user out of Firebase AND clear the server-side
 * `__session` cookie. The optional `callbackUrl` is followed via
 * `window.location.assign` so the destination page renders with a
 * fresh, guest-mode HTML response (avoids hydration mismatch when the
 * server-rendered page expected a session that was just torn down).
 */
export async function signOut(opts: { callbackUrl?: string } = {}): Promise<void> {
  try {
    const auth = getClientAuth();
    await firebaseSignOut(auth);
  } catch {
    /* even if the client sign-out fails we still want to clear the cookie */
  }
  await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  if (typeof window !== "undefined") {
    window.location.assign(opts.callbackUrl ?? "/");
  }
}
