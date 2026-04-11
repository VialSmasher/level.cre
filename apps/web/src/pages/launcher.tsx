import { Link } from 'wouter'
import { ArrowRight, ChartSpline, Lock, Map, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

const INDUSTRIAL_INTEL_ENABLED =
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === 'true' ||
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === '1'

export default function LauncherPage() {
  const { isDemoMode } = useAuth()

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Launcher
          </p>
          <div className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950">
            <span>level CRE</span>
            <ChartSpline size={24} className="-mt-px" />
          </div>
          <div className="max-w-2xl space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Choose your workspace
            </h1>
            <p className="text-base text-slate-600">
              Keep Tool A as the main operating system, and open Industrial Intel when you want market inventory and change tracking.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tool A</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Level CRE</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  CRM, map, workspace, follow-up, requirements, and broker workflow.
                </p>
              </div>
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <Map size={24} />
              </div>
            </div>
            <ul className="mb-6 space-y-2 text-sm text-slate-600">
              <li>• Map-driven prospecting and market workflow</li>
              <li>• Existing day-to-day operating flow</li>
              <li>• Stable default experience</li>
            </ul>
            <Button asChild className="bg-blue-600 text-white hover:bg-blue-700">
              <Link href="/app">
                Open Level CRE
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Tool B</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Industrial Intel</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  External inventory, listing changes, and the foundation for matching and shortlist workflows.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Search size={24} />
              </div>
            </div>

            {!INDUSTRIAL_INTEL_ENABLED ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Industrial Intel is currently hidden behind a feature flag in this environment.
              </div>
            ) : isDemoMode ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Industrial Intel is not available in demo mode.</p>
                      <p className="mt-1 text-amber-800">
                        Use Google sign-in for the real Tool B flow. Demo remains a safe Tool A sandbox.
                      </p>
                    </div>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link href="/app">Back to Level CRE demo</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <ul className="space-y-2 text-sm text-slate-600">
                  <li>• Listing summary, runs, and changes</li>
                  <li>• Read-only inventory slice today</li>
                  <li>• Ready to grow into requirements and shortlist workflows</li>
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
                    <Link href="/tools/industrial-intel">
                      Open Industrial Intel
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/tools/industrial-intel/listings">Open listings</Link>
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
