import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { db } from "./db.server";

export type Role = "admin" | "librarian";
export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  mustChange: boolean;
};

const COOKIE = "tt_sid";
const SESSION_DAYS = 7;
const ITERATIONS = 100000;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const enc = new TextEncoder();

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt.slice().buffer as ArrayBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !saltB64 || !hashB64) return false;
  const hash = await pbkdf2(password, unb64(saltB64), Number(iter));
  return safeEqual(hash, unb64(hashB64));
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use both letters and numbers.";
  return null;
}

async function sha256(text: string): Promise<string> {
  return b64(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
}

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  password_hash: string;
  must_change: number;
  active: number;
  failed_count: number;
  locked_until: string | null;
};

export async function login(
  username: string,
  password: string,
): Promise<{ ok: true; user: SessionUser } | { ok: false; message: string }> {
  const generic = "The username or password is not right.";
  const row = await db()
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username.trim())
    .first<UserRow>();
  if (!row || !row.active) {
    await pbkdf2(password, new Uint8Array(16), ITERATIONS); // even out timing
    return { ok: false, message: generic };
  }
  if (row.locked_until && new Date(row.locked_until + "Z") > new Date()) {
    return { ok: false, message: `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.` };
  }
  const good = await verifyPassword(password, row.password_hash);
  if (!good) {
    const fails = row.failed_count + 1;
    if (fails >= MAX_FAILS) {
      await db()
        .prepare(
          `UPDATE users SET failed_count = 0, locked_until = datetime('now', '+${LOCK_MINUTES} minutes') WHERE id = ?`,
        )
        .bind(row.id)
        .run();
      return { ok: false, message: `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.` };
    }
    await db().prepare("UPDATE users SET failed_count = ? WHERE id = ?").bind(fails, row.id).run();
    return { ok: false, message: generic };
  }
  await db().prepare("UPDATE users SET failed_count = 0, locked_until = NULL WHERE id = ?").bind(row.id).run();

  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = b64(raw).replace(/[+/=]/g, "");
  await db()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`,
    )
    .bind(await sha256(token), row.id)
    .run();
  await db().prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      mustChange: !!row.must_change,
    },
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const row = await db()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role, u.must_change, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .bind(await sha256(token))
    .first<Omit<UserRow, "password_hash" | "failed_count" | "locked_until">>();
  if (!row || !row.active) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    mustChange: !!row.must_change,
  };
}

export async function logout() {
  const token = getCookie(COOKIE);
  if (token) {
    await db().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  deleteCookie(COOKIE, { path: "/" });
}

export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("Please sign in again.");
  if (role === "admin" && user.role !== "admin") throw new Error("Only an admin can do that.");
  return user;
}

export async function endOtherSessions(userId: number) {
  const token = getCookie(COOKIE);
  const keep = token ? await sha256(token) : "";
  await db().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(userId, keep).run();
}

export async function endAllSessions(userId: number) {
  await db().prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}
