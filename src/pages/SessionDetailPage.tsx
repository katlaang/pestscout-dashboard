import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sessionsApi } from '@/services/api'
import type { ScoutingSessionDetailDto } from '@/types'
import {
  SESSION_STATUS_BADGE, SPECIES_LABELS, formatDate, formatDateTime,
  SEVERITY_COLORS, severityFromCount, exportToCsv
} from '@/utils'

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<ScoutingSessionDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (!sessionId) return
    sessionsApi.get(sessionId)
      .then(setSession)
      .catch(() => setError('Session not found'))
      .finally(() => setLoading(false))
  }, [sessionId])

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3500)
  }

  async function handleAction(action: 'complete' | 'reopen' | 'cancel') {
    if (!sessionId) return
    if (action === 'cancel' && !confirm('Cancel this session? This cannot be undone.')) return
    setActionLoading(true)
    try {
      let updated: ScoutingSessionDetailDto
      if (action === 'complete') updated = await sessionsApi.complete(sessionId)
      else if (action === 'reopen') updated = await sessionsApi.reopen(sessionId)
      else updated = await sessionsApi.cancel(sessionId)
      setSession(updated)
      flash(`Session ${action === 'complete' ? 'completed' : action === 'reopen' ? 'reopened' : 'cancelled'} successfully`)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? `Failed to ${action} session`, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return (
    <div style={{ padding: '48px 28px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
      Loading session…
    </div>
  )

  if (error || !session) return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 10, padding: '16px', color: '#c53030', fontSize: 13 }}>
        {error ?? 'Session not found'}
      </div>
    </div>
  )

  const badge = SESSION_STATUS_BADGE[session.status]
  const allObs = session.sections.flatMap(s => s.observations.filter(o => !o.deleted))
  const totalObs = allObs.length
  const pestObs = allObs.filter(o => o.category === 'PEST').length
  const diseaseObs = allObs.filter(o => o.category === 'DISEASE').length

  const canComplete = ['IN_PROGRESS', 'SUBMITTED', 'REOPENED'].includes(session.status)
  const canReopen = ['COMPLETED', 'SUBMITTED'].includes(session.status)
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(session.status)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      {/* Back */}
      <button
        onClick={() => navigate('/sessions')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#6b7280', fontFamily: 'inherit',
          marginBottom: 20, padding: 0,
        }}
      >
        ← Back to sessions
      </button>

      {/* Banner */}
      {banner && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          ...(banner.type === 'error'
            ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' }
            : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' })
        }}>
          {banner.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ color: '#111827', fontSize: 20 }}>
              {session.crop ?? 'Session'}{session.variety ? ` · ${session.variety}` : ''} — W{session.weekNumber}
            </h1>
            <span className={`badge ${badge.cls}`}>{badge.label}</span>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', fontFamily: 'DM Mono, monospace' }}>
            {session.id}
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => {
              const rows = allObs.map(o => ({
                session_id: session.id,
                crop: session.crop ?? '',
                week: session.weekNumber,
                bay: o.bayTag ?? o.bayIndex,
                bench: o.benchTag ?? o.benchIndex,
                spot: o.spotIndex,
                species: SPECIES_LABELS[o.speciesCode] ?? o.speciesCode,
                category: o.category,
                count: o.count,
                severity: severityFromCount(o.count),
                notes: o.notes ?? '',
              }))
              exportToCsv(`session-${session.id.slice(0, 8)}-observations.csv`, rows)
            }}
          >
            ↓ Export CSV
          </button>
          {canReopen && (
            <button className="btn-secondary" disabled={actionLoading}
              onClick={() => handleAction('reopen')} style={{ fontSize: 12 }}>
              🔓 Reopen
            </button>
          )}
          {canComplete && (
            <button className="btn-primary" disabled={actionLoading}
              onClick={() => handleAction('complete')} style={{ fontSize: 12 }}>
              ✓ Mark complete
            </button>
          )}
          {canCancel && (
            <button className="btn-danger" disabled={actionLoading}
              onClick={() => handleAction('cancel')} style={{ fontSize: 12 }}>
              Cancel session
            </button>
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Session date', value: formatDate(session.sessionDate) },
          { label: 'Total observations', value: totalObs },
          { label: 'Pests', value: pestObs, color: pestObs > 0 ? '#d97706' : undefined },
          { label: 'Diseases', value: diseaseObs, color: diseaseObs > 0 ? '#c53030' : undefined },
        ].map(m => (
          <div key={m.label} className="card" style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: m.color ?? '#111827', letterSpacing: '-0.02em' }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Two column: session info + environment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Session details</p>
          <MetaRow label="Status" value={<span className={`badge ${badge.cls}`}>{badge.label}</span>} />
          <MetaRow label="Started" value={session.startedAt ? formatDateTime(session.startedAt) : '—'} />
          <MetaRow label="Submitted" value={session.submittedAt ? formatDateTime(session.submittedAt) : '—'} />
          <MetaRow label="Completed" value={session.completedAt ? formatDateTime(session.completedAt) : '—'} />
          <MetaRow label="Confirmation" value={session.confirmationAcknowledged ? 'Acknowledged' : 'Pending'} />
          {session.notes && <MetaRow label="Notes" value={session.notes} />}
        </div>

        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Environment</p>
          <MetaRow label="Crop" value={session.crop ?? '—'} />
          <MetaRow label="Variety" value={session.variety ?? '—'} />
          <MetaRow label="Temperature" value={session.temperatureCelsius != null ? `${session.temperatureCelsius}°C` : '—'} />
          <MetaRow label="Relative humidity" value={session.relativeHumidityPercent != null ? `${session.relativeHumidityPercent}%` : '—'} />
          <MetaRow label="Observation time" value={session.observationTime ?? '—'} />
          {session.weatherNotes && <MetaRow label="Weather notes" value={session.weatherNotes} />}
        </div>
      </div>

      {/* Recommendations */}
      {session.recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Recommendations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {session.recommendations.map((r, i) => (
              <div key={i} style={{
                background: '#f9fafb', border: '0.5px solid #e5e7eb',
                borderRadius: 7, padding: '9px 12px',
                display: 'flex', gap: 10,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  background: '#f0faf4', color: '#1e5c3a',
                  border: '0.5px solid #a7dcbc',
                  borderRadius: 20, padding: '2px 8px',
                  whiteSpace: 'nowrap', height: 'fit-content',
                }}>
                  {r.type.replace('_', ' ').toLowerCase()}
                </span>
                <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observations by section */}
      {session.sections.map(sec => {
        const obs = sec.observations.filter(o => !o.deleted)
        if (obs.length === 0) return null
        return (
          <div key={sec.targetId} className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              <span>
                {sec.greenhouseId ? '🌿' : '🌱'} {sec.greenhouseId ? 'Greenhouse' : 'Field block'} — {sec.targetId.slice(0, 8)}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{obs.length} observations</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  {['Species', 'Category', 'Bay', 'Bench', 'Spot', 'Count', 'Severity', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obs.sort((a, b) => a.bayIndex - b.bayIndex || a.benchIndex - b.benchIndex).map(o => {
                  const sev = severityFromCount(o.count)
                  const bg = SEVERITY_COLORS[sev]
                  return (
                    <tr key={o.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                      <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>
                        {SPECIES_LABELS[o.speciesCode] ?? o.speciesCode}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span className={`badge ${o.category === 'PEST' ? 'badge-amber' : o.category === 'DISEASE' ? 'badge-red' : 'badge-green'}`}>
                          {o.category.toLowerCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#374151', fontFamily: 'DM Mono, monospace' }}>
                        {o.bayTag ?? o.bayIndex}
                      </td>
                      <td style={{ padding: '8px', color: '#374151', fontFamily: 'DM Mono, monospace' }}>
                        {o.benchTag ?? o.benchIndex}
                      </td>
                      <td style={{ padding: '8px', color: '#374151', fontFamily: 'DM Mono, monospace' }}>
                        {o.spotIndex}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#111827', fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
                        {o.count}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          display: 'inline-block',
                          background: bg,
                          color: '#111',
                          fontSize: 10, fontWeight: 500,
                          padding: '2px 7px',
                          borderRadius: 20,
                          border: '0.5px solid rgba(0,0,0,0.06)',
                        }}>
                          {sev.charAt(0) + sev.slice(1).toLowerCase().replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.notes ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '6px 0',
      borderBottom: '0.5px solid #f9fafb',
      gap: 8,
    }}>
      <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#374151', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
