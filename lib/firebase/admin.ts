import { cert, getApp, getApps, initializeApp, applicationDefault, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "node:fs";

/**
 * Firebase Admin SDK singletons (server-only).
 *
 * Credential resolution order:
 *   1. `FIREBASE_SERVICE_ACCOUNT_JSON` — inline JSON string. Best for
 *      Vercel / Render / Docker since it survives a flat env-var only
 *      deployment surface. Newlines inside the private_key field may be
 *      escaped (`\n`) — we unescape them before parsing.
 *   2. `GOOGLE_APPLICATION_CREDENTIALS` — file path. Standard Google SDK
 *      env. Use this when running locally with the JSON sitting on disk.
 *   3. `applicationDefault()` — for environments that use ambient
 *      credentials (Cloud Run, GCE) — kept as a last-ditch fallback.
 *
 * `getAdminApp()` lazily initialises so the module can be imported by
 * client-targeted bundles (Next.js may do tree-shaking analysis at the
 * route boundary) without exploding when env vars are unset.
 */
const APP_NAME = "a11yagent-admin";

let _app: App | null = null;

type RawServiceAccount = ServiceAccount & { private_key?: string };

function fixupPrivateKey(sa: RawServiceAccount): ServiceAccount {
  // The PEM in `private_key` contains real newlines. When the JSON has
  // been transported through a flat env var it usually arrives with the
  // newlines escaped as the two-character sequence `\n` — Firebase's
  // cert() loader rejects that. Convert it back to real newlines.
  const pk = sa.privateKey ?? sa.private_key;
  if (typeof pk === "string" && pk.includes("\\n")) {
    const fixed = pk.replace(/\\n/g, "\n");
    if (sa.privateKey) sa.privateKey = fixed;
    if (sa.private_key) sa.private_key = fixed;
  }
  return sa;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    try {
      // Parse JSON FIRST so escape sequences inside string literals stay
      // valid; only the private_key PEM needs newline normalization.
      const parsed = JSON.parse(inline) as RawServiceAccount;
      return fixupPrivateKey(parsed);
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `GOOGLE_APPLICATION_CREDENTIALS points to ${filePath} but the file does not exist.`,
      );
    }
    const parsed = JSON.parse(
      fs.readFileSync(filePath, "utf8"),
    ) as RawServiceAccount;
    return fixupPrivateKey(parsed);
  }
  return null;
}

export function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    _app = existing;
    return existing;
  }

  const sa = loadServiceAccount();
  if (sa) {
    _app = initializeApp({ credential: cert(sa) }, APP_NAME);
  } else {
    try {
      _app = initializeApp({ credential: applicationDefault() }, APP_NAME);
    } catch {
      throw new Error(
        "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) or GOOGLE_APPLICATION_CREDENTIALS (file path) in .env.local. See README → Firebase setup.",
      );
    }
  }
  return _app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

let _firestore: Firestore | null = null;

export function getAdminFirestore(): Firestore {
  if (_firestore) return _firestore;
  _firestore = getFirestore(getAdminApp());
  // ignoreUndefinedProperties keeps the SQLite-style "field = ?" code path
  // happy: existing callers freely pass null/undefined columns and Firestore
  // would otherwise reject the write.
  //
  // settings() can only be called once per Firestore instance. In Next.js
  // dev HMR, this module is re-evaluated but the underlying firebase-admin
  // App is cached on globalThis, so the Firestore instance may already have
  // settings applied. Swallow the "already initialized" error.
  try {
    _firestore.settings({ ignoreUndefinedProperties: true });
  } catch (err) {
    if (
      !(err instanceof Error) ||
      !err.message.includes("already been initialized")
    ) {
      throw err;
    }
  }
  return _firestore;
}

// Re-export the discriminator helper so call sites in `lib/db.ts` can keep
// the existing `getApp` import shape without leaking the firebase-admin
// modules across the rest of the codebase.
export { getApp };
