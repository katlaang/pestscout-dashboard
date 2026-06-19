import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './useAuth'
import { authApi, forceLogout, isForcedSessionErrorCode } from '@/services/api'
import { sessionEventStream } from '@/services/sessionStream'
import { getClientSessionId, hasClientSessionId } from '@/utils/clientSession'
import { SHARED_REFRESH_OWNER_KEY, getSharedRefreshToken, getStoredRefreshToken } from '@/utils/authStorage'

export function useSessionBootstrap() {
  const { token, completeAuth, refreshSession, updateUser } = useAuthStore()

  // Start as ready immediately when we already have a fresh, valid session so
  // there is no "Restoring session…" flicker on a normal reload.
  const [ready, setReady] = useState(() => {
    const { token, user, tokenExpiresAt } = useAuthStore.getState()
    return !!(token && user && tokenExpiresAt != null && Date.now() < tokenExpiresAt)
  })

  const initialHadTabId = useRef(hasClientSessionId())
  const claimAttempted = useRef(false)
  const clientSessionId = getClientSessionId()

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        // Always read live state — avoids stale-closure bugs with empty dep array.
        const { token, tokenExpiresAt, refreshToken } = useAuthStore.getState()

        if (!initialHadTabId.current && !claimAttempted.current) {
          const sharedRefreshToken = getSharedRefreshToken()
          if (sharedRefreshToken) {
            claimAttempted.current = true
            await completeAuth(await authApi.claimSession(sharedRefreshToken))
          }
        } else {
          const isExpired = !token || (tokenExpiresAt != null && Date.now() >= tokenExpiresAt)
          if (isExpired) {
            const storedRefreshToken = refreshToken ?? getStoredRefreshToken()
            if (storedRefreshToken) {
              await refreshSession(storedRefreshToken)
            } else {
              if (!cancelled) forceLogout('session_expired')
              return
            }
          }
        }

        const state = useAuthStore.getState()
        if (!state.user && state.token) {
          updateUser(await authApi.me())
        }

        if (!cancelled) {
          setReady(true)
        }
      } catch (error: any) {
        if (cancelled) return

        const errorCode = error?.response?.data?.errorCode
        forceLogout(isForcedSessionErrorCode(errorCode) ? 'session_replaced' : 'session_expired')
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready || !token) {
      sessionEventStream.stop()
      return
    }

    sessionEventStream.start({
      token,
      clientSessionId,
      onSessionReplaced: () => forceLogout('session_replaced'),
    })

    return () => {
      sessionEventStream.stop()
    }
  }, [clientSessionId, ready, token])

  // Immediately log out when another tab claims the shared session.
  // The storage event fires synchronously in all other tabs when storeAuthTokens
  // writes a new owner ID, so this is faster than waiting for the SSE event.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== SHARED_REFRESH_OWNER_KEY) return
      const previousOwner = event.oldValue
      const newOwner = event.newValue
      // Only log out if WE were the previous owner and someone else took over.
      // Without the oldValue check, a token refresh in any other tab fires this
      // and logs us out even though our session was not replaced.
      if (previousOwner === clientSessionId && newOwner && newOwner !== clientSessionId) {
        useAuthStore.getState().logout('session_replaced')
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [clientSessionId])

  return { ready }
}
