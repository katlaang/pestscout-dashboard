import { create } from 'zustand'

export type SessionConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline'

interface SessionConnectionState {
  status: SessionConnectionStatus
  message: string | null
  setConnectionState: (status: SessionConnectionStatus, message?: string | null) => void
  resetConnectionState: () => void
}

export const useSessionConnectionStore = create<SessionConnectionState>((set) => ({
  status: 'idle',
  message: null,
  setConnectionState: (status, message = null) => set({ status, message }),
  resetConnectionState: () => set({ status: 'idle', message: null }),
}))
