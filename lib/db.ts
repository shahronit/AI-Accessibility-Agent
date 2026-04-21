import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";

/**
 * Firestore-backed data layer.
 *
 * The original SQLite implementation ([better-sqlite3]) was migrated to
 * Firestore in one shot. The shape of `DbUser`, `DbScan`, and `DbScanPage`
 * is preserved exactly so existing route handlers and report generators
 * keep working — the only call-site change needed is `await` because
 * Firestore is fully asynchronous.
 *
 * Collection layout:
 *   users/{uid}
 *   scans/{scanId}
 *   scans/{scanId}/pages/{pageId}
 *
 * Timestamps round-trip as ISO strings at the boundary so the existing
 * `DbScan.started_at: string` consumers (CSV/PDF reports, JSON UIs) need
 * no special handling.
 */

const SCANS = "scans";
const USERS = "users";
const PAGES = "pages";

const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Detect Firestore "missing index" errors so callers can degrade
 * gracefully instead of returning a 500 on a fresh project. The Firebase
 * Admin SDK throws a gRPC error with code === 9 (FAILED_PRECONDITION)
 * and a message starting with "9 FAILED_PRECONDITION: The query
 * requires an index".
 */
function isMissingIndexError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; message?: string };
  if (e.code === 9) return true;
  return Boolean(e.message?.includes("requires an index"));
}

let _indexWarningLogged = false;
function logMissingIndexOnce(err: unknown): void {
  if (_indexWarningLogged) return;
  _indexWarningLogged = true;
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(
    "[a11yagent/db] Firestore composite index missing — returning empty results. " +
      "Deploy the indexes from firestore.indexes.json with " +
      "`firebase deploy --only firestore:indexes` (or click the create-index " +
      "URL in the original error). Details: " +
      msg,
  );
}

let _guestEnsured = false;

export async function getDb(): Promise<Firestore> {
  const db = getAdminFirestore();
  await ensureGuestUser();
  return db;
}

/**
 * Idempotently seed the sentinel "guest" user document.
 *
 * The app is guest-default — `getCurrentUserId()` returns `GUEST_USER_ID`
 * (= "guest") for every unauthenticated request. The matching doc holds
 * a stable display name + role for any UI that surfaces it. Cached per
 * process so we don't pay a network round-trip on every hot path.
 */
