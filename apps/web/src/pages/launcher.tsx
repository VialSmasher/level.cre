import { Link } from 'wouter'
import { ArrowRight, Briefcase, ChartSpline, FileText, Lock, Map, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'

const INDUSTRIAL_INTEL_ENABLED =
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === 'true' ||
  String(import.meta.env.VITE_ENABLE_INDUSTRIAL_INTEL ?? '').toLowerCase() === '1'

type ToolRow = {
  label: string
  category: string
  description: string
  details: string[]
  href: string
  icon: typeof Map
  disabled?: boolean
  disabledReason?: string
}

export default function LauncherPage() {
  const { isDemoMode } = useAuth()

  const tools: ToolRow[] = [
    {
      label: 'Level CRE',
      category: 'CRM + map OS',
      description: 'Map-driven prospecting, relationship tracking, workspaces, follow-ups, requirements, and comps.',
      details: ['Map workflow', 'Follow-up queue', 'Workspaces', 'Requirements'],
      href: '/app',
      icon: Map,
    },
    {
      label: 'Industrial Intel',
      category: 'Inventory intelligence',
      description: 'External listing inventory, source runs, dossiers, requirement matching, and survey production.',
      details: ['Listings', 'Dossiers', 'Matching', 'Surveys'],
      href: '/tools/industrial-intel',
      icon: Search,
      disabled: !INDUSTRIAL_INTEL_ENABLED || isDemoMode,
      disabledReason: !INDUSTRIAL_INTEL_ENABLED
        ? 'Feature flag disabled in this environment'
        : 'Use Google sign-in for Industrial Intel',
    },
    {
      label: 'Track Record',
      category: 'Deal history',
      description: 'Private deal ledger, lease-expiry tracking, property photos, and client-safe presentation views.',
      details: ['Deal ledger', 'Photos', 'Expiry tracking', 'Print view'],
      href: '/track-record',
      icon: FileText,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xl font-semibold text-foreground">
              <span>Level CRE</span>
              <ChartSpline size={20} className="text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">Broker Operating Console</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Select the workflow for the current broker task. Each tool keeps the same data model and route behavior.
            </p>
          </div>
          <Badge variant="outline" className="w-fit gap-2 bg-card">
            <Briefcase className="h-3.5 w-3.5" />
            Workflow switcher
          </Badge>
        </header>

        <section className="rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[1.3fr_1fr_140px] gap-3 border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground max-md:hidden">
            <div>Tool</div>
            <div>Coverage</div>
            <div className="text-right">Action</div>
          </div>

          <div className="divide-y divide-border">
            {tools.map((tool) => {
              const Icon = tool.icon
              return (
                <div key={tool.label} className="grid gap-3 px-4 py-4 md:grid-cols-[1.3fr_1fr_140px] md:items-center">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">{tool.label}</h2>
                        <Badge variant="outline">{tool.category}</Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{tool.description}</p>
                      {tool.disabledReason && (
                        <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-amber-800">
                          <Lock className="h-3.5 w-3.5" />
                          {tool.disabledReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {tool.details.map((detail) => (
                      <Badge key={detail} variant="outline" className="bg-background">
                        {detail}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex justify-start md:justify-end">
                    <Button asChild disabled={tool.disabled} variant={tool.disabled ? 'outline' : 'default'}>
                      <Link href={tool.disabled ? '/launcher' : tool.href} aria-disabled={tool.disabled}>
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
