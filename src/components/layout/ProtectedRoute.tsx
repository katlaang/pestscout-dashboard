import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/hooks/useAuth'
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, token } = useAuthStore()
  const { ready } = useSessionBootstrap()

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#9ca3af', fontSize: 13 }}>
        Restoring session...
      </div>
    )
  }

  if (!user || !token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
