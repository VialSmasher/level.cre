import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Archive, CheckCircle2, ExternalLink, Inbox as InboxIcon, Mail, RefreshCcw, Search, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiUrl } from '@/lib/api'
import { apiRequest } from '@/lib/queryClient'

type EmailReviewStatus = 'pending_review' | 'auto_logged' | 'approved' | 'ignored' | 'rejected' | 'all'

type EmailReviewItem = {
  id: string
  matchStatus: Exclude<EmailReviewStatus, 'all'>
  confidence: number
  matchReason: string
  suggestedInteractionType: string
  suggestedOutcome: string
  suggestedSummary: string
  suggestedNextFollowUp: string | null
  interactionId: string | null
  email: {
    provider: string
    providerMessageId: string
    providerThreadId: string | null
    direction: string
    subject: string
    senderEmail: string
    senderName: string
    recipientEmails: string[]
    sentAt: string | null
    receivedAt: string | null
    snippet: string
    attachmentNames: string[]
    sourceUrl: string
  }
  prospect: null | {
    id: string
    name: string
    address: string
    status: string
  }
  listing: null | {
    id: string
    title: string
  }
}

type EmailReviewCounts = {
  pendingReview: number
  approved: number
  autoLogged: number
  ignored: number
  rejected: number
}

type OutlookConfig = {
  configured: boolean
  connected: boolean
  redirectUri?: string
  reason?: string
  scopes?: string[]
  connection: null | {
    id: string
    emailAddress: string | null
    displayName: string | null
    status: string
    lastSyncedAt: string | null
    errorMessage: string | null
  }
}

const statusLabels: Record<EmailReviewStatus, string> = {
  pending_review: 'Needs Review',
  auto_logged: 'Logged',
  approved: 'Approved',
  ignored: 'Ignored',
  rejected: 'Rejected',
  all: 'All',
}

function formatEmailDate(item: EmailReviewItem) {
  const value = item.email.sentAt || item.email.receivedAt
  if (!value) return 'No date'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'No date'
  return `${formatDistanceToNow(date, { addSuffix: true })}`
}

