import type { D1Database } from "@cloudflare/workers-types";
import { bindings } from "./bindings.server";

export function db(): D1Database {
  const { DB } = bindings();
  if (!DB) throw new Error("Database is not available");
  return DB;
}

export async function logActivity(userId: number | null, action: string, detail: string) {
  await db()
    .prepare("INSERT INTO activity (user_id, action, detail) VALUES (?, ?, ?)")
    .bind(userId, action, detail.slice(0, 500))
    .run();
}
