import { Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Component, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { athletesApi } from './api/athletes'
import { authApi } from './api/auth'
import AppFooter from './components/AppFooter'
import AppHeader from './components/AppHeader'
import { useAuth } from './hooks/useAuth'
import AthleteCabinet from './pages/AthleteCabinet'
import AthleteAnalyticsPage from './pages/AthleteAnalyticsPage'
import WorkoutHistoryPage from './pages/WorkoutHistoryPage'
import AthleteProfile from './pages/AthleteProfile'
import AthletesPage from './pages/AthletesPage'
import CoachAnalyticsPage from './pages/CoachAnalyticsPage'
import CoachDashboard from './pages/CoachDashboard'
import CoachProfilePage from './pages/CoachProfilePage'
import AthleteSelfProfile from './pages/AthleteSelfProfile'
import CreateProfilePage from './pages/CreateProfilePage'
import GroupDetail from './pages/GroupDetail'
import GroupList from './pages/GroupList'
import LoadAnalytics from './pages/LoadAnalytics'
import Login from './pages/Login'
import Matrix from './pages/Matrix'
import MetricsPage from './pages/MetricsPage'
import MyPlan from './pages/MyPlan'
import PlanningPage from './pages/PlanningPage'
import RegisterPage from './pages/RegisterPage'
import SettingsPage from './pages/SettingsPage'
import TemplateEditor from './pages/TemplateEditor'

// ─── Error boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: 'red' }}>Ошибка рендеринга</h2>
          <pre style={{ background: '#fee', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {err.message}{'\n\n'}{err.stack}
          </pre>
          <button onClick={() => this.setState({ error: null })}>Попробовать снова</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Authenticated layout ─────────────────────────────────────────────────────

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth()

  useEffect(() => {
    if (user && user.full_name === undefined) {
      authApi.me().then((me) => {
        setUser({ ...user, full_name: me.full_name ?? null })
      }).catch(() => {})
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppHeader />
      <main style={{ paddingTop: 56, flex: 1 }}>
        {children}
      </main>
      <AppFooter />
    </div>
  )
}

// ─── Private route ────────────────────────────────────────────────────────────

function PrivateRoute({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && user.role !== 'admin' && !roles.includes(user.role))
    return <Navigate to="/dashboard" replace />
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}

// ─── Athlete onboarding guard ─────────────────────────────────────────────────

function AthleteOnboardingGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { isLoading, isError } = useQuery({
    queryKey: ['athlete-me'],
    queryFn: athletesApi.me,
    enabled: user?.role === 'athlete',
    retry: false,
    staleTime: 60_000,
  })

  if (user?.role !== 'athlete') return <>{children}</>
  if (isLoading) return <Text p="xl">Загрузка...</Text>
  if (isError) return <Navigate to="/create-profile" replace />
  return <>{children}</>
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <AthleteOnboardingGuard>
                  {user?.role === 'athlete' ? <AthleteCabinet /> : <CoachDashboard />}
                </AthleteOnboardingGuard>
              </PrivateRoute>
            }
          />

          {/* Тренер */}
          <Route path="/coach-profile" element={<PrivateRoute roles={['coach']}><CoachProfilePage /></PrivateRoute>} />
          <Route path="/athletes"   element={<PrivateRoute roles={['coach']}><AthletesPage /></PrivateRoute>} />
          <Route path="/analytics"  element={<PrivateRoute roles={['coach']}><CoachAnalyticsPage /></PrivateRoute>} />
          <Route path="/settings"   element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/groups"     element={<PrivateRoute roles={['coach']}><GroupList /></PrivateRoute>} />
          <Route path="/groups/:id" element={<PrivateRoute roles={['coach']}><GroupDetail /></PrivateRoute>} />
          <Route path="/planning"   element={<PrivateRoute roles={['coach']}><PlanningPage /></PrivateRoute>} />
          <Route path="/planning/:templateId"
            element={<PrivateRoute roles={['coach']}><TemplateEditor /></PrivateRoute>} />
          <Route path="/planning/:templateId/matrix"
            element={<PrivateRoute roles={['coach']}><Matrix /></PrivateRoute>} />

          {/* Спортсмен */}
          <Route path="/create-profile" element={<PrivateRoute roles={['athlete']}><CreateProfilePage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute roles={['athlete']}><AthleteOnboardingGuard><AthleteSelfProfile /></AthleteOnboardingGuard></PrivateRoute>} />
          <Route path="/my-plan"      element={<PrivateRoute roles={['athlete']}><AthleteOnboardingGuard><MyPlan /></AthleteOnboardingGuard></PrivateRoute>} />
          <Route path="/metrics"      element={<PrivateRoute roles={['athlete']}><AthleteOnboardingGuard><MetricsPage /></AthleteOnboardingGuard></PrivateRoute>} />
          <Route path="/my-analytics" element={<PrivateRoute roles={['athlete']}><AthleteOnboardingGuard><AthleteAnalyticsPage /></AthleteOnboardingGuard></PrivateRoute>} />
          <Route path="/my-history"   element={<PrivateRoute roles={['athlete']}><AthleteOnboardingGuard><WorkoutHistoryPage /></AthleteOnboardingGuard></PrivateRoute>} />

          {/* Общие */}
          <Route path="/athletes/:id"        element={<PrivateRoute><AthleteProfile /></PrivateRoute>} />
          <Route path="/analytics/:athleteId" element={<PrivateRoute><LoadAnalytics /></PrivateRoute>} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
