import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Avatar, PageHead } from "../../components/ui-bits";
import { addStudents, listStudents, setStudentActive } from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/students/")({
  head: () => ({ meta: [{ title: "Students · Textbook Returns" }] }),
  loader: () => listStudents(),
  component: StudentsPage,
});

function parseRows(text: string) {
  const out: { sid: string; name: string; className: string }[] = [];
  const bad: number[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const parts = (line.includes("\t") ? line.split("\t") : line.split(",")).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 3 || /^student/i.test(parts[0])) {
        if (!/^student/i.test(parts[0] ?? "")) bad.push(i + 1);
        return;
      }
      out.push({ sid: parts[0], name: parts[1], className: parts.slice(2).join(" ") });
    });
  return { out, bad };
}

function StudentsPage() {
  const students = Route.useLoaderData();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("All");
  const [showArchived, setShowArchived] = useState(false);
  const [one, setOne] = useState({ sid: "", name: "", className: "" });
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);
  const needle = q.trim().toLowerCase();
  const list = students.filter(
    (s) =>
      (showArchived || s.active) &&
      (cls === "All" || s.class_name === cls) &&
      (!needle || `${s.name} ${s.sid}`.toLowerCase().includes(needle)),
  );

  async function save(rows: { sid: string; name: string; className: string }[]) {
    setError("");
    setMsg("");
    try {
      const res = await addStudents({ data: { students: rows } });
      setMsg(
        `${res.added} ${res.added === 1 ? "student" : "students"} added.` +
          (res.skipped.length ? ` Already in the list, so skipped: ${res.skipped.slice(0, 10).join(", ")}${res.skipped.length > 10 ? "…" : ""}.` : ""),
      );
      await router.invalidate();
      return true;
    } catch {
      setError("Some details are not valid. Student ID needs 2 to 20 characters, and name and class are required.");
      return false;
    }
  }

  async function addOne(e: FormEvent) {
    e.preventDefault();
    if (!one.sid.trim() || !one.name.trim() || !one.className.trim()) return setError("Fill in student ID, name and class.");
    if (await save([one])) setOne({ sid: "", name: "", className: one.className });
  }
  async function addBulk(e: FormEvent) {
    e.preventDefault();
    const { out, bad } = parseRows(bulk);
    if (bad.length) return setError(`Lines ${bad.join(", ")} need 3 parts: student ID, name, class.`);
    if (!out.length) return setError("Paste at least one line.");
    if (await save(out)) setBulk("");
  }
  async function toggle(id: number, active: boolean) {
    await setStudentActive({ data: { id, active } });
    await router.invalidate();
  }

  return (
    <>
      <PageHead title={<h1>Students</h1>}>
        <p className="tt-lead">{students.filter((s) => s.active).length} students. Click a name to see everything that student has borrowed, owes and has returned.</p>
      </PageHead>
      {msg && (
        <div className="tt-banner" role="status">
          <div>Done</div>
          <div>
            <span>{msg}</span>
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

      <details className="tt-details" style={{ marginBottom: 16 }}>
        <summary>Add one student</summary>
        <form onSubmit={addOne} noValidate style={{ marginTop: 16 }}>
          <div className="tt-row">
            <div className="tt-field">
              <label htmlFor="sid">Student ID</label>
              <input id="sid" className="tt-input" style={{ width: 180 }} value={one.sid} onChange={(e) => setOne({ ...one, sid: e.target.value })} />
            </div>
            <div className="tt-field" style={{ flex: "1 1 260px" }}>
              <label htmlFor="sname">Full name</label>
              <input id="sname" className="tt-input" value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} />
            </div>
            <div className="tt-field">
              <label htmlFor="scls">Class</label>
              <input id="scls" className="tt-input" style={{ width: 180 }} placeholder="4 Amanah" value={one.className} onChange={(e) => setOne({ ...one, className: e.target.value })} />
            </div>
          </div>
          <button className="tt-btn" type="submit">
            Add student
          </button>
        </form>
      </details>
      <details className="tt-details" style={{ marginBottom: 32 }}>
        <summary>Add many students from a spreadsheet</summary>
        <form onSubmit={addBulk} noValidate style={{ marginTop: 16 }}>
          <div className="tt-field">
            <label htmlFor="bulk">Paste rows</label>
            <span className="tt-hint" id="bulk-hint">
              Copy 3 columns from Excel or Google Sheets: student ID, name, class. One student per line.
            </span>
            <textarea id="bulk" className="tt-textarea" aria-describedby="bulk-hint" placeholder={"M240117\tAiman Hakimi bin Rosli\t4 Amanah"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          </div>
          <button className="tt-btn" type="submit">
            Add students
          </button>
        </form>
      </details>

      <div className="tt-row" style={{ marginBottom: 20 }}>
        <div className="tt-field" style={{ margin: 0 }}>
          <label htmlFor="fcls">Class</label>
          <select id="fcls" className="tt-select" style={{ minWidth: 180 }} value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="All">All classes</option>
            {classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="tt-field" style={{ margin: 0, flex: "1 1 240px", maxWidth: 360 }}>
          <label htmlFor="fq">Find a student</label>
          <input id="fq" type="search" className="tt-input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ width: 22, height: 22 }} />
          Show archived
        </label>
      </div>

      <div className="tt-table-wrap">
        <table className="tt-table stack">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Class</th>
              <th scope="col" className="num">On loan</th>
              <th scope="col" className="num">To replace</th>
              <th scope="col">
                <span className="tt-visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="tt-person">
                    <Avatar name={s.name} colorKey={s.class_name} />
                    <div>
                      <Link to="/students/$sid" params={{ sid: s.sid }} style={{ fontWeight: 700 }}>
                        {s.name}
                      </Link>
                      <span className="tt-sub">
                        {s.sid}
                        {s.is_sample ? " · sample" : ""}
                        {!s.active ? " · archived" : ""}
                      </span>
                    </div>
                  </div>
                </td>
                <td>{s.class_name}</td>
                <td className="num">{s.out_count}</td>
                <td className="num">{s.owed_count ? <strong className="tt-tag orange">{s.owed_count}</strong> : 0}</td>
                <td className="act">
                  <button className="tt-linkbtn" onClick={() => toggle(s.id, !s.active)}>
                    {s.active ? "Archive" : "Restore"}
                    <span className="tt-visually-hidden"> {s.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p>No students match.</p>}
    </>
  );
}
