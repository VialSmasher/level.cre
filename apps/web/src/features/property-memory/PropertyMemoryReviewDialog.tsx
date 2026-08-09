import { AlertTriangle, FileCheck2, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPending) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 lg:left-[calc(50%+7rem)] lg:w-[calc(100vw-16rem)]"
        onEscapeKeyDown={(event) => { if (isPending) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (isPending) event.preventDefault() }}
      >
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-blue-700" aria-hidden />
            Review property evidence
          </DialogTitle>
          <DialogDescription>
            Approve the source-backed facts that belong on this property. The map, zoom and selected asset stay in place.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          {isLoading ? (
            <div className="flex items-center gap-2 px-6 py-8 text-sm text-blue-900" role="status" aria-live="polite">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Loading the saved proposal
            </div>
          ) : null}

          {error ? (
            <div className="m-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">Could not load this proposal</p>
                  <p className="mt-1 text-xs leading-5">{error.message}</p>
                </div>
              </div>
              {onRetry ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>Try again</Button> : null}
            </div>
          ) : null}

          {!isLoading && !error && !item ? (
            <div className="px-6 py-8 text-sm text-slate-600" role="status">
              This proposal is no longer awaiting review. The map is refreshing its latest property story.
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
      </DialogContent>
    </Dialog>
  )
}
