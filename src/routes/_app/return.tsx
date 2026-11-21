import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHead } from "../../components/ui-bits";
import { lookupForReturn, returnLoan, undoReturn, type LoanRow } from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/return")({
  head: () => ({ meta: [{ title: "Return books · Textbook Returns" }] }),
  component: ReturnPage,
});

type Cond = "good" | "damaged" | "lost";
type Result = { loan: LoanRow; condition: Cond };

function ReturnPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<LoanRow[] | null>(null);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<LoanRow | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Result[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
    setToday(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase());
  }, []);

  function reset() {
    setQ("");
    setMatches(null);
    setSelected(null);
    setResult(null);
    setNote("");
    setError("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return setError("Type a copy number, its last few digits, or a student name.");
    setBusy(true);
    setError("");
    setResult(null);
    setSelected(null);
    try {
      const res = await lookupForReturn({ data: { q: term } });
      setMatches(res.rows);
      setNote(res.note);
      if (res.rows.length === 1 && res.rows[0].barcode === term) setSelected(res.rows[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    }
    setBusy(false);
  }

  async function check(cond: Cond) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const res = await returnLoan({ data: { loanId: selected.loan_id, condition: cond } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    const r = { loan: selected, condition: cond };
    setResult(r);
    setSession((s) => [r, ...s]);
  }

  async function undoLast() {
    if (!result) return;
    const res = await undoReturn({ data: { loanId: result.loan.loan_id } });
    if (!res.ok) return setError(res.message);
    setSession((s) => s.filter((x) => x.loan.loan_id !== result.loan.loan_id));
    setResult(null);
  }

  const stampWord = result ? { good: "RETURNED", damaged: "DAMAGED", lost: "LOST" }[result.condition] : "";

  return (
    <>
      <PageHead title={<h1>Return books</h1>}>
        <p className="tt-lead">Type the copy number from the sticker inside the cover. A USB barcode scanner also works here: just scan.</p>
      </PageHead>

      {error && (
        <div className="tt-banner error" role="alert">
          <div>There is a problem</div>
          <div>
            <span>{error}</span>
          </div>
        </div>
      )}

      {!result && (
        <form onSubmit={search} noValidate className="tt-row" style={{ marginBottom: 28 }}>
          <div className="tt-field" style={{ margin: 0, flex: "1 1 320px", maxWidth: 520 }}>
            <label htmlFor="q">Copy number or student</label>
            <span className="tt-hint" id="q-hint">
              Full number, last 3 or more digits, student ID or name
            </span>
            <input
              id="q"
              ref={inputRef}
              className="tt-input wide"
              aria-describedby="q-hint"
              autoComplete="off"
              inputMode="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="tt-btn" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Find"}
          </button>
        </form>
      )}

      {!result && !selected && matches && (
        <section aria-live="polite">
          {matches.length === 0 ? (
            <div className="tt-inset">
              <p style={{ margin: 0 }}>{note || "No book on loan matches that. Check the number and try again."}</p>
            </div>
          ) : (
            <>
              <h2>
                {matches.length} {matches.length === 1 ? "book" : "books"} on loan match
              </h2>
              <div style={{ borderBottom: "1px solid var(--line)" }}>
                {matches.map((m) => (
                  <button key={m.loan_id} className="tt-pick" onClick={() => setSelected(m)}>
                    <b>{m.title}</b> · copy {m.barcode}
                    <span className="tt-sub">
                      {m.student_name} ({m.sid}), {m.class_name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {selected && !result && (
        <section className="tt-card" aria-label="Book to check in">
          <p className="tt-hint">Copy {selected.barcode}</p>
          <h2 style={{ margin: "2px 0 10px" }}>{selected.title}</h2>
          <div className="tt-inset">
            <Link to="/students/$sid" params={{ sid: selected.sid }} style={{ fontWeight: 700 }}>
              {selected.student_name}
            </Link>
            <span className="tt-sub">
              {selected.class_name} · {selected.sid}
            </span>
          </div>
          <h3>What condition is it in?</h3>
          <div className="tt-cond">
            <button className="tt-btn big" disabled={busy} onClick={() => check("good")}>
              Good
            </button>
            <button className="tt-btn big orange" disabled={busy} onClick={() => check("damaged")}>
              Damaged
            </button>
            <button className="tt-btn big secondary" disabled={busy} onClick={() => check("lost")}>
              Lost
            </button>
          </div>
          <p className="tt-hint" style={{ marginTop: 12 }}>
            Damaged or lost puts the book on the student's replacement list.
          </p>
          <p style={{ marginTop: 16, marginBottom: 0 }}>
            <button className="tt-linkbtn" onClick={reset}>
              Not this book? Search again
            </button>
          </p>
        </section>
      )}

      {result && (
        <section className="tt-card" aria-live="polite">
          <div className="tt-stampzone">
            <p className="tt-hint">Copy {result.loan.barcode}</p>
            <h2 style={{ margin: "2px 0 10px", paddingRight: 150 }}>{result.loan.title}</h2>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {result.condition === "good"
                ? "Back on the shelf."
                : result.condition === "damaged"
                  ? "Added to the replacement list."
                  : "Marked as lost and added to the replacement list."}
            </p>
            <p className="tt-hint" style={{ marginBottom: 20 }}>
              {result.condition === "good"
                ? `${result.loan.student_name} owes nothing for this book.`
                : `${result.loan.student_name} needs to bring a new copy (RM ${(result.loan.price_cents / 100).toFixed(2)}).`}
            </p>
            <div className={"tt-stamp " + result.condition} role="img" aria-label={stampWord}>
              <b>{stampWord}</b>
              <span>{today} · PERPUSTAKAAN</span>
            </div>
          </div>
          <div className="tt-row" style={{ alignItems: "center" }}>
            <button className="tt-btn big" onClick={reset} autoFocus>
              Return next book
            </button>
            <button className="tt-linkbtn" onClick={undoLast}>
              Undo
            </button>
          </div>
        </section>
      )}

      {session.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2>Checked in this session ({session.length})</h2>
          <div className="tt-table-wrap">
            <table className="tt-table stack">
              <thead>
                <tr>
                  <th scope="col">Book</th>
                  <th scope="col">Copy no.</th>
                  <th scope="col">Student</th>
                  <th scope="col">Condition</th>
                </tr>
              </thead>
              <tbody>
                {session.map((s) => (
                  <tr key={s.loan.loan_id}>
                    <td>{s.loan.title}</td>
                    <td>{s.loan.barcode}</td>
                    <td>
                      {s.loan.student_name}
                      <span className="tt-sub">{s.loan.class_name}</span>
                    </td>
                    <td>
                      <strong className={"tt-tag " + (s.condition === "good" ? "green" : s.condition === "damaged" ? "orange" : "red")}>
                        {s.condition === "good" ? "Good" : s.condition === "damaged" ? "Damaged" : "Lost"}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
