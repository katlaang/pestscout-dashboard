import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import CustomSpeciesModal from '@/components/scouting/CustomSpeciesModal'
import { adminFarmsApi, customSpeciesApi, observationsApi, scoutingPhotosApi } from '@/services/api'
import type {
  ConfirmScoutingPhotoRequest,
  CreateObservationRequest,
  CustomSpecies,
  FieldBlockResponse,
  GreenhouseResponse,
  ObservationCategory,
  RegisterScoutingPhotoResponse,
  ScoutingObservationDto,
  ScoutingPhotoDto,
  ScoutingSessionSectionDto,
  SpeciesCode,
  UpdateObservationRequest,
} from '@/types'
import { mergeCustomSpecies } from '@/utils/customSpecies'

type BuiltInGridColumn = {
  kind: 'built_in'
  key: string
  code: SpeciesCode
  label: string
  category: ObservationCategory
}

type CustomGridColumn = {
  kind: 'custom'
  key: string
  customSpeciesId: string
  label: string
  codeLabel?: string
  category: ObservationCategory
}

type GridColumn = BuiltInGridColumn | CustomGridColumn

const BUILT_IN_COLUMNS: BuiltInGridColumn[] = [
  { kind: 'built_in', key: 'built_in:RED_SPIDER_MITE', code: 'RED_SPIDER_MITE', label: 'RSM', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:THRIPS', code: 'THRIPS', label: 'Thrips', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:WHITEFLIES', code: 'WHITEFLIES', label: 'W/fly', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:MEALYBUGS', code: 'MEALYBUGS', label: 'M/bugs', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:FALSE_CODLING_MOTH', code: 'FALSE_CODLING_MOTH', label: 'FCM', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:CATERPILLARS', code: 'CATERPILLARS', label: 'Caterp.', category: 'PEST' },
  { kind: 'built_in', key: 'built_in:BENEFICIAL_PP', code: 'BENEFICIAL_PP', label: 'PP', category: 'BENEFICIAL' },
  { kind: 'built_in', key: 'built_in:POWDERY_MILDEW', code: 'POWDERY_MILDEW', label: 'PM', category: 'DISEASE' },
  { kind: 'built_in', key: 'built_in:DOWNY_MILDEW', code: 'DOWNY_MILDEW', label: 'DM', category: 'DISEASE' },
  { kind: 'built_in', key: 'built_in:BOTRYTIS', code: 'BOTRYTIS', label: 'Botrytis', category: 'DISEASE' },
  { kind: 'built_in', key: 'built_in:VERTICILLIUM', code: 'VERTICILLIUM', label: 'Vert.', category: 'DISEASE' },
  { kind: 'built_in', key: 'built_in:BACTERIAL_WILT', code: 'BACTERIAL_WILT', label: 'BW', category: 'DISEASE' },
]

const OTHER_ACTION_LABEL: Record<ObservationCategory, string> = {
  PEST: 'Other pest',
  DISEASE: 'Other disease',
  BENEFICIAL: 'Other beneficial insect',
}

const SPOT_INDEX = 1
const MAX_CELL_PHOTOS = 5

function countColor(n: number | null, category: ObservationCategory): { bg: string; fg: string } {
  if (n === null) return { bg: '#ffffff', fg: '#111827' }
  if (category === 'BENEFICIAL' && n === 0) return { bg: '#111827', fg: '#ffffff' }
  if (category === 'BENEFICIAL') return { bg: '#70ad47', fg: '#14532d' }
  if (n === 0) return { bg: '#70ad47', fg: '#111827' }
  if (n <= 9) return { bg: '#ffff00', fg: '#111827' }
  if (n <= 29) return { bg: '#ffc000', fg: '#111827' }
  return { bg: '#ff0000', fg: '#111827' }
}

function columnMinWidth(col: GridColumn): number {
  if (col.kind === 'custom') {
    return Math.max(118, Math.min(200, col.label.length * 8))
  }

  return Math.max(62, col.label.length * 9)
}

function columnKeyForObservation(observation: ScoutingObservationDto) {
  return observation.customSpeciesId
    ? `custom:${observation.customSpeciesId}`
    : `built_in:${observation.speciesCode}`
}

function obsKey(bayIndex: number, benchIndex: number, columnKey: string) {
  return `${bayIndex}:${benchIndex}:${columnKey}`
}

function photoCellKey(sessionTargetId: string, bayIndex: number, benchIndex: number, spotIndex: number = SPOT_INDEX) {
  return `${sessionTargetId}:${bayIndex}:${benchIndex}:${spotIndex}`
}

function parseCountValue(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (Number.isNaN(parsed) || parsed < 0) return null
  return parsed
}

function rowKey(bayIndex: number, benchIndex: number) {
  return `${bayIndex}:${benchIndex}`
}

interface GridRow {
  bayIndex: number
  bayTag: string
  benchIndex: number
  benchTag: string
  rowSpan?: number
}

function uniqueOrderedStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  values.forEach(value => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    ordered.push(normalized)
  })

  return ordered
}

