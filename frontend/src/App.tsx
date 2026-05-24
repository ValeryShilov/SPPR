import { Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppFooter from './components/AppFooter'
import AppHeader from './components/AppHeader'
import { useAuth } from './hooks/useAuth'
import AthleteCabinet from './pages/AthleteCabinet'
import AthleteProfile from './pages/AthleteProfile'
import AthletesPage from './pages/AthletesPage'
import CoachAnalyticsPage from './pages/CoachAnalyticsPage'
import CoachDashboard from './pages/CoachDashboard'
import GroupDetail from './pages/GroupDetail'
import GroupList from './pages/GroupList'
import LoadAnalytics from './pages/LoadAnalytics'
import Login from './pages/Login'
import Matrix from './pages/Matrix'
import MetricsPage from './pages/MetricsPage'
import MyPlan from './pages/MyPlan'
import PlanningPage from './pages/PlanningPage'
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                {user?.role === 'athlete' ? <AthleteCabinet /> : <CoachDashboard />}
              </PrivateRoute>
            }
          />

          {/* Тренер */}
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
          <Route path="/my-plan" element={<PrivateRoute roles={['athlete']}><MyPlan /></PrivateRoute>} />
          <Route path="/metrics" element={<PrivateRoute roles={['athlete']}><MetricsPage /></PrivateRoute>} />

          {/* Общие */}
          <Route path="/athletes/:id"        element={<PrivateRoute><AthleteProfile /></PrivateRoute>} />
          <Route path="/analytics/:athleteId" element={<PrivateRoute><LoadAnalytics /></PrivateRoute>} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
