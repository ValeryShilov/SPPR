import apiClient from './client'

export interface RegisterData {
  email: string
  password: string
  role?: string
  full_name?: string
}

export interface CreateAthleteData {
  email: string
  password: string
  full_name?: string
  first_name: string
  last_name: string
  birth_date: string
  gender: string
  qualification?: string
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then((r) => r.data),

  me: () => apiClient.get('/auth/me').then((r) => r.data),

  register: (data: RegisterData) =>
    apiClient.post('/auth/register', data).then((r) => r.data),

  createAthlete: (data: CreateAthleteData) =>
    apiClient.post('/auth/create-athlete', data).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }).then((r) => r.data),

  updateMe: (data: { full_name: string | null }) =>
    apiClient.patch('/auth/me', data).then((r) => r.data),

  listCoaches: (): Promise<{ id: string; email: string; full_name: string | null; role: string; is_active: boolean }[]> =>
    apiClient.get('/auth/coaches').then((r) => r.data),
}
