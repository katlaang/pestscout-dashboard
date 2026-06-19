import type { LoginResponse } from '@/types'
import { getClientSessionId } from './clientSession'

export const AUTH_STORE_KEY = 'pestscout-auth'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'
const SHARED_REFRESH_TOKEN_KEY = 'shared_refresh_token'
export const SHARED_REFRESH_OWNER_KEY = 'shared_refresh_owner'

export function getStoredAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getStoredTokenExpiresAt(): number | null {
  const raw = sessionStorage.getItem(TOKEN_EXPIRES_AT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function getSharedRefreshToken(): string | null {
  return localStorage.getItem(SHARED_REFRESH_TOKEN_KEY)
}

export function getSharedRefreshOwner(): string | null {
  return localStorage.getItem(SHARED_REFRESH_OWNER_KEY)
}

export function storeAuthTokens(response: LoginResponse, clientSessionId = getClientSessionId()): number {
  const expiresAt = Date.now() + response.expiresIn * 1000
  sessionStorage.setItem(ACCESS_TOKEN_KEY, response.token)
  sessionStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken)
  sessionStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt))
  localStorage.setItem(SHARED_REFRESH_TOKEN_KEY, response.refreshToken)
  localStorage.setItem(SHARED_REFRESH_OWNER_KEY, clientSessionId)
  return expiresAt
}

export function clearStoredAuth(options?: { clearSharedIfOwned?: boolean }) {
  const clearSharedIfOwned = options?.clearSharedIfOwned ?? true
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
  sessionStorage.removeItem(AUTH_STORE_KEY)

  if (clearSharedIfOwned && localStorage.getItem(SHARED_REFRESH_OWNER_KEY) === getClientSessionId()) {
    localStorage.removeItem(SHARED_REFRESH_TOKEN_KEY)
    localStorage.removeItem(SHARED_REFRESH_OWNER_KEY)
  }
}
