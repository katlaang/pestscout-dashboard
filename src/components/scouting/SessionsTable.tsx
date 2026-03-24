import { useNavigate } from 'react-router-dom'
import type { ScoutingSessionDetailDto } from '@/types'
import { SESSION_STATUS_BADGE, formatDate, formatSessionWeekLabel } from '@/utils'

interface SessionsTableProps {
  sessions: ScoutingSessionDetailDto[]
  compact?: boolean
  showFarm?: boolean
}

export default function SessionsTable({ sessions, compact = false, showFarm = false }: SessionsTableProps) {
  const navigate = useNavigate()

  if (sessions.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        No sessions found
      </div>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
          <th style={thStyle}>Session</th>
          {showFarm && <th style={thStyle}>Farm</th>}
          <th style={thStyle}>Date</th>
          {!compact && <th style={thStyle}>Observations</th>}
          <th style={thStyle}>Status</th>
        </tr>
      </thead>
      <tbody>
        {sessions.slice(0, compact ? 5 : undefined).map(s => {
          const badge = SESSION_STATUS_BADGE[s.status]
          const totalObs = s.sections.reduce(
            (acc, sec) => acc + sec.observations.filter(o => !o.deleted).length, 0
          )
          const isBlocked = !!s.openRestricted

          return (
            <tr
              key={s.id}
              onClick={() => {
                if (!isBlocked) navigate(`/sessions/${s.id}`)
              }}
              style={{
                borderBottom: '0.5px solid #f3f4f6',
                cursor: isBlocked ? 'default' : 'pointer',
                opacity: isBlocked ? 0.45 : 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                if (!isBlocked) e.currentTarget.style.background = '#f9fafb'
              }}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 26, height: 26,
                    borderRadius: 6,
                    background: '#f0faf4',
                    border: '0.5px solid #d6f0e0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12,
                    flexShrink: 0,
                  }}>
                    🌿
                  </div>
                  <div>
                    <p style={{ fontWeight: 500, color: '#111827' }}>
                      {s.crop ?? 'Session'} · {formatSessionWeekLabel(s)}
                    </p>
                    <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                      {s.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
              </td>
              {showFarm && (
                <td style={tdStyle}>
                  <span style={{ color: '#374151' }}>{s.farmName ?? '-'}</span>
                </td>
              )}
              <td style={tdStyle}>
                <span style={{ color: '#374151' }}>{formatDate(s.sessionDate)}</span>
              </td>
              {!compact && (
                <td style={tdStyle}>
                  <span style={{ color: '#374151', fontFamily: 'DM Mono, monospace' }}>
                    {totalObs}
                  </span>
                </td>
              )}
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className={`badge ${badge.cls}`}>{badge.label}</span>
                  {isBlocked && <span className="badge badge-gray">Restricted</span>}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px 8px',
  fontSize: 10,
  fontWeight: 500,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 8px',
}
