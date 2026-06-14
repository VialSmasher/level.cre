import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, ClipboardList, Database, FileText, FolderOpen, Home } from "lucide-react";
import { Link, useLocation } from "wouter";

type ToolLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: "/tools/industrial-intel", label: "Overview", icon: BarChart3 },
  { href: "/tools/industrial-intel/listings", label: "Listings", icon: Database },
  { href: "/tools/industrial-intel/dossiers", label: "Dossiers", icon: FolderOpen },
  { href: "/tools/industrial-intel/requirements", label: "Requirements", icon: ClipboardList },
  { href: "/tools/industrial-intel/surveys", label: "Surveys", icon: FileText },
] as const;

export default function ToolLayout({ children }: ToolLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link href="/tools/industrial-intel" className="group flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <Database className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Inventory intelligence</span>
              <span className="block text-lg font-semibold leading-tight text-slate-950 group-hover:text-blue-700">Industrial Intel</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/tools/industrial-intel"
                ? location === item.href
                : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200"
                    : "text-slate-600 hover:bg-white hover:text-slate-950"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/launcher"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700"
            >
              <Home className="h-4 w-4" />
              Tools
            </Link>
            <Link
              href="/app"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Level CRE
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
