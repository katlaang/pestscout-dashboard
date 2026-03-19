import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './useAuth'
import { authApi, forceLogout, isForcedSessionErrorCode } from '@/services/api'
import { sessionEventStream } from '@/services/sessionStream'
import { getClientSessionId, hasClientSessionId } from '@/utils/clientSession'
import { getSharedRefreshToken, getStoredRefreshToken } from '@/utils/authStorage'

export function useSessionBootstrap() {
  const {
    user,
    token,
    refreshToken,
    completeAuth,
    refreshSession,
    updateUser,
  } = useAuthStore()
  const [ready, setReady] = useState(false)
  const initialHadTabId = useRef(hasClientSessionId())
  const claimAttempted = useRef(false)
  const clientSessionId = getClientSessionId()

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        if (!initialHadTabId.current && !claimAttempted.current) {
          const sharedRefreshToken = getSharedRefreshToken()
          if (sharedRefreshToken) {
            claimAttempted.current = true
            await completeAuth(await authApi.claimSession(sharedRefreshToken))
          }
        } else if (!token) {
          const storedRefreshToken = refreshToken ?? getStoredRefreshToken()
          if (storedRefreshToken) {
            await refreshSession(storedRefreshToken)
          }
        }

        if (!user && useAuthStore.getState().token) {
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
  }, [completeAuth, refreshSession, refreshToken, token, updateUser, user])

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

  return { ready }
}
