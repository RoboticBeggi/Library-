import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { getMe, signOut } from "../lib/api/auth.functions";
import { Logo } from "../components/ui-bits";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const user = await getMe();
    if (!user) throw redirect({ to: "/login" });
    if (user.mustChange && location.pathname !== "/account") throw redirect({ to: "/account" });
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const nav = { activeProps: { className: "active", "aria-current": "page" as const } };

  async function out() {
    await signOut();
    await router.invalidate();
    window.location.href = "/login";
  }

  return (
    <>
      <a className="tt-skip" href="#main">
        Skip to main content
      </a>
      <header className="tt-header">
        <div className="tt-header-in">
          <Link to="/" className="tt-brand">
            <Logo />
            <span className="tt-brand-text">
              <b>Textbook Returns</b>
              <span>Perpustakaan MRSM Gemencheh</span>
            </span>
          </Link>
          {!user.mustChange && (
            <nav aria-label="Main" className="tt-nav">
              <Link to="/" activeOptions={{ exact: true }} {...nav}>
                Books owed
              </Link>
              <Link to="/return" {...nav}>
                Return books
              </Link>
              <Link to="/lend" {...nav}>
                Lend books
              </Link>
              <Link to="/students" {...nav}>
                Students
              </Link>
              <Link to="/books" {...nav}>
                Book stock
              </Link>
              {user.role === "admin" && (
                <Link to="/admin" {...nav}>
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>
      </header>
      <main className="tt-main" id="main">
        <Outlet />
      </main>
      <footer className="tt-footer">
        <div className="tt-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span>
            Signed in as <b>{user.displayName}</b> ({user.username}, {user.role})
          </span>
          <span className="tt-row" style={{ gap: 20, alignItems: "center" }}>
            <Link to="/account">Change password</Link>
            <button className="tt-linkbtn" onClick={out}>
              Sign out
            </button>
          </span>
        </div>
      </footer>
    </>
  );
}
