import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sessionsApi, adminUsersApi, adminFarmsApi } from '@/services/api'
import ObservationGrid, { type ObservationGridHandle } from '@/components/scouting/ObservationGrid'
import SessionRemarkPhotos, { type SessionRemarkPhotosHandle } from '@/components/scouting/SessionRemarkPhotos'
import SessionPlannerFields, { type SessionPlannerTargetDraft } from '@/components/scouting/SessionPlannerFields'
import ConfirmModal from '@/components/common/ConfirmModal'
import type {
  ScoutingSessionDetailDto,
  ScoutingSessionAuditDto,
  UserDto,
  GreenhouseResponse,
  FieldBlockResponse,
  SpeciesCode,
} from '@/types'
import {
  SESSION_STATUS_BADGE,
  SPECIES_LABELS,
  exportToCsv,
  formatDate,
  formatDateTime,
  formatLocalTimeInput,
  formatSessionWeekLabel,
  getDeviceTimeZone,
  getDeviceTimeZoneOptions,
} from '@/utils'
import { buildSessionNotesValue, parseSessionNotesValue } from '@/utils/sessionNotes'
import { useAuthStore } from '@/hooks/useAuth'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STARTABLE: string[] = ['NEW', 'REOPENED', 'INCOMPLETE']

function actorLabel(user: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return 'Unknown'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown'
}

function isAssignableScout(user: UserDto) {
  return user.role === 'SCOUT' && user.isEnabled && user.active && !user.deleted
}

