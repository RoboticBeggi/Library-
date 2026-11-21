import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHead } from "../../components/ui-bits";
import { checkCopy, findStudents, lendCopies } from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/lend")({
  validateSearch: (s: Record<string, unknown>): { sid?: string } => (typeof s.sid === "string" && s.sid ? { sid: s.sid } : {}),
  head: () => ({ meta: [{ title: "Lend books · Textbook Returns" }] }),
  component: LendPage,
});

type Student = { id: number; sid: string; name: string; class_name: string; out_count: number; owed_count: number };
type Item = { barcode: string; title: string };

function LendPage() {
  const { sid } = Route.useSearch();
  const copyRef = useRef<HTMLInputElement>(null);
  const [sq, setSq] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [code, setCode] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!sid) return;
    void findStudents({ data: { q: sid } }).then((res) => {
      const exact = res.find((r) => r.sid.toLowerCase() === sid.toLowerCase());
      if (exact) pick(exact);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  async function searchStudent(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    if (!sq.trim()) return setError("Type a student ID or name.");
    setBusy(true);
    const res = await findStudents({ data: { q: sq.trim() } });
    setBusy(false);
    setStudents(res);
    if (res.length === 1 && res[0].sid.toLowerCase() === sq.trim().toLowerCase()) pick(res[0]);
  }

  function pick(s: Student) {
    setStudent(s);
    setStudents(null);
    setItems([]);
    setTimeout(() => copyRef.current?.focus(), 0);
  }

  async function addCopy(e: FormEvent) {
    e.preventDefault();
    const b = code.trim();
    setError("");
    if (!b) return;
    if (items.some((i) => i.barcode === b)) {
      setCode("");
      return setError(`Copy ${b} is already in the list.`);
    }
    setBusy(true);
    const res = await checkCopy({ data: { barcode: b } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setItems((xs) => [...xs, { barcode: res.barcode, title: res.title }]);
    setCode("");
    copyRef.current?.focus();
  }

  async function lend() {
    if (!student || items.length === 0) return;
    setBusy(true);
    setError("");
    const res = await lendCopies({ data: { studentId: student.id, barcodes: items.map((i) => i.barcode) } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    const failNote = res.failed.length ? ` Not lent (no longer available): ${res.failed.join(", ")}.` : "";
    setDone(`${res.lent.length} ${res.lent.length === 1 ? "book" : "books"} lent to ${student.name}.${failNote}`);
    setStudent(null);
    setItems([]);
    setSq("");
  }

  return (
    <>
      <PageHead title={<h1>Lend books</h1>}>
        <p className="tt-lead">Find the student, then add each book by its copy number.</p>
      </PageHead>
      {done && (
        <div className="tt-banner" role="status">
          <div>Done</div>
          <div>
            <b>{done}</b>
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

      {!student ? (
        <>
          <h2>1. Student</h2>
          <form onSubmit={searchStudent} noValidate className="tt-row" style={{ marginBottom: 20 }}>
            <div className="tt-field" style={{ margin: 0, flex: "1 1 300px", maxWidth: 440 }}>
              <label htmlFor="sq">Student ID or name</label>
              <input id="sq" className="tt-input" autoComplete="off" value={sq} onChange={(e) => setSq(e.target.value)} />
            </div>
            <button className="tt-btn" type="submit" disabled={busy}>
              Find student
            </button>
          </form>
          {students && students.length === 0 && (
            <div className="tt-inset">
              <p style={{ margin: 0 }}>No student matches that. Add them under Students first.</p>
            </div>
          )}
          {students && students.length > 0 && (
            <div style={{ borderBottom: "1px solid var(--line)", maxWidth: 640 }}>
              {students.map((s) => (
                <button key={s.id} className="tt-pick" onClick={() => pick(s)}>
                  <b>{s.name}</b> · {s.sid}
                  <span className="tt-sub">
                    {s.class_name} · {s.out_count} on loan{s.owed_count ? ` · owes ${s.owed_count} replacement` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="tt-card" style={{ maxWidth: 640 }}>
            <div className="tt-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <b style={{ fontSize: 19 }}>{student.name}</b>
                <span className="tt-sub">
                  {student.class_name} · {student.sid} · {student.out_count} already on loan
                </span>
              </div>
              <button className="tt-linkbtn" onClick={() => setStudent(null)}>
                Change student
              </button>
            </div>
            {student.owed_count > 0 && (
              <p className="tt-error-msg" style={{ marginTop: 12 }}>
                This student still owes {student.owed_count} replacement {student.owed_count === 1 ? "book" : "books"}.
              </p>
            )}
          </div>

          <h2>2. Books</h2>
          <form onSubmit={addCopy} noValidate className="tt-row" style={{ marginBottom: 20 }}>
            <div className="tt-field" style={{ margin: 0, flex: "1 1 300px", maxWidth: 440 }}>
              <label htmlFor="code">Copy number</label>
              <span className="tt-hint" id="code-hint">
                Type it and press Enter, or scan it
              </span>
              <input
                id="code"
                ref={copyRef}
                className="tt-input"
                aria-describedby="code-hint"
                autoComplete="off"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button className="tt-btn secondary" type="submit" disabled={busy}>
              Add book
            </button>
          </form>

          {items.length > 0 && (
            <div className="tt-table-wrap" style={{ maxWidth: 760 }}>
              <table className="tt-table">
                <thead>
                  <tr>
                    <th scope="col">Book</th>
                    <th scope="col">Copy no.</th>
                    <th scope="col">
                      <span className="tt-visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.barcode}>
                      <td>{i.title}</td>
                      <td>{i.barcode}</td>
                      <td className="act">
                        <button className="tt-linkbtn" onClick={() => setItems((xs) => xs.filter((x) => x.barcode !== i.barcode))}>
                          Remove<span className="tt-visually-hidden"> {i.barcode}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 24 }}>
            <button className="tt-btn big" disabled={busy || items.length === 0} onClick={lend}>
              Lend {items.length || ""} {items.length === 1 ? "book" : "books"} to {student.name.split(" ")[0]}
            </button>
          </p>
        </>
      )}
    </>
  );
}
