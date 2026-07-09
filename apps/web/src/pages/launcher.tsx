import { Link } from 'wouter'
import { Activity, ArrowRight, BarChart3, Briefcase, ChartSpline, Map, RotateCcw, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const focusAreas = [
  {
    label: 'Today',
    href: '/app/today',
    icon: BarChart3,
    description: 'Start a focused BD block and see the next useful prospecting work.',
  },
  {
    label: 'Map',
    href: '/app/map',
    icon: Map,
    description: 'Work the prospecting map and update relationship status.',
  },
  {
    label: 'Challenges',
    href: '/app/challenges',
    icon: Target,
    description: 'Turn listings, territories, and cleanup queues into focused prospecting pushes.',
  },
  {
    label: 'Follow-ups',
    href: '/app/followup',
    icon: RotateCcw,
    description: 'Clear due touches and keep the relationship engine moving.',
  },
  {
    label: 'Activity Capture',
    href: '/app/inbox',
    icon: Activity,
    description: 'Credit email follow-up without turning Level CRE into a mail client.',
  },
]

export default function LauncherPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="gap-2 rounded-md border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
              <Briefcase className="h-3.5 w-3.5" />
              Focused v1
            </Badge>
            <div className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-950">
              <span>level CRE</span>
              <ChartSpline size={24} className="-mt-px" />
            </div>
            <div className="max-w-2xl space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Prospecting, follow-up, and market memory.
              </h1>
              <p className="text-base leading-7 text-slate-600">
                Level CRE is trimmed around the daily business-development loop: map targets, work follow-ups, capture activity, and improve the private CRM.
              </p>
            </div>
          </div>
          <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
            <Link href="/app/today">
              Open Level CRE
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {focusAreas.map((area) => {
            const Icon = area.icon
            return (
              <Card key={area.label} className="rounded-lg border-slate-200 bg-white shadow-sm">
                <CardContent className="flex items-start justify-between gap-4 p-5">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">{area.label}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{area.description}</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={area.href}>
                      Open
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-sm font-semibold text-slate-950">Kept underneath</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Workspaces remain available as shared containers for listings, pursuit maps, and assistant-vs-human prospecting challenges.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/app/workspaces">Open workspaces</Link>
              </Button>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Parked for later</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Track Record and Industrial Intel are intentionally out of the main v1 flow while the prospecting loop gets tightened.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
