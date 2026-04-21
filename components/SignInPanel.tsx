"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthError,
} from "firebase/auth";
import { getClientAuth, githubProvider, googleProvider } from "@/lib/firebase/client";

/**
 * Firebase-backed sign-in surface.
 *
 * Flow (any provider):
 *   1. Client-side Firebase sign-in returns a `user`.
 *   2. We grab the short-lived ID token (`getIdToken()`).
 *   3. POST it to `/api/auth/session` so the server mints a 14-day
 *      `__session` cookie. Until that POST returns, server-rendered
 *      pages won't see the new identity.
 *   4. Redirect to `callbackUrl`. We use `router.replace` so the
 *      sign-in page doesn't sit in the back-stack.
 *
 * All three providers (email/password, Google, GitHub) end here. The
 * UI keeps a single `pending` flag so the whole panel disables during
 * any in-flight attempt.
 */

interface Props {
  callbackUrl: string;
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.74-6-6.12 0-3.39 2.7-6.13 6-6.13 1.88 0 3.14.8 3.86 1.49l2.63-2.55C16.84 3.27 14.62 2.3 12 2.3 6.92 2.3 2.8 6.42 2.8 11.5S6.92 20.7 12 20.7c6.93 0 9.21-4.86 9.21-7.34 0-.5-.06-.88-.13-1.26H12z"
      />
    </svg>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden focusable="false" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.87-.39.97.01 1.96.14 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.13 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function friendlyAuthError(err: unknown): string {
  if (typeof err === "object" && err && "code" in err) {
    const code = (err as AuthError).code;
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "That email already has an account. Try signing in instead.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/popup-closed-by-user":
        return "Sign-in window closed before finishing.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
      case "auth/account-exists-with-different-credential":
        return "An account with this email already exists using a different provider.";
      case "auth/network-request-failed":
        return "Network error talking to Firebase. Check your connection and try again.";
      case "auth/operation-not-allowed":
        return "This sign-in method isn't enabled in the Firebase Console.";
      case "auth/invalid-api-key":
      case "auth/api-key-not-valid":
        return "Firebase web config is missing or invalid. Set NEXT_PUBLIC_FIREBASE_* env vars.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Sign-in failed. Please try again.";
}

async function exchangeIdTokenForSessionCookie(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = (await res.json()) as { error?: string };
      detail = data?.error ? `: ${data.error}` : "";
    } catch {
      /* ignore */
    }
    throw new Error(`Could not establish server session${detail}`);
  }
}

export function SignInPanel({ callbackUrl }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<null | "email" | "google" | "github">(null);
  const [error, setError] = useState<string | null>(null);

  async function finishSignIn(idToken: string) {
    await exchangeIdTokenForSessionCookie(idToken);
    // Use a hard navigation so the destination page server-renders
    // with the freshly minted __session cookie present.
    if (typeof window !== "undefined") {
      window.location.assign(callbackUrl);
    } else {
      router.replace(callbackUrl);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("email");
    try {
      const auth = getClientAuth();
      const cred = mode === "signin"
        ? await signInWithEmailAndPassword(auth, email.trim(), password)
        : await createUserWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken();
      await finishSignIn(token);
    } catch (err) {
      setError(friendlyAuthError(err));
      setPending(null);
    }
  }

  async function handleProvider(kind: "google" | "github") {
    setError(null);
    setPending(kind);
    try {
      const auth = getClientAuth();
      const provider = kind === "google" ? googleProvider : githubProvider;
      const cred = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken();
      await finishSignIn(token);
    } catch (err) {
      setError(friendlyAuthError(err));
      setPending(null);
    }
  }

  const disableAll = pending !== null;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Sign in or create account" className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/30 p-1 text-xs">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => setMode("signin")}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            mode === "signin" ? "bg-emerald-500/25 text-emerald-200" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => setMode("register")}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            mode === "register" ? "bg-emerald-500/25 text-emerald-200" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create account
        </button>
      </div>

      <form className="space-y-3" onSubmit={handleEmailSubmit}>
        <label className="block text-xs font-medium text-zinc-300">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/30"
            disabled={disableAll}
          />
        </label>
        <label className="block text-xs font-medium text-zinc-300">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/30"
            disabled={disableAll}
          />
        </label>
        <button
          type="submit"
          disabled={disableAll}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
        >
          {pending === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "signin" ? "Sign in with email" : "Create account"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        <span className="h-px flex-1 bg-white/10" />
        Or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          disabled={disableAll}
          onClick={() => handleProvider("google")}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50"
        >
          {pending === "google" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <GoogleMark className="size-4" />
          )}
          Continue with Google
        </button>
        <button
          type="button"
          disabled={disableAll}
          onClick={() => handleProvider("github")}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-100 shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending === "github" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <GithubMark className="size-4" />
          )}
          Continue with GitHub
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
