import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserDto } from '@/types'
import { authApi } from '@/services/api'

interface AuthState {
  user: UserDto | null
  token: string | null
  refreshToken: string | null
  tokenExpiresAt: number | null   // epoch ms
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: (reason?: string) => void
  updateUser: (user: UserDto) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const res = await authApi.login({ email, password })
          const expiresAt = Date.now() + res.expiresIn * 1000
          localStorage.setItem('access_token', res.token)
          localStorage.setItem('refresh_token', res.refreshToken)
          localStorage.setItem('token_expires_at', String(expiresAt))
          set({
            user: res.user,
            token: res.token,
            refreshToken: res.refreshToken,
            tokenExpiresAt: expiresAt,
            isLoading: false,
          })
        } catch (err: any) {
          const msg = err?.response?.data?.message ?? 'Invalid email or password'
          set({ error: msg, isLoading: false })
        }
      },

      logout: (reason?: string) => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('token_expires_at')
        set({ user: null, token: null, refreshToken: null, tokenExpiresAt: null })
        // Navigate happens in the caller (IdleTimer or interceptor) so we just clear state here
        const url = reason ? `/login?reason=${reason}` : '/login'
        window.location.href = url
      },

      updateUser: (user: UserDto) => set({ user }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'pestscout-auth',
      partialize: state => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
      }),
    }
  )
)