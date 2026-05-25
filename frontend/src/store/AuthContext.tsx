import React, { createContext, useContext, useState } from 'react'

interface AuthUser {
  id: string
  email: string
  full_name: string | null
  role: string
  token: string
}

interface AuthContextValue {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('auth_user')
    return stored ? JSON.parse(stored) : null
  })

  const handleSetUser = (u: AuthUser | null) => {
    setUser(u)
    if (u) localStorage.setItem('auth_user', JSON.stringify(u))
    else localStorage.removeItem('auth_user')
  }

  const logout = () => handleSetUser(null)

  return (
    <AuthContext.Provider value={{ user, setUser: handleSetUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
