import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ReplaceAction, ReturnActions, prettyDate, rm } from "../../components/loan-actions";
import { Avatar, PageHead } from "../../components/ui-bits";
import {
  getStudentProfile,
  markReplaced,
  returnLoan,
  undoReplaced,
  undoReturn,
  type ProfileLoan,
} from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/students/$sid")({
  loader: async ({ params }) => {
    const res = await getStudentProfile({ data: { sid: params.sid } });
    if (!res.student) throw notFound();
    return res;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.student?.name ?? "Student"} · Textbook Returns` }],
  }),
  notFoundComponent: () => (
    <>
      <p>
        <Link to="/students">Back to all students</Link>
      </p>
      <h1>Student not found</h1>
      <p>Check the student ID, or find them in the student list.</p>
    </>
  ),
  component: StudentPage,
});

type Done = { text: string; undo: () => Promise<{ ok: boolean; message?: string }> };

function yearOf(l: ProfileLoan) {
  return l.borrowed_at.slice(0, 4);
}
function daysLate(due: string, today: string) {
  return Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86400000);
}

function StudentPage() {
  const data = Route.useLoaderData();
  const student = data.student!;
  const router = useRouter();
  const [year, setYear] = useState("All");
  const [busy, setBusy] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const years = useMemo(() => Array.from(new Set(data.loans.map(yearOf))).sort().reverse(), [data.loans]);
  const inYear = (l: ProfileLoan) => year === "All" || yearOf(l) === year;
  const allOut = data.loans.filter((l) => l.state === "out");
  const allOwed = data.loans.filter((l) => l.state === "owed");
  const owedTotal = allOwed.reduce((a, l) => a + l.price_cents, 0);
  const out = allOut.filter(inYear);
  const owed = allOwed.filter(inYear);
  const history = data.loans.filter((l) => (l.state === "returned" || l.state === "cleared") && inYear(l));
  const historyYears = Array.from(new Set(history.map(yearOf))).sort().reverse();
  const first = student.name.split(" ")[0];

  async function act(l: ProfileLoan, run: () => Promise<{ ok: boolean; message?: string }>, text: string, undo: Done["undo"]) {
    setBusy(l.loan_id);
    setError("");
    try {
      const res = await run();
      if (!res.ok) {
        setError(res.message ?? "That did not work.");
        setBusy(null);
        return;
      }
      setLeaving(l.loan_id);
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
  const doReturn = (l: ProfileLoan, c: "good" | "damaged" | "lost") =>
    act(
      l,
      () => returnLoan({ data: { loanId: l.loan_id, condition: c } }),
      `${l.title} (${l.barcode}) ${c === "good" ? "returned" : c === "damaged" ? "returned damaged" : "marked lost"}.`,
      () => undoReturn({ data: { loanId: l.loan_id } }),
    );
  const doReplace = (l: ProfileLoan, nb: string) => {
    const newBarcode = nb.trim() || undefined;
    return act(
      l,
      () => markReplaced({ data: { loanId: l.loan_id, newBarcode } }),
      `${l.title} replaced${newBarcode ? `. New copy ${newBarcode} added to stock` : ""}.`,
      () => undoReplaced({ data: { loanId: l.loan_id, newBarcode } }),
    );
  };
  async function undo() {
    if (!done) return;
    const res = await done.undo();
    if (!res.ok) setError(res.message ?? "Could not undo.");
    setDone(null);
    await router.invalidate();
  }

  async function copyNote() {
    const lines = [`${student.name} (${student.sid}), ${student.class_name}`];
    if (!allOut.length && !allOwed.length) lines.push("Has returned every textbook. Nothing is owed.");
    if (allOut.length) {
      lines.push("", "Textbooks to return:");
      allOut.forEach((l) => lines.push(`- ${l.title} (copy ${l.barcode}), borrowed ${prettyDate(l.borrowed_at)}`));
    }
    if (allOwed.length) {
      lines.push("", "Textbooks to replace with a new copy:");
      allOwed.forEach((l) => lines.push(`- ${l.title} (${l.condition}), ${rm(l.price_cents)}, from the ${yearOf(l)} session`));
      lines.push(`Total: ${rm(owedTotal)}`);
    }
    lines.push("", "Perpustakaan MRSM Gemencheh");
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Your browser blocked copying.");
    }
  }

  const overdue = data.dueDate && data.today > data.dueDate;

  return (
    <>
      <PageHead
        caption={<Link to="/students">Back to all students</Link>}
        title={
          <div className="tt-profile-head" style={{ margin: "8px 0 14px" }}>
            <Avatar name={student.name} colorKey={student.class_name} size="lg" />
            <div>
              <h1>{student.name}</h1>
              <p className="tt-caption" style={{ margin: "4px 0 0" }}>
                {student.class_name} · {student.sid}
                {!student.active ? " · archived" : ""}
              </p>
            </div>
          </div>
        }
      >
      <p className="tt-lead" style={{ marginBottom: 20 }}>
        {!allOut.length && !allOwed.length ? (
          <>
            <strong className="tt-tag green" style={{ fontSize: 17 }}>All clear</strong> {first} has returned every book and owes nothing.
          </>
        ) : (
          <>
            {first} must{" "}
            {allOut.length > 0 && (
              <strong>
                return {allOut.length} {allOut.length === 1 ? "book" : "books"}
              </strong>
            )}
            {allOut.length > 0 && allOwed.length > 0 && " and "}
            {allOwed.length > 0 && (
              <strong>
                replace {allOwed.length} {allOwed.length === 1 ? "book" : "books"} ({rm(owedTotal)})
              </strong>
            )}
            .
          </>
        )}
      </p>

      <div className="tt-row" style={{ alignItems: "center" }}>
        <Link to="/lend" search={{ sid: student.sid }} className="tt-btn secondary">
          Lend books to {first}
        </Link>
        <button className="tt-btn secondary" onClick={copyNote}>
          {copied ? "Copied" : "Copy note for parents or class teacher"}
        </button>
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
          </div>
        </div>
      )}

      {years.length > 1 && (
        <div className="tt-field" style={{ marginBottom: 32 }}>
          <label htmlFor="year">Show books borrowed in</label>
          <select id="year" className="tt-select" style={{ width: 200 }} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="All">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="tt-group" aria-labelledby="h-out">
        <div className="tt-group-head">
          <h2 id="h-out">Not returned yet</h2>
          <span className="tt-hint">{out.length} {out.length === 1 ? "book" : "books"}</span>
        </div>
        {out.length === 0 ? (
          <p className="tt-hint" style={{ fontSize: 17 }}>Nothing to return{year !== "All" ? ` from ${year}` : ""}.</p>
        ) : (
          <div className="tt-table-wrap">
            <table className="tt-table stack">
              <thead>
                <tr>
                  <th scope="col">Book</th>
                  <th scope="col">Copy no.</th>
                  <th scope="col">Borrowed</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="tt-visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {out.map((l) => {
                  const late = overdue || data.today > l.due_at ? daysLate(l.due_at, data.today) : 0;
                  return (
                    <tr key={l.loan_id} className={leaving === l.loan_id ? "tt-leaving" : undefined}>
                      <td><b>{l.title}</b></td>
                      <td style={{ whiteSpace: "nowrap" }}>{l.barcode}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{prettyDate(l.borrowed_at)}</td>
                      <td>
                        <strong className={"tt-tag " + (late > 0 ? "blue" : "grey")}>{late > 0 ? "Overdue" : "On loan"}</strong>
                        <span className="tt-sub">{late > 0 ? `${late} ${late === 1 ? "day" : "days"} late` : `Due ${prettyDate(l.due_at)}`}</span>
                      </td>
                      <td className="act">
                        <ReturnActions busy={busy === l.loan_id} onPick={(c) => doReturn(l, c)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tt-group" aria-labelledby="h-owed">
        <div className="tt-group-head">
          <h2 id="h-owed">Not replaced yet</h2>
          <span className="tt-hint">{owed.length} {owed.length === 1 ? "book" : "books"}</span>
        </div>
        {owed.length === 0 ? (
          <p className="tt-hint" style={{ fontSize: 17 }}>Nothing to replace{year !== "All" ? ` from ${year}` : ""}.</p>
        ) : (
          <div className="tt-table-wrap">
            <table className="tt-table stack">
              <thead>
                <tr>
                  <th scope="col">Book</th>
                  <th scope="col">Copy no.</th>
                  <th scope="col">Borrowed</th>
                  <th scope="col">Condition</th>
                  <th scope="col"><span className="tt-visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {owed.map((l) => (
                  <tr key={l.loan_id} className={leaving === l.loan_id ? "tt-leaving" : undefined}>
                    <td><b>{l.title}</b></td>
                    <td style={{ whiteSpace: "nowrap" }}>{l.barcode}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {prettyDate(l.borrowed_at)}
                      {yearOf(l) !== data.today.slice(0, 4) && <span className="tt-sub">From an earlier year</span>}
                    </td>
                    <td>
                      <strong className={"tt-tag " + (l.condition === "lost" ? "red" : "orange")}>{l.condition === "lost" ? "Lost" : "Damaged"}</strong>
                      <span className="tt-sub">
                        {rm(l.price_cents)}
                        {l.closed_at ? ` · since ${prettyDate(l.closed_at)}` : ""}
                      </span>
                    </td>
                    <td className="act">
                      <ReplaceAction busy={busy === l.loan_id} onConfirm={(nb) => doReplace(l, nb)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-hist">
        <h2 id="h-hist">History</h2>
        {history.length === 0 && <p className="tt-hint" style={{ fontSize: 17 }}>No finished loans yet.</p>}
        {historyYears.map((y) => {
          const rows = history.filter((l) => yearOf(l) === y);
          return (
            <div key={y} style={{ marginBottom: 28 }}>
              <h3>
                Borrowed in {y} <span style={{ fontWeight: 400, color: "var(--muted)" }}>({rows.length})</span>
              </h3>
              <div className="tt-table-wrap">
                <table className="tt-table stack">
                  <thead>
                    <tr>
                      <th scope="col">Book</th>
                      <th scope="col">Copy no.</th>
                      <th scope="col">Borrowed</th>
                      <th scope="col">Returned</th>
                      <th scope="col">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.loan_id}>
                        <td>{l.title}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{l.barcode}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{prettyDate(l.borrowed_at)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{l.condition === "lost" ? "Not returned" : prettyDate(l.closed_at)}</td>
                        <td>
                          {l.state === "returned" ? (
                            <strong className="tt-tag green">Returned</strong>
                          ) : (
                            <>
                              <strong className="tt-tag grey">Replaced</strong>
                              <span className="tt-sub">
                                was {l.condition}
                                {l.cleared_at ? `, replaced ${prettyDate(l.cleared_at)}` : ""}
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
