import { useState } from "react";

export function ReturnActions({ busy, onPick }: { busy: boolean; onPick: (c: "good" | "damaged" | "lost") => void }) {
  const [more, setMore] = useState(false);
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <button className="tt-btn small" disabled={busy} onClick={() => onPick("good")}>
        Returned
      </button>
      {!more ? (
        <button className="tt-linkbtn" style={{ fontSize: 15 }} onClick={() => setMore(true)}>
          Damaged or lost?
        </button>
      ) : (
        <span style={{ display: "inline-flex", gap: 6 }}>
          <button className="tt-btn small orange" disabled={busy} onClick={() => onPick("damaged")}>
            Damaged
          </button>
          <button className="tt-btn small warning" disabled={busy} onClick={() => onPick("lost")}>
            Lost
          </button>
        </span>
      )}
    </div>
  );
}

export function ReplaceAction({ busy, onConfirm }: { busy: boolean; onConfirm: (newBarcode: string) => void }) {
  const [open, setOpen] = useState(false);
  const [nb, setNb] = useState("");
  if (!open)
    return (
      <button className="tt-btn small" disabled={busy} onClick={() => setOpen(true)}>
        Replaced
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(nb);
      }}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 6, textAlign: "left" }}
    >
      <label style={{ fontSize: 15, fontWeight: 700 }}>
        New copy number <span style={{ fontWeight: 400 }}>(optional)</span>
        <input className="tt-input" style={{ display: "block", width: 200, marginTop: 4 }} value={nb} onChange={(e) => setNb(e.target.value)} />
      </label>
      <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="tt-linkbtn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="tt-btn small" disabled={busy} type="submit">
          Confirm
        </button>
      </span>
    </form>
  );
}

export function rm(cents: number) {
  return "RM " + (cents / 100).toFixed(2);
}

export function prettyDate(d: string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d.slice(0, 10) + "T00:00:00Z");
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
