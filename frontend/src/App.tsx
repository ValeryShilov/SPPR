import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AthleteCabinet from './pages/AthleteCabinet'
import AthleteProfile from './pages/AthleteProfile'
import CoachDashboard from './pages/CoachDashboard'
import LoadAnalytics from './pages/LoadAnalytics'
import Login from './pages/Login'
import Matrix from './pages/Matrix'
import TemplateEditor from './pages/TemplateEditor'

function PrivateRoute({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { user } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              {user?.role === 'coach' ? <CoachDashboard /> : <AthleteCabinet />}
            </PrivateRoute>
          }
        />
        <Route
          path="/athletes/:id"
          element={
            <PrivateRoute role="coach">
              <AthleteProfile />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates/:id"
          element={
            <PrivateRoute role="coach">
              <TemplateEditor />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates/:id/matrix"
          element={
            <PrivateRoute role="coach">
              <Matrix />
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
