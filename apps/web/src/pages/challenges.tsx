import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Briefcase, CheckCircle2, Mail, Map, Phone, Target, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Prospect } from '@level-cre/shared/schema'

type WorkspaceRow = {
  id: string
  title?: string | null
  prospectCount?: number | null
}

type ChallengeCard = {
  title: string
  description: string
  metric: string
  metricLabel: string
  href: string
  action: string
  icon: typeof Target
  tone: string
}

function isDue(value?: string | Date | null) {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return date <= endOfToday
}

function hasContact(prospect: Prospect) {
  return Boolean(
    prospect.contactName ||
      prospect.contactCompany ||
      prospect.contactEmail ||
      prospect.contactPhone,
  )
}

export default function ChallengesPage() {
  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
  })

  const { data: workspaces = [] } = useQuery<WorkspaceRow[]>({
    queryKey: ['/api/listings'],
  })

  const safeProspects = Array.isArray(prospects) ? prospects : []
  const safeWorkspaces = Array.isArray(workspaces) ? workspaces : []
  const dueFollowUps = safeProspects.filter((prospect) => isDue(prospect.followUpDueDate)).length
  const missingContacts = safeProspects.filter((prospect) => !hasContact(prospect)).length
  const untouchedProspects = safeProspects.filter((prospect) => prospect.status === 'prospect').length
  const workspaceProspects = safeWorkspaces.reduce((sum, workspace) => sum + Number(workspace.prospectCount || 0), 0)

  const challenges: ChallengeCard[] = [
    {
      title: 'Follow-up rescue',
      description: 'Clear overdue and due-today touches before they go cold.',
      metric: dueFollowUps.toLocaleString(),
      metricLabel: 'due now',
      href: '/app/followup',
      action: 'Open queue',
      icon: Phone,
      tone: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    {
      title: 'Shared listing sprint',
      description: 'Use a workspace as the container for a listing or pursuit challenge.',
      metric: workspaceProspects.toLocaleString(),
      metricLabel: 'workspace prospects',
      href: '/app/workspaces',
      action: 'Open workspaces',
      icon: Briefcase,
      tone: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    {
      title: 'Map prospecting block',
      description: 'Add targets, verify status, and build coverage in one focused area.',
      metric: untouchedProspects.toLocaleString(),
      metricLabel: 'new prospects',
      href: '/app/map',
      action: 'Open map',
      icon: Map,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      title: 'Data cleanup push',
      description: 'Turn weak records into usable CRM data before the next call block.',
      metric: missingContacts.toLocaleString(),
      metricLabel: 'missing contact',
      href: '/app/review',
      action: 'Open enrichment',
      icon: Wrench,
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      title: 'Email activity credit',
      description: 'Review captured emails so follow-up activity counts in the scorecard.',
      metric: 'XP',
      metricLabel: 'capture',
      href: '/app/inbox',
      action: 'Open activity',
      icon: Mail,
      tone: 'border-violet-200 bg-violet-50 text-violet-700',
    },
  ]

  return (
    <div className="min-h-0 flex-1 bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <Target className="h-4 w-4" />
              Challenges
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Prospecting Blocks</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Pick one measurable business-development push, then let Scorecard track the activity.
            </p>
          </div>
          <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
            <Link href="/broker-stats">
              Open Scorecard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Target className="h-4 w-4 text-blue-600" />
                Assistant-supported blocks
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Work a listing, territory, or cleanup queue against a clear assistant-suggested target. Workspaces stay underneath as the shared container; challenges are the motivational layer.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded-md border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-700">
              Prospecting only
            </Badge>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {challenges.map((challenge) => {
            const Icon = challenge.icon
            return (
              <Card key={challenge.title} className="rounded-lg border-slate-200 bg-white shadow-sm">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${challenge.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-950">{challenge.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{challenge.description}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-2xl font-semibold text-slate-950">{challenge.metric}</span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{challenge.metricLabel}</span>
                      </div>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="shrink-0">
                    <Link href={challenge.href}>
                      {challenge.action}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="rounded-lg border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Score actions, not deals</p>
                <p className="mt-1 text-sm text-slate-500">Calls, emails, notes, meetings, cleanup, and follow-through count here.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Use workspaces as context</p>
                <p className="mt-1 text-sm text-slate-500">Shared listings can become the container for competitive prospecting.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Keep the loop lightweight</p>
                <p className="mt-1 text-sm text-slate-500">The challenge should push the next action, not become another CRM module.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
