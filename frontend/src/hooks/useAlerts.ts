import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../api/analytics'

export function useAlerts(athleteId: string) {
  return useQuery({
    queryKey: ['alerts', athleteId],
    queryFn: () => analyticsApi.getAlerts(athleteId),
    enabled: !!athleteId,
  })
}
