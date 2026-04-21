#!/usr/bin/env node
/**
 * One-shot SQLite → Firestore migration.
 *
 * Walks every `users`, `scans`, and `scan_pages` row in the local
 * `./data/a11yagent.db` (or whatever `DB_PATH` points at) and writes
 * them into Firestore using the Admin SDK. Idempotent — re-running is
 * safe because every write uses `set(..., { merge: true })`.
 *
 * Run with:
 *   npm run migrate:firestore
 *
 * Requires the same Firebase Admin credentials as the app (one of):
 *   - FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON env var)
 *   - GOOGLE_APPLICATION_CREDENTIALS (path to JSON file)
 *
 * Optional:
 *   - DB_PATH                — overrides ./data/a11yagent.db
 *   - MIGRATION_DRY_RUN=1    — print counts and exit without writing
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Best-effort load of .env.local so the script Just Works for local users
// who haven't exported the Firebase env vars in their shell.
function loadDotEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnvLocal();

const Database = (await import("better-sqlite3")).default;
const adminApp = await import("firebase-admin/app");
const adminFs = await import("firebase-admin/firestore");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "a11yagent.db");
const DRY_RUN = process.env.MIGRATION_DRY_RUN === "1";
const FIRESTORE_BATCH_LIMIT = 500;

if (!existsSync(DB_PATH)) {
  console.error(`SQLite DB not found at ${DB_PATH}. Set DB_PATH or run from the project root.`);
  process.exit(1);
}

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    return JSON.parse(inline.replace(/\\n/g, "\n"));
  }
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS points to ${filePath} but file is missing.`);
      process.exit(1);
    }
    return JSON.parse(readFileSync(filePath, "utf8"));
  }
  console.error(
    "Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS before running the migration.",
  );
  process.exit(1);
}

const sa = loadServiceAccount();
const app = adminApp.initializeApp({ credential: adminApp.cert(sa) }, "migration");
const db = adminFs.getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

const sqlite = new Database(DB_PATH, { readonly: true });
sqlite.pragma("journal_mode = WAL");

function isoToTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return adminFs.Timestamp.fromDate(d);
}

async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    for (const op of slice) op(batch);
    await batch.commit();
    process.stdout.write(`  committed ${Math.min(i + FIRESTORE_BATCH_LIMIT, ops.length)}/${ops.length}\r`);
  }
  if (ops.length > 0) console.log("");
}

// ---------------- Users ----------------
const users = sqlite.prepare("SELECT * FROM users").all();
console.log(`users: ${users.length} row(s)`);
if (!DRY_RUN) {
  const ops = users.map((u) => (batch) => {
    batch.set(
      db.collection("users").doc(String(u.id)),
      {
        email: u.email,
        password_hash: u.password_hash ?? "",
        name: u.name ?? null,
        role: u.role ?? "user",
        created_at: isoToTimestamp(u.created_at) ?? adminFs.FieldValue.serverTimestamp(),
        updated_at: isoToTimestamp(u.updated_at) ?? adminFs.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await commitInChunks(ops);
}

// ---------------- Scans ----------------
const scans = sqlite.prepare("SELECT * FROM scans").all();
console.log(`scans: ${scans.length} row(s)`);
if (!DRY_RUN) {
  const ops = scans.map((s) => (batch) => {
    batch.set(
      db.collection("scans").doc(String(s.id)),
      {
        user_id: s.user_id,
        url: s.url,
        status: s.status,
        wcag_level: s.wcag_level,
        max_pages: s.max_pages,
        overall_score: s.overall_score,
        total_violations: s.total_violations ?? 0,
        total_passes: s.total_passes ?? 0,
        total_incomplete: s.total_incomplete ?? 0,
        pages_scanned: s.pages_scanned ?? 0,
        pages_total: s.pages_total ?? 0,
        progress_json: s.progress_json ?? null,
        started_at: isoToTimestamp(s.started_at) ?? adminFs.FieldValue.serverTimestamp(),
        completed_at: isoToTimestamp(s.completed_at),
        error_message: s.error_message ?? null,
      },
      { merge: true },
    );
  });
  await commitInChunks(ops);
}

// ---------------- Scan pages ----------------
const pages = sqlite.prepare("SELECT * FROM scan_pages").all();
console.log(`scan_pages: ${pages.length} row(s)`);
if (!DRY_RUN) {
  const ops = pages.map((p) => (batch) => {
    batch.set(
      db.collection("scans").doc(String(p.scan_id)).collection("pages").doc(String(p.id)),
      {
        scan_id: p.scan_id,
        url: p.url ?? null,
        title: p.title ?? null,
        score: p.score ?? null,
        violations_count: p.violations_count ?? 0,
        passes_count: p.passes_count ?? 0,
        incomplete_count: p.incomplete_count ?? 0,
        results_json: p.results_json ?? null,
        scanned_at: isoToTimestamp(p.scanned_at) ?? adminFs.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  await commitInChunks(ops);
}

if (DRY_RUN) {
  console.log("\nDry run — no writes made. Re-run without MIGRATION_DRY_RUN=1 to migrate.");
} else {
  console.log("\nMigration complete.");
}

sqlite.close();
process.exit(0);
