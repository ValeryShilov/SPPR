import apiClient from './client'

export const athletesApi = {
  list: () => apiClient.get('/athletes').then((r) => r.data),
  me: () => apiClient.get('/athletes/me').then((r) => r.data),
  get: (id: string) => apiClient.get(`/athletes/${id}`).then((r) => r.data),
  update: (id: string, data: unknown) => apiClient.put(`/athletes/${id}`, data).then((r) => r.data),

  getZones: (id: string) => apiClient.get(`/athletes/${id}/zones`).then((r) => r.data),
  getHistory: (id: string, params?: { date_from?: string; date_to?: string }) =>
    apiClient.get(`/athletes/${id}/history`, { params }).then((r) => r.data),

  getMarkers: (id: string) => apiClient.get(`/athletes/${id}/markers`).then((r) => r.data),
  addMarker: (id: string, data: unknown) =>
    apiClient.post(`/athletes/${id}/markers`, data).then((r) => r.data),
  updateMarker: (markerId: string, data: unknown) =>
    apiClient.put(`/markers/${markerId}`, data).then((r) => r.data),
}
