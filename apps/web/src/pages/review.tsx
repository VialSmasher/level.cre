import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Mail,
  Phone,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiRequest } from '@/lib/queryClient'

type ListingRow = {
  id: string
  title: string
  address?: string | null
}

type ReviewWorkspaceRef = {
  id: string
  title?: string | null
}

type FollowUpReviewItem = {
  prospectId: string
  name: string
  status: string
  severity: 'high' | 'medium' | 'low'
  flags: string[]
  reasons: string[]
  dueDate?: string
  dueStatus: 'overdue' | 'today' | 'soon' | 'future' | 'unscheduled'
  followUpTimeframe?: string
  lastEngagementAt?: string
  lastInteractionAt?: string
  interactionCount: number
  contact: {
    name?: string
    email?: string
    phone?: string
    company?: string
  }
  workspaces: ReviewWorkspaceRef[]
}

type FollowUpReviewResponse = {
  generatedAt: string
  listingId: string | null
  daysWindow: number
  summary: {
    totalReviewed: number
    actionable: number
    overdue: number
    dueToday: number
    dueSoon: number
    missingSchedule: number
    noEngagement: number
  }
  items: FollowUpReviewItem[]
}

type DataQualityIssue = {
  code: string
  severity: 'high' | 'medium' | 'low'
  field: string
  message: string
  suggestedFix: string
}

type DataQualityReviewItem = {
  prospectId: string
  name: string
  status: string
  severity: 'high' | 'medium' | 'low'
  issueCount: number
  issues: DataQualityIssue[]
  suggestedActions: string[]
  lastEngagementAt?: string
  contact: {
    name?: string
    email?: string
    phone?: string
    company?: string
  }
  workspaces: ReviewWorkspaceRef[]
}

type DataQualityReviewResponse = {
  generatedAt: string
  listingId: string | null
  summary: {
    totalReviewed: number
    flagged: number
    placeholder_name: number
    missing_notes: number
    missing_submarket: number
    missing_contact_method: number
    invalid_email: number
    invalid_phone: number
    invalid_website: number
    missing_follow_up_strategy: number
  }
  items: DataQualityReviewItem[]
}

const severityClassName: Record<'high' | 'medium' | 'low', string> = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
}

const dueStatusClassName: Record<FollowUpReviewItem['dueStatus'], string> = {
  overdue: 'border-red-200 bg-red-50 text-red-700',
  today: 'border-amber-200 bg-amber-50 text-amber-700',
  soon: 'border-sky-200 bg-sky-50 text-sky-700',
  future: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  unscheduled: 'border-slate-200 bg-slate-50 text-slate-700',
}

