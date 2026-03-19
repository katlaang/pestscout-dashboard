import type { CustomSpecies, CustomSpeciesCategory, SpeciesCode } from '@/types'

export const OTHER_CODE_BY_CATEGORY: Record<CustomSpeciesCategory, SpeciesCode> = {
  PEST: 'PEST_OTHER',
  DISEASE: 'DISEASE_OTHER',
  BENEFICIAL: 'BENEFICIAL_OTHER',
}

export function normalizeCustomSpeciesName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function customSpeciesDuplicateKey(value: string) {
  return normalizeCustomSpeciesName(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
}

export function mergeCustomSpecies(existing: CustomSpecies[], created: CustomSpecies[]) {
  const byId = new Map<string, CustomSpecies>()
  existing.forEach(item => byId.set(item.id, item))
  created.forEach(item => byId.set(item.id, item))
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function ensureOtherCode(selectedCodes: SpeciesCode[], category: CustomSpeciesCategory) {
  const otherCode = OTHER_CODE_BY_CATEGORY[category]
  return selectedCodes.includes(otherCode)
    ? selectedCodes
    : [...selectedCodes, otherCode]
}
