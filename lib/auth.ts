import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getUserById, type DbUser } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const JWT_EXPIRY = "24h";
const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface TokenPayload {
  id: string;
  email: string;
}

export function generateToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email } satisfies TokenPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Extract and verify the Bearer token from a Request.
 * Returns the full DbUser or null when missing/invalid.
 */
export function getAuthUser(request: Request): DbUser | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    const user = getUserById(payload.id);
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * Same as getAuthUser but throws a structured object for use in API routes.
 */
export function requireAuth(request: Request): DbUser {
  const user = getAuthUser(request);
  if (!user) {
    throw { status: 401, message: "Authentication required" };
  }
  return user;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  return null;
}
