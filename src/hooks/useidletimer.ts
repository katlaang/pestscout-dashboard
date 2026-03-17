import { useEffect, useRef } from 'react'
import { useAuthStore } from './useAuth'

const IDLE_MS = 5 * 60 * 1000   // 5 minutes — matches backend idle timeout
const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

/**
 * Attaches global activity listeners and force-logs out after IDLE_MS of inactivity.
 * Only active when user is authenticated.
 * Silent refresh is only attempted while the user is active (via resetIdleTimer).
 */
export function useIdleTimer() {
  const { user, logout, token, refreshToken, tokenExpiresAt } = useAuthStore()
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Schedule a silent token refresh just before expiry, but only if user is active
  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    if (!tokenExpiresAt || !refreshToken) return

    const msUntilExpiry = tokenExpiresAt - Date.now()
    // Refresh 30s before expiry (if expiry is in the future)
    const refreshIn = msUntilExpiry - 30_000
    if (refreshIn <= 0) return

    refreshTimer.current = setTimeout(async () => {
      try {
        const { default: axios } = await import('axios')
        const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
        const res = await axios.post(`${baseURL}/api/auth/refresh`, {
          refreshToken,
        })
        const expiresAt = Date.now() + res.data.expiresIn * 1000
        localStorage.setItem('access_token', res.data.token)
        localStorage.setItem('refresh_token', res.data.refreshToken)
        localStorage.setItem('token_expires_at', String(expiresAt))
        useAuthStore.setState({
          token: res.data.token,
          refreshToken: res.data.refreshToken,
          tokenExpiresAt: expiresAt,
        })
        scheduleRefresh() // reschedule for the new token
      } catch {
        // Refresh failed while active — force logout
        logout('session_expired')
      }
    }, refreshIn)
  }

  function resetIdleTimer() {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      logout('idle')
    }, IDLE_MS)

    // Each activity event reschedules the refresh too (user is clearly active)
    scheduleRefresh()
  }

  useEffect(() => {
    if (!user || !token) return

    // Start idle timer immediately
    resetIdleTimer()

    // Attach activity listeners
    EVENTS.forEach(event =>
      window.addEventListener(event, resetIdleTimer, { passive: true })
    )

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      EVENTS.forEach(event =>
        window.removeEventListener(event, resetIdleTimer)
      )
    }
  }, [user, token, tokenExpiresAt, refreshToken]) // restart when auth state changes

  // Intentionally not returning anything — this hook is purely for side effects
}