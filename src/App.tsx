import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import AppLayout from '@/components/layout/AppLayout'
import FarmScopedLayout from '@/components/layout/FarmScopedLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import ResetPasswordPage from '@/pages/resetpasswordpage'
import DashboardPage from '@/pages/DashboardPage'
import FarmsPage from '@/pages/FarmsPage'
import SessionsPage from '@/pages/SessionsPage'
import SessionDetailPage from '@/pages/SessionDetailPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import HeatmapPage from '@/pages/HeatmapPage'
import AlertsPage from '@/pages/AlertsPage'
import ProfilePage from '@/pages/ProfilePage'
import SuperAdminPage from '@/pages/SuperAdminPage'
import { useAuthStore, getPostLoginRedirect } from '@/hooks/useAuth'
import { setAppNavigate } from '@/utils/navigation'

// IdleSessionManager (and its useIdleTimer hook) live inside AppLayout,
// so both layout wrappers below get idle tracking automatically.

function AuthenticatedApp() {
  return <AppLayout />
}

function FarmScopedAuthenticatedApp() {
  return <FarmScopedLayout />
}

function RootRedirect() {
  const { user, farms } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={getPostLoginRedirect(user, farms)} replace />
}

function NavigationBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    setAppNavigate(navigate)
    return () => setAppNavigate(null)
  }, [navigate])

  return null
}

export default function App() {
  return (
    <HashRouter>
      <NavigationBridge />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontSize: 13,
            border: '0.5px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Non-farm-scoped protected routes — layout via AppLayout */}
        <Route element={<ProtectedRoute><AuthenticatedApp /></ProtectedRoute>}>
          <Route path="/farms" element={<FarmsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
          <Route path="/admin" element={<SuperAdminPage />} />
          {/* Flat routes for SUPER_ADMIN who has no single farm context */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/heatmap" element={<HeatmapPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
        </Route>

        {/* Farm-scoped routes — layout via FarmScopedLayout > AppLayout */}
        <Route path="/:farmSlug" element={<ProtectedRoute><FarmScopedAuthenticatedApp /></ProtectedRoute>}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>

        <Route path="/" element={<ProtectedRoute><RootRedirect /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/farms" replace />} />
      </Routes>
    </HashRouter>
  )
}
