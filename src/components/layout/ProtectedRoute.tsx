import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/hooks/useAuth'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, token } = useAuthStore()

  if (!user || !token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
