import apiClient from './client'

export const telemetryApi = {
  upload: (file: File, workoutId: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('workout_id', workoutId)
    return apiClient
      .post('/telemetry/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },

  getStatus: (taskId: string) =>
    apiClient.get(`/telemetry/status/${taskId}`).then((r) => r.data),

  getWorkoutTelemetry: (workoutId: string) =>
    apiClient.get(`/telemetry/workout/${workoutId}`).then((r) => r.data as Record<string, unknown> | null),

  updateTelemetryNotes: (workoutId: string, data: { rpe: number | null; comment: string | null }) =>
    apiClient.patch(`/telemetry/workout/${workoutId}/notes`, data).then((r) => r.data),

  manualTelemetry: (data: unknown) => apiClient.post('/telemetry/manual', data).then((r) => r.data),

  createMetric: (data: unknown) => apiClient.post('/metrics', data).then((r) => r.data),
  getTodayMetric: () => apiClient.get('/metrics/today').then((r) => r.data),
}
