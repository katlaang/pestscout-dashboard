import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import CustomSpeciesModal from '@/components/scouting/CustomSpeciesModal'
import { adminFarmsApi, customSpeciesApi, observationsApi } from '@/services/api'
import type {
  CustomSpecies,
  ObservationCategory,
  CreateObservationRequest,
  ScoutingObservationDto,
  ScoutingSessionSectionDto,
  SpeciesCode,
  GreenhouseResponse,
  FieldBlockResponse,
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
    return Math.max(112, Math.min(180, col.label.length * 8))
  }

  return Math.max(58, col.label.length * 9)
}

function columnKeyForObservation(observation: ScoutingObservationDto) {
  return observation.customSpeciesId
    ? `custom:${observation.customSpeciesId}`
    : `built_in:${observation.speciesCode}`
}

function obsKey(bayIndex: number, benchIndex: number, columnKey: string) {
  return `${bayIndex}:${benchIndex}:${columnKey}`
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

function EditableCell({
  value,
  count,
  col,
  onValueChange,
}: {
  value: string
  count: number | null
  col: GridColumn
  onValueChange: (value: string) => void
}) {
  const { bg } = countColor(count, col.category)

  return (
    <td style={{ background: bg, padding: 0, minWidth: columnMinWidth(col) }}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder=""
        onChange={event => {
          const nextValue = event.target.value
          if (nextValue === '' || /^\d+$/.test(nextValue)) {
            onValueChange(nextValue)
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          textAlign: 'center',
          color: countColor(count, col.category).fg,
          fontSize: 11,
          padding: '5px 2px',
          fontFamily: 'DM Mono, monospace',
          outline: 'none',
          cursor: 'text',
          MozAppearance: 'textfield',
        } as React.CSSProperties}
      />
    </td>
  )
}

interface ObservationGridProps {
  section: ScoutingSessionSectionDto
  sessionId: string
  isEditable: boolean
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
  farmId,
  surveySpeciesCodes,
  customSurveySpeciesIds,
}, ref) {
  const [obsMap, setObsMap] = useState<Record<string, ScoutingObservationDto>>({})
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [greenhouse, setGreenhouse] = useState<GreenhouseResponse | null>(null)
  const [fieldBlock, setFieldBlock] = useState<FieldBlockResponse | null>(null)
  const [customSpeciesByCategory, setCustomSpeciesByCategory] = useState<Record<ObservationCategory, CustomSpecies[]>>({
    PEST: [],
    DISEASE: [],
    BENEFICIAL: [],
  })
  const [modalCategory, setModalCategory] = useState<ObservationCategory | null>(null)
  const [createdCustomSpeciesIds, setCreatedCustomSpeciesIds] = useState<string[]>([])

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
        if (!map[key] || observation.count > map[key].count) {
          map[key] = observation
        }
      }
    }
    setObsMap(map)
  }, [section.observations])

  useEffect(() => {
    setDraftValues({})
  }, [section.targetId])

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

  function setDraftValueForKey(key: string, nextValue: string, committedObs?: ScoutingObservationDto) {
    setDraftValues(previous => {
      const committedValue = committedObs ? String(committedObs.count) : ''
      if (nextValue === committedValue) {
        if (!(key in previous)) return previous
        const next = { ...previous }
        delete next[key]
        return next
      }
      return { ...previous, [key]: nextValue }
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

  async function flushPendingChanges() {
    const pendingEntries = Object.entries(draftValues)
    if (pendingEntries.length === 0) return

    let nextObsMap = { ...obsMap }
    let nextDraftValues = { ...draftValues }

    try {
      for (const [key, rawValue] of pendingEntries) {
        const trimmedValue = rawValue.trim()
        const existingObservation = nextObsMap[key]
        const committedValue = existingObservation ? String(existingObservation.count) : ''

        if (trimmedValue === committedValue) {
          delete nextDraftValues[key]
          continue
        }

        if (trimmedValue === '') {
          if (existingObservation) {
            await observationsApi.delete(sessionId, existingObservation.id)
            delete nextObsMap[key]
          }
          delete nextDraftValues[key]
          continue
        }

        const parsedCount = parseCountValue(trimmedValue)
        if (parsedCount === null) continue

        if (existingObservation) {
          const updatedObservation = await observationsApi.update(sessionId, existingObservation.id, {
            count: parsedCount,
          })
          nextObsMap[key] = updatedObservation
          delete nextDraftValues[key]
          continue
        }

        const cellMeta = cellMetaByKey.get(key)
        if (!cellMeta) continue

        const createBody: CreateObservationRequest = {
          greenhouseId: section.greenhouseId,
          fieldBlockId: section.fieldBlockId,
          ...(cellMeta.col.kind === 'custom'
            ? { customSpeciesId: cellMeta.col.customSpeciesId }
            : { speciesCode: cellMeta.col.code }),
          category: cellMeta.col.category,
          bayIndex: cellMeta.bayIndex,
          bayTag: cellMeta.bayTag,
          benchIndex: cellMeta.benchIndex,
          benchTag: cellMeta.benchTag,
          count: parsedCount,
        }

        const createdObservation = await observationsApi.create(sessionId, createBody)
        nextObsMap[key] = createdObservation
        delete nextDraftValues[key]
      }
    } catch (error) {
      setObsMap(nextObsMap)
      setDraftValues(nextDraftValues)
      throw error
    }

    setObsMap(nextObsMap)
    setDraftValues(nextDraftValues)
  }

  useImperativeHandle(ref, () => ({
    flushPendingChanges,
  }), [flushPendingChanges])

  const thBase: React.CSSProperties = {
    padding: '5px 6px',
    fontSize: 10,
    fontWeight: 600,
    border: '0.5px solid #e5e7eb',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  }

  const tdBase: React.CSSProperties = {
    padding: '5px 8px',
    fontSize: 11,
    border: '0.5px solid #e5e7eb',
    whiteSpace: 'nowrap',
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
                    const obs = obsMap[key]
                    const hasDraftValue = Object.prototype.hasOwnProperty.call(draftValues, key)
                    const displayValue = hasDraftValue ? draftValues[key] : obs ? String(obs.count) : ''

                    if (isEditable) {
                      return (
                        <EditableCell
                          key={col.key}
                          value={displayValue}
                          count={parseCountValue(displayValue)}
                          col={col}
                          onValueChange={nextValue => setDraftValueForKey(key, nextValue, obs)}
                        />
                      )
                    }

                    const count = obs?.count ?? null
                    const { bg, fg } = countColor(count, col.category)
                    return (
                      <td
                        key={col.key}
                        style={{
                          ...tdBase,
                          background: bg,
                          color: fg,
                          textAlign: 'center',
                          fontFamily: 'DM Mono, monospace',
                          fontWeight: count !== null && count > 0 ? 600 : 400,
                          minWidth: columnMinWidth(col),
                        }}
                      >
                        {count !== null ? count : ''}
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
    </>
  )
})

export default ObservationGrid
