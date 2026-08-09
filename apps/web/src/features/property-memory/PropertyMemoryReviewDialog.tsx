import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, FileCheck2, LoaderCircle, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

import type {
  PropertyMemoryDecision,
  PropertyMemoryReviewItem,
} from './api'
import { PropertyMemoryReviewCard } from './PropertyMemoryReviewCard'

type Props = {
  open: boolean
  item: PropertyMemoryReviewItem | null
  isLoading?: boolean
  error?: Error | null
  isPending?: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (decision: PropertyMemoryDecision) => void
  onReject: (decision: PropertyMemoryDecision) => void
  onCompareDuplicates?: (prospectIds: string[]) => void
  onRetry?: () => void
}

export function PropertyMemoryReviewDialog({
  open,
  item,
  isLoading = false,
  error,
  isPending = false,
  onOpenChange,
  onApprove,
  onReject,
  onCompareDuplicates,
  onRetry,
}: Props) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)

  const requestClose = () => {
    if (isPending) return
    onOpenChange(false)
  }

  useEffect(() => {
    if (!open) return
    titleRef.current?.focus({ preventScroll: true })
  }, [item?.id, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      if (!isPending) onOpenChange(false)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isPending, onOpenChange, open])

  if (!open) return null

  return (
    <aside
      aria-labelledby={titleId}
      aria-busy={isPending || isLoading}
      className="absolute bottom-2 left-2 right-2 z-[80] flex max-h-[82dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="flex items-center gap-2 text-base font-semibold text-slate-950 outline-none">
              <FileCheck2 className="h-5 w-5 text-blue-700" aria-hidden />
              Review changes
            </h2>
            <p className="mt-1 text-xs text-slate-500">Choose what to save.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 shrink-0 p-0"
            onClick={requestClose}
            disabled={isPending}
            aria-label="Close property review"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-blue-900" role="status" aria-live="polite">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            Loading changes
          </div>
        ) : null}

        {error ? (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Could not load changes</p>
                <p className="mt-1 text-xs leading-5">{error.message}</p>
              </div>
            </div>
            {onRetry ? <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>Try again</Button> : null}
          </div>
        ) : null}

        {!isLoading && !error && !item ? (
          <div className="px-5 py-8 text-sm text-slate-600" role="status">
            This review is complete. The map is refreshing.
          </div>
        ) : null}

        {item && !isLoading && !error ? (
          <div className="[&>article]:border-b-0">
            <PropertyMemoryReviewCard
              key={item.id}
              item={item}
              isPending={isPending}
              onApprove={onApprove}
              onReject={onReject}
              onCompareDuplicates={onCompareDuplicates}
              showReject={false}
            />
          </div>
        ) : null}
      </ScrollArea>
    </aside>
  )
}
