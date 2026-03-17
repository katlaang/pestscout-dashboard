import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaPositive?: boolean
  color?: string
  icon?: ReactNode
}

export default function KpiCard({ label, value, delta, deltaPositive, color, icon }: KpiCardProps) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>{label}</p>
        {icon && (
          <div style={{
            width: 28, height: 28,
            borderRadius: 7,
            background: '#f9fafb',
            border: '0.5px solid #e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b7280'
          }}>
            {icon}
          </div>
        )}
      </div>
      <p style={{
        fontSize: 26,
        fontWeight: 500,
        color: color ?? '#111827',
        lineHeight: 1.1,
        letterSpacing: '-0.02em'
      }}>
        {value}
      </p>
      {delta && (
        <p style={{
          fontSize: 11,
          color: deltaPositive === false ? '#c53030' : deltaPositive ? '#1e5c3a' : '#6b7280'
        }}>
          {delta}
        </p>
      )}
    </div>
  )
}
