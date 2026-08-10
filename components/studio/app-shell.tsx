"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StudioProvider } from "./studio-provider";

const nav = [
  { href: "/studio", label: "Studio", mark: "S" },
  { href: "/garments", label: "Garment canon", mark: "G" },
  { href: "/shoots", label: "Shoot desk", mark: "◉" },
  { href: "/konan", label: "Identity", mark: "K" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <StudioProvider>
      <div className="app-shell studio-shell">
        <a className="skip-link" href="#studio-content">Skip to studio content</a>
        <span className="shell-light shell-light-one" aria-hidden="true" />
        <span className="shell-light shell-light-two" aria-hidden="true" />
        <aside className="rail">
          <Link className="brand" href="/studio" aria-label="justurban wears Studio home">
            <span className="brand-mark">JW</span>
            <span className="brand-lockup"><span className="brand-word">justurban wears</span><small>Studio</small></span>
          </Link>
          <nav className="rail-nav" aria-label="Primary navigation">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={active ? "rail-link active" : "rail-link"}
                  href={item.href}
                  key={item.href}
                >
                  <span className="nav-mark" aria-hidden="true">{item.mark}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="rail-lower">
            <Link className="rail-public-link" href="/shop">
              <span aria-hidden="true">↗</span>
              <span>Open public shop</span>
            </Link>
            <div className="rail-foot">
              <span className="privacy-dot" aria-hidden="true" />
              Private studio
            </div>
          </div>
        </aside>
        <div className="workspace">
          <div className="demo-ribbon" role="note">
            <span>Operator surface</span>
            <span>Private references stay local. The public shop never reads this workspace.</span>
          </div>
          <main className="page-canvas" id="studio-content">{children}</main>
        </div>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={active ? "mobile-link active" : "mobile-link"}
                href={item.href}
                key={item.href}
              >
                <span aria-hidden="true">{item.mark}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </StudioProvider>
  );
}
