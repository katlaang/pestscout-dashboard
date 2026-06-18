import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from './useAuth'
import { authApi, forceLogout } from '@/services/api'
import { clearStoredAuth } from '@/utils/authStorage'

const WARNING_MS = 5 * 60 * 1000   // 5 minutes idle → show "will expire in 5 min" banner
const IDLE_MS    = 10 * 60 * 1000  // 10 minutes total idle → session expires
const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

export function useIdleTimer() {
  const { user, token, refreshToken, tokenExpiresAt, refreshSession } = useAuthStore()
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [warningActive, setWarningActive] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // Schedule silent token refresh 30 s before expiry — only runs while user is active
  function scheduleRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    if (!tokenExpiresAt || !refreshToken) return

    const msUntilExpiry = tokenExpiresAt - Date.now()
    const refreshIn = msUntilExpiry - 30_000
    if (refreshIn <= 0) return

    refreshTimer.current = setTimeout(async () => {
      try {
        await refreshSession(refreshToken)
        scheduleRefresh()
      } catch {
        forceLogout('session_expired')
      }
    }, refreshIn)
  }

  function resetIdleTimer() {
    if (idleTimer.current)    clearTimeout(idleTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)
    setWarningActive(false)
    setTimedOut(false)

    // Show banner 1 min before backend timeout
    warningTimer.current = setTimeout(() => setWarningActive(true), WARNING_MS)

    // On idle: clear credentials silently — show overlay instead of auto-redirecting
    idleTimer.current = setTimeout(() => {
      setWarningActive(false)
      setTimedOut(true)
      clearStoredAuth()
      useAuthStore.setState({ user: null, token: null, refreshToken: null, tokenExpiresAt: null, farms: [] })
    }, IDLE_MS)

    scheduleRefresh()
  }

  // Ping backend to reset its lastActivityAt, then restart the local timer.
  // Used by the "Continue working" button.
  const extendSession = useCallback(async () => {
    try {
      await authApi.me()
    } catch {
      // If the call fails the 401 interceptor handles logout
    }
    resetIdleTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user || !token) return

    resetIdleTimer()

    EVENTS.forEach(event =>
      window.addEventListener(event, resetIdleTimer, { passive: true })
    )

    return () => {
      if (idleTimer.current)    clearTimeout(idleTimer.current)
      if (warningTimer.current) clearTimeout(warningTimer.current)
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      EVENTS.forEach(event =>
        window.removeEventListener(event, resetIdleTimer)
      )
    }
  }, [user, token, tokenExpiresAt, refreshToken, refreshSession])

  return { warningActive, timedOut, extendSession }
}
