import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.DB_PATH || "./data/a11yagent.db";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      wcag_level TEXT NOT NULL DEFAULT 'wcag2aa',
      max_pages INTEGER NOT NULL DEFAULT 1,
      overall_score REAL,
      total_violations INTEGER NOT NULL DEFAULT 0,
      total_passes INTEGER NOT NULL DEFAULT 0,
      total_incomplete INTEGER NOT NULL DEFAULT 0,
      pages_scanned INTEGER NOT NULL DEFAULT 0,
      pages_total INTEGER NOT NULL DEFAULT 0,
      progress_json TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS scan_pages (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      url TEXT,
      title TEXT,
      score REAL,
      violations_count INTEGER NOT NULL DEFAULT 0,
      passes_count INTEGER NOT NULL DEFAULT 0,
      incomplete_count INTEGER NOT NULL DEFAULT 0,
      results_json TEXT,
      scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id);
    CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
    CREATE INDEX IF NOT EXISTS idx_scan_pages_scan_id ON scan_pages(scan_id);
  `);

  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
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

export function createUser(email: string, passwordHash: string, name?: string): DbUser {
  const db = getDb();
  const id = randomUUID();
  const isFirstUser = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c === 0;
  const role = isFirstUser ? "admin" : "user";

  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)",
  ).run(id, email.toLowerCase().trim(), passwordHash, name?.trim() || null, role);

  return getUserById(id)!;
}

export function getUserByEmail(email: string): DbUser | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as DbUser | undefined;
}

export function getUserById(id: string): DbUser | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
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

export function createScan(
  userId: string,
  url: string,
  wcagLevel: string,
  maxPages: number,
): DbScan {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    "INSERT INTO scans (id, user_id, url, wcag_level, max_pages) VALUES (?, ?, ?, ?, ?)",
  ).run(id, userId, url, wcagLevel, maxPages);
  return getScanById(id)!;
}

export function updateScan(
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
) {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v ?? null);
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE scans SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function getScanById(id: string): DbScan | undefined {
  return getDb().prepare("SELECT * FROM scans WHERE id = ?").get(id) as DbScan | undefined;
}

export function getUserScans(
  userId: string,
  limit = 20,
  offset = 0,
): DbScan[] {
  return getDb()
    .prepare("SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?")
    .all(userId, limit, offset) as DbScan[];
}

export function getUserScanCount(userId: string): number {
  return (
    getDb().prepare("SELECT COUNT(*) as c FROM scans WHERE user_id = ?").get(userId) as { c: number }
  ).c;
}

export function deleteScan(id: string) {
  const db = getDb();
  db.prepare("DELETE FROM scan_pages WHERE scan_id = ?").run(id);
  db.prepare("DELETE FROM scans WHERE id = ?").run(id);
}

export function clearUserHistory(userId: string) {
  const db = getDb();
  const scanIds = db
    .prepare("SELECT id FROM scans WHERE user_id = ?")
    .all(userId) as { id: string }[];
  const deletePages = db.prepare("DELETE FROM scan_pages WHERE scan_id = ?");
  for (const { id } of scanIds) deletePages.run(id);
  db.prepare("DELETE FROM scans WHERE user_id = ?").run(userId);
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

export function createScanPage(
  scanId: string,
  url: string,
  title: string,
  score: number,
  violationsCount: number,
  passesCount: number,
  incompleteCount: number,
  resultsJson: string,
): DbScanPage {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO scan_pages (id, scan_id, url, title, score, violations_count, passes_count, incomplete_count, results_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, scanId, url, title, score, violationsCount, passesCount, incompleteCount, resultsJson);
  return db.prepare("SELECT * FROM scan_pages WHERE id = ?").get(id) as DbScanPage;
}

export function getScanPages(scanId: string): DbScanPage[] {
  return getDb()
    .prepare("SELECT * FROM scan_pages WHERE scan_id = ? ORDER BY scanned_at ASC")
    .all(scanId) as DbScanPage[];
}

// --------------- Analytics ---------------

export interface DashboardStats {
  totalScans: number;
  completedScans: number;
  averageScore: number | null;
  totalViolations: number;
  recentScans: DbScan[];
}

export function getDashboardStats(userId: string): DashboardStats {
  const db = getDb();
  const totalScans = (
    db.prepare("SELECT COUNT(*) as c FROM scans WHERE user_id = ?").get(userId) as { c: number }
  ).c;
  const completedScans = (
    db
      .prepare("SELECT COUNT(*) as c FROM scans WHERE user_id = ? AND status = 'completed'")
      .get(userId) as { c: number }
  ).c;
  const agg = db
    .prepare(
      "SELECT AVG(overall_score) as avg_score, SUM(total_violations) as total_v FROM scans WHERE user_id = ? AND status = 'completed'",
    )
    .get(userId) as { avg_score: number | null; total_v: number | null };
  const recentScans = db
    .prepare("SELECT * FROM scans WHERE user_id = ? ORDER BY started_at DESC LIMIT 5")
    .all(userId) as DbScan[];

  return {
    totalScans,
    completedScans,
    averageScore: agg.avg_score != null ? Math.round(agg.avg_score * 10) / 10 : null,
    totalViolations: agg.total_v ?? 0,
    recentScans,
  };
}

export function getSeverityBreakdown(userId: string): Record<string, number> {
  const db = getDb();
  const latestScan = db
    .prepare(
      "SELECT id FROM scans WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
    )
    .get(userId) as { id: string } | undefined;

  if (!latestScan) return { critical: 0, serious: 0, moderate: 0, minor: 0 };

  const pages = getScanPages(latestScan.id);
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
