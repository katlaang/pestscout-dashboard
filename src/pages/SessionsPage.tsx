import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { farmsApi, sessionsApi, adminFarmsApi, adminUsersApi } from '@/services/api'
import { useFormDraft } from '@/hooks/useFormDraft'
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
import {
  SESSION_STATUS_BADGE,
  currentWeek,
  exportToCsv,
  formatDate,
  formatLocalDateInput,
  formatSessionWeekLabel,
} from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'
import { useCurrentFarmStore } from '@/hooks/useCurrentFarm'

const ADMIN_ROLES = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER']
const CAN_CREATE_SESSION = new Set(ADMIN_ROLES)
const MANAGEABLE_STATUSES = new Set<SessionStatus>(['DRAFT', 'NEW'])
const ALL_FARMS_VALUE = '__all__'

function isVisibleToRole(session: ScoutingSessionDetailDto, role: string, userId: string): boolean {
  const scoutStatuses = new Set<SessionStatus>(['NEW', 'IN_PROGRESS', 'SUBMITTED', 'REOPENED', 'INCOMPLETE', 'COMPLETED'])

  if (role === 'SUPER_ADMIN') {
    return true
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
      { value: 'IN_PROGRESS', label: 'In progress' },
      { value: 'SUBMITTED', label: 'Submitted' },
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
  const { farmId: currentFarmId } = useCurrentFarmStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const role = user?.role ?? ''
  const isScout = role === 'SCOUT'
  const isSuperAdmin = role === 'SUPER_ADMIN'
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
    if (isScout) {
      const farmId = user?.farmId
      if (!farmId) return

      setFarms([])
      setSelectedFarmId(farmId)
      return
    }

    farmsApi.list().then(data => {
      const farmParam = searchParams.get('farm')
      const matchedFarm = farmParam ? data.find(farm => farm.id === farmParam) : undefined

      setFarms(data)

      if (isSuperAdmin && (farmParam === ALL_FARMS_VALUE || !farmParam)) {
        setSelectedFarmId(ALL_FARMS_VALUE)
        return
      }

      if (matchedFarm) {
        setSelectedFarmId(matchedFarm.id)
        return
      }

      if (data.length > 0) {
        setSelectedFarmId(isSuperAdmin ? ALL_FARMS_VALUE : (currentFarmId ?? data[0].id))
      }
    })
  }, [isScout, isSuperAdmin, searchParams, user?.farmId, currentFarmId])

  useEffect(() => {
    if (!selectedFarmId) return
    setLoading(true)

    const listPromise = isSuperAdmin && selectedFarmId === ALL_FARMS_VALUE
      ? sessionsApi.list()
      : sessionsApi.list(selectedFarmId)

    listPromise
      .then(setSessions)
      .finally(() => setLoading(false))
  }, [isSuperAdmin, selectedFarmId])

  function handleFarmSelection(nextFarmId: string) {
    setSelectedFarmId(nextFarmId)
    setSearchParams({ farm: nextFarmId }, { replace: true })
  }

  const filtered = sessions.filter(session => {
    if (!isVisibleToRole(session, role, user?.id ?? '')) return false

    const matchesStatus = statusFilter === 'ALL' || session.status === statusFilter
    const query = search.trim().toLowerCase()
    const matchesSearch =
      !query ||
      session.crop?.toLowerCase().includes(query) ||
      session.variety?.toLowerCase().includes(query) ||
      session.id.toLowerCase().includes(query) ||
      session.farmName?.toLowerCase().includes(query)

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
  const showFarmColumn = isSuperAdmin && selectedFarmId === ALL_FARMS_VALUE

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
            {isScout
              ? 'Your assigned scouting sessions'
              : isSuperAdmin && selectedFarmId === ALL_FARMS_VALUE
              ? 'All-farm session board with optional farm filtering'
              : isSuperAdmin
              ? 'Sessions for the selected farm'
              : 'Sessions across your attached farms'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => {
              const rows = filtered.map(session => ({
                id: session.id,
                farm: session.farmName ?? '',
                status: session.status,
                crop: session.crop ?? '',
                variety: session.variety ?? '',
                week: formatSessionWeekLabel(session),
                date: session.sessionDate,
                restricted: session.openRestricted ? 'Yes' : 'No',
                observations: session.sections.reduce(
                  (count, section) => count + section.observations.filter(observation => !observation.deleted).length,
                  0,
                ),
              }))
              exportToCsv(`sessions-${selectedFarmId || 'board'}.csv`, rows)
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
          In-progress sessions remain visible across farms, but rows marked restricted cannot be opened until the scout finishes that active work.
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          farms={farms}
          currentUserRole={role}
          defaultFarmId={selectedFarmId === ALL_FARMS_VALUE ? (farms[0]?.id ?? '') : selectedFarmId}
          onCreated={session => {
            if (selectedFarmId === ALL_FARMS_VALUE || session.farmId === selectedFarmId) {
              setSessions(prev => [session, ...prev.filter(existing => existing.id !== session.id)])
            }
            setShowCreate(false)
            flash(session.status === 'DRAFT' ? 'Draft session saved' : `Session created - ${formatSessionWeekLabel(session)}`)
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {isScout ? (
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
          <select className="input" style={{ width: 220 }} value={selectedFarmId} onChange={e => handleFarmSelection(e.target.value)}>
            {isSuperAdmin && <option value={ALL_FARMS_VALUE}>All farms</option>}
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
                {[
                  ...(showFarmColumn ? ['Farm'] : []),
                  'Session',
                  'Date',
                  'Week',
                  'Crop / variety',
                  'Observations',
                  'Status',
                ].map(header => (
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
                const isBlocked = !isScout && !!session.openRestricted
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
                    {showFarmColumn && (
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: '#111827', fontWeight: 500 }}>{session.farmName ?? 'Unknown farm'}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>{session.farmId.slice(0, 8)}</span>
                        </div>
                      </td>
                    )}
                    <td style={{ padding: '10px 14px', fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#9ca3af' }}>
                      {session.id.slice(0, 8)}...
                    </td>
                    <td style={{ padding: '10px 14px' }}>{formatDate(session.sessionDate)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{formatSessionWeekLabel(session)}</td>
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
                        {isBlocked && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 20,
                              background: '#6b7280',
                              color: '#fff',
                            }}
                          >
                            restricted
                          </span>
                        )}
                      </div>
                    </td>
                    {showActionColumn && (
                      <td style={{ padding: '10px 14px' }}>
                        {isBlocked ? (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>
                            Locked while in progress
                          </span>
                        ) : isManageable ? (
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
  currentUserRole,
  defaultFarmId,
  onCreated,
  onCancel,
}: {
  farms: FarmResponse[]
  currentUserRole: string
  defaultFarmId: string
  onCreated: (session: ScoutingSessionDetailDto) => void
  onCancel: () => void
}) {
  const { week: defaultWeek } = currentWeek()
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [dismissSaving, setDismissSaving] = useState(false)
  const [dismissPromptOpen, setDismissPromptOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDraftBanner, setShowDraftBanner] = useState(true)
  const [initialSessionDate] = useState(() => formatLocalDateInput())
  const [farmId, setFarmId] = useState(defaultFarmId)
  const [scouts, setScouts] = useState<UserDto[]>([])
  const [scoutSource, setScoutSource] = useState<'farm' | 'fallback' | 'none'>('none')
  const [structures, setStructures] = useState<(GreenhouseResponse | FieldBlockResponse)[]>([])
  const [plannerTargets, setPlannerTargets] = useState<SessionPlannerTargetDraft[]>([])
  const [surveySpeciesCodes, setSurveySpeciesCodes] = useState<SpeciesCode[]>([])
  const [customSurveySpeciesIds, setCustomSurveySpeciesIds] = useState<string[]>([])
  const [scoutId, setScoutId] = useState('')
  const [crop, setCrop] = useState('')
  const [variety, setVariety] = useState('')
  const [notes, setNotes] = useState('')
  const [sessionDate, setSessionDate] = useState(initialSessionDate)
  const [weekNumber, setWeekNumber] = useState(defaultWeek)

  // ── Local draft autosave (survives idle timeout) ──────────────────────────
  const draftState = { farmId, scoutId, crop, variety, notes, sessionDate, weekNumber, plannerTargets, surveySpeciesCodes, customSurveySpeciesIds }
  type DraftState = typeof draftState

  const applyDraft = useCallback((d: DraftState) => {
    setFarmId(d.farmId ?? defaultFarmId)
    setScoutId(d.scoutId ?? '')
    setCrop(d.crop ?? '')
    setVariety(d.variety ?? '')
    setNotes(d.notes ?? '')
    setSessionDate(d.sessionDate ?? initialSessionDate)
    setWeekNumber(d.weekNumber ?? defaultWeek)
    setPlannerTargets(d.plannerTargets ?? [])
    setSurveySpeciesCodes(d.surveySpeciesCodes ?? [])
    setCustomSurveySpeciesIds(d.customSurveySpeciesIds ?? [])
  // setters are stable; include initialSessionDate & defaultWeek as values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFarmId, defaultWeek, initialSessionDate])

  const { hasDraft, draftAge, restoreDraft, clearDraft } = useFormDraft(
    `session-create-${user?.id ?? 'anon'}`,
    draftState,
    applyDraft,
    { expiryMs: 60 * 60 * 1000 },  // 1-hour expiry
  )
  const selectedFarm = farms.find(farm => farm.id === farmId)
  const isDirty =
    farmId !== defaultFarmId ||
    scoutId.trim() !== '' ||
    crop.trim() !== '' ||
    variety.trim() !== '' ||
    notes.trim() !== '' ||
    plannerTargets.length > 0 ||
    surveySpeciesCodes.length > 0 ||
    customSurveySpeciesIds.length > 0 ||
    sessionDate !== initialSessionDate ||
    weekNumber !== defaultWeek

  useEffect(() => {
    if (!farmId) return

    function isAssignableScout(scout: UserDto) {
      return scout.role === 'SCOUT' && scout.isEnabled && scout.active && !scout.deleted
    }

    function dedupeScouts(list: UserDto[]) {
      return Array.from(new Map(list.map(scout => [scout.id, scout])).values())
    }

    Promise.all([
      adminUsersApi.listScouts(farmId).catch(() => [] as UserDto[]),
      currentUserRole === 'SUPER_ADMIN'
        ? adminUsersApi.list({ role: 'SCOUT' }).catch(() => [] as UserDto[])
        : Promise.resolve([] as UserDto[]),
    ])
      .then(([farmScopedScouts, allScouts]) => {
        const assignableFarmScouts = dedupeScouts(farmScopedScouts.filter(isAssignableScout))
        if (assignableFarmScouts.length > 0) {
          setScouts(assignableFarmScouts)
          setScoutSource('farm')
          return
        }

        if (currentUserRole === 'SUPER_ADMIN') {
          const fallbackScouts = dedupeScouts(allScouts.filter(isAssignableScout))
          setScouts(fallbackScouts)
          setScoutSource(fallbackScouts.length > 0 ? 'fallback' : 'none')
          return
        }

        setScouts([])
        setScoutSource('none')
      })
      .catch(() => {
        setScouts([])
        setScoutSource('none')
      })
  }, [currentUserRole, farmId])

  useEffect(() => {
    if (!farmId) {
      setStructures([])
      setPlannerTargets([])
      return
    }

    const loadStructures = async () => {
      if (selectedFarm?.structureType === 'GREENHOUSE') {
        return adminFarmsApi.listGreenhouses(farmId)
      }
      if (selectedFarm?.structureType === 'FIELD') {
        return adminFarmsApi.listFieldBlocks(farmId)
      }

      const [greenhouses, fieldBlocks] = await Promise.all([
        adminFarmsApi.listGreenhouses(farmId).catch(() => [] as GreenhouseResponse[]),
        adminFarmsApi.listFieldBlocks(farmId).catch(() => [] as FieldBlockResponse[]),
      ])

      if (greenhouses.length > 0 && fieldBlocks.length === 0) return greenhouses
      if (fieldBlocks.length > 0 && greenhouses.length === 0) return fieldBlocks
      return [...greenhouses, ...fieldBlocks]
    }

    loadStructures()
      .then(data => setStructures(data as (GreenhouseResponse | FieldBlockResponse)[]))
      .catch(() => setStructures([]))
    setPlannerTargets([])
  }, [farmId, selectedFarm?.structureType])

  function handleFarmChange(id: string) {
    setFarmId(id)
    setScoutId('')
    setPlannerTargets([])
    setSurveySpeciesCodes([])
    setCustomSurveySpeciesIds([])
    setError(null)
  }

  function buildTargets(): SessionTargetRequest[] | undefined {
    return plannerTargets.length > 0
      ? plannerTargets.map(target => ({
          ...(target.structureType === 'FIELD'
            ? {
                fieldBlockId: target.structureId,
                areaHectares: target.areaHectares === '' ? undefined : Number(target.areaHectares),
              }
            : {
                greenhouseId: target.structureId,
                includeAllBays: target.includeAllBays,
                includeAllBenches: target.includeAllBenches,
                bayTags: target.includeAllBays ? [] : target.bayTags,
                benchTags: target.includeAllBenches ? [] : target.benchTags,
                areaHectares: target.areaHectares === '' ? undefined : Number(target.areaHectares),
              }),
        }))
      : undefined
  }

  function buildRequestBody(status?: SessionStatus): CreateSessionRequest {
    return {
      farmId,
      scoutId: scoutId || undefined,
      targets: buildTargets(),
      status,
      sessionDate,
      weekNumber,
      crop: crop || undefined,
      variety: variety || undefined,
      surveySpeciesCodes: surveySpeciesCodes.length > 0 ? surveySpeciesCodes : undefined,
      customSurveySpeciesIds: customSurveySpeciesIds.length > 0 ? customSurveySpeciesIds : undefined,
      notes: notes || undefined,
    }
  }

  async function createDraftAndClose() {
    if (!farmId || saving || dismissSaving) {
      if (!farmId) onCancel()
      return
    }

    setDismissSaving(true)
    setError(null)
    try {
      clearDraft()
      onCreated(await sessionsApi.create(buildRequestBody('DRAFT')))
    } catch (error: any) {
      setError(error?.response?.data?.message ?? 'Failed to save draft session')
      setDismissPromptOpen(false)
    } finally {
      setDismissSaving(false)
    }
  }

  async function handleCreate() {
    if (!farmId) {
      setError('Please select a farm')
      return
    }

    setSaving(true)
    setError(null)
    try {
      clearDraft()
      onCreated(await sessionsApi.create(buildRequestBody()))
    } catch (error: any) {
      setError(error?.response?.data?.message ?? 'Failed to create session')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (saving || dismissSaving) return
    onCancel()
  }

  function handleRequestDismiss() {
    if (saving || dismissSaving) return
    if (!isDirty) {
      onCancel()
      return
    }
    setDismissPromptOpen(true)
  }

  function handleBackdropDismiss() {
    if (saving || dismissSaving) return
    if (!isDirty) {
      onCancel()
      return
    }
    void createDraftAndClose()
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
        if (e.target === e.currentTarget) handleBackdropDismiss()
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
            onClick={handleRequestDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}
          >
            x
          </button>
        </div>

        {hasDraft && showDraftBanner && (
          <div style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: '#f0faf4', border: '0.5px solid #a7dcbc',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ flex: 1, color: '#1e5c3a' }}>
              💾 You have an unsaved draft
              {draftAge != null && draftAge > 60_000
                ? ` from ${Math.round(draftAge / 60_000)} min ago`
                : ' from just now'
              } — restore it?
            </span>
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => { restoreDraft(); setShowDraftBanner(false) }}
            >
              Restore
            </button>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', lineHeight: 1, padding: '0 2px' }}
              onClick={() => { clearDraft(); setShowDraftBanner(false) }}
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12,
              background: '#fff5f5',
              border: '0.5px solid #fca5a5',
              color: '#c53030',
            }}
          >
            {error}
          </div>
        )}

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select className="input" value={scoutId} onChange={e => setScoutId(e.target.value)}>
                  <option value="">- Assign later -</option>
                  {scouts.map(scout => (
                    <option key={scout.id} value={scout.id}>
                      {scout.firstName} {scout.lastName} ({scout.email})
                    </option>
                  ))}
                </select>
                {scoutSource === 'fallback' && (
                  <div
                    style={{
                      padding: '8px 10px',
                      background: '#f0f9ff',
                      border: '0.5px solid #bae6fd',
                      borderRadius: 7,
                      fontSize: 12,
                      color: '#0369a1',
                    }}
                  >
                    No farm-scoped scouts were returned for this farm, so the full active scout list is shown instead.
                  </div>
                )}
              </div>
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
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
            farmId={farmId}
            farmStructureType={selectedFarm?.structureType}
            structures={structures}
            targets={plannerTargets}
            surveySpeciesCodes={surveySpeciesCodes}
            customSurveySpeciesIds={customSurveySpeciesIds}
            onTargetsChange={setPlannerTargets}
            onSurveySpeciesCodesChange={setSurveySpeciesCodes}
            onCustomSurveySpeciesIdsChange={setCustomSurveySpeciesIds}
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
          The assigned scout starts and records observations through the scout interface on web, tablet, or mobile.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" onClick={handleCancel} disabled={saving || dismissSaving}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving || dismissSaving}>
            {saving ? 'Creating...' : 'Create session'}
          </button>
        </div>

        {dismissPromptOpen && (
          <DraftDismissModal
            loading={dismissSaving}
            onSaveDraft={() => void createDraftAndClose()}
            onDelete={onCancel}
            onContinue={() => setDismissPromptOpen(false)}
          />
        )}
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

function DraftDismissModal({
  loading,
  onSaveDraft,
  onDelete,
  onContinue,
}: {
  loading: boolean
  onSaveDraft: () => void
  onDelete: () => void
  onContinue: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) onContinue()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 12,
          border: '0.5px solid #e5e7eb',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          padding: 24,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 10 }}>Save this session as a draft?</h3>
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 8,
            background: '#f9fafb',
            border: '0.5px solid #e5e7eb',
            fontSize: 12,
            color: '#374151',
          }}
        >
          Closing from the X keeps the work as a draft. Delete will discard this unsaved session instead.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-secondary" type="button" onClick={onContinue} disabled={loading}>
            Continue editing
          </button>
          <button className="btn-danger" type="button" onClick={onDelete} disabled={loading}>
            Delete
          </button>
          <button className="btn-primary" type="button" onClick={onSaveDraft} disabled={loading}>
            {loading ? 'Saving draft...' : 'Save to draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
