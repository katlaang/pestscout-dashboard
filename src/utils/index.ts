import type { SeverityLevel, SpeciesCode, SessionStatus } from '@/types'

type SupportedValuesIntl = typeof Intl & {
  supportedValuesOf?: (key: string) => string[]
}

// ─── Severity ────────────────────────────────────────────────────────────────

export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  ZERO:      '#e9f5ee',
  LOW:       '#a7dcbc',
  MODERATE:  '#71c49a',
  HIGH:      '#f59e0b',
  VERY_HIGH: '#e05252',
  EMERGENCY: '#9b1c1c',
}

export const SEVERITY_TEXT_COLORS: Record<SeverityLevel, string> = {
  ZERO:      '#164530',
  LOW:       '#164530',
  MODERATE:  '#164530',
  HIGH:      '#92400e',
  VERY_HIGH: '#7f1d1d',
  EMERGENCY: '#fca5a5',
}

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  ZERO:      'Zero',
  LOW:       'Low (1–5)',
  MODERATE:  'Moderate (6–10)',
  HIGH:      'High (11–20)',
  VERY_HIGH: 'Very high (21–30)',
  EMERGENCY: 'Emergency (31+)',
}

export const SEVERITY_ORDER: SeverityLevel[] = [
  'ZERO', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'EMERGENCY'
]

export function severityFromCount(count: number): SeverityLevel {
  if (count === 0) return 'ZERO'
  if (count <= 5) return 'LOW'
  if (count <= 10) return 'MODERATE'
  if (count <= 20) return 'HIGH'
  if (count <= 30) return 'VERY_HIGH'
  return 'EMERGENCY'
}

// ─── Species ─────────────────────────────────────────────────────────────────

export const SPECIES_LABELS: Record<SpeciesCode, string> = {
  THRIPS:            'Thrips',
  RED_SPIDER_MITE:   'Red spider mite',
  WHITEFLIES:        'Whiteflies',
  MEALYBUGS:         'Mealybugs',
  CATERPILLARS:      'Caterpillars',
  FALSE_CODLING_MOTH:'False codling moth',
  PEST_OTHER:        'Other pest',
  DOWNY_MILDEW:      'Downy mildew',
  POWDERY_MILDEW:    'Powdery mildew',
  BOTRYTIS:          'Botrytis',
  VERTICILLIUM:      'Verticillium',
  BACTERIAL_WILT:    'Bacterial wilt',
  DISEASE_OTHER:     'Other disease',
  BENEFICIAL_PP:     'Beneficial (PP)',
  BENEFICIAL_OTHER:  'Other beneficial insect',
}

// ─── Session status ───────────────────────────────────────────────────────────

export const SESSION_STATUS_BADGE: Record<SessionStatus, { label: string; cls: string }> = {
  DRAFT:       { label: 'Draft',       cls: 'badge-yellow' },
  NEW:         { label: 'New',         cls: 'badge-green' },
  IN_PROGRESS: { label: 'In progress', cls: 'badge-orange' },
  SUBMITTED:   { label: 'Submitted',   cls: 'badge-green' },
  REOPENED:    { label: 'Reopened',    cls: 'badge-striped' },
  COMPLETED:   { label: 'Completed',   cls: 'badge-green' },
  INCOMPLETE:  { label: 'Incomplete',  cls: 'badge-orange' },
  CANCELLED:   { label: 'Cancelled',   cls: 'badge-gray' },
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function formatName(firstName?: string, lastName?: string, fallback = 'Unknown'): string {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim()
  return name || fallback
}

function padDateTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDateInput(date = new Date()): string {
  return `${date.getFullYear()}-${padDateTimePart(date.getMonth() + 1)}-${padDateTimePart(date.getDate())}`
}

export function formatLocalTimeInput(date = new Date()): string {
  return `${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`
}

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getDeviceTimeZoneOptions(): string[] {
  const deviceTimeZone = getDeviceTimeZone()

  try {
    const supported = (Intl as SupportedValuesIntl).supportedValuesOf?.('timeZone') ?? []
    return Array.from(new Set([deviceTimeZone, ...supported]))
  } catch {
    return [deviceTimeZone]
  }
}

export function getIsoWeekParts(date = new Date()): { week: number; year: number } {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utcDate.getUTCDay() || 7

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)

  const year = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)

  return { week, year }
}

export function formatWeekKey(
  weekNumber?: number | null,
  year?: number | null,
  fallback?: string | null,
): string {
  const normalizedFallback = fallback?.trim()
  if (normalizedFallback) return normalizedFallback

  if (typeof weekNumber === 'number' && Number.isFinite(weekNumber)) {
    const paddedWeek = String(weekNumber).padStart(2, '0')
    if (typeof year === 'number' && Number.isFinite(year)) {
      return `${year}-W${paddedWeek}`
    }
    return `W${paddedWeek}`
  }

  return '-'
}

export function formatTrendWeekLabel(point: {
  week?: string | null
  weekKey?: string | null
  weekNumber?: number | null
  year?: number | null
}): string {
  return formatWeekKey(point.weekNumber, point.year, point.weekKey ?? point.week)
}

export function formatSessionWeekLabel(session: {
  weekNumber?: number | null
  weekYear?: number | null
  weekKey?: string | null
}): string {
  return formatWeekKey(session.weekNumber, session.weekYear, session.weekKey)
}

export function getDistributionCount(item: { count?: number | null; value?: number | null }): number {
  return item.count ?? item.value ?? 0
}

export function currentWeek(): { week: number; year: number } {
  return getIsoWeekParts()
}

// Chart colors for pest types
export const PEST_CHART_COLORS = [
  '#e05252', '#f59e0b', '#71c49a', '#a7dcbc',
  '#2d7a50', '#d97706', '#9b1c1c'
]

// ─── CSV export ───────────────────────────────────────────────────────────────

export function exportToCsv(filename: string, rows: object[]): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape((r as Record<string,unknown>)[h])).join(','))
  ].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
