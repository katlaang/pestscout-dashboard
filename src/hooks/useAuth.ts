import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { FarmMembershipSummary, LoginResponse, UserDto } from '@/types'
import { authApi, registerForceLogoutCallback } from '@/services/api'
import { AUTH_STORE_KEY, clearStoredAuth, getStoredRefreshToken, storeAuthTokens } from '@/utils/authStorage'
import { navigateToLogin } from '@/utils/navigation'

export function getPostLoginRedirect(user: UserDto, farms: FarmMembershipSummary[]): string {
  if (user.role === 'SUPER_ADMIN') return '/admin'
  if (farms.length === 1) return `/${farms[0].slug}/dashboard`
  return '/farms'
}

interface AuthState {
  user: UserDto | null
  token: string | null
  refreshToken: string | null
  tokenExpiresAt: number | null   // epoch ms
  farms: FarmMembershipSummary[]
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  completeAuth: (response: LoginResponse) => Promise<void>
  refreshSession: (refreshTokenOverride?: string) => Promise<string>
  logout: (reason?: string) => void
  updateUser: (user: UserDto) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      farms: [],
      isLoading: false,
      error: null,

      completeAuth: async (response) => {
        const expiresAt = storeAuthTokens(response)
        set({
          token: response.token,
          refreshToken: response.refreshToken,
          tokenExpiresAt: expiresAt,
        })
        const me = await authApi.me()
        set({
          user: me,
          farms: response.farms ?? [],
          token: response.token,
          refreshToken: response.refreshToken,
          tokenExpiresAt: expiresAt,
          isLoading: false,
          error: null,
        })
      },

      refreshSession: async (refreshTokenOverride) => {
        const refreshToken = refreshTokenOverride ?? get().refreshToken ?? getStoredRefreshToken()
        if (!refreshToken) throw new Error('No refresh token available')

        const response = await authApi.refresh(refreshToken)
        const expiresAt = storeAuthTokens(response)
        set({
          token: response.token,
          refreshToken: response.refreshToken,
          tokenExpiresAt: expiresAt,
          error: null,
        })
        return response.token
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.login({ email, password })
          await get().completeAuth(res)
        } catch (err: any) {
          const data = err?.response?.data
          // Backend returns 400 when the account requires a forced password change,
          // but still includes a restricted JWT in the response body so the client
          // can call /api/auth/reset-password as an authenticated user (mode 2).
          if (data?.token && data?.user?.passwordChangeRequired) {
            await get().completeAuth(data as LoginResponse)
            return
          }
          const msg = data?.message ?? 'Invalid email or password'
          set({ error: msg, isLoading: false })
        }
      },

      logout: (reason?: string) => {
        clearStoredAuth()
        set({ user: null, token: null, refreshToken: null, tokenExpiresAt: null })
        navigateToLogin(reason)
      },

      updateUser: (user: UserDto) => set({ user }),

      clearError: () => set({ error: null }),
    }),
    {
      name: AUTH_STORE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: state => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
        farms: state.farms,
      }),
    }
  )
)

// Wire forceLogout (called from api.ts interceptors and SSE handler) through the
// store's logout so the in-memory Zustand state is cleared alongside sessionStorage.
// Without this, user/token survive in memory after clearStoredAuth(), causing
// LoginPage to redirect back to /reset-password?force=true with no JWT attached.
registerForceLogoutCallback((reason) => {
  useAuthStore.getState().logout(reason)
})
