import apiClient from './client'

export const groupsApi = {
  list: () => apiClient.get('/groups').then((r) => r.data),
  create: (data: unknown) => apiClient.post('/groups', data).then((r) => r.data),
  get: (id: string) => apiClient.get(`/groups/${id}`).then((r) => r.data),
  addMember: (groupId: string, data: unknown) =>
    apiClient.post(`/groups/${groupId}/members`, data).then((r) => r.data),
  removeMember: (groupId: string, athleteId: string) =>
    apiClient.delete(`/groups/${groupId}/members/${athleteId}`),
}
