import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { apiRequest } from '@/lib/queryClient'
import type {
  CurrentProjectsMarketMemoryPreview,
  MarketMemoryAnchor,
  MarketMemoryResolution,
} from '@level-cre/shared'

import {
  propertyMemorySearchParams,
  type PropertyMemorySearchFilters,
} from './searchParams'

export { propertyMemorySearchParams, type PropertyMemorySearchFilters } from './searchParams'

export type PropertyMemoryFieldGroup = 'location' | 'municipal' | 'legal' | 'ownership' | 'context'

export type PropertyMemoryFieldDecisions = Record<PropertyMemoryFieldGroup, boolean>

export const DEFAULT_PROPERTY_MEMORY_FIELD_DECISIONS: PropertyMemoryFieldDecisions = {
  location: true,
  municipal: true,
  legal: true,
  ownership: true,
  context: true,
}

export type PropertyMemoryImportRequest = {
  sourceFileName: string
  payload: unknown
}

export type PropertyMemoryStageRequest = PropertyMemoryImportRequest & {
  previewHash: string
}

export type PropertyMemoryImportSummary = {
  identities: number
  anchors: number
  existing: number
  marketMemory: number
  review: number
  pending: number
}

export type PropertyMemoryPreviewResponse = {
  duplicate?: boolean
  importId?: string | null
  sourceHash: string
  summary: PropertyMemoryImportSummary
  preview: CurrentProjectsMarketMemoryPreview
}

export type PropertyMemoryReviewItem = {
  id: string
  importId: string
  status: 'pending' | 'approved' | 'rejected' | 'superseded'
  suggestedLayer: 'existing' | 'market_memory' | 'review'
  matchedDossierId: string | null
  matchedProspectId: string | null
  matchedListingId: string | null
  matchConfidence: number
  resolution: MarketMemoryResolution | Record<string, unknown>
  reviewReasons: string[]
  sourceFileName: string | null
  createdAt: string | null
  updatedAt: string | null
  anchor: MarketMemoryAnchor
  currentValues?: Partial<Record<PropertyMemoryFieldGroup, string[]>>
}

export type PropertyMemoryReviewResponse = {
  rows: PropertyMemoryReviewItem[]
}

export type PropertyMemoryReviewItemResponse = {
  item: PropertyMemoryReviewItem
}

export type PropertyMemoryDecision = {
  action: 'approve' | 'reject'
  targetDossierId?: string | null
  targetProspectId?: string | null
  targetListingId?: string | null
  confirmConflicts: boolean
  coordinateDecision?: 'keep_existing' | 'use_verified'
  fieldDecisions: PropertyMemoryFieldDecisions
}

export type PropertyMemoryDecisionRequest = {
  itemId: string
  decision: PropertyMemoryDecision
}

export type PropertyMemoryDecisionResponse = {
  alreadyReviewed: boolean
  action: 'approved' | 'rejected'
  dossierId?: string | null
  factCount?: number
  item: PropertyMemoryReviewItem
}

export type PropertyMemoryMapResponse = CurrentProjectsMarketMemoryPreview & {
  linkedProspectIds: string[]
  anchors: MarketMemoryAnchor[]
}

export type PropertyMemorySearchRow = {
  canonicalKey: string
  layer: 'existing' | 'market_memory' | 'review'
  dossierId: string | null
  importItemId: string | null
  linkedProspectId: string | null
  linkedListingId: string | null
  address: string
  latitude: number
  longitude: number
  owners: string[]
  legalDescriptions: string[]
  lincs: string[]
  zoning: string[]
  submarket: string | null
  prospectStatus: string | null
  lastActivityAt: string | null
  activityCount: number
  matchedFields: string[]
  anchor: MarketMemoryAnchor
}

export type PropertyMemorySearchResponse = {
  rows: PropertyMemorySearchRow[]
  total: number
  nextCursor: string | null
  source: {
    importId: string | null
    generatedAt: string
    anchorCount: number
  }
}

// Keep endpoints in one place while the backend route surface settles.
export const propertyMemoryRoutes = {
  preview: '/api/intel/brokerage-memory/preview',
  imports: '/api/intel/brokerage-memory/imports',
  review: '/api/intel/brokerage-memory/review',
  reviewItem: (itemId: string) => `/api/intel/brokerage-memory/items/${encodeURIComponent(itemId)}/review`,
  map: '/api/intel/brokerage-memory/map',
  search: '/api/intel/brokerage-memory/search',
  decision: (itemId: string) => `/api/intel/brokerage-memory/items/${encodeURIComponent(itemId)}/decision`,
} as const

export const propertyMemoryKeys = {
  all: ['property-memory'] as const,
  map: () => ['property-memory', 'map'] as const,
  search: (filters: PropertyMemorySearchFilters) => ['property-memory', 'search', filters] as const,
  searchInfinite: (filters: PropertyMemorySearchFilters) => ['property-memory', 'search', 'infinite', filters] as const,
  reviewRoot: () => ['property-memory', 'review'] as const,
  review: (limit: number) => ['property-memory', 'review', limit] as const,
  reviewItem: (itemId: string) => ['property-memory', 'review-item', itemId] as const,
} as const

async function responseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export async function previewPropertyMemoryImport(
  input: PropertyMemoryImportRequest,
): Promise<PropertyMemoryPreviewResponse> {
  return responseJson(await apiRequest('POST', propertyMemoryRoutes.preview, input))
}

export async function stagePropertyMemoryImport(
  input: PropertyMemoryStageRequest,
): Promise<PropertyMemoryPreviewResponse> {
  return responseJson(await apiRequest('POST', propertyMemoryRoutes.imports, input))
}

