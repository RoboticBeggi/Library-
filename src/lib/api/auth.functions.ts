import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  currentUser,
  endOtherSessions,
  hashPassword,
  login,
  logout,
  requireUser,
  validatePassword,
  verifyPassword,
} from "../auth.server";
import { db, logActivity } from "../db.server";

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  return await currentUser();
});

export const signIn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const res = await login(data.username, data.password);
    if (res.ok) await logActivity(res.user.id, "sign_in", "");
    return res.ok ? { ok: true as const, mustChange: res.user.mustChange } : res;
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await logout();
  return { ok: true };
});

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const row = await db().prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
    if (!row || !(await verifyPassword(data.current, row.password_hash))) {
      return { ok: false as const, message: "Your current password is not right." };
    }
    const problem = validatePassword(data.next);
    if (problem) return { ok: false as const, message: problem };
    if (data.next === data.current) return { ok: false as const, message: "Pick a new password, not the same one." };
    await db()
      .prepare("UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?")
      .bind(await hashPassword(data.next), user.id)
      .run();
    await endOtherSessions(user.id);
    await logActivity(user.id, "password_changed", "");
    return { ok: true as const };
  });
