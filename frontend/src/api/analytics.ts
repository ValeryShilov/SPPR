import apiClient from './client'

export const analyticsApi = {
  getLoad: (athleteId: string, params?: { date_from?: string; date_to?: string }) =>
    apiClient.get(`/analytics/load/${athleteId}`, { params }).then((r) => r.data),

  getPlanFact: (athleteId: string) =>
    apiClient.get(`/analytics/plan-fact/${athleteId}`).then((r) => r.data),

  getAlerts: (athleteId: string) =>
    apiClient.get(`/analytics/alerts/${athleteId}`).then((r) => r.data),

  resolveAlert: (alertId: string) =>
    apiClient.put(`/analytics/alerts/${alertId}/resolve`).then((r) => r.data),

  getGroupSummary: (groupId: string) =>
    apiClient.get(`/analytics/group-summary/${groupId}`).then((r) => r.data),
}
