import { Database, Layers3, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { MarketMemoryAnchor } from '@/lib/currentProjectsMarketMemory'

export type MarketMemoryLayer = 'existing' | 'market_memory' | 'review'

type Props = {
  anchors: MarketMemoryAnchor[]
  visibleLayers: Set<MarketMemoryLayer>
  onOpenPreview: () => void
  onToggleLayer: (layer: MarketMemoryLayer) => void
  onClear: () => void
}

const LAYERS: Array<{ key: MarketMemoryLayer; label: string; color: string }> = [
  { key: 'existing', label: 'Existing matches', color: '#0F766E' },
  { key: 'market_memory', label: 'Market memory', color: '#2563EB' },
  { key: 'review', label: 'Needs review', color: '#D97706' },
]

export function MarketMemoryLayerControl({ anchors, visibleLayers, onOpenPreview, onToggleLayer, onClear }: Props) {
  if (anchors.length === 0) {
    return (
      <Button type="button" variant="outline" className="bg-white shadow-lg" onClick={onOpenPreview}>
        <Database className="h-4 w-4 text-blue-700" />
        Brokerage memory
      </Button>
    )
  }

  const pendingCount = anchors.filter((anchor) => anchor.persistence?.state === 'pending').length

  return (
    <div className="w-64 rounded-lg border border-slate-200 bg-white/95 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Layers3 className="h-4 w-4 text-blue-700" />
            Brokerage memory
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {anchors.length} server-backed properties{pendingCount ? ` · ${pendingCount} awaiting review` : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onOpenPreview} aria-label="Load a different brokerage memory file" title="Load a different file">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2 px-3 py-3">
        {LAYERS.map((layer) => {
          const count = anchors.filter((anchor) => anchor.previewLayer === layer.key).length
          return (
            <label key={layer.key} className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-700">
              <Checkbox
                checked={visibleLayers.has(layer.key)}
                onCheckedChange={() => onToggleLayer(layer.key)}
                aria-label={`Show ${layer.label}`}
              />
              <span className="h-2.5 w-2.5 rounded-full border border-white shadow" style={{ backgroundColor: layer.color }} />
              <span className="flex-1">{layer.label}</span>
              <span className="tabular-nums text-slate-500">{count}</span>
            </label>
          )
        })}
      </div>
      <div className="border-t border-slate-200 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-full text-xs text-slate-600" onClick={onClear}>Hide all memory layers</Button>
      </div>
    </div>
  )
}
