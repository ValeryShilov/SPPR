import { useAuthContext } from '../store/AuthContext'

export function useAuth() {
  return useAuthContext()
}