function confidenceTone(confidence: number) {
  if (confidence >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (confidence >= 60) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

export default function InboxPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<EmailReviewStatus>('pending_review')
  const [search, setSearch] = useState('')

  const { data: counts } = useQuery<EmailReviewCounts>({
    queryKey: ['/api/email/review/counts'],
  })

  const { data: outlookConfig } = useQuery<OutlookConfig>({
    queryKey: ['/api/email/outlook/config'],
  })

  const { data: items = [], isLoading } = useQuery<EmailReviewItem[]>({
    queryKey: [`/api/email/review?status=${status}`],
  })

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => {
      const haystack = [
        item.email.subject,
        item.email.senderEmail,
        item.email.senderName,
        item.email.snippet,
        item.prospect?.name,
        item.prospect?.address,
        item.matchReason,
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [items, search])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/email/review/counts'] })
    queryClient.invalidateQueries({ queryKey: [`/api/email/review?status=${status}`] })
  }

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, matchStatus }: { id: string; matchStatus: Exclude<EmailReviewStatus, 'all'> }) => {
      const response = await apiRequest('PATCH', `/api/email/review/${id}`, { matchStatus })
      return response.json()
    },
    onSuccess: invalidate,
  })

  const logInteractionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/email/review/${id}/create-interaction`)
      return response.json()
    },
    onSuccess: invalidate,
  })

  const syncOutlookMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/email/outlook/sync', { days: 30 })
      return response.json()
    },
    onSuccess: invalidate,
  })

  return (
    <div className="min-h-0 flex-1 bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <InboxIcon className="h-4 w-4" />
              Inbox
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Email Review</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 gap-1.5 bg-white px-3 text-slate-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              {counts?.pendingReview ?? 0} pending
            </Badge>
            <Badge variant="outline" className="h-8 bg-white px-3 text-slate-700">
              {counts?.autoLogged ?? 0} logged
            </Badge>
          </div>
        </div>

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search emails, prospects, addresses"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(value) => setStatus(value as EmailReviewStatus)}>
                <SelectTrigger className="w-[170px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_review">Needs Review</SelectItem>
                  <SelectItem value="auto_logged">Logged</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={invalidate} aria-label="Refresh">
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">Outlook</p>
                <Badge variant="outline" className={outlookConfig?.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}>
                  {outlookConfig?.connected ? 'Connected' : outlookConfig?.configured ? 'Ready to connect' : 'Needs setup'}
                </Badge>
              </div>
              {outlookConfig?.connected ? (
                <p className="mt-1 text-sm text-slate-500">
                  {outlookConfig.connection?.emailAddress || outlookConfig.connection?.displayName || 'Microsoft 365'}
                  {outlookConfig.connection?.lastSyncedAt ? ` · synced ${formatDistanceToNow(new Date(outlookConfig.connection.lastSyncedAt), { addSuffix: true })}` : ''}
                </p>
              ) : outlookConfig?.configured ? (
                <p className="mt-1 text-sm text-slate-500">Connect Microsoft 365 to start filling the review queue.</p>
              ) : (
                <p className="mt-1 break-all text-sm text-slate-500">
                  Add Outlook OAuth credentials. Redirect URI: {outlookConfig?.redirectUri || '/api/email/outlook/callback'}
                </p>
              )}
              {outlookConfig?.connection?.errorMessage ? (
                <p className="mt-1 text-sm text-red-600">{outlookConfig.connection.errorMessage}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {!outlookConfig?.connected ? (
                <Button asChild disabled={!outlookConfig?.configured}>
                  <a href={apiUrl('/api/email/outlook/connect?returnTo=/app/inbox')}>Connect Outlook</a>
                </Button>
              ) : (
                <Button onClick={() => syncOutlookMutation.mutate()} disabled={syncOutlookMutation.isPending}>
                  {syncOutlookMutation.isPending ? 'Syncing...' : 'Sync Outlook'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {isLoading ? (
            <Card className="rounded-lg border-slate-200">
              <CardContent className="py-10 text-center text-sm text-slate-500">Loading email review...</CardContent>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card className="rounded-lg border-slate-200">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Mail className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">No {statusLabels[status].toLowerCase()} emails</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.map((item) => (
              <Card key={item.id} className="rounded-lg border-slate-200 bg-white shadow-sm">
                <CardHeader className="space-y-3 p-4 pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="bg-slate-50 text-slate-700">
                          {statusLabels[item.matchStatus]}
                        </Badge>
                        <Badge variant="outline" className={confidenceTone(item.confidence)}>
                          {item.confidence}% match
                        </Badge>
                        <span className="text-xs text-slate-500">{formatEmailDate(item)}</span>
                      </div>
                      <CardTitle className="mt-2 truncate text-base text-slate-950">
                        {item.email.subject || '(No subject)'}
                      </CardTitle>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {item.email.senderName || item.email.senderEmail || 'Unknown sender'}
                        {item.email.senderEmail ? ` <${item.email.senderEmail}>` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.email.sourceUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={item.email.sourceUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updateStatusMutation.isPending}
                        onClick={() => updateStatusMutation.mutate({ id: item.id, matchStatus: 'ignored' })}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Ignore
                      </Button>
                      <Button
                        size="sm"
                        disabled={!item.prospect || logInteractionMutation.isPending}
                        onClick={() => logInteractionMutation.mutate(item.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Log Email
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-2">
                    <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                      {item.suggestedSummary || item.email.snippet || 'No preview available.'}
                    </p>
                    {item.matchReason ? (
                      <p className="text-xs text-slate-500">{item.matchReason}</p>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matched Prospect</p>
                    {item.prospect ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-semibold text-slate-950">{item.prospect.name || 'Untitled prospect'}</p>
                        <p className="text-xs text-slate-600">{item.prospect.address || 'No address'}</p>
                        <Badge variant="outline" className="mt-1 bg-white text-slate-700">{item.prospect.status}</Badge>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No prospect selected</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
