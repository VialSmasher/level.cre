import { Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MapSearchLocation } from '@/features/map/searchTypes';

type SearchResultCardProps = {
  location: MapSearchLocation;
  actionLabel: string;
  pendingLabel?: string;
  onAction: () => void;
  onClose?: () => void;
  isPending?: boolean;
  disabled?: boolean;
  className?: string;
};

function getWebsiteLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

export function SearchResultCard({
  location,
  actionLabel,
  pendingLabel = 'Adding...',
  onAction,
  onClose,
  isPending = false,
  disabled = false,
  className,
}: SearchResultCardProps) {
  const title = location.businessName?.trim() || location.address;
  const showAddress = Boolean(location.businessName?.trim() && location.address);

  return (
    <div
      className={cn(
        'relative w-[220px] max-w-[calc(100vw-4rem)] bg-white text-left text-slate-950',
        className,
      )}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Close search result"
          title="Close"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

      <div className={cn('min-w-0', onClose && 'pr-8')}>
        <p className="truncate text-[13px] font-semibold leading-5">{title}</p>
        {showAddress ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-slate-500">{location.address}</p>
        ) : null}
        {location.contactPhone || location.websiteUrl ? (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-slate-500">
            {[location.contactPhone, location.websiteUrl ? getWebsiteLabel(location.websiteUrl) : null]
              .filter(Boolean)
              .join(' / ')}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onAction}
        disabled={disabled || isPending}
        className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {isPending ? pendingLabel : actionLabel}
      </button>
    </div>
  );
}
