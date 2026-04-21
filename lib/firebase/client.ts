"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";

/**
 * Firebase client SDK singletons (browser).
 *
 * These rely on `NEXT_PUBLIC_FIREBASE_*` env vars which Next.js inlines at
 * build time. The web API key here is *not* a secret in the traditional
 * sense — Firebase intentionally exposes it; security comes from Firebase
 * Auth + Firestore Rules, not from key secrecy. See
 * https://firebase.google.com/docs/projects/api-keys.
 *
 * The OAuth providers are exported as constants so the sign-in panel can
 * call `signInWithPopup(getClientAuth(), googleProvider)` without
 * re-instantiating the provider on every render.
 */

const APP_NAME = "a11yagent-client";

function readConfig() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = (Object.entries(cfg) as Array<[string, string | undefined]>)
    .filter(([, v]) => !v)
    .map(([k]) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase().replace(/^_/, "")}`);
  if (missing.length > 0) {
    throw new Error(
      `Firebase client config is incomplete. Missing env vars: ${missing.join(", ")}. See README → Firebase setup.`,
    );
  }
  return cfg as Required<typeof cfg>;
}

export function getClientApp(): FirebaseApp {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) return existing;
  if (getApps().length > 0) {
    try {
      return getApp(APP_NAME);
    } catch {
      /* not yet initialised */
    }
  }
  return initializeApp(readConfig(), APP_NAME);
}

export function getClientAuth(): Auth {
  return getAuth(getClientApp());
}

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