function inferFallbackBedTags(
  section: ScoutingSessionSectionDto,
  greenhouse: GreenhouseResponse | null,
  fieldBlock: FieldBlockResponse | null,
  totalBayCount: number,
): string[] {
  const explicitBeds =
    section.includeAllBenches === false
      ? uniqueOrderedStrings(section.benchTags ?? [])
      : []

  if (explicitBeds.length > 0) return explicitBeds

  const greenhouseBeds = uniqueOrderedStrings(greenhouse?.benchTags ?? [])
  if (greenhouseBeds.length > 0) return greenhouseBeds

  const bedsPerBayFromCoverage =
    (section.coverage?.totalBays ?? 0) > 0 && (section.coverage?.totalBeds ?? 0) > 0
      ? Math.ceil((section.coverage?.totalBeds ?? 0) / Math.max(section.coverage?.totalBays ?? 1, 1))
      : 0

  const fallbackBedCount =
    greenhouse?.benchesPerBay ??
    fieldBlock?.spotChecksPerBay ??
    bedsPerBayFromCoverage

  if (fallbackBedCount && fallbackBedCount > 0) {
    return Array.from({ length: fallbackBedCount }, (_, index) => String(index + 1))
  }

  return totalBayCount > 0 ? ['1'] : []
}

function buildRows(
  section: ScoutingSessionSectionDto,
  greenhouse: GreenhouseResponse | null,
  fieldBlock: FieldBlockResponse | null,
): GridRow[] {
  const bayMap = new Map<number, { tag: string; beds: Map<number, string> }>()
  const selectedBayTagList =
    section.includeAllBays === false
      ? uniqueOrderedStrings(section.bayTags ?? [])
      : []
  const selectedBedTagList =
    section.includeAllBenches === false
      ? uniqueOrderedStrings(section.benchTags ?? [])
      : []
  const selectedBayTags = selectedBayTagList.length > 0 ? new Set(selectedBayTagList) : null
  const selectedBedTags = selectedBedTagList.length > 0 ? new Set(selectedBedTagList) : null

  if (greenhouse?.bays && greenhouse.bays.length > 0) {
    const sortedBays = [...greenhouse.bays].sort((a, b) => a.position - b.position)

    for (const bay of sortedBays) {
      const bayTag = bay.bayTag || `Bay ${bay.position}`
      if (selectedBayTags && !selectedBayTags.has(bayTag)) continue

      const bedTags =
        bay.bedTags && bay.bedTags.length > 0
          ? bay.bedTags
          : Array.from(
              { length: bay.bedCount ?? greenhouse.benchesPerBay ?? 0 },
              (_, index) => String(index + 1),
            )

      const beds = new Map<number, string>()
      bedTags.forEach((bedTag, index) => {
        if (selectedBedTags && !selectedBedTags.has(bedTag)) return
        beds.set(index + 1, bedTag)
      })

      if (beds.size > 0) {
        bayMap.set(bay.position, { tag: bayTag, beds })
      }
    }
  }

  for (const observation of section.observations.filter(item => !item.deleted)) {
    const bayTag = observation.bayTag ?? `Bay ${observation.bayIndex}`
    const bedTag = observation.benchTag ?? String(observation.benchIndex)
    if (selectedBayTags && !selectedBayTags.has(bayTag)) continue
    if (selectedBedTags && !selectedBedTags.has(bedTag)) continue

    if (!bayMap.has(observation.bayIndex)) {
      bayMap.set(observation.bayIndex, { tag: bayTag, beds: new Map() })
    }
    bayMap.get(observation.bayIndex)!.beds.set(observation.benchIndex, bedTag)
  }

  if (bayMap.size === 0) {
    const greenhouseBayTags = uniqueOrderedStrings(greenhouse?.bayTags ?? [])
    const fieldBayTags = uniqueOrderedStrings(fieldBlock?.bayTags ?? [])
    const fallbackBayCount =
      greenhouse?.bayCount ??
      fieldBlock?.bayCount ??
      section.coverage?.totalBays ??
      selectedBayTagList.length

    const fallbackBayTags =
      selectedBayTagList.length > 0
        ? selectedBayTagList
        : greenhouseBayTags.length > 0
        ? greenhouseBayTags
        : fieldBayTags.length > 0
        ? fieldBayTags
        : fallbackBayCount && fallbackBayCount > 0
        ? Array.from(
            { length: fallbackBayCount },
            (_, index) => section.fieldBlockId ? `Row ${index + 1}` : `Bay ${index + 1}`,
          )
        : []

    const fallbackBedTags = inferFallbackBedTags(section, greenhouse, fieldBlock, fallbackBayTags.length)

    fallbackBayTags.forEach((bayTag, bayIndex) => {
      if (selectedBayTags && !selectedBayTags.has(bayTag)) return

      const beds = new Map<number, string>()
      fallbackBedTags.forEach((bedTag, benchIndex) => {
        if (selectedBedTags && !selectedBedTags.has(bedTag)) return
        beds.set(benchIndex + 1, bedTag)
      })

      if (beds.size > 0) {
        bayMap.set(bayIndex + 1, { tag: bayTag, beds })
      }
    })
  }

  const rows: GridRow[] = []
  for (const bayIndex of [...bayMap.keys()].sort((a, b) => a - b)) {
    const { tag, beds } = bayMap.get(bayIndex)!
    const sortedBeds = [...beds.keys()].sort((a, b) => a - b)
    sortedBeds.forEach((benchIndex, index) => {
      rows.push({
        bayIndex,
        bayTag: tag,
        benchIndex,
        benchTag: beds.get(benchIndex)!,
        rowSpan: index === 0 ? sortedBeds.length : undefined,
      })
    })
  }
  return rows
}

