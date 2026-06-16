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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/tools/industrial-intel" className="group flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-slate-900 text-white">
              <Database className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">Inventory intelligence</span>
              <span className="block text-base font-semibold leading-tight text-foreground group-hover:text-primary">Industrial Intel</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
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
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-muted hover:text-slate-950"
                }`}
                aria-current={isActive ? "page" : undefined}
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
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-slate-700 hover:bg-muted hover:text-slate-950"
            >
              <Home className="h-4 w-4" />
              Tools
            </Link>
            <Link
              href="/app"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Level CRE
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
