import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

type ToolLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: "/tools/industrial-intel", label: "Overview" },
  { href: "/tools/industrial-intel/listings", label: "Listings" },
] as const;

export default function ToolLayout({ children }: ToolLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Tool B
            </p>
            <h1 className="text-2xl font-semibold text-slate-950">Industrial Intel</h1>
          </div>
          <Link href="/app" className="text-sm font-medium text-slate-600 hover:text-slate-950">
            Open Tool A
          </Link>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 px-6 pb-4">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