interface GridCellMeta {
  bayIndex: number
  bayTag: string
  benchIndex: number
  benchTag: string
  col: GridColumn
}

type CellPhotoMap = Record<string, ScoutingPhotoDto[]>

interface PendingCellPhoto {
  tempId: string
  localPhotoId: string
  fileName: string
  previewUrl?: string
  capturedAt: string
  status: 'uploading' | 'error'
  errorMessage?: string
}

type PendingCellPhotoMap = Record<string, PendingCellPhoto[]>

interface ActiveCellState {
  observationKey: string
  photoKey: string
  bayIndex: number
  bayTag: string
  benchIndex: number
  benchTag: string
  col: GridColumn
  draftCount: string
  draftNotes: string
  committedObservation: ScoutingObservationDto | null
  dirty: boolean
  saving: boolean
  clearLoading: boolean
  saveError: string | null
}

function toPhotoMap(photos: ScoutingPhotoDto[]): CellPhotoMap {
  const next: CellPhotoMap = {}

  photos.forEach(photo => {
    const key = photoCellKey(photo.sessionTargetId, photo.bayIndex, photo.benchIndex, photo.spotIndex || SPOT_INDEX)
    next[key] = next[key] ? [...next[key], photo] : [photo]
  })

  return next
}

function makeClientPhotoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

interface ObservationGridProps {
  section: ScoutingSessionSectionDto
  sessionId: string
  isEditable: boolean
  canEditNotes?: boolean
  farmId: string
  surveySpeciesCodes?: SpeciesCode[]
  customSurveySpeciesIds?: string[]
}

export interface ObservationGridHandle {
  flushPendingChanges: () => Promise<void>
}

