import { useMutation } from '@tanstack/react-query'
import { getBrokerClassification, getPropertyClassification, getPropertyInventory, type PropertyClassificationType } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'
import { apiRequest } from '@/lib/queryClient'
import { isDemoModeRequested } from '@/lib/demoApi'
import { PropertyClassificationControl } from './PropertyClassificationControl'

export function PropertyTypePicker({prospect, disabled, onSaved}: {prospect: Prospect; disabled?: boolean; onSaved: (saved: Prospect) => void}) {
  const current = getPropertyClassification(prospect)
  const broker = getBrokerClassification(prospect)
  const imported = getPropertyInventory(prospect)
  const mutation = useMutation({
    mutationFn: async (propertyClassification: PropertyClassificationType | null) => {
      if (isDemoModeRequested()) {
        const aiMetadata = {...(prospect.aiMetadata || {})} as Record<string, unknown>
        if (propertyClassification === null) delete aiMetadata.propertyClassification
        else aiMetadata.propertyClassification = {classification: propertyClassification, source:'broker', reviewedAt:new Date().toISOString(), reviewedBy:'demo-user'}
        return {...prospect, aiMetadata}
      }
      const response = await apiRequest('PATCH', `/api/prospects/${prospect.id}`, {propertyClassification})
      const saved = await response.json() as Prospect
      if (saved.id !== prospect.id) throw new Error('Unexpected save response')
      return saved
    },
    onSuccess: onSaved,
  })
  return <PropertyClassificationControl value={current} onChange={value => mutation.mutate(value)}
    disabled={disabled} busy={mutation.isPending} status={mutation.status}
    sourceLabel={broker ? 'Map correction' : imported ? 'Imported research' : 'Not classified'}
    resetLabel={broker ? imported ? 'Use imported type' : 'Clear correction' : undefined} />
}