const dueStatusLabel: Record<FollowUpReviewItem['dueStatus'], string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  soon: 'Due Soon',
  future: 'Upcoming',
  unscheduled: 'Unscheduled',
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'None'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'None'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRelativeDate(value?: string | null): string {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatWorkspaceNames(workspaces: ReviewWorkspaceRef[]): string {
  if (workspaces.length === 0) return 'No linked workspace'
  return workspaces.map((workspace) => workspace.title || 'Untitled workspace').join(', ')
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiRequest('GET', url)
  return response.json()
}

function SummaryCard({
  title,
  value,
  tone = 'default',
  helper,
}: {
  title: string
  value: number
  tone?: 'default' | 'danger' | 'warning' | 'success'
  helper?: string
}) {
  const toneClassName =
    tone === 'danger'
      ? 'text-red-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'success'
          ? 'text-emerald-700'
          : 'text-slate-900'

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-semibold tracking-tight ${toneClassName}`}>{value}</div>
        {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
      </CardContent>
    </Card>
  )
}

export default function ReviewPage() {
  const [, setLocation] = useLocation()
  const [selectedListingId, setSelectedListingId] = useState<string>('all')
  const [daysWindow, setDaysWindow] = useState<string>('7')

  const { data: ownedListings = [] } = useQuery<ListingRow[]>({
    queryKey: ['/api/listings'],
  })

  const { data: sharedListings = [] } = useQuery<ListingRow[]>({
    queryKey: ['/api/listings', 'shared'],
    queryFn: async () => fetchJson<ListingRow[]>('/api/listings?scope=shared'),
  })

  const listingOptions = (() => {
    const byId = new Map<string, ListingRow>()
    for (const listing of [...ownedListings, ...sharedListings]) {
      byId.set(listing.id, listing)
    }
    return Array.from(byId.values()).sort((left, right) =>
      (left.title || '').localeCompare(right.title || ''),
    )
  })()

  const listingParam =
    selectedListingId !== 'all' ? `&listingId=${encodeURIComponent(selectedListingId)}` : ''

  const followUpsQuery = useQuery<FollowUpReviewResponse>({
    queryKey: ['/api/tool-a/review/followups', selectedListingId, daysWindow],
    queryFn: async () =>
      fetchJson<FollowUpReviewResponse>(
        `/api/tool-a/review/followups?days=${encodeURIComponent(daysWindow)}${listingParam}`,
      ),
  })

  const dataQualityQuery = useQuery<DataQualityReviewResponse>({
    queryKey: ['/api/tool-a/review/data-quality', selectedListingId],
    queryFn: async () =>
      fetchJson<DataQualityReviewResponse>(
        `/api/tool-a/review/data-quality${listingParam ? `?${listingParam.slice(1)}` : ''}`,
      ),
  })

  const selectedListingLabel =
    selectedListingId === 'all'
      ? 'all accessible prospects'
      : listingOptions.find((listing) => listing.id === selectedListingId)?.title || 'selected workspace'

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Bot className="h-3.5 w-3.5" />
              Tool A Review Console
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                See what a clawbot would flag before it touches anything
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                This is a read-only review surface over Tool A. It uses the same deterministic follow-up and data-quality
                logic your bots can call, so we can validate the signal before we automate any edits.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
            <div className="min-w-[220px] space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Workspace Scope</p>
              <Select value={selectedListingId} onValueChange={setSelectedListingId}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="All accessible prospects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accessible prospects</SelectItem>
                  {listingOptions.map((listing) => (
                    <SelectItem key={listing.id} value={listing.id}>
                      {listing.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Due Soon Window</p>
              <Select value={daysWindow} onValueChange={setDaysWindow}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void followUpsQuery.refetch()
                  void dataQualityQuery.refetch()
                }}
                disabled={followUpsQuery.isFetching || dataQualityQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${(followUpsQuery.isFetching || dataQualityQuery.isFetching) ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col gap-3 p-5 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="font-medium text-slate-900">Current scope: {selectedListingLabel}</p>
              <p>
                Follow-up review window: {daysWindow} days. Everything here is still read-only and safe to inspect.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Bot-readable
              </Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Read-only
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="followups" className="space-y-5">
          <TabsList className="bg-slate-200/70">
            <TabsTrigger value="followups">Follow-Up Risk</TabsTrigger>
            <TabsTrigger value="quality">Data Quality</TabsTrigger>
          </TabsList>

          <TabsContent value="followups" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <SummaryCard
                title="Actionable"
                value={followUpsQuery.data?.summary.actionable ?? 0}
                helper="Records that need a human look"
              />
              <SummaryCard
                title="Overdue"
                value={followUpsQuery.data?.summary.overdue ?? 0}
                tone="danger"
              />
              <SummaryCard
                title="Due Today"
                value={followUpsQuery.data?.summary.dueToday ?? 0}
                tone="warning"
              />
              <SummaryCard
                title="Due Soon"
                value={followUpsQuery.data?.summary.dueSoon ?? 0}
                tone="default"
              />
              <SummaryCard
                title="Missing Schedule"
                value={followUpsQuery.data?.summary.missingSchedule ?? 0}
                tone="warning"
              />
              <SummaryCard
                title="No Engagement"
                value={followUpsQuery.data?.summary.noEngagement ?? 0}
                tone="danger"
              />
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CalendarClock className="h-5 w-5 text-blue-600" />
                  Follow-Up Review
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Generated from prospect cadence, explicit due dates, and latest interaction follow-up hints.
                </p>
              </CardHeader>
              <CardContent>
                {followUpsQuery.isLoading ? (
                  <div className="py-10 text-center text-sm text-slate-500">Loading follow-up review...</div>
                ) : followUpsQuery.data?.items.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prospect</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Why It Flagged</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Workspace</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {followUpsQuery.data.items.map((item) => (
                        <TableRow key={item.prospectId}>
                          <TableCell className="min-w-[220px]">
                            <div className="space-y-2">
                              <div className="font-medium text-slate-900">{item.name}</div>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline" className={severityClassName[item.severity]}>
                                  {item.severity.toUpperCase()}
                                </Badge>
                                {item.flags.map((flag) => (
                                  <Badge key={flag} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                                    {flag.replaceAll('_', ' ')}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="capitalize text-slate-900">{item.status.replaceAll('_', ' ')}</div>
                              <div className="text-xs text-slate-500">
                                {item.interactionCount} interaction{item.interactionCount === 1 ? '' : 's'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Badge variant="outline" className={dueStatusClassName[item.dueStatus]}>
                                <Clock3 className="mr-1 h-3.5 w-3.5" />
                                {dueStatusLabel[item.dueStatus]}
                              </Badge>
                              <div className="text-sm text-slate-700">{formatRelativeDate(item.dueDate)}</div>
                              <div className="text-xs text-slate-500">
                                Last touch: {formatRelativeDate(item.lastEngagementAt)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[280px]">
                            <div className="space-y-2">
                              {item.reasons.map((reason) => (
                                <div key={reason} className="flex items-start gap-2 text-sm text-slate-700">
                                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  <span>{reason}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2 text-sm text-slate-700">
                              {item.contact.company ? <div>{item.contact.company}</div> : null}
                              {item.contact.email ? (
                                <div className="inline-flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                                  {item.contact.email}
                                </div>
                              ) : null}
                              {item.contact.phone ? (
                                <div className="inline-flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                                  {item.contact.phone}
                                </div>
                              ) : null}
                              {!item.contact.email && !item.contact.phone && !item.contact.company ? (
                                <span className="text-slate-400">No contact detail</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="space-y-2">
                              <div className="text-sm text-slate-700">{formatWorkspaceNames(item.workspaces)}</div>
                              {item.workspaces[0] ? (
                                <Button
                                  variant="ghost"
                                  className="h-7 px-0 text-xs text-blue-600 hover:bg-transparent hover:text-blue-700"
                                  onClick={() => setLocation(`/app/workspaces/${item.workspaces[0].id}`)}
                                >
                                  Open workspace
                                  <ExternalLink className="ml-1 h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">No follow-up issues in this scope</p>
                      <p className="text-sm text-slate-500">
                        Nothing is currently overdue, due soon, or missing a schedule in {selectedListingLabel}.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality" className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard title="Flagged" value={dataQualityQuery.data?.summary.flagged ?? 0} />
              <SummaryCard
                title="Missing Contact"
                value={dataQualityQuery.data?.summary.missing_contact_method ?? 0}
                tone="danger"
              />
              <SummaryCard
                title="Missing Follow-Up"
                value={dataQualityQuery.data?.summary.missing_follow_up_strategy ?? 0}
                tone="warning"
              />
              <SummaryCard
                title="Placeholder Names"
                value={dataQualityQuery.data?.summary.placeholder_name ?? 0}
                tone="warning"
              />
              <SummaryCard
                title="Missing Notes"
                value={dataQualityQuery.data?.summary.missing_notes ?? 0}
                tone="default"
              />
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="gap-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Wrench className="h-5 w-5 text-blue-600" />
                  Data Quality Review
                </CardTitle>
                <p className="text-sm text-slate-600">
                  These are the cleanup suggestions a future clawbot could surface before any write-back flow exists.
                </p>
              </CardHeader>
              <CardContent>
                {dataQualityQuery.isLoading ? (
                  <div className="py-10 text-center text-sm text-slate-500">Loading data-quality review...</div>
                ) : dataQualityQuery.data?.items.length ? (
                  <div className="space-y-4">
                    {dataQualityQuery.data.items.map((item) => (
                      <Card key={item.prospectId} className="border-slate-200 bg-slate-50/60 shadow-none">
                        <CardHeader className="gap-3 pb-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-lg">{item.name}</CardTitle>
                                <Badge variant="outline" className={severityClassName[item.severity]}>
                                  {item.severity.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                  {item.issueCount} issue{item.issueCount === 1 ? '' : 's'}
                                </Badge>
                              </div>
                              <div className="text-sm text-slate-500">
                                {formatWorkspaceNames(item.workspaces)}
                              </div>
                            </div>

                            {item.workspaces[0] ? (
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/app/workspaces/${item.workspaces[0].id}`}>
                                  Open workspace
                                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                            <div className="space-y-3">
                              {item.issues.map((issue) => (
                                <div
                                  key={`${item.prospectId}-${issue.code}`}
                                  className="rounded-xl border border-white bg-white p-4 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={severityClassName[issue.severity]}>
                                      {issue.severity.toUpperCase()}
                                    </Badge>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      {issue.field}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-slate-800">{issue.message}</p>
                                  <p className="mt-2 text-xs text-slate-500">Suggested fix: {issue.suggestedFix}</p>
                                </div>
                              ))}
                            </div>

                            <div className="space-y-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Contact Snapshot
                                </p>
                                <div className="space-y-1 text-sm text-slate-700">
                                  <div>{item.contact.company || 'No company'}</div>
                                  <div>{item.contact.email || 'No email'}</div>
                                  <div>{item.contact.phone || 'No phone'}</div>
                                </div>
                              </div>

                              <Separator />

                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Suggested Actions
                                </p>
                                <div className="space-y-2">
                                  {item.suggestedActions.map((action) => (
                                    <div key={action} className="flex items-start gap-2 text-sm text-slate-700">
                                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                      <span>{action}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">No data-quality issues in this scope</p>
                      <p className="text-sm text-slate-500">
                        The current records in {selectedListingLabel} look clean against the review rules we have today.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