const ObservationGrid = forwardRef<ObservationGridHandle, ObservationGridProps>(function ObservationGrid({
  section,
  sessionId,
  isEditable,
  canEditNotes: canEditNotesProp,
  farmId,
  surveySpeciesCodes,
  customSurveySpeciesIds,
}, ref) {
  const [obsMap, setObsMap] = useState<Record<string, ScoutingObservationDto>>({})
  const [greenhouse, setGreenhouse] = useState<GreenhouseResponse | null>(null)
  const [fieldBlock, setFieldBlock] = useState<FieldBlockResponse | null>(null)
  const [customSpeciesByCategory, setCustomSpeciesByCategory] = useState<Record<ObservationCategory, CustomSpecies[]>>({
    PEST: [],
    DISEASE: [],
    BENEFICIAL: [],
  })
  const [modalCategory, setModalCategory] = useState<ObservationCategory | null>(null)
  const [createdCustomSpeciesIds, setCreatedCustomSpeciesIds] = useState<string[]>([])
  const [photoMap, setPhotoMap] = useState<CellPhotoMap>({})
  const [pendingPhotoMap, setPendingPhotoMap] = useState<PendingCellPhotoMap>({})
  const [activeCell, setActiveCell] = useState<ActiveCellState | null>(null)

  const saveTimerRef = useRef<number | null>(null)
  const activeCellRef = useRef<ActiveCellState | null>(null)
  const pendingPhotoMapRef = useRef<PendingCellPhotoMap>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const canEditNotes = canEditNotesProp ?? isEditable

  useEffect(() => {
    activeCellRef.current = activeCell
  }, [activeCell])

  useEffect(() => {
    pendingPhotoMapRef.current = pendingPhotoMap
  }, [pendingPhotoMap])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (!farmId) {
      setCustomSpeciesByCategory({ PEST: [], DISEASE: [], BENEFICIAL: [] })
      return
    }

    Promise.all([
      customSpeciesApi.list(farmId, 'PEST').catch(() => [] as CustomSpecies[]),
      customSpeciesApi.list(farmId, 'DISEASE').catch(() => [] as CustomSpecies[]),
      customSpeciesApi.list(farmId, 'BENEFICIAL').catch(() => [] as CustomSpecies[]),
    ]).then(([pests, diseases, beneficials]) => {
      if (!alive) return
      setCustomSpeciesByCategory({
        PEST: pests,
        DISEASE: diseases,
        BENEFICIAL: beneficials,
      })
    })

    return () => {
      alive = false
    }
  }, [farmId])

  useEffect(() => {
    const map: Record<string, ScoutingObservationDto> = {}
    for (const observation of section.observations) {
      if (!observation.deleted) {
        const key = obsKey(observation.bayIndex, observation.benchIndex, columnKeyForObservation(observation))
        map[key] = observation
      }
    }
    setObsMap(map)
  }, [section.observations])

  useEffect(() => {
    let alive = true

    scoutingPhotosApi.listSession(sessionId)
      .then(photos => {
        if (!alive) return
        setPhotoMap(toPhotoMap(photos))
      })
      .catch(() => {
        if (!alive) return
        setPhotoMap({})
      })

    return () => {
      alive = false
    }
  }, [sessionId])

  useEffect(() => {
    setActiveCell(null)
  }, [section.targetId])

  useEffect(() => {
    return () => {
      Object.values(pendingPhotoMapRef.current)
        .flat()
        .forEach(photo => {
          if (photo.previewUrl) {
            URL.revokeObjectURL(photo.previewUrl)
          }
        })
    }
  }, [])

  useEffect(() => {
    if (!section.greenhouseId || !farmId) {
      setGreenhouse(null)
      return
    }
    adminFarmsApi.listGreenhouses(farmId)
      .then(list => {
        const matched = list.find(item => item.id === section.greenhouseId)
        setGreenhouse(matched ?? (list.length === 1 ? list[0] : null))
      })
      .catch(() => setGreenhouse(null))
  }, [section.greenhouseId, farmId])

  useEffect(() => {
    if (!section.fieldBlockId || !farmId) {
      setFieldBlock(null)
      return
    }
    adminFarmsApi.listFieldBlocks(farmId)
      .then(list => {
        const matched = list.find(item => item.id === section.fieldBlockId)
        setFieldBlock(matched ?? (list.length === 1 ? list[0] : null))
      })
      .catch(() => setFieldBlock(null))
  }, [section.fieldBlockId, farmId])

  const derivedCustomSpecies = useMemo(() => {
    const byCategory: Record<ObservationCategory, CustomSpecies[]> = {
      PEST: [],
      DISEASE: [],
      BENEFICIAL: [],
    }
    const seen = new Set<string>()

    section.observations.forEach(observation => {
      if (!observation.customSpeciesId || seen.has(observation.customSpeciesId)) return
      seen.add(observation.customSpeciesId)
      byCategory[observation.category].push({
        id: observation.customSpeciesId,
        category: observation.category,
        name: observation.customSpeciesName ?? observation.customSpeciesCode ?? observation.customSpeciesId,
        code: observation.customSpeciesCode ?? '',
      })
    })

    return byCategory
  }, [section.observations])

  const mergedCustomSpeciesByCategory = useMemo(() => ({
    PEST: mergeCustomSpecies(customSpeciesByCategory.PEST, derivedCustomSpecies.PEST),
    DISEASE: mergeCustomSpecies(customSpeciesByCategory.DISEASE, derivedCustomSpecies.DISEASE),
    BENEFICIAL: mergeCustomSpecies(customSpeciesByCategory.BENEFICIAL, derivedCustomSpecies.BENEFICIAL),
  }), [customSpeciesByCategory, derivedCustomSpecies])

  const customSpeciesById = useMemo(() => {
    const byId = new Map<string, CustomSpecies>()
    Object.values(mergedCustomSpeciesByCategory).flat().forEach(item => byId.set(item.id, item))
    return byId
  }, [mergedCustomSpeciesByCategory])

  const activeCustomSpeciesIds = useMemo(() => {
    const ids = new Set<string>(customSurveySpeciesIds ?? [])
    createdCustomSpeciesIds.forEach(id => ids.add(id))
    section.observations.forEach(observation => {
      if (observation.customSpeciesId) ids.add(observation.customSpeciesId)
    })
    return Array.from(ids)
  }, [createdCustomSpeciesIds, customSurveySpeciesIds, section.observations])

  const visibleColumns = useMemo(() => {
    const builtInAllowed = new Set(surveySpeciesCodes ?? [])
    const builtIns = BUILT_IN_COLUMNS.filter(column => {
      if (!surveySpeciesCodes || surveySpeciesCodes.length === 0) return true
      return builtInAllowed.has(column.code)
    })

    const customs: GridColumn[] = activeCustomSpeciesIds
      .map(id => customSpeciesById.get(id))
      .filter((item): item is CustomSpecies => !!item)
      .map(item => ({
        kind: 'custom',
        key: `custom:${item.id}`,
        customSpeciesId: item.id,
        label: item.name,
        codeLabel: item.code || undefined,
        category: item.category,
      }))

    return (['PEST', 'BENEFICIAL', 'DISEASE'] as ObservationCategory[]).flatMap(category => [
      ...builtIns.filter(column => column.category === category),
      ...customs.filter(column => column.category === category),
    ])
  }, [activeCustomSpeciesIds, customSpeciesById, surveySpeciesCodes])

  const pestCount = visibleColumns.filter(column => column.category === 'PEST').length
  const beneficialCount = visibleColumns.filter(column => column.category === 'BENEFICIAL').length
  const diseaseCount = visibleColumns.filter(column => column.category === 'DISEASE').length

  const rows = useMemo(() => buildRows(section, greenhouse, fieldBlock), [section, greenhouse, fieldBlock])

  const rowRemarksByKey = useMemo(() => {
    const remarks: Record<string, string> = {}

    Object.values(obsMap).forEach(observation => {
      const note = observation.notes?.trim()
      if (!note) return

      const key = rowKey(observation.bayIndex, observation.benchIndex)
      if (!remarks[key]) {
        remarks[key] = note
        return
      }

      const existing = remarks[key]
        .split(' | ')
        .map(item => item.trim())
        .filter(Boolean)

      if (!existing.includes(note)) {
        remarks[key] = [...existing, note].join(' | ')
      }
    })

    return remarks
  }, [obsMap])

  const cellMetaByKey = useMemo(() => {
    const map = new Map<string, GridCellMeta>()
    rows.forEach(row => {
      visibleColumns.forEach(col => {
        map.set(obsKey(row.bayIndex, row.benchIndex, col.key), {
          bayIndex: row.bayIndex,
          bayTag: row.bayTag,
          benchIndex: row.benchIndex,
          benchTag: row.benchTag,
          col,
        })
      })
    })
    return map
  }, [rows, visibleColumns])

  function setPendingPhotosForKey(key: string, updater: (previous: PendingCellPhoto[]) => PendingCellPhoto[]) {
    setPendingPhotoMap(previous => {
      const nextForKey = updater(previous[key] ?? [])
      if (nextForKey.length === 0) {
        const next = { ...previous }
        delete next[key]
        return next
      }
      return { ...previous, [key]: nextForKey }
    })
  }

  function handleCustomSpeciesCreated(created: CustomSpecies[]) {
    if (!modalCategory || created.length === 0) return

    setCustomSpeciesByCategory(previous => ({
      ...previous,
      [modalCategory]: mergeCustomSpecies(previous[modalCategory], created),
    }))
    setCreatedCustomSpeciesIds(previous => Array.from(new Set([
      ...previous,
      ...created.map(item => item.id),
    ])))
    setModalCategory(null)
  }

  function openCellEditor(meta: GridCellMeta) {
    const observationKey = obsKey(meta.bayIndex, meta.benchIndex, meta.col.key)
    const committedObservation = obsMap[observationKey] ?? null
    setActiveCell({
      observationKey,
      photoKey: photoCellKey(section.targetId, meta.bayIndex, meta.benchIndex, SPOT_INDEX),
      bayIndex: meta.bayIndex,
      bayTag: meta.bayTag,
      benchIndex: meta.benchIndex,
      benchTag: meta.benchTag,
      col: meta.col,
      draftCount: committedObservation ? String(committedObservation.count) : '',
      draftNotes: committedObservation?.notes ?? '',
      committedObservation,
      dirty: false,
      saving: false,
      clearLoading: false,
      saveError: null,
    })
  }

  async function saveActiveCellDraft(force = false) {
    const current = activeCellRef.current
    if (!current || (!isEditable && !canEditNotes)) return
    if (!current.dirty && !force) return

    const trimmedCount = current.draftCount.trim()
    const parsedCount = parseCountValue(trimmedCount)
    const trimmedNotes = current.draftNotes.trim()

    if (!isEditable && !current.committedObservation) {
      return
    }

    if (isEditable && (trimmedCount === '' || parsedCount === null)) {
      return
    }

    const resolvedCount = parsedCount ?? current.committedObservation?.count
    if (resolvedCount == null) {
      return
    }

    setActiveCell(previous => previous && previous.observationKey === current.observationKey
      ? { ...previous, saving: true, saveError: null }
      : previous)

    try {
      let savedObservation: ScoutingObservationDto
      if (current.committedObservation) {
        const updateBody: UpdateObservationRequest = {
          sessionTargetId: section.targetId,
          greenhouseId: section.greenhouseId,
          fieldBlockId: section.fieldBlockId,
          ...(current.col.kind === 'custom'
            ? { customSpeciesId: current.col.customSpeciesId }
            : { speciesCode: current.col.code }),
          category: current.col.category,
          bayIndex: current.bayIndex,
          bayTag: current.bayTag,
          benchIndex: current.benchIndex,
          benchTag: current.benchTag,
          spotIndex: SPOT_INDEX,
          count: resolvedCount,
          notes: canEditNotes ? (trimmedNotes || undefined) : current.committedObservation.notes,
          version: current.committedObservation.version,
        }
        savedObservation = await observationsApi.update(sessionId, current.committedObservation.id, updateBody)
      } else {
        const createBody: CreateObservationRequest = {
          sessionTargetId: section.targetId,
          greenhouseId: section.greenhouseId,
          fieldBlockId: section.fieldBlockId,
          ...(current.col.kind === 'custom'
            ? { customSpeciesId: current.col.customSpeciesId }
            : { speciesCode: current.col.code }),
          category: current.col.category,
          bayIndex: current.bayIndex,
          bayTag: current.bayTag,
          benchIndex: current.benchIndex,
          benchTag: current.benchTag,
          spotIndex: SPOT_INDEX,
          count: resolvedCount,
          notes: trimmedNotes || undefined,
        }
        savedObservation = await observationsApi.create(sessionId, createBody)
      }

      setObsMap(previous => ({
        ...previous,
        [current.observationKey]: savedObservation,
      }))

      setActiveCell(previous => {
        if (!previous || previous.observationKey !== current.observationKey) return previous
        return {
          ...previous,
          committedObservation: savedObservation,
          draftCount: String(savedObservation.count),
          draftNotes: savedObservation.notes ?? '',
          dirty: false,
          saving: false,
          saveError: null,
        }
      })
    } catch (error: any) {
      setActiveCell(previous => {
        if (!previous || previous.observationKey !== current.observationKey) return previous
        return {
          ...previous,
          saving: false,
          saveError: error?.response?.data?.message ?? 'Could not save this cell yet.',
        }
      })
      throw error
    }
  }

  async function clearActiveCell() {
    const current = activeCellRef.current
    if (!current) return

    if (!current.committedObservation) {
      setActiveCell(previous => previous ? {
        ...previous,
        draftCount: '',
        draftNotes: '',
        dirty: false,
        saveError: null,
      } : previous)
      return
    }

    setActiveCell(previous => previous && previous.observationKey === current.observationKey
      ? { ...previous, clearLoading: true, saveError: null }
      : previous)

    try {
      await observationsApi.delete(sessionId, current.committedObservation.id)
      setObsMap(previous => {
        const next = { ...previous }
        delete next[current.observationKey]
        return next
      })
      setActiveCell(previous => previous && previous.observationKey === current.observationKey
        ? {
            ...previous,
            committedObservation: null,
            draftCount: '',
            draftNotes: '',
            dirty: false,
            saving: false,
            clearLoading: false,
            saveError: null,
          }
        : previous)
    } catch (error: any) {
      setActiveCell(previous => previous && previous.observationKey === current.observationKey
        ? {
            ...previous,
            clearLoading: false,
            saveError: error?.response?.data?.message ?? 'Could not clear this cell.',
          }
        : previous)
    }
  }

  async function flushPendingChanges() {
    await saveActiveCellDraft(true)
  }

  useImperativeHandle(ref, () => ({
    flushPendingChanges,
  }), [flushPendingChanges])

  useEffect(() => {
    if (!activeCell || (!isEditable && !canEditNotes) || !activeCell.dirty) return
    if (activeCell.draftCount.trim() === '') return

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveActiveCellDraft()
    }, 700)

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [activeCell?.observationKey, activeCell?.draftCount, activeCell?.draftNotes, activeCell?.dirty, canEditNotes, isEditable])

  const thBase: CSSProperties = {
    padding: '5px 6px',
    fontSize: 10,
    fontWeight: 600,
    border: '0.5px solid #e5e7eb',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  }

  const tdBase: CSSProperties = {
    padding: '5px 8px',
    fontSize: 11,
    border: '0.5px solid #e5e7eb',
    whiteSpace: 'nowrap',
  }

  const currentCellPhotos = activeCell ? photoMap[activeCell.photoKey] ?? [] : []
  const currentPendingPhotos = activeCell ? pendingPhotoMap[activeCell.photoKey] ?? [] : []
  const currentPhotoCount = currentCellPhotos.length + currentPendingPhotos.length
  const canEditCurrentCellNotes = !!activeCell && canEditNotes && (isEditable || !!activeCell.committedObservation)
  const canSaveCurrentCell = !!activeCell && (isEditable ? activeCell.draftCount.trim() !== '' : !!activeCell.committedObservation)

  async function handleModalClose() {
    if (activeCell?.dirty && activeCell.draftCount.trim() !== '') {
      try {
        await saveActiveCellDraft(true)
      } catch {
        return
      }
    }
    setActiveCell(null)
  }

  function removePendingPhoto(cellKey: string, tempId: string) {
    setPendingPhotosForKey(cellKey, previous => {
      const target = previous.find(item => item.tempId === tempId)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return previous.filter(item => item.tempId !== tempId)
    })
  }

  async function addPhotoForCell(file: File, cell: ActiveCellState) {
    const localPhotoId = makeClientPhotoId()
    const tempId = `pending:${localPhotoId}`
    const previewUrl = URL.createObjectURL(file)
    const capturedAt = new Date().toISOString()

    setPendingPhotosForKey(cell.photoKey, previous => [
      ...previous,
      {
        tempId,
        localPhotoId,
        fileName: file.name,
        previewUrl,
        capturedAt,
        status: 'uploading',
      },
    ])

    try {
      const registered = await scoutingPhotosApi.register({
        sessionId,
        sessionTargetId: section.targetId,
        bayIndex: cell.bayIndex,
        bayTag: cell.bayTag,
        benchIndex: cell.benchIndex,
        benchTag: cell.benchTag,
        spotIndex: SPOT_INDEX,
        localPhotoId,
        purpose: 'Cell photo',
        sourceType: 'SCOUT_HANDHELD',
        capturedAt,
      })

      const confirmed = await uploadRegisteredPhoto(file, registered)

      removePendingPhoto(cell.photoKey, tempId)
      setPhotoMap(previous => ({
        ...previous,
        [cell.photoKey]: [...(previous[cell.photoKey] ?? []), confirmed],
      }))
    } catch (error: any) {
      setPendingPhotosForKey(cell.photoKey, previous =>
        previous.map(item => item.tempId === tempId
          ? {
              ...item,
              status: 'error',
              errorMessage: error?.response?.data?.message ?? error?.message ?? 'Upload failed.',
            }
          : item),
      )
    }
  }

  async function handlePhotoInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    const cell = activeCellRef.current
    if (!cell || files.length === 0) return

    const existingCount = (photoMap[cell.photoKey] ?? []).length + (pendingPhotoMap[cell.photoKey] ?? []).length
    const remainingSlots = Math.max(MAX_CELL_PHOTOS - existingCount, 0)

    for (const file of files.slice(0, remainingSlots)) {
      void addPhotoForCell(file, cell)
    }
  }

  async function handleDeletePhoto(photo: ScoutingPhotoDto) {
    const key = photoCellKey(photo.sessionTargetId, photo.bayIndex, photo.benchIndex, photo.spotIndex || SPOT_INDEX)
    try {
      await scoutingPhotosApi.delete(sessionId, photo.id)
      setPhotoMap(previous => {
        const nextPhotos = (previous[key] ?? []).filter(item => item.id !== photo.id)
        if (nextPhotos.length === 0) {
          const next = { ...previous }
          delete next[key]
          return next
        }
        return { ...previous, [key]: nextPhotos }
      })
    } catch {
      // Keep local state unchanged on failure.
    }
  }

  function renderPhotoTile(photo: ScoutingPhotoDto) {
    const previewUrl = photoPreviewUrl(photo)

    return (
      <div
        key={photo.id}
        style={{
          border: '0.5px solid #d1d5db',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Cell photo"
            style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            height: 88,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            color: '#6b7280',
            fontSize: 24,
          }}>
            📷
          </div>
        )}
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#111827' }}>Saved photo</span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>{formatCapturedAt(photo.capturedAt)}</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>{photo.syncStatus}</span>
          {isEditable && (
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start' }}
              onClick={() => handleDeletePhoto(photo)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderPendingPhotoTile(photo: PendingCellPhoto) {
    return (
      <div
        key={photo.tempId}
        style={{
          border: '0.5px solid #d1d5db',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#ffffff',
        }}
      >
        {photo.previewUrl ? (
          <img
            src={photo.previewUrl}
            alt="Pending cell photo"
            style={{ width: '100%', height: 88, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            height: 88,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            color: '#6b7280',
            fontSize: 24,
          }}>
            📷
          </div>
        )}
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#111827' }}>{photo.fileName}</span>
          <span style={{ fontSize: 10, color: photo.status === 'error' ? '#b91c1c' : '#92400e' }}>
            {photo.status === 'error' ? (photo.errorMessage ?? 'Upload failed') : 'Uploading...'}
          </span>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: 11, padding: '4px 8px', alignSelf: 'flex-start' }}
            onClick={() => activeCell && removePendingPhoto(activeCell.photoKey, photo.tempId)}
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  if (rows.length === 0 && !isEditable) {
    return (
      <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
        No observations recorded yet.
      </p>
    )
  }

  return (
    <>
      {isEditable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {(['PEST', 'BENEFICIAL', 'DISEASE'] as ObservationCategory[]).map(category => (
            <button
              key={category}
              type="button"
              className="btn-secondary"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => setModalCategory(category)}
            >
              {OTHER_ACTION_LABEL[category]}
            </button>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'auto', width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr>
              <th colSpan={2} style={{ ...thBase, background: '#f9fafb', color: '#374151', textAlign: 'center' }}>
                Location
              </th>
              {pestCount > 0 && (
                <th colSpan={pestCount} style={{ ...thBase, background: '#fef3c7', color: '#92400e', textAlign: 'center' }}>
                  Pest
                </th>
              )}
              {beneficialCount > 0 && (
                <th colSpan={beneficialCount} style={{ ...thBase, background: '#dcfce7', color: '#166534', textAlign: 'center' }}>
                  Beneficial
                </th>
              )}
              {diseaseCount > 0 && (
                <th colSpan={diseaseCount} style={{ ...thBase, background: '#fee2e2', color: '#991b1b', textAlign: 'center' }}>
                  Disease
                </th>
              )}
              <th style={{ ...thBase, background: '#f9fafb', color: '#374151', textAlign: 'center', minWidth: 180 }}>
                Remarks
              </th>
            </tr>

            <tr>
              <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bay</th>
              <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bed</th>
              {visibleColumns.map(col => (
                <th
                  key={col.key}
                  style={{
                    ...thBase,
                    minWidth: columnMinWidth(col),
                    textAlign: 'center',
                    background:
                      col.category === 'PEST' ? '#fffbeb' :
                      col.category === 'BENEFICIAL' ? '#f0fdf4' : '#fff5f5',
                    color:
                      col.category === 'PEST' ? '#92400e' :
                      col.category === 'BENEFICIAL' ? '#166534' : '#991b1b',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10, fontWeight: 600 }}>
                      {col.label}
                    </span>
                    {col.kind === 'custom' && col.codeLabel && (
                      <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 9, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>
                        {col.codeLabel}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 180, textAlign: 'center' }}>
                Remarks
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => {
              const rowId = `${row.bayIndex}-${row.benchIndex}`
              return (
                <tr key={rowId} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                  {row.rowSpan !== undefined && (
                    <td
                      rowSpan={row.rowSpan}
                      style={{
                        ...tdBase,
                        fontWeight: 600,
                        textAlign: 'center',
                        background: '#f9fafb',
                        color: '#374151',
                        verticalAlign: 'middle',
                        borderRight: '1px solid #d1d5db',
                      }}
                    >
                      {row.bayTag}
                    </td>
                  )}

                  <td style={{ ...tdBase, color: '#6b7280', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                    {row.benchTag}
                  </td>

                  {visibleColumns.map(col => {
                    const key = obsKey(row.bayIndex, row.benchIndex, col.key)
                    const meta = cellMetaByKey.get(key)!
                    const savedObservation = obsMap[key]
                    const isActiveCell = activeCell?.observationKey === key
                    const draftValue = isActiveCell ? activeCell?.draftCount ?? '' : undefined
                    const displayValue = typeof draftValue === 'string'
                      ? draftValue
                      : savedObservation
                      ? String(savedObservation.count)
                      : ''
                    const displayCount = parseCountValue(displayValue)
                    const { bg, fg } = countColor(displayCount, col.category)
                    const cellPhotoKey = photoCellKey(section.targetId, row.bayIndex, row.benchIndex, SPOT_INDEX)
                    const totalPhotos = (photoMap[cellPhotoKey] ?? []).length + (pendingPhotoMap[cellPhotoKey] ?? []).length

                    return (
                      <td key={col.key} style={{ background: bg, padding: 0, minWidth: columnMinWidth(col) }}>
                        <button
                          type="button"
                          onClick={() => openCellEditor(meta)}
                          style={{
                            width: '100%',
                            minHeight: 42,
                            border: 'none',
                            background: 'transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'center',
                            padding: '2px 4px',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              textAlign: 'center',
                              color: fg,
                              fontSize: 11,
                              fontFamily: 'DM Mono, monospace',
                              fontWeight: displayCount !== null && displayCount > 0 ? 600 : 400,
                              lineHeight: 1.2,
                              minHeight: 14,
                            }}
                          >
                            {displayValue}
                          </span>
                          <span
                            style={{
                              marginTop: 4,
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 9,
                              color: fg,
                              opacity: displayCount === null ? 0.85 : 1,
                              lineHeight: 1,
                            }}
                          >
                            <span aria-hidden="true">📷</span>
                            <span>{totalPhotos}/{MAX_CELL_PHOTOS}</span>
                          </span>
                        </button>
                      </td>
                    )
                  })}

                  <td
                    style={{
                      ...tdBase,
                      minWidth: 180,
                      maxWidth: 240,
                      whiteSpace: 'normal',
                      color: '#6b7280',
                      background: '#ffffff',
                      verticalAlign: 'top',
                    }}
                  >
                    {rowRemarksByKey[rowKey(row.bayIndex, row.benchIndex)] ?? ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && isEditable && (
          <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
            No Bay/Bed layout was returned for this target yet. Once the target structure is available, you can enter observations here on web, tablet, or mobile.
          </p>
        )}
      </div>

      <CustomSpeciesModal
        farmId={farmId}
        category={modalCategory}
        open={!!modalCategory}
        existingItems={modalCategory ? mergedCustomSpeciesByCategory[modalCategory] : []}
        onClose={() => setModalCategory(null)}
        onCreated={handleCustomSpeciesCreated}
      />

      {activeCell && (
        <div
          onClick={() => void handleModalClose()}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 80,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(880px, 100%)',
              maxHeight: 'calc(100vh - 40px)',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(17, 24, 39, 0.2)',
              border: '0.5px solid #e5e7eb',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, color: '#111827' }}>
                  {activeCell.col.label} • {activeCell.bayTag} / {activeCell.benchTag}
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Cell photos are attached to this Bay/Bed location. Use spot 1 for now.
                </p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => void handleModalClose()}>
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  Count
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="input"
                    value={activeCell.draftCount}
                    disabled={!isEditable}
                    onChange={event => {
                      const nextValue = event.target.value
                      if (nextValue === '' || /^\d+$/.test(nextValue)) {
                        setActiveCell(previous => previous ? {
                          ...previous,
                          draftCount: nextValue,
                          dirty: true,
                          saveError: null,
                        } : previous)
                      }
                    }}
                    onBlur={() => {
                      if (activeCellRef.current?.draftCount.trim()) {
                        void saveActiveCellDraft(true)
                      }
                    }}
                    placeholder="Enter count"
                  />
                </label>

                <label style={{ fontSize: 12, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  Notes
                  <textarea
                    className="input"
                    value={activeCell.draftNotes}
                    disabled={!canEditCurrentCellNotes}
                    rows={4}
                    onChange={event => {
                      setActiveCell(previous => previous ? {
                        ...previous,
                        draftNotes: event.target.value,
                        dirty: true,
                        saveError: null,
                      } : previous)
                    }}
                    onBlur={() => {
                      if (activeCellRef.current?.draftCount.trim()) {
                        void saveActiveCellDraft(true)
                      }
                    }}
                    placeholder="Optional notes for this cell"
                    style={{ resize: 'vertical' }}
                  />
                </label>

                {!isEditable && canEditNotes && !activeCell.committedObservation && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                    Remarks can only be added to cells that already have a saved count.
                  </div>
                )}

                {activeCell.saveError && (
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>
                    {activeCell.saveError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(isEditable || canEditCurrentCellNotes) && (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={activeCell.saving || !canSaveCurrentCell}
                      onClick={() => void saveActiveCellDraft(true)}
                    >
                      {activeCell.saving ? 'Saving...' : isEditable ? 'Save cell' : 'Save remarks'}
                    </button>
                  )}
                  {isEditable && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={activeCell.clearLoading || (!activeCell.committedObservation && activeCell.draftCount === '' && activeCell.draftNotes === '')}
                      onClick={() => void clearActiveCell()}
                    >
                      {activeCell.clearLoading ? 'Clearing...' : 'Clear cell'}
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Photos</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {currentPhotoCount}/{MAX_CELL_PHOTOS} attached to this cell
                    </div>
                  </div>
                  {isEditable && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handlePhotoInputChange}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={currentPhotoCount >= MAX_CELL_PHOTOS}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {currentPhotoCount >= MAX_CELL_PHOTOS ? 'Photo limit reached' : 'Add photo'}
                      </button>
                    </>
                  )}
                </div>

                {(currentCellPhotos.length > 0 || currentPendingPhotos.length > 0) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {currentPendingPhotos.map(renderPendingPhotoTile)}
                    {currentCellPhotos.map(renderPhotoTile)}
                  </div>
                ) : (
                  <div style={{
                    border: '0.5px dashed #d1d5db',
                    borderRadius: 10,
                    padding: '22px 16px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#9ca3af',
                    background: '#f9fafb',
                  }}>
                    No photos attached to this cell yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
})

export default ObservationGrid
