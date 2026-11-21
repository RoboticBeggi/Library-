import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ReplaceAction, ReturnActions } from "../../components/loan-actions";
import { Avatar, PageHead } from "../../components/ui-bits";
import { useMemo, useState } from "react";
import {
  getOwed,
  markReplaced,
  returnLoan,
  undoReplaced,
  undoReturn,
  type LoanRow,
} from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Books owed · Textbook Returns" }] }),
  loader: () => getOwed(),
  component: OwedPage,
});

type Done = { text: string; undo: () => Promise<{ ok: boolean; message?: string }> };

function daysBetween(from: string, to: string) {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}
function rm(cents: number) {
  return "RM " + (cents / 100).toFixed(2);
}
function prettyDate(d: string) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function OwedPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [tab, setTab] = useState<"out" | "owed">("out");
  const [cls, setCls] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const out = data.rows.filter((r) => r.state === "out");
  const owed = data.rows.filter((r) => r.state === "owed");
  const uniq = (xs: LoanRow[]) => new Set(xs.map((r) => r.sid)).size;
  const owedTotal = owed.reduce((a, r) => a + r.price_cents, 0);
  const classes = useMemo(() => Array.from(new Set(data.rows.map((r) => r.class_name))).sort(), [data.rows]);
  const overdue = data.dueDate && data.today > data.dueDate;

  const needle = q.trim().toLowerCase();
  const list = (tab === "out" ? out : owed).filter(
    (r) =>
      (cls === "All" || r.class_name === cls) &&
      (!needle || `${r.student_name} ${r.sid} ${r.barcode} ${r.title}`.toLowerCase().includes(needle)),
  );
  const groups: { cls: string; rows: LoanRow[] }[] = [];
  for (const r of list) {
    const g = groups.find((x) => x.cls === r.class_name);
    if (g) g.rows.push(r);
    else groups.push({ cls: r.class_name, rows: [r] });
  }

  async function act(r: LoanRow, run: () => Promise<{ ok: boolean; message?: string }>, text: string, undo: Done["undo"]) {
    setBusy(r.loan_id);
    setError("");
    try {
      const res = await run();
      if (!res.ok) {
        setError(res.message ?? "That did not work.");
        setBusy(null);
        return;
      }
      setLeaving(r.loan_id);
      setTimeout(async () => {
        await router.invalidate();
        setLeaving(null);
        setBusy(null);
        setDone({ text, undo });
      }, 380);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      setBusy(null);
    }
  }

  function doReturn(r: LoanRow, condition: "good" | "damaged" | "lost") {
    const words = { good: "returned", damaged: "returned damaged", lost: "marked lost" }[condition];
    return act(
      r,
      () => returnLoan({ data: { loanId: r.loan_id, condition } }),
      `${r.title} (${r.barcode}) ${words} for ${r.student_name}.`,
      () => undoReturn({ data: { loanId: r.loan_id } }),
    );
  }
  function doReplace(r: LoanRow, newBarcode: string) {
    const nb = newBarcode.trim() || undefined;
    return act(
      r,
      () => markReplaced({ data: { loanId: r.loan_id, newBarcode: nb } }),
      `${r.student_name} replaced ${r.title}${nb ? `. New copy ${nb} added to stock` : ""}.`,
      () => undoReplaced({ data: { loanId: r.loan_id, newBarcode: nb } }),
    );
  }

  async function undo() {
    if (!done) return;
    const res = await done.undo();
    if (!res.ok) setError(res.message ?? "Could not undo.");
    setDone(null);
    await router.invalidate();
  }

  async function copyList() {
    const lines: string[] = [];
    const head = tab === "out" ? "Textbooks not returned" : "Textbooks to replace";
    lines.push(`${head} (${data.sessionLabel}), as of ${prettyDate(data.today)}`);
    for (const g of groups) {
      lines.push("", g.cls);
      for (const r of g.rows) {
        const extra = tab === "out" ? "not returned" : `${r.condition}, replace (${rm(r.price_cents)})`;
        lines.push(`- ${r.student_name} (${r.sid}): ${r.title}, copy ${r.barcode}, ${extra}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Your browser blocked copying. Select the list and copy it by hand.");
    }
  }

  return (
    <>
      <PageHead
        caption={
          <>
            {data.sessionLabel}
            {data.dueDate ? ` · return deadline ${prettyDate(data.dueDate)}` : ""}
          </>
        }
        title={<h1>Books still owed</h1>}
      >
      <p className="tt-lead">
        {out.length === 0 && owed.length === 0 ? (
          <>Nothing is owed. Every book is back and every replacement is done.</>
        ) : (
          <>
            <strong>{uniq(out)} {uniq(out) === 1 ? "student has" : "students have"}</strong> not returned {out.length}{" "}
            {out.length === 1 ? "book" : "books"}. <strong>{uniq(owed)} {uniq(owed) === 1 ? "student" : "students"}</strong> still{" "}
            {uniq(owed) === 1 ? "has" : "have"} to replace {owed.length} damaged or lost {owed.length === 1 ? "book" : "books"}, worth{" "}
            {rm(owedTotal)}.
          </>
        )}
      </p>
      <div className="tt-figures">
        <button className="tt-figure" style={{ ["--c" as string]: "#1a6fb5" }} aria-pressed={tab === "out"} onClick={() => setTab("out")}>
          <b>{out.length}</b>
          <span>
            books not returned · {uniq(out)} {uniq(out) === 1 ? "student" : "students"}
          </span>
        </button>
        <button className="tt-figure" style={{ ["--c" as string]: "#d4622a" }} aria-pressed={tab === "owed"} onClick={() => setTab("owed")}>
          <b>{owed.length}</b>
          <span>
            books to replace · {uniq(owed)} {uniq(owed) === 1 ? "student" : "students"}
          </span>
        </button>
        <div className="tt-figure" style={{ ["--c" as string]: "#0f7b6c" }}>
          <b>{rm(owedTotal)}</b>
          <span>value of books to replace</span>
        </div>
      </div>
      </PageHead>

      {done && (
        <div className="tt-banner" role="status">
          <div>Done</div>
          <div>
            <b style={{ fontSize: 19 }}>{done.text}</b>
            <button className="tt-linkbtn" onClick={undo}>
              Undo
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="tt-banner error" role="alert">
          <div>There is a problem</div>
          <div>
            <span>{error}</span>
            <button className="tt-linkbtn" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Which list" className="tt-tabs">
        <button role="tab" className="tt-tab" aria-selected={tab === "out"} onClick={() => setTab("out")}>
          Not returned <span style={{ fontWeight: 400 }}>({out.length})</span>
        </button>
        <button role="tab" className="tt-tab" aria-selected={tab === "owed"} onClick={() => setTab("owed")}>
          Not replaced <span style={{ fontWeight: 400 }}>({owed.length})</span>
        </button>
      </div>

      <div className="tt-panel" role="tabpanel">
        <div className="tt-row" style={{ marginBottom: 28 }}>
          <div className="tt-field" style={{ margin: 0 }}>
            <label htmlFor="cls">Class</label>
            <select id="cls" className="tt-select" style={{ minWidth: 190 }} value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="All">All classes</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="tt-field" style={{ margin: 0, flex: "1 1 260px", maxWidth: 380 }}>
            <label htmlFor="q">Find a student or book</label>
            <span className="tt-hint" id="q-hint">
              Name, student ID or copy number
            </span>
            <input id="q" type="search" className="tt-input" aria-describedby="q-hint" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="tt-btn secondary" onClick={copyList} disabled={list.length === 0}>
            {copied ? "Copied" : "Copy list for class teachers"}
          </button>
        </div>

        {groups.map((g) => (
          <section key={g.cls} className="tt-group" aria-labelledby={"g-" + g.cls}>
            <div className="tt-group-head">
              <h2 id={"g-" + g.cls}>{g.cls}</h2>
              <span className="tt-hint">
                {uniq(g.rows)} {uniq(g.rows) === 1 ? "student" : "students"}, {g.rows.length} {g.rows.length === 1 ? "book" : "books"}
              </span>
            </div>
            <div className="tt-table-wrap">
              <table className="tt-table stack">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "28%" }}>Student</th>
                    <th scope="col">Book</th>
                    <th scope="col">Copy no.</th>
                    <th scope="col">{tab === "out" ? "Status" : "Condition"}</th>
                    <th scope="col">
                      <span className="tt-visually-hidden">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.loan_id} className={leaving === r.loan_id ? "tt-leaving" : undefined}>
                      <td>
                        <div className="tt-person">
                          <Avatar name={r.student_name} colorKey={r.class_name} />
                          <div>
                            <Link to="/students/$sid" params={{ sid: r.sid }} style={{ fontWeight: 700 }}>
                              {r.student_name}
                            </Link>
                            <span className="tt-sub">{r.sid}</span>
                          </div>
                        </div>
                      </td>
                      <td>{r.title}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.barcode}</td>
                      <td>
                        {tab === "out" ? (
                          <>
                            <strong className={"tt-tag " + (overdue ? "blue" : "grey")}>{overdue ? "Overdue" : "On loan"}</strong>
                            {overdue && (
                              <span className="tt-sub">
                                {daysBetween(data.dueDate, data.today)} {daysBetween(data.dueDate, data.today) === 1 ? "day" : "days"} late
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <strong className={"tt-tag " + (r.condition === "lost" ? "red" : "orange")}>
                              {r.condition === "lost" ? "Lost" : "Damaged"}
                            </strong>
                            <span className="tt-sub">
                              {rm(r.price_cents)}
                              {r.closed_at ? ` · since ${prettyDate(r.closed_at)}` : ""}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="act">
                        {tab === "out" ? (
                          <ReturnActions busy={busy === r.loan_id} onPick={(c) => doReturn(r, c)} />
                        ) : (
                          <ReplaceAction busy={busy === r.loan_id} onConfirm={(nb) => doReplace(r, nb)} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {groups.length === 0 && <p style={{ fontSize: 19, margin: 0 }}>No books owed in this list.</p>}
      </div>
    </>
  );
}
