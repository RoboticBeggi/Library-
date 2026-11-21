import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { endAllSessions, hashPassword, randomPassword, requireUser } from "../auth.server";
import { db, logActivity } from "../db.server";

export const getAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser("admin");
  const users = await db()
    .prepare("SELECT id, username, display_name, role, active, must_change, created_at FROM users ORDER BY role, username")
    .all<{ id: number; username: string; display_name: string; role: string; active: number; must_change: number; created_at: string }>();
  const settings = await db().prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const sample = await db()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM students WHERE is_sample = 1) + (SELECT COUNT(*) FROM titles WHERE is_sample = 1) AS n`,
    )
    .first<{ n: number }>();
  const activity = await db()
    .prepare(
      `SELECT a.at, a.action, a.detail, u.username FROM activity a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 40`,
    )
    .all<{ at: string; action: string; detail: string; username: string | null }>();
  const map: Record<string, string> = {};
  for (const s of settings.results ?? []) map[s.key] = s.value;
  return { users: users.results ?? [], settings: map, sampleCount: sample?.n ?? 0, activity: activity.results ?? [] };
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
      displayName: z.string().trim().min(2).max(80),
      role: z.enum(["admin", "librarian"]),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireUser("admin");
    const temp = randomPassword();
    const r = await db()
      .prepare("INSERT OR IGNORE INTO users (username, display_name, role, password_hash, must_change) VALUES (?, ?, ?, ?, 1)")
      .bind(data.username.toLowerCase(), data.displayName, data.role, await hashPassword(temp))
      .run();
    if (!r.meta.changes) return { ok: false as const, message: "That username is already taken." };
    await logActivity(admin.id, "user_created", `${data.username} (${data.role})`);
    return { ok: true as const, tempPassword: temp };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const admin = await requireUser("admin");
    const temp = randomPassword();
    await db()
      .prepare("UPDATE users SET password_hash = ?, must_change = 1, failed_count = 0, locked_until = NULL WHERE id = ?")
      .bind(await hashPassword(temp), data.id)
      .run();
    await endAllSessions(data.id);
    await logActivity(admin.id, "password_reset", String(data.id));
    return { ok: true as const, tempPassword: temp };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int().positive(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const admin = await requireUser("admin");
    if (data.id === admin.id && !data.active) return { ok: false as const, message: "You cannot turn off your own account." };
    await db().prepare("UPDATE users SET active = ? WHERE id = ?").bind(data.active ? 1 : 0, data.id).run();
    if (!data.active) await endAllSessions(data.id);
    await logActivity(admin.id, data.active ? "user_enabled" : "user_disabled", String(data.id));
    return { ok: true as const };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sessionLabel: z.string().trim().min(2).max(60),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireUser("admin");
    await db().batch([
      db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('due_date', ?)").bind(data.dueDate),
      db().prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('session_label', ?)").bind(data.sessionLabel),
    ]);
    await logActivity(admin.id, "settings_saved", `${data.sessionLabel}, due ${data.dueDate}`);
    return { ok: true as const };
  });

export const clearSampleData = createServerFn({ method: "POST" })
  .inputValidator(z.object({ confirm: z.literal("DELETE SAMPLE DATA") }))
  .handler(async () => {
    const admin = await requireUser("admin");
    await db().batch([
      db().prepare("DELETE FROM loans WHERE is_sample = 1 OR copy_id IN (SELECT id FROM copies WHERE is_sample = 1) OR student_id IN (SELECT id FROM students WHERE is_sample = 1)"),
      db().prepare("DELETE FROM copies WHERE is_sample = 1"),
      db().prepare("DELETE FROM titles WHERE is_sample = 1 AND id NOT IN (SELECT title_id FROM copies)"),
      db().prepare("DELETE FROM students WHERE is_sample = 1"),
    ]);
    await logActivity(admin.id, "sample_cleared", "");
    return { ok: true as const };
  });
