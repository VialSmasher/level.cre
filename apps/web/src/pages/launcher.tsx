import { Link } from 'wouter'
import { ArrowRight, Briefcase, ChartSpline, FileText, Lock, Map, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

const INDUSTRIAL_INTEL_ENABLED =
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === 'true' ||
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === '1'

export default function LauncherPage() {
  const { isDemoMode } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" />
              Broker tools
            </p>
            <div className="flex items-center gap-2 text-2xl font-semibold tracking-normal text-slate-950">
              <span>Level CRE</span>
              <ChartSpline size={24} className="-mt-px" />
            </div>
            <div className="max-w-2xl space-y-2">
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                Broker operating console
              </h1>
              <p className="text-base text-slate-600">
                Level CRE is the live CRM and map operating system. Industrial Intel tracks outside inventory and listing movement for matching.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground">
            Select the workflow for the job in front of you.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">CRM + map OS</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Level CRE</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  CRM, map, workspace, follow-up, requirements, and broker workflow.
                </p>
              </div>
              <div className="rounded-md border border-border bg-background p-2 text-slate-700">
                <Map size={18} />
              </div>
            </div>
            <ul className="mb-5 space-y-2 text-sm text-slate-600">
              <li>Map-driven prospecting and market workflow</li>
              <li>Daily follow-up, activity, and workspace execution</li>
              <li>Best place to move active relationships forward</li>
            </ul>
            <Button asChild>
              <Link href="/app">
                Open Level CRE
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Inventory intelligence</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Industrial Intel</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  External inventory, listing changes, and the foundation for matching and shortlist workflows.
                </p>
              </div>
              <div className="rounded-md border border-border bg-background p-2 text-slate-700">
                <Search size={18} />
              </div>
            </div>

            {!INDUSTRIAL_INTEL_ENABLED ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-slate-600">
                Industrial Intel is currently hidden behind a feature flag in this environment.
              </div>
            ) : isDemoMode ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Industrial Intel is not available in demo mode.</p>
                      <p className="mt-1 text-amber-800">
                        Use Google sign-in for the real Industrial Intel flow. Demo remains a safe Level CRE sandbox.
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
                  <li>Listing summary, source runs, and changes</li>
                  <li>CSV intake for CoStar-style exports</li>
                  <li>Ready to grow into surveys and shortlist workflows</li>
                </ul>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
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

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Deal history</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Track Record</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Maintain a private deal ledger, track lease expiries, and prepare client-ready portfolio views.
                </p>
              </div>
              <div className="rounded-md border border-border bg-background p-2 text-slate-700">
                <FileText size={18} />
              </div>
            </div>
            <ul className="mb-5 space-y-2 text-sm text-slate-600">
              <li>Deal records with SF, client, role, and expiry dates</li>
              <li>Image drop zone for property photos</li>
              <li>Presentation and print view for client-facing sheets</li>
            </ul>
            <Button asChild>
              <Link href="/track-record">
                Open Track Record
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  )
}
