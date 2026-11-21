import type { ReactNode } from "react";

const PALETTE = ["#1a6fb5", "#0f7b6c", "#7a4fb3", "#b4552c", "#2f6b2f", "#a3335d", "#3e5c9a", "#8a6d1d"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string) {
  const parts = name
    .replace(/\b(bin|binti|bt|b\.|a\/l|a\/p)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, colorKey, size }: { name: string; colorKey?: string; size?: "lg" }) {
  const bg = PALETTE[hash(colorKey ?? name) % PALETTE.length];
  return (
    <span className={"tt-avatar" + (size ? " " + size : "")} style={{ background: bg }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PageHead({ caption, title, children }: { caption?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="tt-pagehead">
      <div className="tt-pagehead-in">
        {caption && <p className="tt-caption">{caption}</p>}
        {title}
        {children}
      </div>
    </div>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="0" y="0" width="34" height="34" rx="8" fill="#ffffff" fillOpacity="0.1" />
      <rect x="7" y="9" width="5" height="17" rx="1" fill="#7cc0ff" />
      <rect x="13.5" y="7" width="5" height="19" rx="1" fill="#ffffff" />
      <rect x="20" y="10" width="5" height="16" rx="1" fill="#ffdd00" transform="rotate(10 22.5 18)" />
      <rect x="5" y="26" width="24" height="2.5" rx="1" fill="#ffffff" />
    </svg>
  );
}
