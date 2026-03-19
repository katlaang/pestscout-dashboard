import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import SettingsPage from '@/pages/SettingsPage'
import SuperAdminPage from '@/pages/SuperAdminPage'
import { useIdleTimer } from '@/hooks/useidletimer'
import { useAuthStore } from '@/hooks/useAuth'

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

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<SuperAdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
