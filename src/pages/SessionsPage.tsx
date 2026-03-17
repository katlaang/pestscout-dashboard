import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { farmsApi, sessionsApi, adminFarmsApi } from '@/services/api'
import type { FarmResponse, ScoutingSessionDetailDto, SessionStatus, GreenhouseResponse } from '@/types'
import type { CreateSessionRequest } from '@/services/api'
import { SESSION_STATUS_BADGE, formatDate, exportToCsv, currentWeek } from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'

const STATUS_FILTERS: { value: SessionStatus | 'ALL'; label: string }[] = [
  { value: 'ALL',         label: 'All' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'SUBMITTED',   label: 'Submitted' },
  { value: 'COMPLETED',   label: 'Completed' },
  { value: 'DRAFT',       label: 'Draft' },
]

const CAN_CREATE_SESSION = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER']

export default function SessionsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreate = CAN_CREATE_SESSION.includes(user?.role ?? '')

  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState('')
  const [sessions, setSessions] = useState<ScoutingSessionDetailDto[]>([])
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    farmsApi.list().then(data => {
      setFarms(data)
      if (data.length > 0) setSelectedFarmId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedFarmId) return
    setLoading(true)
    sessionsApi.list(selectedFarmId).then(setSessions).finally(() => setLoading(false))
  }, [selectedFarmId])

  const filtered = sessions.filter(s => {
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter
    const matchSearch = !search ||
      s.crop?.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3500)
  }

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Sessions</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>All scouting sessions across your farms</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => {
              const rows = filtered.map(s => ({
                id: s.id, status: s.status, crop: s.crop ?? '',
                variety: s.variety ?? '', week: s.weekNumber, date: s.sessionDate,
                observations: s.sections.reduce((n, sec) => n + sec.observations.filter(o => !o.deleted).length, 0),
              }))
              exportToCsv(`sessions-${selectedFarmId}.csv`, rows)
            }}>
            ↓ Export CSV
          </button>
          {/* Only SUPER_ADMIN, FARM_ADMIN, MANAGER can create sessions */}
          {canCreate && (
            <button className="btn-primary" style={{ fontSize: 12 }}
              onClick={() => setShowCreate(true)}>
              + New session
            </button>
          )}
        </div>
      </div>

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

      {/* Scout read-only notice */}
      {!canCreate && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: '#f9fafb', border: '0.5px solid #e5e7eb', color: '#6b7280',
        }}>
          Sessions are created by managers. Scouts record observations within an assigned session using the mobile app.
        </div>
      )}

      {/* Create session modal */}
      {showCreate && (
        <CreateSessionModal
          farms={farms}
          defaultFarmId={selectedFarmId}
          onCreated={session => {
            setSessions(prev => [session, ...prev])
            setShowCreate(false)
            flash(`Session created — W${session.weekNumber}`)
            navigate(`/sessions/${session.id}`)
          }}
          onCancel={() => setShowCreate(false)}
          onError={msg => { setShowCreate(false); flash(msg, 'error') }}
        />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" style={{ width: 180 }} value={selectedFarmId}
          onChange={e => setSelectedFarmId(e.target.value)}>
          {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input className="input" style={{ width: 200 }} placeholder="Search by crop or ID…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: '0.5px solid',
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                ...(statusFilter === f.value
                  ? { background: '#1e5c3a', color: '#fff', borderColor: '#1e5c3a' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' })
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading sessions…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No sessions match your filters</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
                {['Session', 'Date', 'Week', 'Crop / variety', 'Observations', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const badge = SESSION_STATUS_BADGE[s.status]
                const totalObs = s.sections.reduce((acc, sec) => acc + sec.observations.filter(o => !o.deleted).length, 0)
                return (
                  <tr key={s.id} onClick={() => navigate(`/sessions/${s.id}`)}
                    style={{ borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#374151' }}>{s.id.slice(0, 12)}…</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{formatDate(s.sessionDate)}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>W{s.weekNumber}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: '#111827' }}>
                      {s.crop ?? '—'}{s.variety ? ` · ${s.variety}` : ''}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151', fontFamily: 'DM Mono, monospace' }}>{totalObs}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Create Session Modal ─────────────────────────────────────────────────────

function CreateSessionModal({ farms, defaultFarmId, onCreated, onCancel, onError }: {
  farms: FarmResponse[]
  defaultFarmId: string
  onCreated: (s: ScoutingSessionDetailDto) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const { week, year } = currentWeek()
  const [saving, setSaving] = useState(false)
  const [farmId, setFarmId] = useState(defaultFarmId)
  const [greenhouses, setGreenhouses] = useState<GreenhouseResponse[]>([])
  const [form, setForm] = useState<CreateSessionRequest>({
    farmId: defaultFarmId,
    crop: '',
    variety: '',
    weekNumber: week,
    sessionDate: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  // Load greenhouses when farm changes
  useEffect(() => {
    if (!farmId) return
    adminFarmsApi.listGreenhouses(farmId)
      .then(setGreenhouses)
      .catch(() => setGreenhouses([]))
  }, [farmId])

  function setField(k: keyof CreateSessionRequest, v: string | number) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function handleFarmChange(id: string) {
    setFarmId(id)
    setField('farmId', id)
    setField('greenhouseId', '')
  }

  async function handleCreate() {
    if (!form.farmId) { onError('Please select a farm'); return }
    setSaving(true)
    try {
      const body: CreateSessionRequest = {
        ...form,
        greenhouseId: (form as any).greenhouseId || undefined,
        crop: form.crop || undefined,
        variety: form.variety || undefined,
        notes: form.notes || undefined,
      }
      onCreated(await sessionsApi.create(body))
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Failed to create session')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        border: '0.5px solid #e5e7eb',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        width: '100%', maxWidth: 520, padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, color: '#111827' }}>New scouting session</h2>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Farm */}
          <Field label="Farm *">
            <select className="input" value={farmId} onChange={e => handleFarmChange(e.target.value)}>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>

          {/* Greenhouse (optional) */}
          <Field label="Greenhouse / field block">
            <select className="input" value={(form as any).greenhouseId ?? ''}
              onChange={e => setField('greenhouseId' as any, e.target.value)}>
              <option value="">— None selected —</option>
              {greenhouses.map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.structureType.toLowerCase()})</option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Crop">
              <input className="input" placeholder="e.g. Tomato"
                value={form.crop ?? ''} onChange={e => setField('crop', e.target.value)} />
            </Field>
            <Field label="Variety">
              <input className="input" placeholder="e.g. Beefsteak"
                value={form.variety ?? ''} onChange={e => setField('variety', e.target.value)} />
            </Field>
            <Field label="Week number">
              <input className="input" type="number" min={1} max={53}
                value={form.weekNumber ?? week} onChange={e => setField('weekNumber', Number(e.target.value))} />
            </Field>
            <Field label="Session date">
              <input className="input" type="date"
                value={form.sessionDate ?? ''} onChange={e => setField('sessionDate', e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <input className="input" placeholder="Optional notes for scouts"
              value={form.notes ?? ''} onChange={e => setField('notes', e.target.value)} />
          </Field>
        </div>

        {/* Role reminder */}
        <div style={{
          marginTop: 14, padding: '8px 12px', borderRadius: 7,
          background: '#f0faf4', border: '0.5px solid #a7dcbc',
          fontSize: 12, color: '#1e5c3a',
        }}>
          Scouts will be assigned to this session and will record observations using the mobile app.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
