import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BrokerClassificationSchema, type MarketMemoryAnchor, type PropertyClassificationType } from '@level-cre/shared'
import { apiRequest } from '@/lib/queryClient'
import { PropertyClassificationControl } from '@/features/map/PropertyClassificationControl'
import { propertyMemoryKeys, type PropertyMemoryMapResponse } from './api'
import { applyMemoryClassification, memoryClassificationTarget, memoryClassificationUrl, readMemoryClassificationResponse } from './classification'

export function MemoryClassificationPicker({anchor, onSaved}: {anchor:MarketMemoryAnchor; onSaved:(anchor:MarketMemoryAnchor)=>void}) {
  const queryClient = useQueryClient()
  const target = memoryClassificationTarget(anchor)
  const correction = BrokerClassificationSchema.safeParse(anchor.propertyClassification)
  const current = correction.success ? correction.data.classification : 'unknown'
  const mutation = useMutation({
    mutationFn: async (propertyClassification: PropertyClassificationType | null) => {
      if (!target) throw new Error('This property is not available for classification')
      const response = await apiRequest('PATCH', memoryClassificationUrl(target), {propertyClassification})
      return {target, classification:readMemoryClassificationResponse(await response.json(), target)}
    },
    onSuccess: ({target:savedTarget, classification}) => {
      queryClient.setQueryData<PropertyMemoryMapResponse>(propertyMemoryKeys.map(), previous => previous ? {
        ...previous, anchors:previous.anchors.map(item => applyMemoryClassification(item, savedTarget, classification)),
      } : previous)
      onSaved(applyMemoryClassification(anchor, savedTarget, classification))
      void queryClient.invalidateQueries({queryKey:propertyMemoryKeys.all})
      void queryClient.invalidateQueries({queryKey:['/api/intel/dossiers']})
    },
  })
  return <PropertyClassificationControl value={current} onChange={value => mutation.mutate(value)}
    busy={mutation.isPending} disabled={!target} status={mutation.status}
    sourceLabel={correction.success ? 'Map correction' : 'Not classified'}
    resetLabel={correction.success ? 'Clear correction' : undefined}
    unavailableReason={!target ? anchor.persistence?.state === 'local_preview' ? 'Import this research file to save a type.' : 'Open the linked profile to update its type.' : undefined} />
}
