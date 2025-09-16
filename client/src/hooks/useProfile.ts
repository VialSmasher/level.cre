import { useQuery, useMutation } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import type { Profile, UpdateProfile } from '@shared/schema'

export function useProfile() {
  const { data: profile, isLoading, error } = useQuery<Profile | null>({
    queryKey: ['/api/profile'],
    retry: false,
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: UpdateProfile) => {
      const response = await apiRequest('PATCH', '/api/profile', updates)
      return response.json()
    },
    onSuccess: () => {
      // Invalidate profile query to refetch data
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] })
      // Broadcast submarket change event for real-time updates
      window.dispatchEvent(new CustomEvent('submarketChange'))
    },
  })

  const updateSubmarkets = async (submarkets: string[]) => {
    // Optimistic update
    queryClient.setQueryData(['/api/profile'], (old: Profile | null) => 
      old ? { ...old, submarkets } : old
    )
    
    // Also sync with database submarkets for map usage
    try {
      // Create database submarkets for each profile submarket if they don't exist
      for (const submarketName of submarkets) {
        const response = await fetch('/api/submarkets')
        if (response.ok) {
          const dbSubmarkets = await response.json()
          const exists = dbSubmarkets.some((s: any) => s.name === submarketName)
          
          if (!exists) {
            // Create new submarket in database
            await apiRequest('POST', '/api/submarkets', {
              name: submarketName,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`, // Random color
              isActive: true
            })
          }
        }
      }
      
      // Invalidate submarkets query to refresh map dropdown
      queryClient.invalidateQueries({ queryKey: ['/api/submarkets'] })
    } catch (error) {
      console.error('Error syncing submarkets to database:', error)
    }
    
    return updateProfileMutation.mutate({ submarkets })
  }

  return {
    profile,
    isLoading,
    error,
    hasProfile: !!profile,
    updateSubmarkets,
    isUpdating: updateProfileMutation.isPending,
  }
}