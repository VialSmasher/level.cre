import type { ReactNode } from 'react';
import { Link } from 'wouter';

import { cn } from '@/lib/utils';

type ScorecardView = 'overview' | 'badges' | 'standings';

type ScorecardPageHeaderProps = {
  activeView: ScorecardView;
  title: string;
  description: string;
};

type ScorecardPageShellProps = {
  children: ReactNode;
};

const SCORECARD_VIEWS: Array<{ id: ScorecardView; href: string; label: string }> = [
  { id: 'overview', href: '/broker-stats', label: 'Overview' },
  { id: 'badges', href: '/badges', label: 'Achievements' },
  { id: 'standings', href: '/app/standings', label: 'Standings' },
];

export function ScorecardPageShell({ children }: ScorecardPageShellProps) {
  return (
    <div className="min-h-full bg-[#f6f8fb]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

export function ScorecardPageHeader({ activeView, title, description }: ScorecardPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scorecard</p>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{description}</p>
      </div>

      <nav
        aria-label="Scorecard views"
        className="grid w-full grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit"
      >
        {SCORECARD_VIEWS.map((view) => {
          const isActive = view.id === activeView;
          return (
            <Link
              key={view.id}
              href={view.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              {view.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
