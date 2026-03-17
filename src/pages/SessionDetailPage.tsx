import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sessionsApi } from '@/services/api'
import type { ScoutingSessionDetailDto } from '@/types'
import {
  SESSION_STATUS_BADGE, SPECIES_LABELS, formatDate, formatDateTime,
  SEVERITY_COLORS, severityFromCount, exportToCsv
} from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [session, setSession] = useState<ScoutingSessionDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showReopenModal, setShowReopenModal] = useState(false)

  const role = user?.role ?? ''
  const isManager = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'].includes(role)
  const actorName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Manager'

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

  async function handleStart() {
    if (!sessionId) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.start(sessionId))
      flash('Session started — now in progress')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to start session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleComplete(comment: string) {
    if (!sessionId || !session) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.complete(sessionId, {
        version: session.version!,
        confirmationAcknowledged: true,
        actorName,
        comment: comment || undefined,
      }))
      flash('Session completed successfully')
      setShowCompleteModal(false)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to complete session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleReopen(comment: string) {
    if (!sessionId) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.reopen(sessionId, {
        comment: comment || undefined,
        actorName,
      }))
      flash('Session reopened')
      setShowReopenModal(false)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to reopen session', 'error')
    } finally { setActionLoading(false) }
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

  // Role-gated state transitions based on SessionStateMachine
  // SCOUT: can start (NEW/DRAFT → IN_PROGRESS) — handled in mobile app
  // MANAGER: can complete (SUBMITTED/REOPENED → COMPLETED), reopen (SUBMITTED/COMPLETED/INCOMPLETE → REOPENED)
  const canStart   = isManager && ['NEW', 'DRAFT'].includes(session.status)
  const canComplete = isManager && ['SUBMITTED', 'REOPENED'].includes(session.status)
  const canReopen  = isManager && ['SUBMITTED', 'COMPLETED', 'INCOMPLETE'].includes(session.status)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      {/* Back */}
      <button onClick={() => navigate('/sessions')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', fontFamily: 'inherit', marginBottom: 20, padding: 0 }}>
        ← Back to sessions
      </button>

      {/* Banner */}
      {banner && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          ...(banner.type === 'error'
            ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' }
            : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' })
        }}>{banner.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ color: '#111827', fontSize: 20 }}>
              {session.crop ?? 'Session'}{session.variety ? ` · ${session.variety}` : ''} — W{session.weekNumber}
            </h1>
            <span className={`badge ${badge?.cls ?? 'badge-gray'}`}>{badge?.label ?? session.status}</span>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{session.id}</p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* CSV export */}
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => exportToCsv(`session-${session.id.slice(0, 8)}.csv`,
              allObs.map(o => ({
                session_id: session.id, crop: session.crop ?? '', week: session.weekNumber,
                bay: o.bayTag ?? o.bayIndex, bench: o.benchTag ?? o.benchIndex, spot: o.spotIndex,
                species: SPECIES_LABELS[o.speciesCode] ?? o.speciesCode, category: o.category,
                count: o.count, severity: severityFromCount(o.count), notes: o.notes ?? '',
              })))}>
            ↓ Export CSV
          </button>

          {/* Start — manager pushes session to IN_PROGRESS before handing to scout */}
          {canStart && (
            <button className="btn-secondary" disabled={actionLoading} style={{ fontSize: 12 }}
              onClick={handleStart}>
              ▶ Start session
            </button>
          )}

          {/* Reopen */}
          {canReopen && (
            <button className="btn-secondary" disabled={actionLoading} style={{ fontSize: 12 }}
              onClick={() => setShowReopenModal(true)}>
              🔓 Reopen
            </button>
          )}

          {/* Complete — manager approves after scout submits */}
          {canComplete && (
            <button className="btn-primary" disabled={actionLoading} style={{ fontSize: 12 }}
              onClick={() => setShowCompleteModal(true)}>
              ✓ Mark complete
            </button>
          )}

          {/* Workflow guide for in-progress sessions */}
          {session.status === 'IN_PROGRESS' && (
            <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
              Scout is recording — awaiting submission
            </span>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Session date',        value: formatDate(session.sessionDate) },
          { label: 'Total observations',  value: totalObs },
          { label: 'Pests',               value: pestObs,    color: pestObs > 0 ? '#d97706' : undefined },
          { label: 'Diseases',            value: diseaseObs, color: diseaseObs > 0 ? '#c53030' : undefined },
        ].map(m => (
          <div key={m.label} className="card" style={{ padding: '10px 12px' }}>
            <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: m.color ?? '#111827', letterSpacing: '-0.02em' }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Session info + environment */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Session details</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            {[
              { label: 'Crop / variety', value: [session.crop, session.variety].filter(Boolean).join(' · ') || '—' },
              { label: 'Week', value: `Week ${session.weekNumber}` },
              { label: 'Scout ID', value: session.scoutId ? session.scoutId.slice(0, 8) + '…' : '—' },
              { label: 'Manager ID', value: session.managerId ? session.managerId.slice(0, 8) + '…' : '—' },
              { label: 'Started', value: session.startedAt ? formatDateTime(session.startedAt) : '—' },
              { label: 'Submitted', value: session.submittedAt ? formatDateTime(session.submittedAt) : '—' },
              { label: 'Completed', value: session.completedAt ? formatDateTime(session.completedAt) : '—' },
              { label: 'Confirmation', value: session.confirmationAcknowledged ? '✓ Acknowledged' : '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '0.5px solid #f9fafb' }}>
                <span style={{ color: '#6b7280', flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: '#111827', textAlign: 'right' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Environment</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            {[
              { label: 'Temperature', value: session.temperatureCelsius ? `${session.temperatureCelsius}°C` : '—' },
              { label: 'Humidity', value: session.relativeHumidityPercent ? `${session.relativeHumidityPercent}%` : '—' },
              { label: 'Obs. time', value: session.observationTime ?? '—' },
              { label: 'Weather notes', value: session.weatherNotes || '—' },
              { label: 'Session notes', value: session.notes || '—' },
              ...(session.reopenComment ? [{ label: 'Reopen note', value: session.reopenComment }] : []),
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '0.5px solid #f9fafb' }}>
                <span style={{ color: '#6b7280', flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: '#111827', textAlign: 'right' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status workflow guide */}
      <div className="card" style={{ marginBottom: 16, padding: '10px 14px' }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Session workflow</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, flexWrap: 'wrap' }}>
          {['DRAFT', 'NEW', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED'].map((s, i, arr) => {
            const isCurrent = session.status === s
            const isDone = ['DRAFT','NEW','IN_PROGRESS','SUBMITTED','COMPLETED'].indexOf(session.status) >
                           ['DRAFT','NEW','IN_PROGRESS','SUBMITTED','COMPLETED'].indexOf(s)
            return (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: isCurrent ? '#1e5c3a' : isDone ? '#f0faf4' : '#f3f4f6',
                  color: isCurrent ? '#fff' : isDone ? '#2d7a50' : '#9ca3af',
                  border: `0.5px solid ${isCurrent ? '#1e5c3a' : isDone ? '#a7dcbc' : '#e5e7eb'}`
                }}>
                  {s.replace('_', ' ')}
                </span>
                {i < arr.length - 1 && <span style={{ color: '#d1d5db' }}>→</span>}
              </span>
            )
          })}
          <span style={{ color: '#9ca3af', marginLeft: 8, fontStyle: 'italic' }}>
            {session.status === 'DRAFT' && '— Manager: click "Start session" to activate'}
            {session.status === 'NEW' && '— Scout: start from mobile app'}
            {session.status === 'IN_PROGRESS' && '— Scout: recording observations on mobile'}
            {session.status === 'SUBMITTED' && '— Manager: review and mark complete'}
            {session.status === 'COMPLETED' && '— ✓ Done'}
            {session.status === 'INCOMPLETE' && '— Session interrupted; reopen to continue'}
            {session.status === 'REOPENED' && '— Scout can edit again; resubmit when done'}
          </span>
        </div>
      </div>

      {/* Observations */}
      {session.sections.map(section => (
        <div key={section.targetId} className="card" style={{ marginBottom: 14 }}>
          <div className="card-title">
            <span style={{ fontSize: 13 }}>
              {section.greenhouseId ? `Greenhouse` : `Field block`}
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8, fontFamily: 'DM Mono, monospace' }}>
                {(section.greenhouseId ?? section.fieldBlockId ?? '').slice(0, 8)}…
              </span>
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {section.observations.filter(o => !o.deleted).length} observations
            </span>
          </div>

          {section.observations.filter(o => !o.deleted).length === 0 ? (
            <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>No observations recorded yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  {['Bay', 'Bench', 'Spot', 'Species', 'Category', 'Count', 'Severity', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.observations.filter(o => !o.deleted).map(obs => {
                  const sev = severityFromCount(obs.count)
                  return (
                    <tr key={obs.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 8px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{obs.bayTag ?? `B${obs.bayIndex}`}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{obs.benchTag ?? obs.benchIndex}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{obs.spotIndex}</td>
                      <td style={{ padding: '7px 8px', color: '#111827' }}>{SPECIES_LABELS[obs.speciesCode] ?? obs.speciesCode}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span className={`badge ${obs.category === 'PEST' ? 'badge-amber' : obs.category === 'DISEASE' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 9 }}>
                          {obs.category}
                        </span>
                      </td>
                      <td style={{ padding: '7px 8px', fontWeight: 500, color: '#111827' }}>{obs.count}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, fontSize: 9, fontWeight: 600, background: SEVERITY_COLORS[sev] ?? '#e5e7eb', color: '#fff' }}>
                          {sev}
                        </span>
                      </td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', maxWidth: 200 }}>{obs.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Recommendations */}
      {session.recommendations.length > 0 && (
        <div className="card">
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Recommendations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {session.recommendations.map((r, i) => (
              <div key={i} style={{ padding: '8px 12px', background: '#f9fafb', borderRadius: 7, fontSize: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginRight: 8 }}>{r.type}</span>
                {r.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete modal */}
      {showCompleteModal && (
        <ConfirmModal
          title="Complete session"
          description="Confirm that all scouting data is correct and approve this session."
          confirmLabel="Complete session"
          onConfirm={handleComplete}
          onCancel={() => setShowCompleteModal(false)}
          loading={actionLoading}
        />
      )}

      {/* Reopen modal */}
      {showReopenModal && (
        <ConfirmModal
          title="Reopen session"
          description="This allows the scout to edit observations again."
          confirmLabel="Reopen"
          onConfirm={handleReopen}
          onCancel={() => setShowReopenModal(false)}
          loading={actionLoading}
        />
      )}
    </div>
  )
}

// ─── Confirm modal with optional comment ─────────────────────────────────────

function ConfirmModal({ title, description, confirmLabel, onConfirm, onCancel, loading }: {
  title: string
  description: string
  confirmLabel: string
  onConfirm: (comment: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [comment, setComment] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: '100%', maxWidth: 400, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, color: '#111827', marginBottom: 8 }}>{title}</h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{description}</p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 5 }}>Comment (optional)</label>
          <textarea className="input" style={{ resize: 'vertical', minHeight: 60, fontSize: 12 }}
            placeholder="e.g. Reviewed and approved"
            value={comment} onChange={e => setComment(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
          <button className="btn-primary" style={{ fontSize: 12 }} disabled={loading}
            onClick={() => onConfirm(comment)}>
            {loading ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
