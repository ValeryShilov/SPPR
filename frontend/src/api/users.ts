import apiClient from './client'

export const usersApi = {
  getMe: () =>
    apiClient.get('/users/me').then((r) => r.data),

  updateMe: (data: { full_name?: string | null }) =>
    apiClient.patch('/users/me', data).then((r) => r.data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    apiClient.post('/users/me/change-password', data).then((r) => r.data),
}
