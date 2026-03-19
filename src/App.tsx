import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import AppLayout from '@/components/layout/AppLayout'
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
import { useIdleTimer } from '@/hooks/useidletimer'
import { useAuthStore } from '@/hooks/useAuth'
import { setAppNavigate } from '@/utils/navigation'

// Wraps protected routes and activates the idle timer
function AuthenticatedApp() {
  useIdleTimer()
  return <AppLayout />
}

// Scouts land on /sessions; everyone else lands on the dashboard
function RootRedirect() {
  const { user } = useAuthStore()
  if (user?.role === 'SCOUT') return <Navigate to="/sessions" replace />
  return <DashboardPage />
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
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AuthenticatedApp />
            </ProtectedRoute>
          }
        >
          <Route index element={<RootRedirect />} />
          <Route path="farms" element={<FarmsPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="sessions/:sessionId" element={<SessionDetailPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<Navigate to="/profile" replace />} />
          <Route path="admin" element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
