import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { useAuth } from './hooks/useAuth'
import AthleteCabinet from './pages/AthleteCabinet'
import AthleteProfile from './pages/AthleteProfile'
import CoachDashboard from './pages/CoachDashboard'
import GroupDetail from './pages/GroupDetail'
import GroupList from './pages/GroupList'
import LoadAnalytics from './pages/LoadAnalytics'
import Login from './pages/Login'
import Matrix from './pages/Matrix'
import MetricsPage from './pages/MetricsPage'
import MyPlan from './pages/MyPlan'
import PlanningPage from './pages/PlanningPage'
import TemplateEditor from './pages/TemplateEditor'

function PrivateRoute({
  children,
  roles,
}: {
  children: JSX.Element
  roles?: string[]
}) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && user.role !== 'admin' && !roles.includes(user.role))
    return <Navigate to="/dashboard" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
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

        {/* Тренер + Admin */}
        <Route
          path="/groups"
          element={
            <PrivateRoute roles={['coach']}>
              <GroupList />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <PrivateRoute roles={['coach']}>
              <GroupDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/planning"
          element={
            <PrivateRoute roles={['coach']}>
              <PlanningPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/planning/:templateId"
          element={
            <PrivateRoute roles={['coach']}>
              <TemplateEditor />
            </PrivateRoute>
          }
        />
        <Route
          path="/planning/:templateId/matrix"
          element={
            <PrivateRoute roles={['coach']}>
              <Matrix />
            </PrivateRoute>
          }
        />

        {/* Спортсмен */}
        <Route
          path="/my-plan"
          element={
            <PrivateRoute roles={['athlete']}>
              <MyPlan />
            </PrivateRoute>
          }
        />
        <Route
          path="/metrics"
          element={
            <PrivateRoute roles={['athlete']}>
              <MetricsPage />
            </PrivateRoute>
          }
        />

        {/* Общие */}
        <Route
          path="/athletes/:id"
          element={
            <PrivateRoute>
              <AthleteProfile />
            </PrivateRoute>
          }
        />
        <Route
          path="/analytics/:athleteId"
          element={
            <PrivateRoute>
              <LoadAnalytics />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
