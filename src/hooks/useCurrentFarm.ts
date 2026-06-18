import { create } from 'zustand'

interface CurrentFarmState {
  farmId: string | null
  farmSlug: string | null
  setCurrentFarm: (farmId: string, farmSlug: string) => void
}

export const useCurrentFarmStore = create<CurrentFarmState>(set => ({
  farmId: null,
  farmSlug: null,
  setCurrentFarm: (farmId, farmSlug) => set({ farmId, farmSlug }),
}))
