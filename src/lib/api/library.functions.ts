import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "../auth.server";
import { db, logActivity } from "../db.server";

const code = z.string().trim().min(1).max(40);

export type LoanRow = {
  loan_id: number;
  state: "out" | "returned" | "owed" | "cleared";
  condition: "good" | "damaged" | "lost" | null;
  borrowed_at: string;
  due_at: string;
  closed_at: string | null;
  barcode: string;
  copy_status: string;
  title: string;
  price_cents: number;
  student_id: number;
  sid: string;
  student_name: string;
  class_name: string;
};

const LOAN_SELECT = `SELECT l.id AS loan_id, l.state, l.condition, l.borrowed_at, l.due_at, l.closed_at,
  c.barcode, c.status AS copy_status, t.name AS title, t.price_cents,
  s.id AS student_id, s.sid, s.name AS student_name, s.class_name
  FROM loans l JOIN copies c ON c.id = l.copy_id JOIN titles t ON t.id = c.title_id
  JOIN students s ON s.id = l.student_id`;

async function setting(key: string): Promise<string> {
  const r = await db().prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? "";
}

export const getOwed = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const rows = await db()
    .prepare(`${LOAN_SELECT} WHERE l.state IN ('out','owed') ORDER BY s.class_name, s.name, t.name`)
    .all<LoanRow>();
  const totals = await db()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM copies WHERE status != 'retired') AS copies,
              (SELECT COUNT(*) FROM loans WHERE state = 'out') AS out,
              date('now', '+8 hours') AS today`,
    )
    .first<{ copies: number; out: number; today: string }>();
  return {
    rows: rows.results ?? [],
    dueDate: await setting("due_date"),
    sessionLabel: await setting("session_label"),
    totalCopies: totals?.copies ?? 0,
    today: totals?.today ?? "",
  };
});

export const lookupForReturn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ q: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireUser();
    const q = data.q;
    const digits = /^[0-9A-Za-z-]+$/.test(q);
    let rows: LoanRow[] = [];
    if (digits) {
      const exact = await db().prepare(`${LOAN_SELECT} WHERE l.state = 'out' AND c.barcode = ?`).bind(q).all<LoanRow>();
      rows = exact.results ?? [];
      if (rows.length === 0 && q.length >= 3) {
        const tail = await db()
          .prepare(`${LOAN_SELECT} WHERE l.state = 'out' AND (c.barcode LIKE ? OR s.sid = ? COLLATE NOCASE) LIMIT 25`)
          .bind("%" + q, q)
          .all<LoanRow>();
        rows = tail.results ?? [];
      }
    }
    if (rows.length === 0 && q.length >= 2) {
      const byName = await db()
        .prepare(`${LOAN_SELECT} WHERE l.state = 'out' AND (s.name LIKE ? OR s.sid LIKE ?) ORDER BY s.name LIMIT 25`)
        .bind("%" + q + "%", "%" + q + "%")
        .all<LoanRow>();
      rows = byName.results ?? [];
    }
    let note = "";
    if (rows.length === 0) {
      const copy = await db()
        .prepare(`SELECT c.barcode, c.status, t.name FROM copies c JOIN titles t ON t.id = c.title_id WHERE c.barcode = ?`)
        .bind(q)
        .first<{ barcode: string; status: string; name: string }>();
      if (copy) {
        note =
          copy.status === "available"
            ? `Copy ${copy.barcode} (${copy.name}) is already on the shelf. Nobody has it on loan.`
            : `Copy ${copy.barcode} (${copy.name}) is not on loan. Its status is ${copy.status}.`;
      }
    }
    return { rows, note };
  });

export const returnLoan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ loanId: z.number().int().positive(), condition: z.enum(["good", "damaged", "lost"]) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const loan = await db()
      .prepare(`${LOAN_SELECT} WHERE l.id = ?`)
      .bind(data.loanId)
      .first<LoanRow>();
    if (!loan) return { ok: false as const, message: "That loan was not found." };
    if (loan.state !== "out") return { ok: false as const, message: "That book was already checked in." };
    const state = data.condition === "good" ? "returned" : "owed";
    const copyStatus = data.condition === "good" ? "available" : data.condition;
    await db().batch([
      db()
        .prepare("UPDATE loans SET state = ?, condition = ?, closed_at = date('now') WHERE id = ? AND state = 'out'")
        .bind(state, data.condition, data.loanId),
      db().prepare("UPDATE copies SET status = ? WHERE barcode = ?").bind(copyStatus, loan.barcode),
    ]);
    await logActivity(user.id, "return_" + data.condition, `${loan.barcode} ${loan.title} from ${loan.sid} ${loan.student_name}`);
    return { ok: true as const, loan: { ...loan, state, condition: data.condition } };
  });

export const undoReturn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ loanId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const loan = await db()
      .prepare(`${LOAN_SELECT} WHERE l.id = ? AND l.state IN ('returned','owed') AND l.closed_at >= date('now','-1 day')`)
      .bind(data.loanId)
      .first<LoanRow>();
    if (!loan) return { ok: false as const, message: "This can no longer be undone." };
    await db().batch([
      db().prepare("UPDATE loans SET state = 'out', condition = NULL, closed_at = NULL WHERE id = ?").bind(data.loanId),
      db().prepare("UPDATE copies SET status = 'loaned' WHERE barcode = ?").bind(loan.barcode),
    ]);
    await logActivity(user.id, "undo_return", `${loan.barcode} ${loan.sid}`);
    return { ok: true as const };
  });

export const markReplaced = createServerFn({ method: "POST" })
  .inputValidator(z.object({ loanId: z.number().int().positive(), newBarcode: z.string().trim().max(40).optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const loan = await db()
      .prepare(`SELECT l.id, l.state, c.title_id, c.barcode FROM loans l JOIN copies c ON c.id = l.copy_id WHERE l.id = ?`)
      .bind(data.loanId)
      .first<{ id: number; state: string; title_id: number; barcode: string }>();
    if (!loan || loan.state !== "owed") return { ok: false as const, message: "That replacement is not pending." };
    const stmts = [
      db().prepare("UPDATE loans SET state = 'cleared', cleared_at = date('now') WHERE id = ?").bind(loan.id),
      db().prepare("UPDATE copies SET status = 'retired' WHERE barcode = ?").bind(loan.barcode),
    ];
    if (data.newBarcode) {
      const exists = await db().prepare("SELECT id FROM copies WHERE barcode = ?").bind(data.newBarcode).first();
      if (exists) return { ok: false as const, message: `Copy number ${data.newBarcode} is already in the system.` };
      stmts.push(
        db().prepare("INSERT INTO copies (barcode, title_id, status) VALUES (?, ?, 'available')").bind(data.newBarcode, loan.title_id),
      );
    }
    await db().batch(stmts);
    await logActivity(user.id, "replaced", `${loan.barcode}${data.newBarcode ? " -> " + data.newBarcode : ""}`);
    return { ok: true as const };
  });

export const undoReplaced = createServerFn({ method: "POST" })
  .inputValidator(z.object({ loanId: z.number().int().positive(), newBarcode: z.string().trim().max(40).optional() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const loan = await db()
      .prepare(`SELECT l.id, l.condition, c.barcode FROM loans l JOIN copies c ON c.id = l.copy_id WHERE l.id = ? AND l.state = 'cleared' AND l.cleared_at >= date('now','-1 day')`)
      .bind(data.loanId)
      .first<{ id: number; condition: string; barcode: string }>();
    if (!loan) return { ok: false as const, message: "This can no longer be undone." };
    const stmts = [
      db().prepare("UPDATE loans SET state = 'owed', cleared_at = NULL WHERE id = ?").bind(loan.id),
      db().prepare("UPDATE copies SET status = ? WHERE barcode = ?").bind(loan.condition === "lost" ? "lost" : "damaged", loan.barcode),
    ];
    if (data.newBarcode) {
      stmts.push(
        db().prepare("DELETE FROM copies WHERE barcode = ? AND status = 'available' AND id NOT IN (SELECT copy_id FROM loans)").bind(data.newBarcode),
      );
    }
    await db().batch(stmts);
    await logActivity(user.id, "undo_replaced", loan.barcode);
    return { ok: true as const };
  });

export const findStudents = createServerFn({ method: "POST" })
  .inputValidator(z.object({ q: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    await requireUser();
    const r = await db()
      .prepare(
        `SELECT s.id, s.sid, s.name, s.class_name,
          (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.state = 'out') AS out_count,
          (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.state = 'owed') AS owed_count
         FROM students s WHERE s.active = 1 AND (s.sid = ? COLLATE NOCASE OR s.name LIKE ? OR s.sid LIKE ?)
         ORDER BY (s.sid = ? COLLATE NOCASE) DESC, s.name LIMIT 20`,
      )
      .bind(data.q, "%" + data.q + "%", data.q + "%", data.q)
      .all<{ id: number; sid: string; name: string; class_name: string; out_count: number; owed_count: number }>();
    return r.results ?? [];
  });

export const checkCopy = createServerFn({ method: "POST" })
  .inputValidator(z.object({ barcode: code }))
  .handler(async ({ data }) => {
    await requireUser();
    const c = await db()
      .prepare(
        `SELECT c.barcode, c.status, t.name AS title,
          (SELECT s.name FROM loans l JOIN students s ON s.id = l.student_id WHERE l.copy_id = c.id AND l.state = 'out' LIMIT 1) AS holder
         FROM copies c JOIN titles t ON t.id = c.title_id WHERE c.barcode = ?`,
      )
      .bind(data.barcode)
      .first<{ barcode: string; status: string; title: string; holder: string | null }>();
    if (!c) return { ok: false as const, message: `Copy ${data.barcode} is not in the system. Add it under Book stock first.` };
    if (c.status !== "available") {
      const why = c.status === "loaned" ? `is on loan to ${c.holder ?? "another student"}` : `is marked ${c.status}`;
      return { ok: false as const, message: `Copy ${c.barcode} (${c.title}) ${why}.` };
    }
    return { ok: true as const, barcode: c.barcode, title: c.title };
  });

export const lendCopies = createServerFn({ method: "POST" })
  .inputValidator(z.object({ studentId: z.number().int().positive(), barcodes: z.array(code).min(1).max(30) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const student = await db().prepare("SELECT id, sid, name FROM students WHERE id = ? AND active = 1").bind(data.studentId).first<{ id: number; sid: string; name: string }>();
    if (!student) return { ok: false as const, message: "Student not found.", lent: [] as string[], failed: [] as string[] };
    const due = (await setting("due_date")) || new Date().toISOString().slice(0, 10);
    const lent: string[] = [];
    const failed: string[] = [];
    for (const b of Array.from(new Set(data.barcodes))) {
      const c = await db().prepare("SELECT id FROM copies WHERE barcode = ? AND status = 'available'").bind(b).first<{ id: number }>();
      if (!c) { failed.push(b); continue; }
      await db().batch([
        db().prepare("UPDATE copies SET status = 'loaned' WHERE id = ? AND status = 'available'").bind(c.id),
        db().prepare("INSERT INTO loans (copy_id, student_id, due_at, created_by) VALUES (?, ?, ?, ?)").bind(c.id, student.id, due, user.id),
      ]);
      lent.push(b);
    }
    if (lent.length) await logActivity(user.id, "lend", `${lent.join(", ")} to ${student.sid} ${student.name}`);
    return { ok: true as const, message: "", lent, failed };
  });

// ---------- Students ----------
export const listStudents = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const r = await db()
    .prepare(
      `SELECT s.id, s.sid, s.name, s.class_name, s.active, s.is_sample,
        (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.state = 'out') AS out_count,
        (SELECT COUNT(*) FROM loans l WHERE l.student_id = s.id AND l.state = 'owed') AS owed_count
       FROM students s ORDER BY s.class_name, s.name`,
    )
    .all<{ id: number; sid: string; name: string; class_name: string; active: number; is_sample: number; out_count: number; owed_count: number }>();
  return r.results ?? [];
});

const studentInput = z.object({
  sid: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  className: z.string().trim().min(1).max(40),
});

export const addStudents = createServerFn({ method: "POST" })
  .inputValidator(z.object({ students: z.array(studentInput).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    let added = 0;
    const skipped: string[] = [];
    for (const s of data.students) {
      const r = await db()
        .prepare("INSERT OR IGNORE INTO students (sid, name, class_name) VALUES (?, ?, ?)")
        .bind(s.sid.toUpperCase(), s.name, s.className)
        .run();
      if (r.meta.changes) added++;
      else skipped.push(s.sid.toUpperCase());
    }
    await logActivity(user.id, "students_added", `${added} added`);
    return { added, skipped };
  });

export const setStudentActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int().positive(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await db().prepare("UPDATE students SET active = ? WHERE id = ?").bind(data.active ? 1 : 0, data.id).run();
    await logActivity(user.id, data.active ? "student_restored" : "student_archived", String(data.id));
    return { ok: true };
  });

// ---------- Book stock ----------
export const listStock = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const r = await db()
    .prepare(
      `SELECT t.id, t.name, t.form, t.price_cents, t.isbn, t.is_sample,
        SUM(CASE WHEN c.status = 'available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN c.status = 'loaned' THEN 1 ELSE 0 END) AS loaned,
        SUM(CASE WHEN c.status IN ('damaged','lost') THEN 1 ELSE 0 END) AS problem,
        SUM(CASE WHEN c.status = 'retired' THEN 1 ELSE 0 END) AS retired
       FROM titles t LEFT JOIN copies c ON c.title_id = t.id GROUP BY t.id ORDER BY t.form, t.name`,
    )
    .all<{ id: number; name: string; form: string; price_cents: number; isbn: string | null; is_sample: number; available: number; loaned: number; problem: number; retired: number }>();
  return r.results ?? [];
});

export const listCopies = createServerFn({ method: "POST" })
  .inputValidator(z.object({ titleId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await requireUser();
    const r = await db()
      .prepare(
        `SELECT c.id, c.barcode, c.status,
          (SELECT s.name || ' (' || s.class_name || ')' FROM loans l JOIN students s ON s.id = l.student_id WHERE l.copy_id = c.id AND l.state IN ('out','owed') ORDER BY l.id DESC LIMIT 1) AS holder
         FROM copies c WHERE c.title_id = ? ORDER BY c.barcode`,
      )
      .bind(data.titleId)
      .all<{ id: number; barcode: string; status: string; holder: string | null }>();
    return r.results ?? [];
  });

export const addTitle = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().trim().min(2).max(160),
      form: z.string().trim().max(40),
      priceRm: z.number().min(0).max(1000),
      isbn: z.string().trim().max(20).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const r = await db()
      .prepare("INSERT INTO titles (name, form, price_cents, isbn) VALUES (?, ?, ?, ?)")
      .bind(data.name, data.form, Math.round(data.priceRm * 100), data.isbn || null)
      .run();
    await logActivity(user.id, "title_added", data.name);
    return { id: Number(r.meta.last_row_id) };
  });

export const addCopies = createServerFn({ method: "POST" })
  .inputValidator(z.object({ titleId: z.number().int().positive(), barcodes: z.array(code).min(1).max(1000) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    let added = 0;
    const skipped: string[] = [];
    for (const b of Array.from(new Set(data.barcodes))) {
      const r = await db().prepare("INSERT OR IGNORE INTO copies (barcode, title_id) VALUES (?, ?)").bind(b, data.titleId).run();
      if (r.meta.changes) added++;
      else skipped.push(b);
    }
    await logActivity(user.id, "copies_added", `${added} copies to title ${data.titleId}`);
    return { added, skipped };
  });

// ---------- One student's full record ----------
export type ProfileLoan = LoanRow & { cleared_at: string | null };

export const getStudentProfile = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sid: z.string().trim().min(1).max(20) }))
  .handler(async ({ data }) => {
    await requireUser();
    const student = await db()
      .prepare("SELECT id, sid, name, class_name, active, is_sample FROM students WHERE sid = ? COLLATE NOCASE")
      .bind(data.sid)
      .first<{ id: number; sid: string; name: string; class_name: string; active: number; is_sample: number }>();
    if (!student) return { student: null, loans: [] as ProfileLoan[], dueDate: "", today: "" };
    const loans = await db()
      .prepare(
        `${LOAN_SELECT.replace("l.closed_at,", "l.closed_at, l.cleared_at,")} WHERE l.student_id = ?
         ORDER BY l.borrowed_at DESC, t.name`,
      )
      .bind(student.id)
      .all<ProfileLoan>();
    const t = await db().prepare("SELECT date('now', '+8 hours') AS today").first<{ today: string }>();
    return { student, loans: loans.results ?? [], dueDate: await setting("due_date"), today: t?.today ?? "" };
  });
