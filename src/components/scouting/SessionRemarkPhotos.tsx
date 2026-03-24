import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { scoutingPhotosApi, sessionsApi } from '@/services/api'
import type {
  ConfirmScoutingPhotoRequest,
  RegisterScoutingPhotoResponse,
  ScoutingPhotoDto,
  ScoutingSessionDetailDto,
} from '@/types'
import {
  buildHotspotPhotoPurpose,
  buildSessionNotesValue,
  countWords,
  createHotspotIssueId,
  limitWords,
  parseHotspotPhotoPurpose,
  parseSessionNotesValue,
  type SessionHotspotIssue,
} from '@/utils/sessionNotes'

const MAX_HOTSPOT_PHOTOS = 5
const MAX_HOTSPOT_NOTE_WORDS = 500

type PendingRemarkPhoto = {
  tempId: string
  issueId: string
  localPhotoId: string
  fileName: string
  previewUrl?: string
  capturedAt: string
  status: 'uploading' | 'error'
  errorMessage?: string
}

function isRemarkPhoto(photo: ScoutingPhotoDto) {
  return !photo.sessionTargetId && photo.bayIndex == null && photo.benchIndex == null && photo.spotIndex == null
}

function makeClientPhotoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `remark-photo-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyIssue(): SessionHotspotIssue {
  const now = new Date().toISOString()
  return {
    id: createHotspotIssueId(),
    title: '',
    location: '',
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

function issueLabel(issue: Pick<SessionHotspotIssue, 'title' | 'location'>) {
  return issue.title.trim() || issue.location.trim() || 'Untitled hotspot'
}

function issueIdForPhoto(photo: ScoutingPhotoDto): string {
  const parsedPurpose = parseHotspotPhotoPurpose(photo.purpose)
  if (parsedPurpose.issueId) return parsedPurpose.issueId

  const normalizedLabel = parsedPurpose.label.trim() || 'Imported hotspot'
  return `legacy:${normalizedLabel}`
}

function labelForPhoto(photo: ScoutingPhotoDto): string {
  const parsedPurpose = parseHotspotPhotoPurpose(photo.purpose)
  return parsedPurpose.label.trim() || 'Imported hotspot'
}

function photoPreviewUrl(photo: ScoutingPhotoDto): string | null {
  const value = photo.objectKey?.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) {
    return value
  }
  return null
}

function formatCapturedAt(value?: string | null) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

async function uploadRegisteredPhoto(file: File, registered: RegisterScoutingPhotoResponse) {
  if (!registered.uploadUrl) {
    throw new Error('Photo upload URL was not returned.')
  }

  const headers: Record<string, string> = { ...(registered.uploadHeaders ?? {}) }
  if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = file.type || 'application/octet-stream'
  }

  const response = await fetch(registered.uploadUrl, {
    method: registered.uploadMethod ?? 'PUT',
    headers,
    body: file,
  })

  if (!response.ok) {
    throw new Error('Photo upload failed.')
  }

  if (!registered.objectKey) {
    throw new Error('Photo storage key was not returned.')
  }

  const confirmBody: ConfirmScoutingPhotoRequest = {
    sessionId: registered.sessionId,
    localPhotoId: registered.localPhotoId,
    objectKey: registered.objectKey,
  }

  return scoutingPhotosApi.confirm(confirmBody)
}

export interface SessionRemarkPhotosHandle {
  flushPendingChanges: () => Promise<void>
}

type SessionRemarkPhotosProps = {
  session: ScoutingSessionDetailDto
  actorName: string
  isEditable: boolean
  onSessionUpdated: (session: ScoutingSessionDetailDto) => void
}

const SessionRemarkPhotos = forwardRef<SessionRemarkPhotosHandle, SessionRemarkPhotosProps>(function SessionRemarkPhotos({
  session,
  actorName,
  isEditable,
  onSessionUpdated,
}, ref) {
  const [photos, setPhotos] = useState<ScoutingPhotoDto[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<PendingRemarkPhoto[]>([])
  const [issues, setIssues] = useState<SessionHotspotIssue[]>([])
  const [issuesDirty, setIssuesDirty] = useState(false)
  const [savingIssues, setSavingIssues] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadIssueId, setUploadIssueId] = useState<string | null>(null)
  const [focusIssueId, setFocusIssueId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const savePromiseRef = useRef<Promise<void> | null>(null)

  const parsedNotes = useMemo(() => parseSessionNotesValue(session.notes), [session.notes])

  useEffect(() => {
    if (!issuesDirty) {
      setIssues(parsedNotes.metadata.hotspotIssues)
    }
  }, [issuesDirty, parsedNotes.metadata.hotspotIssues, session.id])

  useEffect(() => {
    let alive = true

    setLoading(true)
    scoutingPhotosApi.listSession(session.id)
      .then(list => {
        if (!alive) return
        setPhotos(list.filter(isRemarkPhoto))
      })
      .catch(() => {
        if (!alive) return
        setPhotos([])
        setError('Could not load session hotspot photos.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [session.id])

  useEffect(() => {
    return () => {
      pendingPhotos.forEach(photo => {
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl)
        }
      })
    }
  }, [pendingPhotos])

  const savedPhotosByIssue = useMemo(() => {
    const next: Record<string, ScoutingPhotoDto[]> = {}

    photos.forEach(photo => {
      const issueId = issueIdForPhoto(photo)
      next[issueId] = next[issueId] ? [...next[issueId], photo] : [photo]
    })

    return next
  }, [photos])

  const pendingPhotosByIssue = useMemo(() => {
    const next: Record<string, PendingRemarkPhoto[]> = {}

    pendingPhotos.forEach(photo => {
      next[photo.issueId] = next[photo.issueId] ? [...next[photo.issueId], photo] : [photo]
    })

    return next
  }, [pendingPhotos])

  const visibleIssues = useMemo(() => {
    const ordered = [...issues]
    const seen = new Set(ordered.map(issue => issue.id))

    Object.entries(savedPhotosByIssue).forEach(([issueId, issuePhotos]) => {
      if (seen.has(issueId)) return
      const firstPhoto = issuePhotos[0]
      ordered.push({
        id: issueId,
        title: labelForPhoto(firstPhoto),
        location: '',
        note: '',
      })
      seen.add(issueId)
    })

    Object.keys(pendingPhotosByIssue).forEach(issueId => {
      if (seen.has(issueId)) return
      ordered.push({
        id: issueId,
        title: issueId.startsWith('legacy:') ? issueId.replace(/^legacy:/, '') : 'Untitled hotspot',
        location: '',
        note: '',
      })
      seen.add(issueId)
    })

    return ordered
  }, [issues, pendingPhotosByIssue, savedPhotosByIssue])

  async function reloadLatestSessionState() {
    const latestSession = await sessionsApi.get(session.id)
    onSessionUpdated(latestSession)
    return latestSession
  }

  async function saveIssuesForSession(
    baseSession: ScoutingSessionDetailDto,
    nextIssues: SessionHotspotIssue[],
  ) {
    const baseNotes = parseSessionNotesValue(baseSession.notes)

    return sessionsApi.update(baseSession.id, {
      notes: buildSessionNotesValue(baseNotes.plainNotes, {
        ...baseNotes.metadata,
        hotspotIssues: nextIssues,
      }),
      version: baseSession.version,
      actorName,
    })
  }

  function setIssueField(issueId: string, field: keyof SessionHotspotIssue, value: string) {
    setIssues(previous => {
      const now = new Date().toISOString()
      const existingIndex = previous.findIndex(issue => issue.id === issueId)
      if (existingIndex === -1) {
        return [
          ...previous,
          {
            id: issueId,
            title: field === 'title' ? value : '',
            location: field === 'location' ? value : '',
            note: field === 'note' ? value : '',
            createdAt: now,
            updatedAt: now,
          },
        ]
      }

      return previous.map(issue => (
        issue.id === issueId
          ? {
              ...issue,
              [field]: field === 'note' ? limitWords(value, MAX_HOTSPOT_NOTE_WORDS) : value,
              updatedAt: now,
            }
          : issue
      ))
    })
    setIssuesDirty(true)
    setError(null)
  }

  function addIssue() {
    const nextIssue = createEmptyIssue()
    setIssues(previous => [...previous, nextIssue])
    setIssuesDirty(true)
    setError(null)
    setFocusIssueId(nextIssue.id)
  }

  function removePendingPhoto(tempId: string) {
    setPendingPhotos(previous => {
      const target = previous.find(photo => photo.tempId === tempId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return previous.filter(photo => photo.tempId !== tempId)
    })
  }

  function deleteIssue(issueId: string) {
    const hasPhotos = (savedPhotosByIssue[issueId]?.length ?? 0) > 0 || (pendingPhotosByIssue[issueId]?.length ?? 0) > 0
    if (hasPhotos) {
      setError('Remove the hotspot photos before deleting this issue.')
      return
    }

    setIssues(previous => previous.filter(issue => issue.id !== issueId))
    setIssuesDirty(true)
    setError(null)
  }

  async function saveIssues() {
    if (savePromiseRef.current) {
      return savePromiseRef.current
    }

    const run = (async () => {
      setSavingIssues(true)
      setError(null)

      try {
        const nextIssues = issues
          .map(issue => ({
            ...issue,
            title: issue.title.trim(),
            location: issue.location.trim(),
            note: limitWords(issue.note, MAX_HOTSPOT_NOTE_WORDS).trim(),
            updatedAt: new Date().toISOString(),
          }))
          .filter(issue => {
            const hasPhotos = (savedPhotosByIssue[issue.id]?.length ?? 0) > 0 || (pendingPhotosByIssue[issue.id]?.length ?? 0) > 0
            return issue.title || issue.location || issue.note || hasPhotos
          })

        let updatedSession: ScoutingSessionDetailDto

        try {
          updatedSession = await saveIssuesForSession(session, nextIssues)
        } catch (saveError: any) {
          if (saveError?.response?.status !== 409) {
            throw saveError
          }

          const latestSession = await reloadLatestSessionState()
          updatedSession = await saveIssuesForSession(latestSession, nextIssues)
        }

        setIssues(nextIssues)
        setIssuesDirty(false)
        setFocusIssueId(null)
        onSessionUpdated(updatedSession)
      } catch (saveError: any) {
        setError(saveError?.response?.data?.message ?? 'Could not save hotspot issue details.')
        throw saveError
      } finally {
        setSavingIssues(false)
        savePromiseRef.current = null
      }
    })()

    savePromiseRef.current = run
    return run
  }

  async function flushPendingChanges() {
    if (savePromiseRef.current) {
      await savePromiseRef.current
      return
    }

    if (issuesDirty) {
      await saveIssues()
    }
  }

  useImperativeHandle(ref, () => ({
    flushPendingChanges,
  }), [issuesDirty, savingIssues, session.id, session.version, issues, actorName, parsedNotes, savedPhotosByIssue, pendingPhotosByIssue])

  async function uploadRemarkPhoto(file: File, issueId: string) {
    const issue = visibleIssues.find(item => item.id === issueId)
    const localPhotoId = makeClientPhotoId()
    const tempId = `pending:${localPhotoId}`
    const capturedAt = new Date().toISOString()
    const previewUrl = URL.createObjectURL(file)

    setPendingPhotos(previous => [
      ...previous,
      {
        tempId,
        issueId,
        localPhotoId,
        fileName: file.name,
        previewUrl,
        capturedAt,
        status: 'uploading',
      },
    ])

    try {
      const registered = await scoutingPhotosApi.register({
        sessionId: session.id,
        localPhotoId,
        purpose: buildHotspotPhotoPurpose(issueId, issueLabel(issue ?? { title: '', location: '' })),
        capturedAt,
      })

      const confirmed = await uploadRegisteredPhoto(file, registered)
      removePendingPhoto(tempId)
      setPhotos(previous => [...previous, confirmed].filter(isRemarkPhoto))
    } catch (uploadError: any) {
      setPendingPhotos(previous => previous.map(photo => (
        photo.tempId === tempId
          ? {
              ...photo,
              status: 'error',
              errorMessage: uploadError?.response?.data?.message ?? uploadError?.message ?? 'Upload failed.',
            }
          : photo
      )))
    }
  }

  async function handlePhotoInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    const issueId = uploadIssueId
    event.target.value = ''
    setUploadIssueId(null)

    if (!issueId || files.length === 0) return

    const existingCount = (savedPhotosByIssue[issueId]?.length ?? 0) + (pendingPhotosByIssue[issueId]?.length ?? 0)
    const remainingSlots = Math.max(MAX_HOTSPOT_PHOTOS - existingCount, 0)

    for (const file of files.slice(0, remainingSlots)) {
      void uploadRemarkPhoto(file, issueId)
    }
  }

  async function handleDeletePhoto(photo: ScoutingPhotoDto) {
    try {
      await scoutingPhotosApi.delete(session.id, photo.id)
      setPhotos(previous => previous.filter(item => item.id !== photo.id))
    } catch {
      setError('Could not delete the selected hotspot photo.')
    }
  }

  function renderSavedPhoto(photo: ScoutingPhotoDto) {
    const preview = photoPreviewUrl(photo)

    return (
      <div key={photo.id} style={{ border: '0.5px solid #d1d5db', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
        {preview ? (
          <img src={preview} alt="Saved hotspot" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#6b7280', fontSize: 24 }}>
            IMG
          </div>
        )}
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{labelForPhoto(photo)}</span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{formatCapturedAt(photo.capturedAt)}</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>{photo.syncStatus}</span>
          {isEditable && (
            <button className="btn-secondary" type="button" style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start' }} onClick={() => handleDeletePhoto(photo)}>
              Delete
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderPendingPhoto(photo: PendingRemarkPhoto) {
    return (
      <div key={photo.tempId} style={{ border: '0.5px solid #d1d5db', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
        {photo.previewUrl ? (
          <img src={photo.previewUrl} alt="Pending hotspot" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', color: '#6b7280', fontSize: 24 }}>
            IMG
          </div>
        )}
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{photo.fileName}</span>
          <span style={{ fontSize: 10, color: photo.status === 'error' ? '#b91c1c' : '#92400e' }}>
            {photo.status === 'error' ? (photo.errorMessage ?? 'Upload failed') : 'Uploading...'}
          </span>
          <button className="btn-secondary" type="button" style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start' }} onClick={() => removePendingPhoto(photo.tempId)}>
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Hotspots</p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>
            Add several hotspot issues with a title, Bay/Bed location, up to 5 photos, and a note up to 500 words.
          </p>
          {isEditable && (
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Hotspot changes save when you click save or move out of a field.
            </p>
          )}
        </div>
        {isEditable && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: 'none' }}
              onChange={handlePhotoInputChange}
            />
            <button className="btn-secondary" type="button" style={{ fontSize: 12 }} onClick={addIssue}>
              Add issue
            </button>
            <button className="btn-primary" type="button" style={{ fontSize: 12 }} disabled={savingIssues || !issuesDirty} onClick={() => void saveIssues()}>
              {savingIssues ? 'Saving...' : issuesDirty ? 'Save hotspot changes' : 'Saved'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030', fontSize: 12 }}>
          {error}
        </div>
      )}

      {issuesDirty && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fffbeb', border: '0.5px solid #fde68a', color: '#92400e', fontSize: 12 }}>
          Hotspot titles, locations, and notes have unsaved changes.
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading hotspot issues...</div>
      ) : visibleIssues.length === 0 ? (
        <div style={{ border: '0.5px dashed #d1d5db', borderRadius: 10, padding: '22px 16px', textAlign: 'center', fontSize: 12, color: '#9ca3af', background: '#f9fafb' }}>
          <div style={{ marginBottom: isEditable ? 10 : 0 }}>
            {isEditable ? 'No hotspot issues added to this session yet.' : 'Start the session to add hotspot issues.'}
          </div>
          {isEditable && (
            <button className="btn-primary" type="button" style={{ fontSize: 12 }} onClick={addIssue}>
              Add first hotspot issue
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleIssues.map(issue => {
            const issuePhotos = savedPhotosByIssue[issue.id] ?? []
            const issuePendingPhotos = pendingPhotosByIssue[issue.id] ?? []
            const totalPhotos = issuePhotos.length + issuePendingPhotos.length
            const issueWordCount = countWords(issue.note)
            const canDeleteIssue = totalPhotos === 0

            return (
              <div key={issue.id} style={{ border: '0.5px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{issueLabel(issue)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{totalPhotos}/{MAX_HOTSPOT_PHOTOS} photos</div>
                  </div>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-secondary"
                        type="button"
                        style={{ fontSize: 11, padding: '5px 10px' }}
                        disabled={totalPhotos >= MAX_HOTSPOT_PHOTOS}
                        onClick={() => {
                          setUploadIssueId(issue.id)
                          fileInputRef.current?.click()
                        }}
                      >
                        {totalPhotos >= MAX_HOTSPOT_PHOTOS ? 'Photo limit reached' : 'Add photo'}
                      </button>
                      <button
                        className="btn-secondary"
                        type="button"
                        style={{ fontSize: 11, padding: '5px 10px' }}
                        disabled={!canDeleteIssue}
                        onClick={() => deleteIssue(issue.id)}
                      >
                        Delete issue
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Title
                    <input
                      className="input"
                      value={issue.title}
                      autoFocus={focusIssueId === issue.id}
                      disabled={!isEditable}
                      placeholder="Hotspot title"
                      onFocus={() => {
                        if (focusIssueId === issue.id) {
                          setFocusIssueId(null)
                        }
                      }}
                      onChange={event => setIssueField(issue.id, 'title', event.target.value)}
                      onBlur={() => {
                        if (issuesDirty) {
                          void saveIssues()
                        }
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Location
                    <input
                      className="input"
                      value={issue.location}
                      disabled={!isEditable}
                      placeholder="Bay 1 / Bed 2"
                      onChange={event => setIssueField(issue.id, 'location', event.target.value)}
                      onBlur={() => {
                        if (issuesDirty) {
                          void saveIssues()
                        }
                      }}
                    />
                  </label>
                </div>

                <label style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  Note
                  <textarea
                    className="input"
                    rows={4}
                    value={issue.note}
                    disabled={!isEditable}
                    placeholder="Describe the hotspot issue"
                    onChange={event => setIssueField(issue.id, 'note', event.target.value)}
                    onBlur={() => {
                      if (issuesDirty) {
                        void saveIssues()
                      }
                    }}
                    style={{ resize: 'vertical' }}
                  />
                </label>

                <div style={{ fontSize: 11, color: issueWordCount >= MAX_HOTSPOT_NOTE_WORDS ? '#d97706' : '#9ca3af', marginBottom: 12 }}>
                  {issueWordCount}/{MAX_HOTSPOT_NOTE_WORDS} words
                </div>

                {(issuePhotos.length > 0 || issuePendingPhotos.length > 0) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                    {issuePendingPhotos.map(renderPendingPhoto)}
                    {issuePhotos.map(renderSavedPhoto)}
                  </div>
                ) : (
                  <div style={{ border: '0.5px dashed #d1d5db', borderRadius: 10, padding: '18px 16px', textAlign: 'center', fontSize: 12, color: '#9ca3af', background: '#f9fafb' }}>
                    No photos attached to this issue yet.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

export default SessionRemarkPhotos