export async function fetchPropertyMemoryReview(limit = 100): Promise<PropertyMemoryReviewResponse> {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 250)
  return responseJson(await apiRequest('GET', `${propertyMemoryRoutes.review}?limit=${boundedLimit}`))
}

export async function fetchPropertyMemoryReviewItem(itemId: string): Promise<PropertyMemoryReviewItemResponse> {
  return responseJson(await apiRequest('GET', propertyMemoryRoutes.reviewItem(itemId)))
}

export async function fetchPropertyMemoryMap(): Promise<PropertyMemoryMapResponse> {
  return responseJson(await apiRequest('GET', propertyMemoryRoutes.map))
}

export async function fetchPropertyMemorySearch(
  filters: PropertyMemorySearchFilters,
): Promise<PropertyMemorySearchResponse> {
  const params = propertyMemorySearchParams(filters)
  const query = params.toString()
  const suffix = query ? `?${query}` : ''
  return responseJson(await apiRequest('GET', `${propertyMemoryRoutes.search}${suffix}`))
}

export async function decidePropertyMemoryItem(
  request: PropertyMemoryDecisionRequest,
): Promise<PropertyMemoryDecisionResponse> {
  return responseJson(await apiRequest('POST', propertyMemoryRoutes.decision(request.itemId), request.decision))
}

export async function invalidatePropertyMemoryMap(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: propertyMemoryKeys.map() })
}

export async function invalidatePropertyMemoryReview(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: propertyMemoryKeys.reviewRoot() })
}

export async function invalidatePropertyMemoryAfterImport(queryClient: QueryClient) {
  await Promise.all([
    invalidatePropertyMemoryMap(queryClient),
    invalidatePropertyMemoryReview(queryClient),
  ])
}

export async function invalidatePropertyMemoryAfterDecision(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: propertyMemoryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['/api/intel/dossiers'] }),
    queryClient.invalidateQueries({ queryKey: ['/api/prospects'] }),
  ])
}

type MutationCallbacks<TData, TVariables> = {
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>
  onError?: (error: Error, variables: TVariables) => void
}

export function usePropertyMemoryMap(options: { enabled?: boolean } = {}) {
  return useQuery<PropertyMemoryMapResponse>({
    queryKey: propertyMemoryKeys.map(),
    queryFn: fetchPropertyMemoryMap,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  })
}

export function usePropertyMemoryReview(options: { enabled?: boolean; limit?: number } = {}) {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 250)
  return useQuery<PropertyMemoryReviewResponse>({
    queryKey: propertyMemoryKeys.review(limit),
    queryFn: () => fetchPropertyMemoryReview(limit),
    enabled: options.enabled ?? true,
    staleTime: 15_000,
  })
}

export function usePropertyMemoryReviewItem(
  itemId: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<PropertyMemoryReviewItemResponse>({
    queryKey: propertyMemoryKeys.reviewItem(itemId || ''),
    queryFn: () => fetchPropertyMemoryReviewItem(itemId || ''),
    enabled: Boolean(itemId) && (options.enabled ?? true),
    staleTime: 30_000,
  })
}

export function usePropertyMemorySearch(
  filters: PropertyMemorySearchFilters,
  options: { enabled?: boolean } = {},
) {
  return useQuery<PropertyMemorySearchResponse>({
    queryKey: propertyMemoryKeys.search(filters),
    queryFn: () => fetchPropertyMemorySearch(filters),
    enabled: options.enabled ?? true,
    staleTime: 20_000,
  })
}

export function useInfinitePropertyMemorySearch(
  filters: PropertyMemorySearchFilters,
  options: { enabled?: boolean } = {},
) {
  const baseFilters = { ...filters, cursor: undefined }
  return useInfiniteQuery({
    queryKey: propertyMemoryKeys.searchInfinite(baseFilters),
    queryFn: ({ pageParam }) => fetchPropertyMemorySearch({
      ...baseFilters,
      cursor: pageParam || undefined,
    }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: options.enabled ?? true,
    staleTime: 20_000,
  })
}

export function usePreviewPropertyMemoryImport(
  callbacks: MutationCallbacks<PropertyMemoryPreviewResponse, PropertyMemoryImportRequest> = {},
) {
  return useMutation<PropertyMemoryPreviewResponse, Error, PropertyMemoryImportRequest>({
    mutationFn: previewPropertyMemoryImport,
    onSuccess: callbacks.onSuccess,
    onError: callbacks.onError,
  })
}

export function useStagePropertyMemoryImport(
  callbacks: MutationCallbacks<PropertyMemoryPreviewResponse, PropertyMemoryStageRequest> = {},
) {
  const queryClient = useQueryClient()
  return useMutation<PropertyMemoryPreviewResponse, Error, PropertyMemoryStageRequest>({
    mutationFn: stagePropertyMemoryImport,
    onSuccess: async (data, variables) => {
      await invalidatePropertyMemoryAfterImport(queryClient)
      await callbacks.onSuccess?.(data, variables)
    },
    onError: callbacks.onError,
  })
}

export function useDecidePropertyMemoryItem(
  callbacks: MutationCallbacks<PropertyMemoryDecisionResponse, PropertyMemoryDecisionRequest> = {},
) {
  const queryClient = useQueryClient()
  return useMutation<PropertyMemoryDecisionResponse, Error, PropertyMemoryDecisionRequest>({
    mutationFn: decidePropertyMemoryItem,
    onSuccess: async (data, variables) => {
      await callbacks.onSuccess?.(data, variables)
      void invalidatePropertyMemoryAfterDecision(queryClient).catch((error) => {
        console.error('Property-memory refresh failed after a confirmed decision:', error)
      })
    },
    onError: callbacks.onError,
  })
}
