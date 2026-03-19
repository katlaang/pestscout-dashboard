import { useEffect, useMemo, useState } from 'react'
import CustomSpeciesModal from '@/components/scouting/CustomSpeciesModal'
import { adminFarmsApi, customSpeciesApi, observationsApi } from '@/services/api'
import type {
  CustomSpecies,
  ObservationCategory,
  ScoutingObservationDto,
  ScoutingSessionSectionDto,
  SpeciesCode,
  GreenhouseResponse,
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
  if (category === 'BENEFICIAL') return { bg: '#70ad47', fg: '#111827' }
  if (n === 0) return { bg: '#70ad47', fg: '#111827' }
  if (n <= 9) return { bg: '#ffff00', fg: '#111827' }
  if (n <= 29) return { bg: '#ffc000', fg: '#111827' }
  return { bg: '#ff0000', fg: '#111827' }
}

function columnKeyForObservation(observation: ScoutingObservationDto) {
  return observation.customSpeciesId
    ? `custom:${observation.customSpeciesId}`
    : `built_in:${observation.speciesCode}`
}

function obsKey(bayIndex: number, benchIndex: number, columnKey: string) {
  return `${bayIndex}:${benchIndex}:${columnKey}`
}

interface GridRow {
  bayIndex: number
  bayTag: string
  benchIndex: number
  benchTag: string
  rowSpan?: number
}

function buildRows(
  section: ScoutingSessionSectionDto,
  greenhouse: GreenhouseResponse | null,
): GridRow[] {
  const bayMap = new Map<number, { tag: string; beds: Map<number, string> }>()
  const selectedBayTags =
    section.includeAllBays === false && section.bayTags && section.bayTags.length > 0
      ? new Set(section.bayTags)
      : null
  const selectedBedTags =
    section.includeAllBenches === false && section.benchTags && section.benchTags.length > 0
      ? new Set(section.benchTags)
      : null

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

  if (bayMap.size === 0 && greenhouse?.bayCount) {
    for (let bayIndex = 1; bayIndex <= greenhouse.bayCount; bayIndex++) {
      const bayTag = greenhouse.bayTags?.[bayIndex - 1] ?? String(bayIndex)
      if (selectedBayTags && !selectedBayTags.has(bayTag)) continue

      const beds = new Map<number, string>()
      for (let benchIndex = 1; benchIndex <= (greenhouse.benchesPerBay ?? 2); benchIndex++) {
        const bedTag = greenhouse.benchTags?.[benchIndex - 1] ?? String(benchIndex)
        if (selectedBedTags && !selectedBedTags.has(bedTag)) continue
        beds.set(benchIndex, bedTag)
      }
      if (beds.size > 0) {
        bayMap.set(bayIndex, { tag: bayTag, beds })
      }
    }
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

function EditableCell({
  obs,
  sessionId,
  section,
  bayIndex,
  bayTag,
  benchIndex,
  benchTag,
  col,
  onSaved,
}: {
  obs: ScoutingObservationDto | undefined
  sessionId: string
  section: ScoutingSessionSectionDto
  bayIndex: number
  bayTag: string
  benchIndex: number
  benchTag: string
  col: GridColumn
  onSaved: (updated: ScoutingObservationDto) => void
}) {
  const [val, setVal] = useState(obs ? String(obs.count) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setVal(obs ? String(obs.count) : '')
  }, [obs?.count, obs?.id])

  async function commit() {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0) {
      setVal(obs ? String(obs.count) : '')
      return
    }
    if (obs && n === obs.count) return

    setSaving(true)
    try {
      const updated = obs
        ? await observationsApi.update(sessionId, obs.id, { count: n })
        : await observationsApi.create(sessionId, {
            greenhouseId: section.greenhouseId,
            fieldBlockId: section.fieldBlockId,
            ...(col.kind === 'custom'
              ? { customSpeciesId: col.customSpeciesId }
              : { speciesCode: col.code }),
            category: col.category,
            bayIndex,
            bayTag,
            benchIndex,
            benchTag,
            count: n,
          })
      onSaved(updated)
    } catch {
      setVal(obs ? String(obs.count) : '')
    } finally {
      setSaving(false)
    }
  }

  const committedCount = obs ? obs.count : null
  const { bg } = countColor(committedCount, col.category)

  return (
    <td style={{ background: bg, padding: 0, minWidth: 46 }}>
      <input
        type="number"
        min={0}
        value={val}
        placeholder=""
        onChange={event => setVal(event.target.value)}
        onBlur={commit}
        onKeyDown={event => event.key === 'Enter' && commit()}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
          textAlign: 'center',
          color: '#111827',
          fontSize: 11,
          padding: '5px 2px',
          fontFamily: 'DM Mono, monospace',
          outline: 'none',
          cursor: saving ? 'wait' : 'text',
          opacity: saving ? 0.5 : 1,
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
  onChanged: () => void
}

export default function ObservationGrid({
  section,
  sessionId,
  isEditable,
  farmId,
  surveySpeciesCodes,
  customSurveySpeciesIds,
  onChanged,
}: ObservationGridProps) {
  const [obsMap, setObsMap] = useState<Record<string, ScoutingObservationDto>>({})
  const [greenhouse, setGreenhouse] = useState<GreenhouseResponse | null>(null)
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
    if (!section.greenhouseId || !farmId) return
    adminFarmsApi.listGreenhouses(farmId)
      .then(list => setGreenhouse(list.find(item => item.id === section.greenhouseId) ?? null))
      .catch(() => {})
  }, [section.greenhouseId, farmId])

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

  const rows = useMemo(() => buildRows(section, greenhouse), [section, greenhouse])

  function handleSaved(key: string, updated: ScoutingObservationDto) {
    setObsMap(previous => ({ ...previous, [key]: updated }))
    onChanged()
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

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'auto' }}>
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
            </tr>

            <tr>
              <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bay</th>
              <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bed</th>
              {visibleColumns.map(col => (
                <th
                  key={col.key}
                  style={{
                    ...thBase,
                    minWidth: col.kind === 'custom' ? 76 : 46,
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
            </tr>
          </thead>

          <tbody>
            {rows.map(row => {
              const rowKey = `${row.bayIndex}-${row.benchIndex}`
              return (
                <tr key={rowKey} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
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

                    if (isEditable) {
                      return (
                        <EditableCell
                          key={col.key}
                          obs={obs}
                          sessionId={sessionId}
                          section={section}
                          bayIndex={row.bayIndex}
                          bayTag={row.bayTag}
                          benchIndex={row.benchIndex}
                          benchTag={row.benchTag}
                          col={col}
                          onSaved={updated => handleSaved(key, updated)}
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
                          minWidth: col.kind === 'custom' ? 76 : 46,
                        }}
                      >
                        {count !== null ? count : ''}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && isEditable && (
          <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
            No bay/bed structure loaded. Observations entered via mobile app will appear here.
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
}