function dedupeUsers(users: UserDto[]) {
  return Array.from(new Map(users.map(item => [item.id, item])).values())
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [session,       setSession]       = useState<ScoutingSessionDetailDto | null>(null)
  const [audits,        setAudits]        = useState<ScoutingSessionAuditDto[]>([])
  const [loading,       setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [banner,        setBanner]        = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [deviceDefaults] = useState(() => ({
    observationTime: formatLocalTimeInput(),
    observationTimezone: getDeviceTimeZone(),
    timezoneOptions: getDeviceTimeZoneOptions(),
  }))

  // Planner fields for draft/new sessions
  const [scouts,        setScouts]        = useState<UserDto[]>([])
  const [plannerStructures, setPlannerStructures] = useState<(GreenhouseResponse | FieldBlockResponse)[]>([])
  const [plannerTargets, setPlannerTargets] = useState<SessionPlannerTargetDraft[]>([])
  const [surveySpeciesCodes, setSurveySpeciesCodes] = useState<SpeciesCode[]>([])
  const [customSurveySpeciesIds, setCustomSurveySpeciesIds] = useState<string[]>([])
  const [draftScoutId,  setDraftScoutId]  = useState('')
  const [draftDate,     setDraftDate]     = useState('')
  const [draftWeek,     setDraftWeek]     = useState<number>(1)
  const [draftCrop,     setDraftCrop]     = useState('')
  const [draftVariety,  setDraftVariety]  = useState('')
  const [draftNotes,    setDraftNotes]    = useState('')
  const [draftSaving,   setDraftSaving]   = useState(false)
  const [plannerEditing, setPlannerEditing] = useState(false)
  const [weatherTemp,   setWeatherTemp]   = useState('')
  const [weatherRh,     setWeatherRh]     = useState('')
  const [weatherTime,   setWeatherTime]   = useState('')
  const [weatherTimezone, setWeatherTimezone] = useState('')
  const [weatherNotes,  setWeatherNotes]  = useState('')
  const [weatherSaving, setWeatherSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [assignedScoutName, setAssignedScoutName] = useState('')

  // Modals
  const [showCompleteWarn, setShowCompleteWarn] = useState(false)
  const [showAcceptWarn,   setShowAcceptWarn]   = useState(false)
  const [showReopenModal,  setShowReopenModal]  = useState(false)
  const [showRemoteModal,  setShowRemoteModal]  = useState(false)
  const [showAuditTrail,   setShowAuditTrail]   = useState(false)
  const [showDeleteModal,  setShowDeleteModal]  = useState(false)
  const observationGridRefs = useRef<Record<string, ObservationGridHandle | null>>({})
  const hotspotEditorRef = useRef<SessionRemarkPhotosHandle | null>(null)

  const role      = user?.role ?? ''
  const isScout   = role === 'SCOUT'
  const isManager = ['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER'].includes(role)
  const myName    = actorLabel(user)
  const parsedSessionNotes = useMemo(() => parseSessionNotesValue(session?.notes), [session?.notes])

  useEffect(() => {
    if (!sessionId) return
    sessionsApi.get(sessionId)
      .then(setSession)
      .catch(() => setError('Session not found or you do not have access'))
      .finally(() => setLoading(false))
  }, [sessionId])

  // Initialise draft form fields from session whenever it loads/changes
  useEffect(() => {
    if (!session) return
    setDraftScoutId(session.scoutId ?? '')
    setDraftDate(session.sessionDate)
    setDraftWeek(session.weekNumber)
    setDraftCrop(session.crop ?? '')
    setDraftVariety(session.variety ?? '')
    setDraftNotes(parsedSessionNotes.plainNotes)
    setSurveySpeciesCodes(session.surveySpeciesCodes ?? [])
    setCustomSurveySpeciesIds(session.customSurveySpeciesIds ?? [])
    setPlannerTargets(
      session.sections.map(section => ({
        structureId: section.greenhouseId ?? section.fieldBlockId ?? section.targetId,
        structureType: section.greenhouseId ? 'GREENHOUSE' : 'FIELD',
        includeAllBays: section.includeAllBays ?? true,
        includeAllBenches: section.includeAllBenches ?? true,
        bayTags: section.bayTags ?? [],
        benchTags: section.benchTags ?? [],
        areaHectares: section.areaHectares != null ? String(section.areaHectares) : '',
      })),
    )
  }, [parsedSessionNotes.plainNotes, session?.id, session?.version])

  useEffect(() => {
    if (!session) return
    setWeatherTemp(session.temperatureCelsius != null ? String(session.temperatureCelsius) : '')
    setWeatherRh(session.relativeHumidityPercent != null ? String(session.relativeHumidityPercent) : '')
    setWeatherTime(session.observationTime ?? deviceDefaults.observationTime)
    setWeatherTimezone(session.observationTimezone ?? deviceDefaults.observationTimezone)
    setWeatherNotes(session.weatherNotes ?? '')
  }, [
    deviceDefaults,
    session?.id,
    session?.temperatureCelsius,
    session?.relativeHumidityPercent,
    session?.observationTime,
    session?.observationTimezone,
    session?.weatherNotes,
  ])

  useEffect(() => {
    if (!session?.scoutId) {
      setAssignedScoutName('')
      return
    }

    if (user?.id === session.scoutId) {
      setAssignedScoutName(actorLabel(user))
      return
    }

    let alive = true

    adminUsersApi.get(session.scoutId)
      .then(scout => {
        if (!alive) return
        setAssignedScoutName(actorLabel(scout))
      })
      .catch(() => {
        if (!alive) return
        const fallbackScout = scouts.find(item => item.id === session.scoutId)
        setAssignedScoutName(fallbackScout ? actorLabel(fallbackScout) : '')
      })

    return () => {
      alive = false
    }
  }, [session?.scoutId, scouts, user])

  useEffect(() => {
    setPlannerEditing(false)
  }, [session?.id, session?.status])

  // Load scouts list for planner form (managers only)
  useEffect(() => {
    if (!session || !isManager || !['DRAFT', 'NEW'].includes(session.status)) return

    let alive = true

    Promise.all([
      adminUsersApi.listScouts(session.farmId).catch(() => [] as UserDto[]),
      role === 'SUPER_ADMIN'
        ? adminUsersApi.list({ role: 'SCOUT' }).catch(() => [] as UserDto[])
        : Promise.resolve([] as UserDto[]),
      session.scoutId
        ? adminUsersApi.get(session.scoutId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([farmScopedScouts, allScouts, assignedScout]) => {
        if (!alive) return

        const assignableFarmScouts = dedupeUsers(farmScopedScouts.filter(isAssignableScout))
        if (assignableFarmScouts.length > 0) {
          const merged = assignedScout && isAssignableScout(assignedScout)
            ? dedupeUsers([...assignableFarmScouts, assignedScout])
            : assignableFarmScouts
          setScouts(merged)
          return
        }

        if (role === 'SUPER_ADMIN') {
          const fallbackScouts = dedupeUsers(allScouts.filter(isAssignableScout))
          const merged = assignedScout && isAssignableScout(assignedScout)
            ? dedupeUsers([...fallbackScouts, assignedScout])
            : fallbackScouts
          setScouts(merged)
          return
        }

        if (assignedScout && isAssignableScout(assignedScout)) {
          setScouts([assignedScout])
          return
        }

        setScouts([])
      })
      .catch(() => {
        if (!alive) return
        setScouts([])
      })

    return () => {
      alive = false
    }
  }, [session?.status, session?.farmId, session?.scoutId, isManager, role])

  useEffect(() => {
    if (!session || !isManager || !['DRAFT', 'NEW'].includes(session.status)) return

    Promise.all([
      adminFarmsApi.listGreenhouses(session.farmId).catch(() => [] as GreenhouseResponse[]),
      adminFarmsApi.listFieldBlocks(session.farmId).catch(() => [] as FieldBlockResponse[]),
    ]).then(([greenhouses, fieldBlocks]) => {
      const hasGreenhouseTargets = session.sections.some(section => !!section.greenhouseId)
      const hasFieldTargets = session.sections.some(section => !!section.fieldBlockId)

      if (hasGreenhouseTargets || (greenhouses.length > 0 && fieldBlocks.length === 0)) {
        setPlannerStructures(greenhouses)
        return
      }

      if (hasFieldTargets || (fieldBlocks.length > 0 && greenhouses.length === 0)) {
        setPlannerStructures(fieldBlocks)
        return
      }

      setPlannerStructures([...greenhouses, ...fieldBlocks])
    })
  }, [session?.farmId, session?.status, session?.sections, isManager])

  useEffect(() => {
    if (!showAuditTrail || !sessionId) return
    sessionsApi.audits(sessionId).then(setAudits).catch(() => setAudits([]))
  }, [showAuditTrail, sessionId])

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 4000)
  }

  async function reloadSessionState() {
    if (!sessionId) {
      throw new Error('Session not found')
    }

    const latestSession = await sessionsApi.get(sessionId)
    setSession(latestSession)
    return latestSession
  }

  async function updateSessionWithRetry(
    buildBody: (baseSession: ScoutingSessionDetailDto) => Record<string, unknown>,
  ) {
    if (!sessionId || !session) return null

    try {
      const updatedSession = await sessionsApi.update(sessionId, buildBody(session))
      setSession(updatedSession)
      return updatedSession
    } catch (error: any) {
      if (error?.response?.status !== 409) {
        throw error
      }

      const latestSession = await reloadSessionState()
      const retriedSession = await sessionsApi.update(sessionId, buildBody(latestSession))
      setSession(retriedSession)
      return retriedSession
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleStart() {
    if (!sessionId || !session) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.start(sessionId))
      flash('Session started — now in progress')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to start session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleAcceptRemoteStart() {
    if (!sessionId) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.acceptRemoteStart(sessionId))
      flash('Remote start accepted — session is now in progress')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to accept remote start', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleRequestRemoteStart(comment: string) {
    if (!sessionId || !session) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.remoteStartRequest(sessionId, {
        version: session.version, actorName: myName, comment: comment || undefined,
      }))
      flash('Remote start request sent — scout has been notified')
      setShowRemoteModal(false)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to send remote start request', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleSubmit(comment: string) {
    if (!sessionId || !session) return
    setActionLoading(true)
    try {
      await hotspotEditorRef.current?.flushPendingChanges()
      for (const section of session.sections) {
        await observationGridRefs.current[section.targetId]?.flushPendingChanges()
      }

      const latestSession = await sessionsApi.get(sessionId)
      setSession(latestSession)

      setSession(await sessionsApi.submit(sessionId, {
        version: latestSession.version,
        confirmationAcknowledged: true,
        actorName: myName, comment: comment || undefined,
      }))
      flash('Session submitted for approval')
      setShowCompleteWarn(false)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to submit session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleAccept(comment: string) {
    if (!sessionId || !session) return
    setActionLoading(true)
    try {
      const latestSession = await sessionsApi.get(sessionId)
      setSession(latestSession)

      setSession(await sessionsApi.accept(sessionId, {
        version: latestSession.version,
        actorName: myName,
        comment: comment || undefined,
      }))
      flash('Session accepted and marked completed')
      setShowAcceptWarn(false)
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to accept session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleSaveDraft() {
    if (!sessionId || !session) return
    setDraftSaving(true)
    try {
      const previousStatus = session.status
      const updated = await updateSessionWithRetry(baseSession => {
        const baseParsedNotes = parseSessionNotesValue(baseSession.notes)

        return {
          scoutId: draftScoutId || undefined,
          sessionDate: draftDate,
          weekNumber: draftWeek,
          crop: draftCrop || undefined,
          variety: draftVariety || undefined,
          surveySpeciesCodes: surveySpeciesCodes.length > 0 ? surveySpeciesCodes : undefined,
          customSurveySpeciesIds: customSurveySpeciesIds.length > 0 ? customSurveySpeciesIds : undefined,
          targets: plannerTargets.map(target => ({
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
          })),
          notes: buildSessionNotesValue(draftNotes, baseParsedNotes.metadata),
          version: baseSession.version,
          actorName: myName,
        }
      })
      if (!updated) return
      setPlannerEditing(false)
      if (previousStatus === 'DRAFT' && updated.status === 'NEW') {
        navigate('/sessions', { replace: true })
        return
      }
      flash(previousStatus === 'DRAFT' ? 'Draft saved' : 'Session saved')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to save session', 'error')
    } finally { setDraftSaving(false) }
  }

  async function handleSaveWeather() {
    if (!sessionId || !session) return
    setWeatherSaving(true)
    try {
      const updated = await updateSessionWithRetry(baseSession => ({
        temperatureCelsius: weatherTemp === '' ? undefined : Number(weatherTemp),
        relativeHumidityPercent: weatherRh === '' ? undefined : Number(weatherRh),
        observationTime: weatherTime || undefined,
        observationTimezone: weatherTimezone.trim() || undefined,
        weatherNotes: weatherNotes || undefined,
        version: baseSession.version,
        actorName: myName,
      }))
      if (!updated) return
      flash('Weather values saved')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to save weather values', 'error')
    } finally {
      setWeatherSaving(false)
    }
  }

  async function handleReopen(comment: string) {
    if (!sessionId) return
    setActionLoading(true)
    try {
      setSession(await sessionsApi.reopen(sessionId, {
        comment: comment || undefined, actorName: myName,
      }))
      flash('Session reopened — scout can now edit again')
      setShowReopenModal(false)
      // Refresh audit trail if visible
      sessionsApi.audits(sessionId).then(setAudits).catch(() => {})
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to reopen session', 'error')
    } finally { setActionLoading(false) }
  }

  async function handleDeleteSession() {
    if (!sessionId) return
    setDeleteLoading(true)
    try {
      await sessionsApi.delete(sessionId)
      navigate('/sessions', { replace: true })
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to delete session', 'error')
      setDeleteLoading(false)
      setShowDeleteModal(false)
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────
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

  // ── Derived state ─────────────────────────────────────────────────────────
  const badge      = SESSION_STATUS_BADGE[session.status]
  const allObs     = session.sections.flatMap(s => s.observations.filter(o => !o.deleted))
  const pestObs    = allObs.filter(o => o.category === 'PEST').length
  const diseaseObs = allObs.filter(o => o.category === 'DISEASE').length

  const isAssignedScout    = isScout && session.scoutId === user?.id
  const canManagePlanner   = isManager && ['DRAFT', 'NEW'].includes(session.status)
  const plannerReadOnly    = canManagePlanner && !plannerEditing
  const canDeleteSession   = isManager && ['DRAFT', 'NEW'].includes(session.status)
  // remoteStartConsentRequired is a runtime field — present in the enriched backend version
  const remoteStartPending = !!(session as any).remoteStartConsentRequired

  //
  // Action matrix — mirrors SessionStateMachine + @PreAuthorize in ScoutingSessionController
  //
  // SCOUT only (assigned to this session):
  const canStart = isAssignedScout && STARTABLE.includes(session.status)
  const canSubmit = isAssignedScout && ['IN_PROGRESS', 'REOPENED', 'INCOMPLETE'].includes(session.status)
  const canAccept = isManager && session.status === 'SUBMITTED'
  const isWaitingForApproval = isAssignedScout && session.status === 'SUBMITTED'

  // MANAGER / FARM_ADMIN / SUPER_ADMIN — reopen is COMPLETED only (per reopenSession service)
  const canReopen = isManager && session.status === 'COMPLETED'
  const canEditWeather =
    isAssignedScout && ['IN_PROGRESS', 'REOPENED', 'INCOMPLETE'].includes(session.status)
  const canEditRemarkPhotos = isAssignedScout && ['IN_PROGRESS', 'REOPENED', 'INCOMPLETE'].includes(session.status)
  const canSeeAuditTrail = !isScout
  const isOpenRestricted = !isScout && !!session.openRestricted
  const parsedWeatherTemp = weatherTemp.trim() === '' ? null : Number(weatherTemp)
  const parsedWeatherRh = weatherRh.trim() === '' ? null : Number(weatherRh)
  const weatherHasValues =
    weatherTemp.trim() !== '' ||
    weatherRh.trim() !== '' ||
    weatherTime.trim() !== '' ||
    weatherTimezone.trim() !== '' ||
    weatherNotes.trim() !== ''
  const weatherDirty =
    (parsedWeatherTemp ?? null) !== (session.temperatureCelsius ?? null) ||
    (parsedWeatherRh ?? null) !== (session.relativeHumidityPercent ?? null) ||
    weatherTime !== (session.observationTime ?? '') ||
    weatherTimezone.trim() !== (session.observationTimezone ?? '').trim() ||
    weatherNotes.trim() !== (session.weatherNotes ?? '').trim()
  const weatherPanelTone = weatherSaving
    ? {
        background: '#eff6ff',
        border: '0.5px solid #93c5fd',
        title: '#1d4ed8',
        body: '#1e40af',
        hint: 'Saving weather values...',
      }
    : weatherDirty
    ? {
        background: '#fffbeb',
        border: '0.5px solid #fde68a',
        title: '#92400e',
        body: '#92400e',
        hint: 'Weather changes are not saved yet.',
      }
    : weatherHasValues
    ? {
        background: '#f0faf4',
        border: '0.5px solid #a7dcbc',
        title: '#1e5c3a',
        body: '#1e5c3a',
        hint: 'Weather values are saved.',
      }
    : {
        background: '#ffffff',
        border: '0.5px solid #e5e7eb',
        title: '#374151',
        body: '#6b7280',
        hint: 'Enter the weather values manually for now.',
      }

  if (isOpenRestricted) return (
    <div style={{ padding: '24px 28px', maxWidth: 760 }}>
      <div className="card" style={{ border: '0.5px solid #d1d5db' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ color: '#111827', fontSize: 20, marginBottom: 6 }}>
              {session.farmName ?? 'Farm session'} · {formatSessionWeekLabel(session)}
            </h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              This session is still in progress and is restricted for management access.
            </p>
            <div style={{ padding: '12px 14px', borderRadius: 8, background: '#f9fafb', border: '0.5px solid #e5e7eb', fontSize: 12, color: '#374151' }}>
              The session board keeps this row visible, but the detail page stays blocked until the assigned scout finishes the active session work.
            </div>
          </div>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/sessions')}>
            Back to sessions
          </button>
        </div>
      </div>
    </div>
  )

  // SUPER_ADMIN can request remote start on startable sessions with an assigned scout
  const canRequestRemoteStart =
    role === 'SUPER_ADMIN' &&
    !!session.scoutId &&
    STARTABLE.includes(session.status) &&
    !remoteStartPending

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* Remote-start informational banner — scout sees this when a request is pending */}
      {isAssignedScout && remoteStartPending && (
        <RemoteStartInfoBanner
          requestedByName={(session as any).remoteStartRequestedByName}
          loading={actionLoading}
          onAccept={handleAcceptRemoteStart}
        />
      )}

      {isWaitingForApproval && (
        <div style={{
          marginBottom: 20,
          padding: '12px 14px',
          borderRadius: 10,
          background: '#eff6ff',
          border: '0.5px solid #93c5fd',
          color: '#1e40af',
          fontSize: 12,
        }}>
          This session has been submitted and is now read-only while you wait for manager or admin approval.
        </div>
      )}

      {isAssignedScout && session.status === 'NEW' && (
        <div style={{
          marginBottom: 20,
          padding: '12px 14px',
          borderRadius: 10,
          background: '#fffbeb',
          border: '0.5px solid #fde68a',
          color: '#92400e',
          fontSize: 12,
        }}>
          Start the session before entering counts, remarks, hotspot issues, or weather.
        </div>
      )}

      {/* Planner form */}
      {canManagePlanner && (
        <div className="card" style={{ marginBottom: 20, border: '1.5px solid #bae6fd', background: '#f0f9ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0369a1', marginBottom: 4 }}>
                {session.status === 'DRAFT' ? 'Draft session' : 'Session planner'}
              </p>
              <p style={{ fontSize: 11, color: '#0369a1' }}>
                {session.status === 'DRAFT'
                  ? 'Planning stays Draft until session date, assigned scout, and at least one target are saved.'
                  : 'Review the planning values or click Edit to change them.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {plannerReadOnly ? (
                <button className="btn-secondary" type="button" style={{ fontSize: 12 }} onClick={() => setPlannerEditing(true)}>
                  Edit
                </button>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      setDraftScoutId(session.scoutId ?? '')
                      setDraftDate(session.sessionDate)
                      setDraftWeek(session.weekNumber)
                      setDraftCrop(session.crop ?? '')
                      setDraftVariety(session.variety ?? '')
                      setDraftNotes(parsedSessionNotes.plainNotes)
                      setSurveySpeciesCodes(session.surveySpeciesCodes ?? [])
                      setCustomSurveySpeciesIds(session.customSurveySpeciesIds ?? [])
                      setWeatherTemp(session.temperatureCelsius != null ? String(session.temperatureCelsius) : '')
                      setWeatherRh(session.relativeHumidityPercent != null ? String(session.relativeHumidityPercent) : '')
                      setWeatherTime(session.observationTime ?? deviceDefaults.observationTime)
                      setWeatherTimezone(session.observationTimezone ?? deviceDefaults.observationTimezone)
                      setWeatherNotes(session.weatherNotes ?? '')
                      setPlannerTargets(
                        session.sections.map(section => ({
                          structureId: section.greenhouseId ?? section.fieldBlockId ?? section.targetId,
                          structureType: section.greenhouseId ? 'GREENHOUSE' : 'FIELD',
                          includeAllBays: section.includeAllBays ?? true,
                          includeAllBenches: section.includeAllBenches ?? true,
                          bayTags: section.bayTags ?? [],
                          benchTags: section.benchTags ?? [],
                          areaHectares: section.areaHectares != null ? String(section.areaHectares) : '',
                        })),
                      )
                      setPlannerEditing(false)
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn-primary" type="button" disabled={draftSaving} onClick={handleSaveDraft} style={{ fontSize: 12 }}>
                    {draftSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>
                Assigned Scout {!draftScoutId && <span style={{ color: '#d97706' }}>(required)</span>}
              </label>
              {scouts.length === 0 ? (
                <input
                  className="input"
                  disabled
                  value={draftScoutId ? (assignedScoutName || 'Assigned scout') : 'No scout assigned'}
                />
              ) : (
                <select className="input" value={draftScoutId} disabled={plannerReadOnly} onChange={e => setDraftScoutId(e.target.value)}>
                  <option value="">- Assign later -</option>
                  {scouts.map(s => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.email})</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Session date</label>
                <input className="input" type="date" value={draftDate} disabled={plannerReadOnly} onChange={e => setDraftDate(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Week number</label>
                <input className="input" type="number" min={1} max={53} value={draftWeek} disabled={plannerReadOnly}
                  onChange={e => setDraftWeek(Number(e.target.value))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Crop</label>
                <input className="input" placeholder="e.g. Tomato" value={draftCrop} disabled={plannerReadOnly}
                  onChange={e => setDraftCrop(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Variety</label>
                <input className="input" placeholder="e.g. Beefsteak" value={draftVariety} disabled={plannerReadOnly}
                  onChange={e => setDraftVariety(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Notes</label>
              <input className="input" placeholder="Optional notes for scouts" value={draftNotes} disabled={plannerReadOnly}
                onChange={e => setDraftNotes(e.target.value)} />
            </div>

            <SessionPlannerFields
              farmId={session.farmId}
              farmStructureType={plannerTargets.some(target => target.structureType === 'GREENHOUSE')
                ? 'GREENHOUSE'
                : plannerTargets.some(target => target.structureType === 'FIELD')
                  ? 'FIELD'
                  : undefined}
              structures={plannerStructures}
              targets={plannerTargets}
              surveySpeciesCodes={surveySpeciesCodes}
              customSurveySpeciesIds={customSurveySpeciesIds}
              onTargetsChange={setPlannerTargets}
              onSurveySpeciesCodesChange={setSurveySpeciesCodes}
              onCustomSurveySpeciesIdsChange={setCustomSurveySpeciesIds}
              readOnly={plannerReadOnly}
            />
          </div>
        </div>
      )}

      {/* Reopen comment strip */}
      {session.reopenComment && session.status === 'REOPENED' && (
        <div style={{
          marginBottom: 20, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: '#fffbf0', border: '0.5px solid #fde68a', color: '#92400e',
        }}>
          <strong>Reopened with note:</strong> {session.reopenComment}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ color: '#111827', fontSize: 20 }}>
              {session.crop ?? 'Session'}{session.variety ? ` · ${session.variety}` : ''} — {formatSessionWeekLabel(session)}
            </h1>
            <span className={`badge ${badge?.cls ?? 'badge-gray'}`}>{badge?.label ?? session.status}</span>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(session.sessionDate)}</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {session.farmName ? `${session.farmName} · ` : ''}Scout: {assignedScoutName || 'Unassigned'}
          </p>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {canSeeAuditTrail && <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => setShowAuditTrail(v => !v)}>
            {showAuditTrail ? 'Hide trail' : '📋 Audit trail'}
          </button>}

          {/* SCOUT: Start */}
          {canStart && (
            <button className="btn-primary" style={{ fontSize: 12 }} disabled={actionLoading}
              onClick={handleStart}>
              {actionLoading ? 'Starting…' : '▶ Start session'}
            </button>
          )}

          {/* SCOUT: Complete — opens warning modal */}
          {canSubmit && (
            <button
              style={{ padding: '8px 14px', borderRadius: 8, border: '0.5px solid #059669', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', background: '#059669', color: '#fff' }}
              disabled={actionLoading}
              onClick={() => setShowCompleteWarn(true)}>
              Submit session
            </button>
          )}

          {canAccept && (
            <button className="btn-primary" style={{ fontSize: 12 }} disabled={actionLoading} onClick={() => setShowAcceptWarn(true)}>
              Accept session
            </button>
          )}

          {/* SUPER_ADMIN: Request remote start */}
          {canRequestRemoteStart && (
            <button className="btn-secondary" style={{ fontSize: 12 }} disabled={actionLoading}
              onClick={() => setShowRemoteModal(true)}>
              📡 Request remote start
            </button>
          )}

          {/* MANAGER/ADMIN: Reopen */}
          {canReopen && (
            <button className="btn-secondary" style={{ fontSize: 12, color: '#d97706', borderColor: '#fde68a' }}
              disabled={actionLoading}
              onClick={() => setShowReopenModal(true)}>
              ↩ Reopen session
            </button>
          )}

          {canDeleteSession && (
            <button
              className="btn-danger"
              style={{ fontSize: 12 }}
              disabled={deleteLoading}
              onClick={() => setShowDeleteModal(true)}>
              Delete
            </button>
          )}

          {/* Export */}
          <button className="btn-secondary" style={{ fontSize: 12 }}
            onClick={() => {
              const rows = allObs.map(o => ({
                bay: o.bayTag ?? o.bayIndex, bed: o.benchTag ?? o.benchIndex,
                spot: o.spotIndex,
                species: o.customSpeciesName
                  ?? (o.speciesCode ? SPECIES_LABELS[o.speciesCode] ?? o.speciesCode : undefined)
                  ?? o.customSpeciesCode
                  ?? o.customSpeciesId
                  ?? 'Unknown',
                category: o.category, count: o.count, notes: o.notes ?? '',
              }))
              exportToCsv(`session-${sessionId}.csv`, rows)
            }}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── Audit trail panel ── */}
      {canSeeAuditTrail && showAuditTrail && <AuditTrailPanel audits={audits} />}

      {/* ── Metadata grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Week',        value: formatSessionWeekLabel(session) },
          { label: 'Farm',        value: session.farmName ?? session.farmId },
          { label: 'Date',        value: formatDate(session.sessionDate) },
          { label: 'Scout',       value: assignedScoutName || '—' },
          { label: 'Crop',        value: session.crop ?? '—' },
          { label: 'Variety',     value: session.variety ?? '—' },
          { label: 'Observations',value: String(allObs.length) },
          { label: 'Pests',       value: String(pestObs) },
          { label: 'Diseases',    value: String(diseaseObs) },
          { label: 'Started',     value: session.startedAt ? formatDateTime(session.startedAt) : '—' },
          { label: 'Completed',   value: session.completedAt ? formatDateTime(session.completedAt) : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Notes */}
      {parsedSessionNotes.plainNotes && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Session notes</p>
          <p style={{ fontSize: 12, color: '#6b7280' }}>{parsedSessionNotes.plainNotes}</p>
        </div>
      )}

      <SessionRemarkPhotos
        ref={hotspotEditorRef}
        session={session}
        actorName={myName}
        isEditable={canEditRemarkPhotos}
        onSessionUpdated={setSession}
      />

      {/* Weather */}
      {(canEditWeather ||
        session.temperatureCelsius != null ||
        session.relativeHumidityPercent != null ||
        session.observationTime ||
        session.observationTimezone ||
        session.weatherNotes) && (
        <div className="card" style={{ marginBottom: 20, background: weatherPanelTone.background, border: weatherPanelTone.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 500, color: weatherPanelTone.title, marginBottom: 4 }}>Weather</p>
              <p style={{ fontSize: 11, color: weatherPanelTone.body }}>{weatherPanelTone.hint}</p>
            </div>
            {canEditWeather && (
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={weatherSaving || !weatherDirty} onClick={handleSaveWeather}>
                {weatherSaving ? 'Saving...' : weatherDirty ? 'Save weather' : weatherHasValues ? 'Saved' : 'Save weather'}
              </button>
            )}
          </div>

          {canEditWeather ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Temp</label>
                <input className="input" type="number" value={weatherTemp} onChange={e => setWeatherTemp(e.target.value)} placeholder="Celsius" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>RH</label>
                <input className="input" type="number" value={weatherRh} onChange={e => setWeatherRh(e.target.value)} placeholder="Percent" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Time</label>
                <input className="input" type="time" value={weatherTime} onChange={e => setWeatherTime(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Timezone</label>
                <>
                  <input
                    className="input"
                    list="weather-timezone-options"
                    placeholder="America/Chicago"
                    value={weatherTimezone}
                    onChange={e => setWeatherTimezone(e.target.value)}
                  />
                  <datalist id="weather-timezone-options">
                    {deviceDefaults.timezoneOptions.map(timezone => (
                      <option key={timezone} value={timezone} />
                    ))}
                  </datalist>
                </>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 4 }}>Remarks</label>
                <input className="input" value={weatherNotes} onChange={e => setWeatherNotes(e.target.value)} placeholder="Optional weather notes" />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#374151' }}>
              {session.temperatureCelsius != null && <span>Temp {session.temperatureCelsius} C</span>}
              {session.relativeHumidityPercent != null && <span>RH {session.relativeHumidityPercent}%</span>}
              {session.observationTime && <span>Time {session.observationTime}</span>}
              {session.observationTimezone && <span>Timezone {session.observationTimezone}</span>}
              {session.weatherNotes && <span style={{ color: '#6b7280' }}>{session.weatherNotes}</span>}
            </div>
          )}
        </div>
      )}

      {/* Sections / Observations */}
      {session.sections.map(section => {
        const sectionObs = section.observations.filter(o => !o.deleted)
        const canEditObservations = isAssignedScout && ['IN_PROGRESS', 'REOPENED', 'INCOMPLETE'].includes(session.status)
        const canEditObservationNotes =
          isAssignedScout && ['IN_PROGRESS', 'REOPENED', 'INCOMPLETE'].includes(session.status)
        return (
          <div key={section.targetId} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                {section.greenhouseId ? '🏠 Greenhouse' : '🌾 Field block'}
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8, fontFamily: 'DM Mono, monospace' }}>
                  {(section.greenhouseId ?? section.fieldBlockId ?? '').slice(0, 8)}…
                </span>
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                {sectionObs.length} observation{sectionObs.length !== 1 ? 's' : ''}
              </span>
            </div>
            {section.targetName && (
              <div style={{ marginBottom: 8, fontSize: 12, color: '#374151', fontWeight: 500 }}>
                {section.targetName}
              </div>
            )}
            {section.coverage && (
              <div style={{
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 7,
                background: section.coverage.complete ? '#f0faf4' : '#fffbeb',
                border: `0.5px solid ${section.coverage.complete ? '#a7dcbc' : '#fde68a'}`,
                fontSize: 12,
                color: section.coverage.complete ? '#1e5c3a' : '#92400e',
              }}>
                {section.greenhouseId
                  ? `Coverage ${section.coverage.coveredBays ?? 0}/${section.coverage.totalBays ?? 0} bays, ${section.coverage.coveredBeds ?? 0}/${section.coverage.totalBeds ?? 0} beds${section.coverage.percentComplete != null ? ` (${Math.round(section.coverage.percentComplete)}%)` : ''}`
                  : `Coverage ${section.coverage.coveredBays ?? 0}/${section.coverage.totalBays ?? 0} rows${section.coverage.percentComplete != null ? ` (${Math.round(section.coverage.percentComplete)}%)` : ''}`}
              </div>
            )}
            <ObservationGrid
              ref={grid => {
                observationGridRefs.current[section.targetId] = grid
              }}
              section={section}
              sessionId={sessionId!}
              sessionNotes={session.notes}
              isEditable={canEditObservations}
              canEditNotes={canEditObservationNotes}
              farmId={session.farmId}
              surveySpeciesCodes={session.surveySpeciesCodes}
              customSurveySpeciesIds={session.customSurveySpeciesIds}
              onSessionUpdated={setSession}
            />
          </div>
        )
      })}

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

      {/* ─────── Modals ─────── */}

      {showDeleteModal && (
        <ConfirmModal
          title="Delete session?"
          message={
            <span>
              This will permanently remove this session. Only Draft and New sessions can be deleted.
            </span>
          }
          confirmLabel="Delete session"
          onConfirm={handleDeleteSession}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleteLoading}
          tone="danger"
        />
      )}

      {showCompleteWarn && (
        <WarningModal
          title="Submit this session?"
          warning="Submit this session for manager or admin approval. After submit, the session becomes read-only until it is accepted or reopened."
          confirmLabel="Submit session"
          confirmColor="#059669"
          onConfirm={handleSubmit}
          onCancel={() => setShowCompleteWarn(false)}
          loading={actionLoading}
          commentPlaceholder="Optional submit note"
        />
      )}

      {showAcceptWarn && (
        <WarningModal
          title="Accept this session?"
          warning="Accepting the submitted session marks it completed. Admin roles can reopen it later if more work is needed."
          confirmLabel="Accept session"
          confirmColor="#1e5c3a"
          onConfirm={handleAccept}
          onCancel={() => setShowAcceptWarn(false)}
          loading={actionLoading}
          commentPlaceholder="Optional acceptance note"
        />
      )}

      {showReopenModal && (
        <WarningModal
          title="Reopen this session?"
          warning="The session will be unlocked and the assigned scout can edit observations again. This is recorded in the audit trail with your name."
          confirmLabel="Reopen session"
          confirmColor="#d97706"
          onConfirm={handleReopen}
          onCancel={() => setShowReopenModal(false)}
          loading={actionLoading}
          commentPlaceholder="Reason for reopening (recommended)"
        />
      )}

      {showRemoteModal && (
        <WarningModal
          title="Request remote session start?"
          warning="This notifies the assigned scout to start this session. The scout may ignore this and start independently at any time."
          confirmLabel="Send request"
          confirmColor="#1e5c3a"
          onConfirm={handleRequestRemoteStart}
          onCancel={() => setShowRemoteModal(false)}
          loading={actionLoading}
          commentPlaceholder="Optional message for the scout"
        />
      )}
    </div>
  )
}

// ─── Remote start informational banner ───────────────────────────────────────

function RemoteStartInfoBanner({
  requestedByName, loading, onAccept,
}: {
  requestedByName?: string | null
  loading: boolean
  onAccept: () => void
}) {
  return (
    <div style={{
      marginBottom: 20, borderRadius: 10, overflow: 'hidden',
      border: '1.5px solid #f59e0b', background: '#fffbf0',
    }}>
      <div style={{ background: '#f59e0b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15 }}>📡</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>remoted accessed session start</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          {requestedByName && (
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Requested by <strong>{requestedByName}</strong></p>
          )}
          <p style={{ fontSize: 11, color: '#9ca3af' }}>
            You can accept the remote start or use the ▶ Start session button to start independently.
          </p>
        </div>
        <button className="btn-primary" disabled={loading}
          style={{ fontSize: 13, padding: '9px 20px', background: '#f59e0b', borderColor: '#f59e0b', flexShrink: 0 }}
          onClick={onAccept}>
          {loading ? 'Accepting…' : 'Accept'}
        </button>
      </div>
    </div>
  )
}

// ─── Audit trail panel ────────────────────────────────────────────────────────

const AUDIT_LABEL: Record<string, string> = {
  SESSION_CREATED:                'Created',
  SESSION_VIEWED:                 'Viewed',
  SESSION_EDITED:                 'Edited',
  SESSION_REMOTE_START_REQUESTED: 'Remote start requested',
  SESSION_STARTED:                'Started',
  SESSION_SUBMITTED:              'Submitted for review',
  SESSION_COMPLETED:              'Completed & locked',
  SESSION_REOPENED:               '↩ Reopened',
  SESSION_MARKED_INCOMPLETE:      'Marked incomplete',
}

function AuditTrailPanel({ audits }: { audits: ScoutingSessionAuditDto[] }) {
  if (audits.length === 0) return (
    <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10, background: '#f9fafb', border: '0.5px solid #e5e7eb', fontSize: 12, color: '#9ca3af' }}>
      No audit events yet.
    </div>
  )

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Audit trail
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {audits.map((ev, i) => {
          const isReopen = ev.action === 'SESSION_REOPENED'
          return (
            <div key={ev.id ?? i} style={{
              display: 'grid',
              gridTemplateColumns: '140px 180px 140px 1fr',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 6,
              background: isReopen ? '#fffbf0' : i % 2 === 0 ? '#f9fafb' : '#fff',
              border: isReopen ? '0.5px solid #fde68a' : 'none',
              fontSize: 11,
              alignItems: 'start',
            }}>
              <span style={{ color: '#9ca3af', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : '—'}
              </span>
              <span style={{ fontWeight: isReopen ? 600 : 400, color: isReopen ? '#d97706' : '#374151' }}>
                {AUDIT_LABEL[ev.action] ?? ev.action}
              </span>
              <span style={{ color: '#6b7280' }}>
                {ev.actorName ?? ev.actorEmail ?? '—'}
                {ev.actorRole && (
                  <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 5 }}>({ev.actorRole})</span>
                )}
              </span>
              <span style={{ color: '#9ca3af', fontStyle: ev.comment ? 'normal' : 'italic' }}>
                {ev.comment || (isReopen ? '(no reason given)' : '')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Warning / confirm modal ──────────────────────────────────────────────────

function WarningModal({
  title, warning, confirmLabel, confirmColor,
  onConfirm, onCancel, loading, commentPlaceholder,
}: {
  title: string
  warning: string
  confirmLabel: string
  confirmColor: string
  onConfirm: (comment: string) => void
  onCancel: () => void
  loading: boolean
  commentPlaceholder?: string
}) {
  const [comment, setComment] = useState('')
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: '100%', maxWidth: 420, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 10 }}>{title}</h3>
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: '#fff8f0', border: '0.5px solid #fed7aa', fontSize: 12, color: '#92400e',
        }}>
          ⚠️ {warning}
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#374151', marginBottom: 5 }}>
            Comment <span style={{ color: '#9ca3af' }}>(optional)</span>
          </label>
          <textarea
            className="input"
            style={{ resize: 'vertical', minHeight: 64, fontSize: 12 }}
            placeholder={commentPlaceholder ?? 'Add a note…'}
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', background: confirmColor, color: '#fff', opacity: loading ? 0.7 : 1 }}
            disabled={loading}
            onClick={() => onConfirm(comment)}>
            {loading ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
