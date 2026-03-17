import { create } from 'zustand'

interface AlertCountState {
  count: number
  setCount: (n: number) => void
}

export const useAlertCount = create<AlertCountState>(set => ({
  count: 0,
  setCount: (count) => set({ count }),
}))
