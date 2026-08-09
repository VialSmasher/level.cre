import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { apiRequest } from '@/lib/queryClient'

export type ProspectMergeFieldKey =
  | 'name'
  | 'status'
  | 'notes'
  | 'address'
  | 'businessName'
  | 'websiteUrl'
  | 'submarketId'
  | 'lastContactDate'
  | 'followUp'
  | 'contactName'
  | 'contactEmail'
  | 'contactPhone'
  | 'contactCompany'
  | 'buildingSf'
  | 'lotSizeAcres'
  | 'mapLocation'
  | 'aiMetadata'
  | 'marketIdentity'

export type ProspectMergeFieldChoice = 'canonical' | 'duplicate' | 'combine'

export type ProspectMergeCandidateProspect = {
  id: string
  name: string
  status: string
  address: string | null
  businessName: string | null
  contactCompany: string | null
  buildingSf: number | null
  lotSizeAcres: number | null
  resolvedLat: number | null
  resolvedLng: number | null
  preservationScore: number
  relationshipCounts: {
    listings: number
    interactions: number
    activities: number
    opportunities: number
    dossiers: number
  }
}

export type ProspectMergeCandidateGroup = {
  id: string
  recommendedCanonicalId: string
  reasons: string[]
  prospects: ProspectMergeCandidateProspect[]
}

export type ProspectMergePreviewProspect = {
  id: string
  name: string
  status: string
  address: string | null
  businessName: string | null
  contactCompany: string | null
  buildingSf: number | null
  lotSizeAcres: number | null
  resolvedLat: number | null
  resolvedLng: number | null
  [key: string]: unknown
}

export type ProspectMergeCandidatesResponse = {
  groups: ProspectMergeCandidateGroup[]
}

export type ProspectMergeFieldComparison = {
  key: ProspectMergeFieldKey
  label: string
  group: 'property' | 'brokerage' | 'contact' | 'map' | 'system'
  canonicalValue: unknown
  duplicateValue: unknown
  conflict: boolean
  defaultChoice: ProspectMergeFieldChoice
  allowCombine: boolean
}

export type ProspectMergePreviewResponse = {
  canonicalProspect: ProspectMergePreviewProspect
  duplicateProspect: ProspectMergePreviewProspect
  fieldComparisons: ProspectMergeFieldComparison[]
  defaultFieldChoices: Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>
  relationshipCounts: Record<string, { canonical: number; duplicate: number }>
  blockers: Array<{ code: string; message: string; ids: string[] }>
  canApply: boolean
  recommendation: {
    prospectId: string
    reasons: string[]
    canonicalScore: number
    duplicateScore: number
  }
  previewHash: string
}

export type ProspectMergeApplyRequest = {
  canonicalProspectId: string
  duplicateProspectId: string
  previewHash: string
  idempotencyKey: string
  confirmConflicts: true
  fieldChoices: Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>
}

export type ProspectMergeApplyResponse = {
  alreadyApplied: boolean
  mergeEventId: string
  canonicalProspectId: string
  duplicateProspectId: string
  status: string
  movedCounts: Record<string, number>
}

export type ProspectMergeUndoRequest = {
  mergeEventId: string
  confirmUndo: true
}

export type ProspectMergeUndoResponse = {
  mergeEventId: string
  status: 'reversed'
  canonicalProspectId: string
  duplicateProspectId: string
  restoredCounts: Record<string, number>
}

export const prospectMergeRoutes = {
  candidates: '/api/prospects/duplicate-merges/candidates',
  preview: '/api/prospects/duplicate-merges/preview',
  apply: '/api/prospects/duplicate-merges',
  undo: (mergeEventId: string) => `/api/prospects/duplicate-merges/${encodeURIComponent(mergeEventId)}/undo`,
  resolve: (prospectId: string) => `/api/prospects/${encodeURIComponent(prospectId)}/resolve`,
} as const

export const prospectMergeKeys = {
  all: ['prospect-merge'] as const,
  candidates: (limit: number) => ['prospect-merge', 'candidates', limit] as const,
  preview: (canonicalProspectId: string, duplicateProspectId: string) => [
    'prospect-merge', 'preview', canonicalProspectId, duplicateProspectId,
  ] as const,
} as const

async function responseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

async function invalidateProspectMergeConsumers(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: prospectMergeKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['/api/prospects'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/interactions'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/listings'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/opportunities'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/intel/dossiers'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/automation/activity-pulse'] }),
    queryClient.invalidateQueries({ queryKey: ['property-memory'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/automation/sales-brief?limit=25'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/automation/reconciliation?limit=25'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/agent/sales-activity/imports?matchStatus=needs_review&limit=50'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/activity-events?eventType=market_record_proposed&matchStatus=needs_review&limit=50'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/activity-events?eventType=opportunity_promotion_proposed&matchStatus=needs_review&limit=50'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/activity-events?source=codex_property_title_audit&matchStatus=needs_review&limit=250'] }),
  ])
}

export function useProspectMergeCandidates(options: { enabled?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 50)
  return useQuery<ProspectMergeCandidatesResponse>({
    queryKey: prospectMergeKeys.candidates(limit),
    queryFn: async () => responseJson(await apiRequest('GET', `${prospectMergeRoutes.candidates}?limit=${limit}`)),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  })
}

export function useProspectMergePreview(
  canonicalProspectId: string | null,
  duplicateProspectId: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<ProspectMergePreviewResponse>({
    queryKey: prospectMergeKeys.preview(canonicalProspectId || '', duplicateProspectId || ''),
    queryFn: async () => responseJson(await apiRequest('POST', prospectMergeRoutes.preview, {
      canonicalProspectId,
      duplicateProspectId,
    })),
    enabled: Boolean(canonicalProspectId && duplicateProspectId) && (options.enabled ?? true),
    staleTime: 10_000,
  })
}

export function useApplyProspectMerge(callbacks: {
  onSuccess?: (result: ProspectMergeApplyResponse) => void | Promise<void>
  onError?: (error: Error) => void
} = {}) {
  const queryClient = useQueryClient()
  return useMutation<ProspectMergeApplyResponse, Error, ProspectMergeApplyRequest>({
    mutationFn: async (request) => responseJson(await apiRequest('POST', prospectMergeRoutes.apply, request)),
    onSuccess: async (result) => {
      await invalidateProspectMergeConsumers(queryClient)
      await callbacks.onSuccess?.(result)
    },
    onError: callbacks.onError,
  })
}

export function useUndoProspectMerge(callbacks: {
  onSuccess?: (result: ProspectMergeUndoResponse) => void | Promise<void>
  onError?: (error: Error) => void
} = {}) {
  const queryClient = useQueryClient()
  return useMutation<ProspectMergeUndoResponse, Error, ProspectMergeUndoRequest>({
    mutationFn: async ({ mergeEventId, confirmUndo }) => responseJson(await apiRequest(
      'POST',
      prospectMergeRoutes.undo(mergeEventId),
      { confirmUndo },
    )),
    onSuccess: async (result) => {
      await invalidateProspectMergeConsumers(queryClient)
      await callbacks.onSuccess?.(result)
    },
    onError: callbacks.onError,
  })
}

export async function resolveProspectId(prospectId: string) {
  return responseJson<{
    requestedProspectId: string
    canonicalProspectId: string
    merged: boolean
    mergeEventId: string | null
  }>(await apiRequest('GET', prospectMergeRoutes.resolve(prospectId)))
}
