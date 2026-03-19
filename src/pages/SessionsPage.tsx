import { useState, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { farmsApi, sessionsApi, adminFarmsApi, adminUsersApi } from '@/services/api'
import type {
  FarmResponse,
  ScoutingSessionDetailDto,
  SessionStatus,
  GreenhouseResponse,
  FieldBlockResponse,
  UserDto,
  SpeciesCode,
} from '@/types'
import type { CreateSessionRequest, SessionTargetRequest } from '@/services/api'
import ConfirmModal from '@/components/common/ConfirmModal'
import SessionPlannerFields, { type SessionPlannerTargetDraft } from '@/components/scouting/SessionPlannerFields'
import { SESSION_STATUS_BADGE, formatDate, exportToCsv, currentWeek } from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'

const ADMIN_ROLES = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER']
const CAN_CREATE_SESSION = new Set(ADMIN_ROLES)
const MANAGEABLE_STATUSES = new Set<SessionStatus>(['DRAFT', 'NEW'])

function isVisibleToRole(session: ScoutingSessionDetailDto, role: string, userId: string): boolean {
  const superAdminStatuses = new Set<SessionStatus>(['DRAFT', 'NEW', 'COMPLETED', 'INCOMPLETE', 'REOPENED'])
  const scoutStatuses = new Set<SessionStatus>(['NEW', 'IN_PROGRESS', 'SUBMITTED', 'REOPENED', 'INCOMPLETE', 'COMPLETED'])

  if (role === 'SUPER_ADMIN') {
    return superAdminStatuses.has(session.status)
  }

  if (role === 'SCOUT') {
    return session.scoutId === userId && scoutStatuses.has(session.status)
  }

  return true
}

function statusFiltersForRole(role: string): { value: SessionStatus | 'ALL'; label: string }[] {
  if (role === 'SCOUT') {
    return [
      { value: 'ALL', label: 'All mine' },
      { value: 'NEW', label: 'New' },
      { value: 'IN_PROGRESS', label: 'In progress' },
      { value: 'SUBMITTED', label: 'Submitted' },
      { value: 'REOPENED', label: 'Reopened' },
      { value: 'INCOMPLETE', label: 'Incomplete' },
      { value: 'COMPLETED', label: 'Completed' },
    ]
  }

  if (role === 'SUPER_ADMIN') {
    return [
      { value: 'ALL', label: 'All' },
      { value: 'DRAFT', label: 'Draft' },
      { value: 'NEW', label: 'New' },
      { value: 'REOPENED', label: 'Reopened' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'INCOMPLETE', label: 'Incomplete' },
    ]
  }

  return [
    { value: 'ALL', label: 'All' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'NEW', label: 'New' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'REOPENED', label: 'Reopened' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'INCOMPLETE', label: 'Incomplete' },
  ]
}

function canManageSession(role: string, status: SessionStatus): boolean {
  return ADMIN_ROLES.includes(role) && MANAGEABLE_STATUSES.has(status)
}

export default function SessionsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const role = user?.role ?? ''
  const canCreate = CAN_CREATE_SESSION.has(role)
  const showActionColumn = ADMIN_ROLES.includes(role)

  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState('')
  const [sessions, setSessions] = useState<ScoutingSessionDetailDto[]>([])
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ScoutingSessionDetailDto | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (role === 'SCOUT') {
      const farmId = user?.farmId
      if (!farmId) return

      farmsApi.get(farmId)
        .then(farm => {
          setFarms([farm])
          setSelectedFarmId(farm.id)
        })
        .catch(() => {
          setSelectedFarmId(farmId)
        })
      return
    }

    farmsApi.list().then(data => {
      setFarms(data)
      if (data.length > 0) setSelectedFarmId(data[0].id)
    })
  }, [role, user?.farmId])

  useEffect(() => {
    if (!selectedFarmId) return
    setLoading(true)
    sessionsApi.list(selectedFarmId)
      .then(setSessions)
      .finally(() => setLoading(false))
  }, [selectedFarmId])

  const filtered = sessions.filter(session => {
    if (!isVisibleToRole(session, role, user?.id ?? '')) return false

    const matchesStatus = statusFilter === 'ALL' || session.status === statusFilter
    const query = search.trim().toLowerCase()
    const matchesSearch =
      !query ||
      session.crop?.toLowerCase().includes(query) ||
      session.variety?.toLowerCase().includes(query) ||
      session.id.toLowerCase().includes(query)

    return matchesStatus && matchesSearch
  })

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3500)
  }

  async function handleDeleteSession() {
    if (!deleteTarget) return
    setDeleteLoading(true)

    try {
      await sessionsApi.delete(deleteTarget.id)
      setSessions(prev => prev.filter(session => session.id !== deleteTarget.id))
      flash('Session deleted')
      setDeleteTarget(null)
    } catch (error: any) {
      flash(error?.response?.data?.message ?? 'Failed to delete session', 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const statusFilters = statusFiltersForRole(role)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
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
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => {
              const rows = filtered.map(session => ({
                id: session.id,
                status: session.status,
                crop: session.crop ?? '',
                variety: session.variety ?? '',
                week: session.weekNumber,
                date: session.sessionDate,
                observations: session.sections.reduce(
                  (count, section) => count + section.observations.filter(observation => !observation.deleted).length,
                  0,
                ),
              }))
              exportToCsv(`sessions-${selectedFarmId}.csv`, rows)
            }}
          >
            Export CSV
          </button>
          {canCreate && (
            <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowCreate(true)}>
              + New session
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            ...(banner.type === 'error'
              ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' }
              : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' }),
          }}
        >
          {banner.msg}
        </div>
      )}

      {role === 'SCOUT' && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            background: '#f9fafb',
            border: '0.5px solid #e5e7eb',
            color: '#6b7280',
          }}
        >
          Draft sessions are hidden from scouts. Open a New session to start recording observations.
        </div>
      )}

      {role === 'SUPER_ADMIN' && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 12,
            background: '#f0f9ff',
            border: '0.5px solid #bae6fd',
            color: '#0369a1',
          }}
        >
          Showing management-visible sessions. In-progress and submitted sessions stay with the assigned scout.
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          farms={farms}
          defaultFarmId={selectedFarmId}
          onCreated={session => {
            if (session.farmId === selectedFarmId) {
              setSessions(prev => [session, ...prev.filter(existing => existing.id !== session.id)])
            }
            setShowCreate(false)
            flash(session.status === 'DRAFT' ? 'Draft session saved' : `Session created - W${session.weekNumber}`)
          }}
          onCancel={() => setShowCreate(false)}
          onError={message => {
            setShowCreate(false)
            flash(message, 'error')
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {role === 'SCOUT' ? (
          <div
            className="input"
            style={{
              width: 180,
              display: 'flex',
              alignItems: 'center',
              background: '#f9fafb',
              color: '#6b7280',
            }}
          >
            {farms[0]?.name ?? 'Your farm'}
          </div>
        ) : (
          <select className="input" style={{ width: 180 }} value={selectedFarmId} onChange={e => setSelectedFarmId(e.target.value)}>
            {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        )}

        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Search by crop or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {statusFilters.map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: '0.5px solid',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
                ...(statusFilter === filter.value
                  ? { background: '#1e5c3a', color: '#fff', borderColor: '#1e5c3a' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }),
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading sessions...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No sessions match your filters</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
                {['Session', 'Date', 'Week', 'Crop / variety', 'Observations', 'Status'].map(header => (
                  <th
                    key={header}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: 10,
                      fontWeight: 500,
                      color: '#9ca3af',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                    }}
                  >
                    {header}
                  </th>
                ))}
                {showActionColumn && (
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: 10,
                      fontWeight: 500,
                      color: '#9ca3af',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                    }}
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(session => {
                const badge = SESSION_STATUS_BADGE[session.status]
                const totalObs = session.sections.reduce(
                  (count, section) => count + section.observations.filter(observation => !observation.deleted).length,
                  0,
                )
                const remoteStartPending = !!(session as any).remoteStartConsentRequired
                const isBlocked = (role === 'FARM_ADMIN' || role === 'MANAGER') && session.status === 'IN_PROGRESS'
                const isManageable = canManageSession(role, session.status)

                return (
                  <tr
                    key={session.id}
                    onClick={() => {
                      if (!isBlocked) navigate(`/sessions/${session.id}`)
                    }}
                    style={{
                      borderBottom: '0.5px solid #f3f4f6',
                      cursor: isBlocked ? 'default' : 'pointer',
                      opacity: isBlocked ? 0.45 : 1,
                    }}
                    onMouseEnter={e => {
                      if (!isBlocked) e.currentTarget.style.background = '#f9fafb'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = ''
                    }}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#9ca3af' }}>
                      {session.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '10px 14px' }}>{formatDate(session.sessionDate)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>W{session.weekNumber}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: '#111827' }}>{session.crop ?? '-'}</span>
                      {session.variety && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{session.variety}</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: totalObs > 0 ? '#111827' : '#9ca3af' }}>{totalObs}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`badge ${badge?.cls ?? 'badge-gray'}`}>{badge?.label ?? session.status}</span>
                        {remoteStartPending && role === 'SCOUT' && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 20,
                              background: '#f59e0b',
                              color: '#fff',
                            }}
                          >
                            start requested
                          </span>
                        )}
                      </div>
                    </td>
                    {showActionColumn && (
                      <td style={{ padding: '10px 14px' }}>
                        {isManageable ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              className="btn-secondary"
                              type="button"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={e => {
                                e.stopPropagation()
                                navigate(`/sessions/${session.id}`)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-danger"
                              type="button"
                              style={{ fontSize: 12, padding: '5px 12px' }}
                              onClick={e => {
                                e.stopPropagation()
                                setDeleteTarget(session)
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>-</span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete session?"
          message={
            <span>
              This will permanently remove session <strong>{deleteTarget.id.slice(0, 8)}</strong>. Only Draft and New sessions can be deleted.
            </span>
          }
          confirmLabel="Delete session"
          onConfirm={handleDeleteSession}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
          tone="danger"
        />
      )}
    </div>
  )
}

function CreateSessionModal({
  farms,
  defaultFarmId,
  onCreated,
  onCancel,
  onError,
}: {
  farms: FarmResponse[]
  defaultFarmId: string
  onCreated: (session: ScoutingSessionDetailDto) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const { week } = currentWeek()
  const [saving, setSaving] = useState(false)
  const [farmId, setFarmId] = useState(defaultFarmId)
  const [scouts, setScouts] = useState<UserDto[]>([])
  const [structures, setStructures] = useState<(GreenhouseResponse | FieldBlockResponse)[]>([])
  const [plannerTargets, setPlannerTargets] = useState<SessionPlannerTargetDraft[]>([])
  const [surveySpeciesCodes, setSurveySpeciesCodes] = useState<SpeciesCode[]>([])
  const [scoutId, setScoutId] = useState('')
  const [crop, setCrop] = useState('')
  const [variety, setVariety] = useState('')
  const [notes, setNotes] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [weekNumber, setWeekNumber] = useState(week)

  const selectedFarm = farms.find(farm => farm.id === farmId)
  const isField = selectedFarm?.structureType === 'FIELD'

  useEffect(() => {
    if (!farmId) return
    adminUsersApi.listScouts(farmId).then(setScouts).catch(() => setScouts([]))
  }, [farmId])

  useEffect(() => {
    if (!farmId || selectedFarm?.structureType === 'OTHER') {
      setStructures([])
      return
    }

    const request = isField ? adminFarmsApi.listFieldBlocks(farmId) : adminFarmsApi.listGreenhouses(farmId)
    request.then(data => setStructures(data as any[])).catch(() => setStructures([]))
    setPlannerTargets([])
  }, [farmId, isField, selectedFarm?.structureType])

  function handleFarmChange(id: string) {
    setFarmId(id)
    setScoutId('')
    setPlannerTargets([])
  }

  async function handleCreate() {
    if (!farmId) {
      onError('Please select a farm')
      return
    }

    const targets: SessionTargetRequest[] | undefined = plannerTargets.length > 0
      ? plannerTargets.map(target => ({
          ...(target.structureType === 'FIELD'
            ? { fieldBlockId: target.structureId }
            : { greenhouseId: target.structureId }),
          includeAllBays: target.includeAllBays,
          includeAllBenches: target.includeAllBenches,
          bayTags: target.includeAllBays ? [] : target.bayTags,
          benchTags: target.includeAllBenches ? [] : target.benchTags,
          areaHectares: target.areaHectares === '' ? undefined : Number(target.areaHectares),
        }))
      : undefined

    setSaving(true)
    try {
      const body: CreateSessionRequest = {
        farmId,
        scoutId: scoutId || undefined,
        targets,
        sessionDate,
        weekNumber,
        crop: crop || undefined,
        variety: variety || undefined,
        surveySpeciesCodes: surveySpeciesCodes.length > 0 ? surveySpeciesCodes : undefined,
        notes: notes || undefined,
      }
      onCreated(await sessionsApi.create(body))
    } catch (error: any) {
      onError(error?.response?.data?.message ?? 'Failed to create session')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '0.5px solid #e5e7eb',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          width: '100%',
          maxWidth: 900,
          padding: 24,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, color: '#111827' }}>New scouting session</h2>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}
          >
            x
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Farm *">
            <select className="input" value={farmId} onChange={e => handleFarmChange(e.target.value)}>
              {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
            </select>
          </Field>

          <Field label="Assigned Scout">
            {scouts.length === 0 ? (
              <div
                style={{
                  padding: '8px 10px',
                  background: '#fffbf0',
                  border: '0.5px solid #fde68a',
                  borderRadius: 7,
                  fontSize: 12,
                  color: '#d97706',
                }}
              >
                No scouts on this farm yet. You can assign one later.
              </div>
            ) : (
              <select className="input" value={scoutId} onChange={e => setScoutId(e.target.value)}>
                <option value="">- Assign later -</option>
                {scouts.map(scout => (
                  <option key={scout.id} value={scout.id}>
                    {scout.firstName} {scout.lastName} ({scout.email})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Crop">
              <input className="input" placeholder="e.g. Tomato" value={crop} onChange={e => setCrop(e.target.value)} />
            </Field>
            <Field label="Variety">
              <input className="input" placeholder="e.g. Beefsteak" value={variety} onChange={e => setVariety(e.target.value)} />
            </Field>
            <Field label="Week number">
              <input
                className="input"
                type="number"
                min={1}
                max={53}
                value={weekNumber}
                onChange={e => setWeekNumber(Number(e.target.value))}
              />
            </Field>
            <Field label="Session date">
              <input className="input" type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <input className="input" placeholder="Optional notes for scouts" value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>

          <SessionPlannerFields
            structures={structures}
            targets={plannerTargets}
            surveySpeciesCodes={surveySpeciesCodes}
            onTargetsChange={setPlannerTargets}
            onSurveySpeciesCodesChange={setSurveySpeciesCodes}
          />
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '8px 12px',
            borderRadius: 7,
            background: '#f0faf4',
            border: '0.5px solid #a7dcbc',
            fontSize: 12,
            color: '#1e5c3a',
          }}
        >
          The assigned scout starts and records observations through the mobile app.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating...' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
