import type { AlertDto } from '@/types'

interface AlertCardProps {
  alert: AlertDto
  compact?: boolean
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; titleColor: string }> = {
  emergency: { bg: '#fff5f5', border: '#fca5a5', titleColor: '#c53030' },
  critical:  { bg: '#fff5f5', border: '#fca5a5', titleColor: '#c53030' },
  high:      { bg: '#fffbf0', border: '#fde68a', titleColor: '#d97706' },
  medium:    { bg: '#fffbf0', border: '#fde68a', titleColor: '#d97706' },
  low:       { bg: '#f0faf4', border: '#a7dcbc', titleColor: '#1e5c3a' },
  zero:      { bg: '#f0faf4', border: '#a7dcbc', titleColor: '#1e5c3a' },
}

export default function AlertCard({ alert, compact = false }: AlertCardProps) {
  const sev = alert.severity?.toLowerCase() ?? 'medium'
  const style = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.medium

  return (
    <div style={{
      background: style.bg,
      border: `0.5px solid ${style.border}`,
      borderRadius: 8,
      padding: compact ? '7px 10px' : '10px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
        <path d="M6.5 1L12 11H1L6.5 1z" stroke={style.titleColor} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
        <line x1="6.5" y1="5" x2="6.5" y2="8" stroke={style.titleColor} strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="6.5" cy="9.5" r="0.6" fill={style.titleColor}/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: style.titleColor }}>
          {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)} — {alert.pest}
        </p>
        <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          {alert.location} · Count: {alert.count}
          {!compact && ` · ${alert.time}`}
        </p>
      </div>
      {!compact && (
        <span style={{
          fontSize: 10,
          color: '#9ca3af',
          whiteSpace: 'nowrap',
          alignSelf: 'flex-end'
        }}>
          {alert.time}
        </span>
      )}
    </div>
  )
}