export async function ensureGuestUser(): Promise<void> {
  if (_guestEnsured) return;
  const db = getAdminFirestore();
  await db.collection(USERS).doc("guest").set(
    {
      email: "guest@local",
      name: "Guest",
      role: "user",
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  _guestEnsured = true;
}

export function closeDb(): void {
  // No-op — Firestore Admin SDK manages connection lifecycle internally.
  // Kept as an export so any prior code that called it remains valid.
}

// --------------- Users ---------------

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

interface UserDocFields {
  email?: string;
  password_hash?: string;
  name?: string | null;
  role?: string;
  created_at?: Timestamp | string;
  updated_at?: Timestamp | string;
}

function tsToIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function tsToIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return tsToIso(value);
}

function userFromDoc(id: string, data: UserDocFields | undefined): DbUser | undefined {
  if (!data) return undefined;
  return {
    id,
    email: data.email ?? "",
    password_hash: data.password_hash ?? "",
    name: data.name ?? null,
    role: data.role ?? "user",
    created_at: tsToIso(data.created_at),
    updated_at: tsToIso(data.updated_at),
  };
}

/**
 * Create or merge a user document. Used by the auth layer when a Firebase
 * Auth uid first appears server-side. Email/password persistence is
 * handled by Firebase Auth itself, so `passwordHash` may be an empty
 * string for OAuth-only users.
 */
export async function createUser(
  email: string,
  passwordHash: string,
  name?: string,
  uid?: string,
): Promise<DbUser> {
  const db = getAdminFirestore();
  const id = uid ?? randomUUID();

  // First user gets the admin role; everyone else is a regular user.
  // We compute this with a count query rather than a transaction —
  // worst case under a race, two simultaneous first-time signups see
  // count == 0 and both become admin, which is acceptable for a
  // single-tenant app.
  const existing = await db.collection(USERS).count().get();
  const role = existing.data().count === 0 ? "admin" : "user";

  await db.collection(USERS).doc(id).set(
    {
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name: name?.trim() || null,
      role,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const fetched = await db.collection(USERS).doc(id).get();
  return userFromDoc(id, fetched.data() as UserDocFields | undefined)!;
}

export async function getUserByEmail(email: string): Promise<DbUser | undefined> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(USERS)
    .where("email", "==", email.toLowerCase().trim())
    .limit(1)
    .get();
  if (snap.empty) return undefined;
  const doc = snap.docs[0];
  return userFromDoc(doc.id, doc.data() as UserDocFields);
}

export async function getUserById(id: string): Promise<DbUser | undefined> {
  const db = getAdminFirestore();
  const snap = await db.collection(USERS).doc(id).get();
  if (!snap.exists) return undefined;
  return userFromDoc(snap.id, snap.data() as UserDocFields);
}

// --------------- Scans ---------------

export interface DbScan {
  id: string;
  user_id: string;
  url: string;
  status: string;
  wcag_level: string;
  max_pages: number;
  overall_score: number | null;
  total_violations: number;
  total_passes: number;
  total_incomplete: number;
  pages_scanned: number;
  pages_total: number;
  progress_json: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface ScanDocFields {
  user_id?: string;
  url?: string;
  status?: string;
  wcag_level?: string;
  max_pages?: number;
  overall_score?: number | null;
  total_violations?: number;
  total_passes?: number;
  total_incomplete?: number;
  pages_scanned?: number;
  pages_total?: number;
  progress_json?: string | null;
  started_at?: Timestamp | string;
  completed_at?: Timestamp | string | null;
  error_message?: string | null;
}

function scanFromDoc(id: string, data: ScanDocFields | undefined): DbScan | undefined {
  if (!data) return undefined;
  return {
    id,
    user_id: data.user_id ?? "guest",
    url: data.url ?? "",
    status: data.status ?? "pending",
    wcag_level: data.wcag_level ?? "wcag2aa",
    max_pages: data.max_pages ?? 1,
    overall_score: data.overall_score ?? null,
    total_violations: data.total_violations ?? 0,
    total_passes: data.total_passes ?? 0,
    total_incomplete: data.total_incomplete ?? 0,
    pages_scanned: data.pages_scanned ?? 0,
    pages_total: data.pages_total ?? 0,
    progress_json: data.progress_json ?? null,
    started_at: tsToIso(data.started_at),
    completed_at: tsToIsoOrNull(data.completed_at),
    error_message: data.error_message ?? null,
  };
}

export async function createScan(
  userId: string,
  url: string,
  wcagLevel: string,
  maxPages: number,
): Promise<DbScan> {
  await ensureGuestUser();
  const db = getAdminFirestore();
  const id = randomUUID();
  const now = Timestamp.now();
  await db.collection(SCANS).doc(id).set({
    user_id: userId,
    url,
    status: "pending",
    wcag_level: wcagLevel,
    max_pages: maxPages,
    overall_score: null,
    total_violations: 0,
    total_passes: 0,
    total_incomplete: 0,
    pages_scanned: 0,
    pages_total: 0,
    progress_json: null,
    started_at: now,
    completed_at: null,
    error_message: null,
  });
  const fetched = await db.collection(SCANS).doc(id).get();
  return scanFromDoc(id, fetched.data() as ScanDocFields)!;
}

export async function updateScan(
  id: string,
  fields: Partial<
    Pick<
      DbScan,
      | "status"
      | "overall_score"
      | "total_violations"
      | "total_passes"
      | "total_incomplete"
      | "pages_scanned"
      | "pages_total"
      | "progress_json"
      | "completed_at"
      | "error_message"
    >
  >,
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const db = getAdminFirestore();
  const update: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (k === "completed_at" && typeof v === "string") {
      update[k] = Timestamp.fromDate(new Date(v));
    } else {
      update[k] = v;
    }
  }
  await db.collection(SCANS).doc(id).update(update);
}

export async function getScanById(id: string): Promise<DbScan | undefined> {
  const db = getAdminFirestore();
  const snap = await db.collection(SCANS).doc(id).get();
  if (!snap.exists) return undefined;
  return scanFromDoc(snap.id, snap.data() as ScanDocFields);
}

export async function getUserScans(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<DbScan[]> {
  const db = getAdminFirestore();
  // Firestore has no native OFFSET; we over-fetch and slice. For history
  // pagination this is fine — the dashboard caps page size at 20 and
  // production users rarely scroll past a few pages. If usage grows we
  // can switch to cursor-based pagination via `startAfter(lastDoc)`.
  const q = db
    .collection(SCANS)
    .where("user_id", "==", userId)
    .orderBy("started_at", "desc")
    .limit(limit + offset);
  let snap;
  try {
    snap = await q.get();
  } catch (err) {
    if (isMissingIndexError(err)) {
      logMissingIndexOnce(err);
      return [];
    }
    throw err;
  }
  const docs = snap.docs.slice(offset, offset + limit);
  return docs
    .map((d) => scanFromDoc(d.id, d.data() as ScanDocFields))
    .filter((s): s is DbScan => Boolean(s));
}

export async function getUserScanCount(userId: string): Promise<number> {
  const db = getAdminFirestore();
  const agg = await db.collection(SCANS).where("user_id", "==", userId).count().get();
  return agg.data().count;
}

export async function deleteScan(id: string): Promise<void> {
  const db = getAdminFirestore();
  await deleteScanWithPages(db, id);
}

async function deleteScanWithPages(db: Firestore, scanId: string): Promise<void> {
  const pagesSnap = await db.collection(SCANS).doc(scanId).collection(PAGES).get();
  // Subcollection batch delete in chunks of 500 (Firestore batch cap).
  for (let i = 0; i < pagesSnap.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of pagesSnap.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  await db.collection(SCANS).doc(scanId).delete();
}

export async function clearUserHistory(userId: string): Promise<void> {
  const db = getAdminFirestore();
  const snap = await db.collection(SCANS).where("user_id", "==", userId).get();
  // Each scan has a subcollection that needs explicit cleanup. We collect
  // the scan ids first so the work survives batch chunking and we don't
  // hold a stale snapshot iterator across mutations.
  const ids = snap.docs.map((d) => d.id);
  for (const id of ids) {
    await deleteScanWithPages(db, id);
  }
}

// --------------- Scan Pages ---------------

export interface DbScanPage {
  id: string;
  scan_id: string;
  url: string | null;
  title: string | null;
  score: number | null;
  violations_count: number;
  passes_count: number;
  incomplete_count: number;
  results_json: string | null;
  scanned_at: string;
}

interface ScanPageDocFields {
  scan_id?: string;
  url?: string | null;
  title?: string | null;
  score?: number | null;
  violations_count?: number;
  passes_count?: number;
  incomplete_count?: number;
  results_json?: string | null;
  scanned_at?: Timestamp | string;
}

function pageFromDoc(id: string, data: ScanPageDocFields | undefined): DbScanPage | undefined {
  if (!data) return undefined;
  return {
    id,
    scan_id: data.scan_id ?? "",
    url: data.url ?? null,
    title: data.title ?? null,
    score: data.score ?? null,
    violations_count: data.violations_count ?? 0,
    passes_count: data.passes_count ?? 0,
    incomplete_count: data.incomplete_count ?? 0,
    results_json: data.results_json ?? null,
    scanned_at: tsToIso(data.scanned_at),
  };
}

export async function createScanPage(
  scanId: string,
  url: string,
  title: string,
  score: number,
  violationsCount: number,
  passesCount: number,
  incompleteCount: number,
  resultsJson: string,
): Promise<DbScanPage> {
  const db = getAdminFirestore();
  const id = randomUUID();
  const ref = db.collection(SCANS).doc(scanId).collection(PAGES).doc(id);
  const now = Timestamp.now();
  await ref.set({
    scan_id: scanId,
    url,
    title,
    score,
    violations_count: violationsCount,
    passes_count: passesCount,
    incomplete_count: incompleteCount,
    results_json: resultsJson,
    scanned_at: now,
  });
  const fetched = await ref.get();
  return pageFromDoc(id, fetched.data() as ScanPageDocFields)!;
}

export async function getScanPages(scanId: string): Promise<DbScanPage[]> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(SCANS)
    .doc(scanId)
    .collection(PAGES)
    .orderBy("scanned_at", "asc")
    .get();
  return snap.docs
    .map((d) => pageFromDoc(d.id, d.data() as ScanPageDocFields))
    .filter((p): p is DbScanPage => Boolean(p));
}

// --------------- Analytics ---------------

export interface DashboardStats {
  totalScans: number;
  completedScans: number;
  averageScore: number | null;
  totalViolations: number;
  recentScans: DbScan[];
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const db = getAdminFirestore();
  const scansCol = db.collection(SCANS);
  const userQuery = scansCol.where("user_id", "==", userId);

  let totalAgg, completedSnap, recentSnap;
  try {
    [totalAgg, completedSnap, recentSnap] = await Promise.all([
      userQuery.count().get(),
      userQuery.where("status", "==", "completed").get(),
      userQuery.orderBy("started_at", "desc").limit(5).get(),
    ]);
  } catch (err) {
    if (isMissingIndexError(err)) {
      logMissingIndexOnce(err);
      return {
        totalScans: 0,
        completedScans: 0,
        averageScore: null,
        totalViolations: 0,
        recentScans: [],
      };
    }
    throw err;
  }

  // Aggregate avg/sum on the client side instead of via aggregateField.
  // We're already paying for the document reads to populate `recentScans`
  // overlap and usually have far fewer than a few hundred completed scans
  // per user; switching to native aggregations is a future optimisation.
  let scoreSum = 0;
  let scoreCount = 0;
  let violationsSum = 0;
  for (const doc of completedSnap.docs) {
    const data = doc.data() as ScanDocFields;
    if (typeof data.overall_score === "number") {
      scoreSum += data.overall_score;
      scoreCount += 1;
    }
    if (typeof data.total_violations === "number") {
      violationsSum += data.total_violations;
    }
  }

  const recentScans = recentSnap.docs
    .map((d) => scanFromDoc(d.id, d.data() as ScanDocFields))
    .filter((s): s is DbScan => Boolean(s));

  return {
    totalScans: totalAgg.data().count,
    completedScans: completedSnap.size,
    averageScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    totalViolations: violationsSum,
    recentScans,
  };
}

export async function getSeverityBreakdown(userId: string): Promise<Record<string, number>> {
  const db = getAdminFirestore();
  let latestSnap;
  try {
    latestSnap = await db
      .collection(SCANS)
      .where("user_id", "==", userId)
      .where("status", "==", "completed")
      .orderBy("completed_at", "desc")
      .limit(1)
      .get();
  } catch (err) {
    if (isMissingIndexError(err)) {
      logMissingIndexOnce(err);
      return { critical: 0, serious: 0, moderate: 0, minor: 0 };
    }
    throw err;
  }

  if (latestSnap.empty) return { critical: 0, serious: 0, moderate: 0, minor: 0 };

  const latestId = latestSnap.docs[0].id;
  const pages = await getScanPages(latestId);
  const breakdown: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  for (const page of pages) {
    if (!page.results_json) continue;
    try {
      const results = JSON.parse(page.results_json);
      const violations = results.violations ?? [];
      for (const v of violations) {
        const impact: string = v.impact || "moderate";
        const nodeCount = v.nodes?.length || 1;
        breakdown[impact] = (breakdown[impact] || 0) + nodeCount;
      }
    } catch {
      /* skip malformed */
    }
  }

  return breakdown;
}

export function calculateScore(violations: number, passes: number): number {
  const total = violations + passes;
  if (total === 0) return 100;
  return Math.round((passes / total) * 1000) / 10;
}

// Suppress unused warning for unused WriteBatch import when batch helpers are tree-shaken.
export type { WriteBatch };
