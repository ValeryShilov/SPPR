import apiClient from './client'

export const plansApi = {
  listTemplates: () => apiClient.get('/templates').then((r) => r.data),
  createTemplate: (data: unknown) => apiClient.post('/templates', data).then((r) => r.data),
  getTemplate: (id: string) => apiClient.get(`/templates/${id}`).then((r) => r.data),
  updateTemplate: (id: string, data: unknown) =>
    apiClient.put(`/templates/${id}`, data).then((r) => r.data),
  adaptTemplate: (id: string) => apiClient.post(`/templates/${id}/adapt`).then((r) => r.data),
  getMatrix: (id: string) => apiClient.get(`/templates/${id}/matrix`).then((r) => r.data),
  approveAll: (id: string) => apiClient.post(`/templates/${id}/approve-all`).then((r) => r.data),

  getWorkout: (id: string) => apiClient.get(`/workouts/${id}`).then((r) => r.data),
  updateWorkout: (id: string, data: unknown) =>
    apiClient.put(`/workouts/${id}`, data).then((r) => r.data),
  approveWorkout: (id: string) => apiClient.post(`/workouts/${id}/approve`).then((r) => r.data),

  getMyPlan: () => apiClient.get('/my-plan').then((r) => r.data),
}
