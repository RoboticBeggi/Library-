import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  clearSampleData,
  createUser,
  getAdmin,
  resetUserPassword,
  saveSettings,
  setUserActive,
} from "../../lib/api/admin.functions";
import { PageHead } from "../../components/ui-bits";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin · Textbook Returns" }] }),
  beforeLoad: ({ context }) => {
    if (context.user.role !== "admin") throw redirect({ to: "/" });
  },
  loader: () => getAdmin(),
  component: AdminPage,
});

function AdminPage() {
  const data = Route.useLoaderData();
  const { user: me } = Route.useRouteContext();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [secret, setSecret] = useState<{ who: string; pw: string } | null>(null);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({ due: data.settings.due_date ?? "", label: data.settings.session_label ?? "" });
  const [nu, setNu] = useState({ username: "", displayName: "", role: "librarian" as "admin" | "librarian" });
  const [confirmText, setConfirmText] = useState("");

  function flash(m: string) {
    setError("");
    setMsg(m);
  }

  async function onSettings(e: FormEvent) {
    e.preventDefault();
    try {
      await saveSettings({ data: { dueDate: settings.due, sessionLabel: settings.label } });
      flash("Settings saved.");
      await router.invalidate();
    } catch {
      setError("Check the session name and the date.");
    }
  }
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSecret(null);
    try {
      const res = await createUser({ data: nu });
      if (!res.ok) return setError(res.message);
      setSecret({ who: nu.username.toLowerCase(), pw: res.tempPassword });
      flash(`Account ${nu.username.toLowerCase()} created.`);
      setNu({ username: "", displayName: "", role: "librarian" });
      await router.invalidate();
    } catch {
      setError("Username needs 3 to 32 letters, numbers, dots or dashes. Display name is required.");
    }
  }
  async function onReset(id: number, username: string) {
    const res = await resetUserPassword({ data: { id } });
    setSecret({ who: username, pw: res.tempPassword });
    flash(`Password reset for ${username}. They have been signed out everywhere.`);
    await router.invalidate();
  }
  async function onToggle(id: number, active: boolean) {
    const res = await setUserActive({ data: { id, active } });
    if (!res.ok) return setError(res.message);
    flash(active ? "Account turned on." : "Account turned off and signed out.");
    await router.invalidate();
  }
  async function onClear(e: FormEvent) {
    e.preventDefault();
    if (confirmText !== "DELETE SAMPLE DATA") return setError('Type DELETE SAMPLE DATA exactly to confirm.');
    await clearSampleData({ data: { confirm: "DELETE SAMPLE DATA" } });
    setConfirmText("");
    flash("Sample data removed. Only real records are left.");
    await router.invalidate();
  }

  return (
    <>
      <PageHead title={<h1>Admin</h1>}>
        <p className="tt-lead">Session settings, staff accounts and the activity log.</p>
      </PageHead>
      {msg && (
        <div className="tt-banner" role="status">
          <div>Done</div>
          <div>
            <span>{msg}</span>
          </div>
        </div>
      )}
      {secret && (
        <div className="tt-banner info" role="status">
          <div>Temporary password, shown once</div>
          <div>
            <span>
              Give <b>{secret.who}</b> this password: <b style={{ fontFamily: "ui-monospace, monospace", fontSize: 20 }}>{secret.pw}</b>. They must change it
              when they sign in.
            </span>
            <button className="tt-linkbtn" onClick={() => setSecret(null)}>
              Hide
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

      <section style={{ marginBottom: 48 }}>
        <h2>Session</h2>
        <form onSubmit={onSettings} noValidate className="tt-row">
          <div className="tt-field">
            <label htmlFor="label">Session name</label>
            <input id="label" className="tt-input" style={{ width: 240 }} value={settings.label} onChange={(e) => setSettings({ ...settings, label: e.target.value })} />
          </div>
          <div className="tt-field">
            <label htmlFor="due">Return deadline</label>
            <input id="due" type="date" className="tt-input" style={{ width: 200 }} value={settings.due} onChange={(e) => setSettings({ ...settings, due: e.target.value })} />
          </div>
          <div className="tt-field">
            <button className="tt-btn" type="submit">
              Save
            </button>
          </div>
        </form>
        <p className="tt-hint">New loans get this deadline. Books not back after it show as overdue.</p>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2>Staff accounts</h2>
        <div className="tt-table-wrap">
          <table className="tt-table stack">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="tt-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.display_name}</b>
                    <span className="tt-sub">{u.username}</span>
                  </td>
                  <td>{u.role === "admin" ? "Admin" : "Librarian"}</td>
                  <td>
                    {!u.active ? (
                      <strong className="tt-tag grey">Turned off</strong>
                    ) : u.must_change ? (
                      <strong className="tt-tag orange">Temporary password</strong>
                    ) : (
                      <strong className="tt-tag green">Active</strong>
                    )}
                  </td>
                  <td className="act">
                    <span style={{ display: "inline-flex", gap: 16 }}>
                      <button className="tt-linkbtn" onClick={() => onReset(u.id, u.username)}>
                        Reset password<span className="tt-visually-hidden"> for {u.username}</span>
                      </button>
                      {u.id !== me.id && (
                        <button className="tt-linkbtn" onClick={() => onToggle(u.id, !u.active)}>
                          {u.active ? "Turn off" : "Turn on"}
                          <span className="tt-visually-hidden"> {u.username}</span>
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="tt-details" style={{ marginTop: 20 }}>
          <summary>Add a staff account</summary>
          <form onSubmit={onCreate} noValidate style={{ marginTop: 16 }}>
            <div className="tt-row">
              <div className="tt-field">
                <label htmlFor="nu-user">Username</label>
                <input id="nu-user" className="tt-input" style={{ width: 200 }} autoCapitalize="none" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
              </div>
              <div className="tt-field" style={{ flex: "1 1 240px" }}>
                <label htmlFor="nu-name">Display name</label>
                <input id="nu-name" className="tt-input" value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} />
              </div>
              <div className="tt-field">
                <label htmlFor="nu-role">Role</label>
                <select id="nu-role" className="tt-select" style={{ width: 180 }} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value as "admin" | "librarian" })}>
                  <option value="librarian">Librarian</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button className="tt-btn" type="submit">
              Create account
            </button>
          </form>
        </details>
      </section>

      {data.sampleCount > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2>Sample data</h2>
          <p>The system has sample students and books so you can practise. Remove them before you enter real records.</p>
          <form onSubmit={onClear} noValidate className="tt-row">
            <div className="tt-field">
              <label htmlFor="confirm">Type DELETE SAMPLE DATA to confirm</label>
              <input id="confirm" className="tt-input" style={{ width: 300 }} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
            <div className="tt-field">
              <button className="tt-btn warning" type="submit">
                Remove sample data
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2>Recent activity</h2>
        <div className="tt-table-wrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th scope="col">When (UTC)</th>
                <th scope="col">Who</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((a, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap" }}>{a.at}</td>
                  <td>{a.username ?? ""}</td>
                  <td>
                    {a.action.replace(/_/g, " ")}
                    {a.detail ? <span className="tt-sub">{a.detail}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
