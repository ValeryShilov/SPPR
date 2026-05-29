import apiClient from './client'

export const plansApi = {
  listTemplates: () => apiClient.get('/templates').then((r) => r.data),
  createTemplate: (data: unknown) => apiClient.post('/templates', data).then((r) => r.data),
  getTemplate: (id: string) => apiClient.get(`/templates/${id}`).then((r) => r.data),
  updateTemplate: (id: string, data: unknown) =>
    apiClient.put(`/templates/${id}`, data).then((r) => r.data),
  adaptTemplate: (id: string) => apiClient.post(`/templates/${id}/adapt`).then((r) => r.data),
  adaptTemplateSync: (id: string) => apiClient.post(`/templates/${id}/adapt-sync`).then((r) => r.data),
  getMatrix: (id: string) => apiClient.get(`/templates/${id}/matrix`).then((r) => r.data),
  getGroupMembers: (id: string) => apiClient.get(`/templates/${id}/group-members`).then((r) => r.data),
  getAthleteZones: (id: string) => apiClient.get(`/templates/${id}/athlete-zones`).then((r) => r.data),
  getTemplateAlerts: (id: string) => apiClient.get(`/templates/${id}/alerts`).then((r) => r.data),
  getWeekConflicts: (id: string, weekStart: string) =>
    apiClient.get(`/templates/${id}/week-conflicts?week_start=${weekStart}`).then((r) => r.data),
  approveAll: (id: string, weekStart?: string) =>
    apiClient.post(`/templates/${id}/approve-all${weekStart ? `?week_start=${weekStart}` : ''}`).then((r) => r.data),
  deleteTemplate: (id: string) => apiClient.delete(`/templates/${id}`).then((r) => r.data),

  getWorkout: (id: string) => apiClient.get(`/workouts/${id}`).then((r) => r.data),
  createWorkout: (data: unknown) => apiClient.post('/workouts', data).then((r) => r.data),
  createSelfWorkout: (data: { planned_date: string; workout_type: string | null; workout_subtype?: string | null }) =>
    apiClient.post('/workouts/self', data).then((r) => r.data),
  updateWorkout: (id: string, data: unknown) =>
    apiClient.put(`/workouts/${id}`, data).then((r) => r.data),
  deleteWorkout: (id: string) => apiClient.delete(`/workouts/${id}`).then((r) => r.data),
  deleteSelfWorkout: (id: string) => apiClient.delete(`/workouts/self/${id}`).then((r) => r.data),
  approveWorkout: (id: string) => apiClient.post(`/workouts/${id}/approve`).then((r) => r.data),

  getMyPlan: () => apiClient.get('/my-plan').then((r) => r.data),
}
