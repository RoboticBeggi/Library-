import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageHead } from "../../components/ui-bits";
import { addCopies, addTitle, listCopies, listStock } from "../../lib/api/library.functions";

export const Route = createFileRoute("/_app/books")({
  head: () => ({ meta: [{ title: "Book stock · Textbook Returns" }] }),
  loader: () => listStock(),
  component: BooksPage,
});

type Copy = { id: number; barcode: string; status: string; holder: string | null };
const statusTag: Record<string, [string, string]> = {
  available: ["green", "On shelf"],
  loaned: ["blue", "On loan"],
  damaged: ["orange", "Damaged"],
  lost: ["red", "Lost"],
  retired: ["grey", "Removed"],
};

function splitCodes(text: string) {
  return text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function BooksPage() {
  const titles = Route.useLoaderData();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", form: "", price: "", isbn: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const price = Number(form.price || "0");
    if (form.name.trim().length < 2) return setError("Enter the book title.");
    if (!Number.isFinite(price) || price < 0) return setError("Price must be a number, for example 24.90.");
    await addTitle({ data: { name: form.name, form: form.form, priceRm: price, isbn: form.isbn || undefined } });
    setMsg(`${form.name} added. Now add its copy numbers below.`);
    setForm({ name: "", form: form.form, price: "", isbn: "" });
    await router.invalidate();
  }

  const totals = titles.reduce(
    (a, t) => ({ available: a.available + (t.available ?? 0), loaned: a.loaned + (t.loaned ?? 0), problem: a.problem + (t.problem ?? 0) }),
    { available: 0, loaned: 0, problem: 0 },
  );

  return (
    <>
      <PageHead title={<h1>Book stock</h1>}>
        <p className="tt-lead">Every textbook title, its copies, and where each copy is right now.</p>
      </PageHead>
      <div className="tt-stats">
        <div>
          <b>{titles.length}</b>titles
        </div>
        <div>
          <b>{totals.available}</b>copies on the shelf
        </div>
        <div>
          <b>{totals.loaned}</b>copies on loan
        </div>
        <div>
          <b>{totals.problem}</b>damaged or lost
        </div>
      </div>
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
      <details className="tt-details" style={{ marginBottom: 32 }}>
        <summary>Add a book title</summary>
        <form onSubmit={add} noValidate style={{ marginTop: 16 }}>
          <div className="tt-row">
            <div className="tt-field" style={{ flex: "1 1 300px" }}>
              <label htmlFor="tname">Title</label>
              <input id="tname" className="tt-input wide" placeholder="Sejarah Tingkatan 4" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="tt-field">
              <label htmlFor="tform">Form</label>
              <input id="tform" className="tt-input" style={{ width: 140 }} placeholder="Form 4" value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })} />
            </div>
            <div className="tt-field">
              <label htmlFor="tprice">Replacement price (RM)</label>
              <input id="tprice" className="tt-input" style={{ width: 160 }} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="tt-field">
              <label htmlFor="tisbn">
                ISBN <span style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input id="tisbn" className="tt-input" style={{ width: 200 }} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
            </div>
          </div>
          <button className="tt-btn" type="submit">
            Add title
          </button>
        </form>
      </details>

      {titles.map((t) => (
        <TitleBlock key={t.id} t={t} onChanged={() => router.invalidate()} />
      ))}
      {titles.length === 0 && <p>No books yet. Add a title to start.</p>}
    </>
  );
}

function TitleBlock({
  t,
  onChanged,
}: {
  t: { id: number; name: string; form: string; price_cents: number; is_sample: number; available: number; loaned: number; problem: number; retired: number };
  onChanged: () => void;
}) {
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [codes, setCodes] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    setCopies(await listCopies({ data: { titleId: t.id } }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const list = splitCodes(codes);
    if (!list.length) return setNote("Type or scan at least one copy number.");
    const res = await addCopies({ data: { titleId: t.id, barcodes: list } });
    setNote(`${res.added} added.${res.skipped.length ? ` Already in the system: ${res.skipped.slice(0, 8).join(", ")}.` : ""}`);
    setCodes("");
    await load();
    onChanged();
  }

  return (
    <details
      className="tt-card"
      style={{ padding: "16px 20px" }}
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !copies) void load();
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "revert" }}>
        <b style={{ fontSize: 19 }}>{t.name}</b>
        <span className="tt-sub" style={{ display: "inline", marginLeft: 8 }}>
          {t.form} · RM {(t.price_cents / 100).toFixed(2)} · {t.available ?? 0} on shelf, {t.loaned ?? 0} on loan
          {t.problem ? `, ${t.problem} damaged or lost` : ""}
          {t.is_sample ? " · sample" : ""}
        </span>
      </summary>
      <div style={{ marginTop: 16 }}>
        <form onSubmit={save} noValidate>
          <div className="tt-field">
            <label htmlFor={"c" + t.id}>Add copy numbers</label>
            <span className="tt-hint">Type or scan them, separated by spaces, commas or new lines.</span>
            <textarea id={"c" + t.id} className="tt-textarea" style={{ minHeight: 80 }} value={codes} onChange={(e) => setCodes(e.target.value)} />
          </div>
          <div className="tt-row" style={{ alignItems: "center" }}>
            <button className="tt-btn secondary" type="submit">
              Add copies
            </button>
            {note && <span role="status">{note}</span>}
          </div>
        </form>
        {copies && copies.length > 0 && (
          <div className="tt-table-wrap" style={{ marginTop: 20 }}>
            <table className="tt-table">
              <thead>
                <tr>
                  <th scope="col">Copy no.</th>
                  <th scope="col">Status</th>
                  <th scope="col">With</th>
                </tr>
              </thead>
              <tbody>
                {copies.map((c) => {
                  const [color, label] = statusTag[c.status] ?? ["grey", c.status];
                  return (
                    <tr key={c.id}>
                      <td>{c.barcode}</td>
                      <td>
                        <strong className={"tt-tag " + color}>{label}</strong>
                      </td>
                      <td>{c.status === "available" || c.status === "retired" ? "" : c.holder ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
