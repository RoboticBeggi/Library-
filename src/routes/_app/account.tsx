import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { changePassword } from "../../lib/api/auth.functions";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Change password · Textbook Returns" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== again) return setError("The two new passwords do not match.");
    setBusy(true);
    const res = await changePassword({ data: { current, next } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDone(true);
    if (user.mustChange) window.location.href = "/";
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Change your password</h1>
      {user.mustChange && (
        <div className="tt-inset">
          <p style={{ margin: 0 }}>
            <b>You are using a temporary password.</b> Choose your own before you continue.
          </p>
        </div>
      )}
      {done && !user.mustChange && (
        <div className="tt-banner" role="status">
          <div>Done</div>
          <div>
            <span>Your password has been changed. Other devices have been signed out.</span>
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
      <form onSubmit={submit} noValidate>
        <div className="tt-field">
          <label htmlFor="cur">Current password</label>
          <input id="cur" type="password" className="tt-input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="tt-field">
          <label htmlFor="new">New password</label>
          <p className="tt-hint" id="new-hint">
            At least 10 characters, with letters and numbers.
          </p>
          <input id="new" type="password" className="tt-input" aria-describedby="new-hint" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="tt-field">
          <label htmlFor="again">Type the new password again</label>
          <input id="again" type="password" className="tt-input" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </div>
        <button className="tt-btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
