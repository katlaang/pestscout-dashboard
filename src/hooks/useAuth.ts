import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LoginResponse, UserDto } from '@/types'
import { authApi } from '@/services/api'
import { AUTH_STORE_KEY, clearStoredAuth, getStoredRefreshToken, storeAuthTokens } from '@/utils/authStorage'

interface AuthState {
  user: UserDto | null
  token: string | null
  refreshToken: string | null
  tokenExpiresAt: number | null   // epoch ms
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
          const msg = err?.response?.data?.message ?? 'Invalid email or password'
          set({ error: msg, isLoading: false })
        }
      },

      logout: (reason?: string) => {
        clearStoredAuth()
        set({ user: null, token: null, refreshToken: null, tokenExpiresAt: null })
        // Navigate happens in the caller (IdleTimer or interceptor) so we just clear state here
        const url = reason ? `/login?reason=${reason}` : '/login'
        window.location.href = url
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
      }),
    }
  )
)
