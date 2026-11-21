import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getMe, signIn } from "../lib/api/auth.functions";
import { Logo } from "../components/ui-bits";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Textbook Returns" }] }),
  beforeLoad: async () => {
    const me = await getMe();
    if (me) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await signIn({ data: { username, password } });
      if (res.ok) {
        window.location.href = res.mustChange ? "/account" : "/";
        return;
      }
      setError(res.message);
    } catch {
      setError("Could not sign in. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="tt-auth">
      <section className="tt-auth-brand" aria-label="About this service">
        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
          <Logo size={40} />
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <b style={{ fontSize: 18 }}>Textbook Returns</b>
            <span style={{ fontSize: 14, color: "#b9c6d8" }}>Perpustakaan MRSM Gemencheh</span>
          </span>
        </div>
        <div style={{ position: "relative", zIndex: 1, padding: "48px 0" }}>
          <h1>Every textbook, and who has it.</h1>
          <p>Lend books, check them back in, and see at a glance which students still have to return or replace a book.</p>
          <ul className="tt-auth-list">
            <li>Find any student and their books in seconds</li>
            <li>Type copy numbers or use a barcode scanner</li>
            <li>History kept year after year</li>
          </ul>
        </div>
        <span />
      </section>
      <main className="tt-auth-form" id="main">
        <div>
          <h2 style={{ fontSize: 30, margin: "0 0 6px" }}>Sign in</h2>
          <p className="tt-hint" style={{ fontSize: 17, marginBottom: 28 }}>
            For library staff. Ask the library admin if you need an account.
          </p>
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
              <label htmlFor="username">Username</label>
              <input
                id="username"
                className="tt-input"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="tt-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="tt-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="tt-btn" type="submit" disabled={busy} style={{ background: "#0b1f3a", boxShadow: "0 2px 0 #000" }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
