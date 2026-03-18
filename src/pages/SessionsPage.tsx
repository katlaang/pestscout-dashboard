import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { farmsApi, sessionsApi, adminFarmsApi, adminUsersApi } from '@/services/api'
import type { FarmResponse, ScoutingSessionDetailDto, SessionStatus, GreenhouseResponse, FieldBlockResponse, UserDto } from '@/types'
import type { CreateSessionRequest, SessionTargetRequest } from '@/services/api'
import { SESSION_STATUS_BADGE, formatDate, exportToCsv, currentWeek } from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'

// ─── Visibility rules ─────────────────────────────────────────────────────────
//
// SUPER_ADMIN (per-farm view):  DRAFT, NEW, COMPLETED, INCOMPLETE, REOPENED
//                               (NOT IN_PROGRESS or SUBMITTED — scout is actively working those)
// FARM_ADMIN / MANAGER:         ALL statuses on their farm
// SCOUT (own sessions only):    NEW, IN_PROGRESS, SUBMITTED, REOPENED, INCOMPLETE, COMPLETED
//                               + DRAFT only when a remote-start is pending

function isVisibleToRole(s: ScoutingSessionDetailDto, role: string, userId: string): boolean {
  const SUPER_ADMIN_STATUSES = new Set(['DRAFT', 'NEW', 'COMPLETED', 'INCOMPLETE', 'REOPENED'])
  const SCOUT_STATUSES       = new Set(['NEW', 'IN_PROGRESS', 'SUBMITTED', 'REOPENED', 'INCOMPLETE', 'COMPLETED'])

  if (role === 'SUPER_ADMIN') {
    return SUPER_ADMIN_STATUSES.has(s.status)
  }
  if (role === 'SCOUT') {
    // Scout only sees their own sessions
    if (s.scoutId !== userId) return false
    // DRAFT visible only if a remote-start is pending
    if (s.status === 'DRAFT') return !!(s as any).remoteStartConsentRequired
    return SCOUT_STATUSES.has(s.status)
  }
  // FARM_ADMIN / MANAGER see everything on their farm
  return true
}

// Status filter options per role
function statusFiltersForRole(role: string): { value: SessionStatus | 'ALL'; label: string }[] {
  if (role === 'SCOUT') {
    return [
      { value: 'ALL',         label: 'All mine' },
      { value: 'IN_PROGRESS', label: 'In progress' },
      { value: 'SUBMITTED',   label: 'Submitted' },
      { value: 'REOPENED',    label: 'Reopened' },
      { value: 'INCOMPLETE',  label: 'Incomplete' },
      { value: 'COMPLETED',   label: 'Completed' },
    ]
  }
  if (role === 'SUPER_ADMIN') {
    return [
      { value: 'ALL',        label: 'All' },
      { value: 'DRAFT',      label: 'Draft' },
      { value: 'NEW',        label: 'New' },
      { value: 'REOPENED',   label: 'Reopened' },
      { value: 'COMPLETED',  label: 'Completed' },
      { value: 'INCOMPLETE', label: 'Incomplete' },
    ]
  }
  // FARM_ADMIN / MANAGER
  return [
    { value: 'ALL',         label: 'All' },
    { value: 'DRAFT',       label: 'Draft' },
    { value: 'NEW',         label: 'New' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'SUBMITTED',   label: 'Submitted' },
    { value: 'REOPENED',    label: 'Reopened' },
    { value: 'COMPLETED',   label: 'Completed' },
    { value: 'INCOMPLETE',  label: 'Incomplete' },
  ]
}

const CAN_CREATE_SESSION = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER']

