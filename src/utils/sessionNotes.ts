export interface SessionHotspotIssue {
  id: string
  title: string
  location: string
  note: string
  createdAt?: string
  updatedAt?: string
}

export interface SessionInteractionMetadata {
  rowRemarks: Record<string, string>
  hotspotIssues: SessionHotspotIssue[]
}

interface StoredSessionInteractionMetadata {
  version: 1
  rowRemarks?: Record<string, unknown>
  hotspotIssues?: SessionHotspotIssue[]
}

const SESSION_META_MARKER_LABEL = '[[PESTSCOUT_SESSION_META_V1]]'
const SESSION_META_MARKER = `\n\n${SESSION_META_MARKER_LABEL}\n`
const SESSION_META_MARKER_AT_START = `${SESSION_META_MARKER_LABEL}\n`

function emptySessionInteractionMetadata(): SessionInteractionMetadata {
  return {
    rowRemarks: {},
    hotspotIssues: [],
  }
}

export function countWords(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function limitWords(value: string, maxWords: number): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  const words = trimmed.split(/\s+/)
  if (words.length <= maxWords) return value

  return words.slice(0, maxWords).join(' ')
}

function normalizeRowRemarks(value: Record<string, unknown> | undefined): Record<string, string> {
  if (!value) return {}

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, remark]) => [key, typeof remark === 'string' ? remark.trim() : ''])
      .filter(([, remark]) => !!remark),
  )
}

function normalizeHotspotIssue(value: Record<string, unknown>): SessionHotspotIssue | null {
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!id) return null

  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const location = typeof value.location === 'string' ? value.location.trim() : ''
  const note = typeof value.note === 'string' ? value.note.trim() : ''
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : undefined
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : undefined

  return {
    id,
    title,
    location,
    note,
    createdAt,
    updatedAt,
  }
}

function normalizeHotspotIssues(values: SessionHotspotIssue[] | undefined): SessionHotspotIssue[] {
  if (!values) return []

  return values
    .map(issue => normalizeHotspotIssue(issue as unknown as Record<string, unknown>))
    .filter((issue): issue is SessionHotspotIssue => !!issue)
}

function parseStoredSessionInteractionMetadata(metadataText: string): SessionInteractionMetadata | null {
  if (!metadataText.trim().startsWith('{')) {
    return null
  }

  try {
    const parsed = JSON.parse(metadataText) as StoredSessionInteractionMetadata

    return {
      rowRemarks: normalizeRowRemarks(parsed.rowRemarks),
      hotspotIssues: normalizeHotspotIssues(parsed.hotspotIssues),
    }
  } catch {
    return null
  }
}

export function parseSessionNotesValue(notes?: string | null): {
  plainNotes: string
  metadata: SessionInteractionMetadata
} {
  const raw = typeof notes === 'string' ? notes.replace(/\r\n/g, '\n') : ''
  const containsMarker = raw.includes(SESSION_META_MARKER_LABEL)

  if (!containsMarker) {
    return {
      plainNotes: raw.trim(),
      metadata: emptySessionInteractionMetadata(),
    }
  }

  const lines = raw.split('\n')
  const plainLines: string[] = []
  let latestMetadata = emptySessionInteractionMetadata()

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index]
    const trimmedLine = currentLine.trim()

    if (trimmedLine === SESSION_META_MARKER_LABEL) {
      const nextLine = lines[index + 1]?.trim() ?? ''
      const parsedMetadata = parseStoredSessionInteractionMetadata(nextLine)
      if (parsedMetadata) {
        latestMetadata = parsedMetadata
      }
      if (nextLine.startsWith('{')) {
        index += 1
      }
      continue
    }

    if (trimmedLine.startsWith(SESSION_META_MARKER_LABEL)) {
      const parsedMetadata = parseStoredSessionInteractionMetadata(
        trimmedLine.slice(SESSION_META_MARKER_LABEL.length).trim(),
      )
      if (parsedMetadata) {
        latestMetadata = parsedMetadata
      }
      continue
    }

    plainLines.push(currentLine)
  }

  return {
    plainNotes: plainLines.join('\n').trim(),
    metadata: latestMetadata,
  }
}

export function buildSessionNotesValue(
  plainNotes: string | null | undefined,
  metadata: SessionInteractionMetadata,
): string | undefined {
  const normalizedPlainNotes = parseSessionNotesValue(plainNotes).plainNotes
  const normalizedMetadata: StoredSessionInteractionMetadata = {
    version: 1,
    rowRemarks: normalizeRowRemarks(metadata.rowRemarks),
    hotspotIssues: metadata.hotspotIssues
      .map(issue => normalizeHotspotIssue(issue as unknown as Record<string, unknown>))
      .filter((issue): issue is SessionHotspotIssue => !!issue),
  }

  const hasMetadata =
    Object.keys(normalizedMetadata.rowRemarks ?? {}).length > 0 ||
    (normalizedMetadata.hotspotIssues?.length ?? 0) > 0

  if (!normalizedPlainNotes && !hasMetadata) {
    return undefined
  }

  if (!hasMetadata) {
    return normalizedPlainNotes || undefined
  }

  const metadataText = JSON.stringify(normalizedMetadata)
  return `${normalizedPlainNotes}${normalizedPlainNotes ? SESSION_META_MARKER : SESSION_META_MARKER.trimStart()}${metadataText}`
}

export function buildRowRemarkKey(sessionTargetId: string, bayIndex: number, benchIndex: number): string {
  return `${sessionTargetId}:${bayIndex}:${benchIndex}`
}

export function createHotspotIssueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `hotspot-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function buildHotspotPhotoPurpose(issueId: string, title: string): string {
  const normalizedTitle = title.trim()
  return normalizedTitle
    ? `HOTSPOT::${issueId}::${normalizedTitle}`
    : `HOTSPOT::${issueId}`
}

export function parseHotspotPhotoPurpose(purpose?: string | null): {
  issueId: string | null
  label: string
} {
  const normalizedPurpose = purpose?.trim() ?? ''
  if (!normalizedPurpose) {
    return { issueId: null, label: 'Hotspot photo' }
  }

  if (!normalizedPurpose.startsWith('HOTSPOT::')) {
    return { issueId: null, label: normalizedPurpose }
  }

  const [, issueId = '', title = ''] = normalizedPurpose.split('::')
  return {
    issueId: issueId.trim() || null,
    label: title.trim() || 'Hotspot photo',
  }
}
