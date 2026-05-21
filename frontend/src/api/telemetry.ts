import apiClient from './client'

export const telemetryApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient
      .post('/telemetry/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
  getStatus: (taskId: string) =>
    apiClient.get(`/telemetry/status/${taskId}`).then((r) => r.data),

  createMetric: (data: unknown) => apiClient.post('/metrics', data).then((r) => r.data),
  getTodayMetric: () => apiClient.get('/metrics/today').then((r) => r.data),
}
