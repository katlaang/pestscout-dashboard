import type { AlertDto } from '@/types'

interface AlertCardProps {
  alert: AlertDto
  compact?: boolean
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; titleColor: string }> = {
  emergency: { bg: '#fff1f2', border: '#fda4af', titleColor: '#dc2626' },
  critical: { bg: '#fff7ed', border: '#fdba74', titleColor: '#ea580c' },
  very_high: { bg: '#fffbea', border: '#fde68a', titleColor: '#a16207' },
  high: { bg: '#fffbea', border: '#fde68a', titleColor: '#a16207' },
  medium: { bg: '#f8fafc', border: '#cbd5e1', titleColor: '#475569' },
  moderate: { bg: '#f8fafc', border: '#cbd5e1', titleColor: '#475569' },
  low: { bg: '#f0faf4', border: '#a7dcbc', titleColor: '#1e5c3a' },
  zero: { bg: '#f0faf4', border: '#a7dcbc', titleColor: '#1e5c3a' },
}

function formatSeverityLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
}

export default function AlertCard({ alert, compact = false }: AlertCardProps) {
  const severity = alert.severity?.toLowerCase().replace(/\s+/g, '_') ?? 'medium'
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium

  return (
    <div
      style={{
        background: style.bg,
        border: `0.5px solid ${style.border}`,
        borderRadius: 8,
        padding: compact ? '7px 10px' : '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
        <path d="M6.5 1L12 11H1L6.5 1z" stroke={style.titleColor} strokeWidth="1.2" fill="none" strokeLinejoin="round" />
        <line x1="6.5" y1="5" x2="6.5" y2="8" stroke={style.titleColor} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="6.5" cy="9.5" r="0.6" fill={style.titleColor} />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: style.titleColor }}>
          {formatSeverityLabel(alert.severity)} - {alert.pest}
        </p>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          {alert.farmName ? `${alert.farmName} - ` : ''}
          {alert.location} - Count: {alert.count}
          {!compact && alert.time ? ` - ${alert.time}` : ''}
        </p>
      </div>
      {!compact && alert.time && (
        <span
          style={{
            fontSize: 10,
            color: '#9ca3af',
            whiteSpace: 'nowrap',
            alignSelf: 'flex-end',
          }}
        >
          {alert.time}
        </span>
      )}
    </div>
  )
}