export default function SessionsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const role     = user?.role ?? ''
  const canCreate = CAN_CREATE_SESSION.includes(role)

  const [farms,          setFarms]          = useState<FarmResponse[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState('')
  const [sessions,       setSessions]       = useState<ScoutingSessionDetailDto[]>([])
  const [statusFilter,   setStatusFilter]   = useState<SessionStatus | 'ALL'>('ALL')
  const [search,         setSearch]         = useState('')
  const [loading,        setLoading]        = useState(true)
  const [showCreate,     setShowCreate]     = useState(false)
  const [banner,         setBanner]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

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

  const statusFilters = statusFiltersForRole(role)

  const filtered = sessions.filter(s => {
    if (!isVisibleToRole(s, role, user?.id ?? '')) return false
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
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            {role === 'SCOUT'
              ? 'Your assigned scouting sessions'
              : role === 'SUPER_ADMIN'
              ? 'Sessions visible to management per farm'
              : 'All scouting sessions on your farm'}
          </p>
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
        }}>{banner.msg}</div>
      )}

      {/* Scout read-only notice */}
      {role === 'SCOUT' && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: '#f9fafb', border: '0.5px solid #e5e7eb', color: '#6b7280',
        }}>
          Sessions are created by managers. Record observations in the mobile app once a session is started.
        </div>
      )}

      {/* Super admin visibility note */}
      {role === 'SUPER_ADMIN' && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: '#f0f9ff', border: '0.5px solid #bae6fd', color: '#0369a1',
        }}>
          Showing management-visible sessions (Draft, New, Completed, Incomplete, Reopened). In-progress and submitted sessions are managed by the assigned scout.
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
          {statusFilters.map(f => (
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
                const badge    = SESSION_STATUS_BADGE[s.status]
                const totalObs = s.sections.reduce((acc, sec) => acc + sec.observations.filter(o => !o.deleted).length, 0)
                const remoteStart = !!(s as any).remoteStartConsentRequired
                return (
                  <tr key={s.id} onClick={() => navigate(`/sessions/${s.id}`)}
                    style={{ borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#9ca3af' }}>
                      {s.id.slice(0, 8)}…
                    </td>
                    <td style={{ padding: '10px 14px' }}>{formatDate(s.sessionDate)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>W{s.weekNumber}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: '#111827' }}>{s.crop ?? '—'}</span>
                      {s.variety && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{s.variety}</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: totalObs > 0 ? '#111827' : '#9ca3af' }}>
                      {totalObs}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${badge?.cls ?? 'badge-gray'}`}>{badge?.label ?? s.status}</span>
                        {/* Remote-start pending badge — visible to scout */}
                        {remoteStart && role === 'SCOUT' && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f59e0b', color: '#fff' }}>
                            📡 start requested
                          </span>
                        )}
                      </div>
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

// ─── Create session modal ─────────────────────────────────────────────────────
// scoutId and targets are now optional in the backend — but we encourage the
// manager to fill them in up front for a better experience.

function CreateSessionModal({
  farms, defaultFarmId, onCreated, onCancel, onError,
}: {
  farms: FarmResponse[]
  defaultFarmId: string
  onCreated: (s: ScoutingSessionDetailDto) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const { week } = currentWeek()
  const [saving,           setSaving]           = useState(false)
  const [farmId,           setFarmId]           = useState(defaultFarmId)
  const [scouts,           setScouts]           = useState<UserDto[]>([])
  const [structures,       setStructures]       = useState<(GreenhouseResponse | FieldBlockResponse)[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [scoutId,          setScoutId]          = useState('')
  const [crop,             setCrop]             = useState('')
  const [variety,          setVariety]          = useState('')
  const [notes,            setNotes]            = useState('')
  const [sessionDate,      setSessionDate]      = useState(new Date().toISOString().slice(0, 10))
  const [weekNumber,       setWeekNumber]       = useState(week)

  const selectedFarm = farms.find(f => f.id === farmId)
  const isField      = selectedFarm?.structureType === 'FIELD'

  useEffect(() => {
    if (!farmId) return
    adminUsersApi.list({ farmId, role: 'SCOUT' })
      .then(setScouts).catch(() => setScouts([]))
  }, [farmId])

  useEffect(() => {
    if (!farmId || selectedFarm?.structureType === 'OTHER') { setStructures([]); return }
    const fetch = isField ? adminFarmsApi.listFieldBlocks(farmId) : adminFarmsApi.listGreenhouses(farmId)
    fetch.then(data => setStructures(data as any[])).catch(() => setStructures([]))
    setSelectedTargetId('')
  }, [farmId, isField, selectedFarm?.structureType])

  function handleFarmChange(id: string) {
    setFarmId(id)
    setScoutId('')
    setSelectedTargetId('')
  }

  async function handleCreate() {
    if (!farmId) { onError('Please select a farm'); return }

    // Build targets — optional but strongly encouraged
    const targets: SessionTargetRequest[] | undefined = selectedTargetId
      ? [{ ...(isField ? { fieldBlockId: selectedTargetId } : { greenhouseId: selectedTargetId }), includeAllBays: true, includeAllBenches: true }]
      : undefined   // backend will auto-resolve all structures on the farm

    setSaving(true)
    try {
      const body: CreateSessionRequest = {
        farmId,
        scoutId:    scoutId     || undefined,  // optional — assign later if needed
        targets,                                // optional — backend resolves defaults
        sessionDate,
        weekNumber,
        crop:    crop    || undefined,
        variety: variety || undefined,
        notes:   notes   || undefined,
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
      position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{
        background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: '100%', maxWidth: 540, padding: 24,
        maxHeight: '90vh', overflowY: 'auto',
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

          {/* Scout — optional (can be assigned later) */}
          <Field label="Assign scout">
            {scouts.length === 0 ? (
              <div style={{ padding: '8px 10px', background: '#fffbf0', border: '0.5px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#d97706' }}>
                No scouts on this farm yet — you can assign one after creation.
              </div>
            ) : (
              <select className="input" value={scoutId} onChange={e => setScoutId(e.target.value)}>
                <option value="">— Assign later —</option>
                {scouts.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.email})</option>
                ))}
              </select>
            )}
          </Field>

          {/* Structure target — optional */}
          {structures.length > 0 && (
            <Field label={`${isField ? 'Field block' : 'Greenhouse'} (optional — backend defaults to all)`}>
              <select className="input" value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)}>
                <option value="">— All structures on this farm —</option>
                {structures.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Crop">
              <input className="input" placeholder="e.g. Tomato" value={crop} onChange={e => setCrop(e.target.value)} />
            </Field>
            <Field label="Variety">
              <input className="input" placeholder="e.g. Beefsteak" value={variety} onChange={e => setVariety(e.target.value)} />
            </Field>
            <Field label="Week number">
              <input className="input" type="number" min={1} max={53}
                value={weekNumber} onChange={e => setWeekNumber(Number(e.target.value))} />
            </Field>
            <Field label="Session date">
              <input className="input" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <input className="input" placeholder="Optional notes for scouts"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
        </div>

        <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 7, background: '#f0faf4', border: '0.5px solid #a7dcbc', fontSize: 12, color: '#1e5c3a' }}>
          The assigned scout starts and records observations via the mobile app. Managers can reopen completed sessions if corrections are needed.
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
