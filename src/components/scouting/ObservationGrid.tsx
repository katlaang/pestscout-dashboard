import { useState, useEffect, useMemo } from 'react'
import { observationsApi, adminFarmsApi } from '@/services/api'
import type {
  ScoutingSessionSectionDto,
  ScoutingObservationDto,
  SpeciesCode,
  ObservationCategory,
  GreenhouseResponse,
} from '@/types'

// ─── Column definitions ───────────────────────────────────────────────────────

const SPECIES_COLS: { code: SpeciesCode; label: string; cat: ObservationCategory }[] = [
  { code: 'RED_SPIDER_MITE',    label: 'RSM',      cat: 'PEST'       },
  { code: 'THRIPS',             label: 'Thrips',   cat: 'PEST'       },
  { code: 'WHITEFLIES',         label: 'W/fly',    cat: 'PEST'       },
  { code: 'MEALYBUGS',          label: 'M/bugs',   cat: 'PEST'       },
  { code: 'FALSE_CODLING_MOTH', label: 'FCM',      cat: 'PEST'       },
  { code: 'CATERPILLARS',       label: 'Caterp.',  cat: 'PEST'       },
  { code: 'PEST_OTHER',         label: 'Other',    cat: 'PEST'       },
  { code: 'BENEFICIAL_PP',      label: 'PP',       cat: 'BENEFICIAL' },
  { code: 'POWDERY_MILDEW',     label: 'PM',       cat: 'DISEASE'    },
  { code: 'DOWNY_MILDEW',       label: 'DM',       cat: 'DISEASE'    },
  { code: 'BOTRYTIS',           label: 'Botrytis', cat: 'DISEASE'    },
  { code: 'VERTICILLIUM',       label: 'Vert.',    cat: 'DISEASE'    },
  { code: 'BACTERIAL_WILT',     label: 'BW',       cat: 'DISEASE'    },
  { code: 'DISEASE_OTHER',      label: 'Other',    cat: 'DISEASE'    },
]


// ─── Color coding ─────────────────────────────────────────────────────────────

function countColor(n: number | null, category: ObservationCategory): { bg: string; fg: string } {
  if (n === null) return { bg: '#ffffff', fg: '#111827' }
  if (category === 'BENEFICIAL') return { bg: '#70ad47', fg: '#111827' }
  if (n === 0) return { bg: '#70ad47', fg: '#111827' }
  if (n <= 9) return { bg: '#ffff00', fg: '#111827' }
  if (n <= 29) return { bg: '#ffc000', fg: '#111827' }
  return { bg: '#ff0000', fg: '#111827' }
}

// ─── Key helper ───────────────────────────────────────────────────────────────

function obsKey(bayIndex: number, benchIndex: number, code: SpeciesCode) {
  return `${bayIndex}:${benchIndex}:${code}`
}

// ─── Row structure ────────────────────────────────────────────────────────────

interface GridRow {
  bayIndex:   number
  bayTag:     string
  benchIndex: number
  benchTag:   string
  rowSpan?:   number
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

  for (const o of section.observations.filter(o => !o.deleted)) {
    const bayTag = o.bayTag ?? `Bay ${o.bayIndex}`
    const bedTag = o.benchTag ?? String(o.benchIndex)
    if (selectedBayTags && !selectedBayTags.has(bayTag)) continue
    if (selectedBedTags && !selectedBedTags.has(bedTag)) continue

    if (!bayMap.has(o.bayIndex))
      bayMap.set(o.bayIndex, { tag: bayTag, beds: new Map() })
    bayMap.get(o.bayIndex)!.beds.set(o.benchIndex, bedTag)
  }

  if (bayMap.size === 0 && greenhouse?.bayCount) {
    for (let b = 1; b <= greenhouse.bayCount; b++) {
      const bayTag = greenhouse.bayTags?.[b - 1] ?? String(b)
      if (selectedBayTags && !selectedBayTags.has(bayTag)) continue

      const beds = new Map<number, string>()
      for (let bn = 1; bn <= (greenhouse.benchesPerBay ?? 2); bn++) {
        const bedTag = greenhouse.benchTags?.[bn - 1] ?? String(bn)
        if (selectedBedTags && !selectedBedTags.has(bedTag)) continue
        beds.set(bn, bedTag)
      }
      if (beds.size > 0) {
        bayMap.set(b, { tag: bayTag, beds })
      }
    }
  }

  const rows: GridRow[] = []
  for (const bayIndex of [...bayMap.keys()].sort((a, b) => a - b)) {
    const { tag, beds } = bayMap.get(bayIndex)!
    const sorted = [...beds.keys()].sort((a, b) => a - b)
    sorted.forEach((benchIndex, i) => {
      rows.push({
        bayIndex, bayTag: tag,
        benchIndex, benchTag: beds.get(benchIndex)!,
        rowSpan: i === 0 ? sorted.length : undefined,
      })
    })
  }
  return rows
}

// ─── Editable cell ────────────────────────────────────────────────────────────

function EditableCell({
  obs, sessionId, section,
  bayIndex, bayTag, benchIndex, benchTag,
  col, onSaved,
}: {
  obs:        ScoutingObservationDto | undefined
  sessionId:  string
  section:    ScoutingSessionSectionDto
  bayIndex:   number
  bayTag:     string
  benchIndex: number
  benchTag:   string
  col:        { code: SpeciesCode; cat: ObservationCategory }
  onSaved:    (updated: ScoutingObservationDto) => void
}) {
  const [val,     setVal]     = useState(obs ? String(obs.count) : '')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { setVal(obs ? String(obs.count) : '') }, [obs?.count, obs?.id])

  async function commit() {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0) { setVal(obs ? String(obs.count) : ''); return }
    if (obs && n === obs.count) return
    setSaving(true)
    try {
      const updated = obs
        ? await observationsApi.update(sessionId, obs.id, { count: n })
        : await observationsApi.create(sessionId, {
            greenhouseId: section.greenhouseId,
            fieldBlockId: section.fieldBlockId,
            speciesCode:  col.code,
            category:     col.cat,
            bayIndex, bayTag,
            benchIndex, benchTag,
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
  const { bg } = countColor(committedCount, col.cat)

  return (
    <td style={{ background: bg, padding: 0, minWidth: 38 }}>
      <input
        type="number"
        min={0}
        value={val}
        placeholder=""
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        style={{
          width: '100%', height: '100%', border: 'none', background: 'transparent',
          textAlign: 'center', color: '#111827',
          fontSize: 11, padding: '5px 2px',
          fontFamily: 'DM Mono, monospace', outline: 'none',
          cursor: saving ? 'wait' : 'text',
          opacity: saving ? 0.5 : 1,
          MozAppearance: 'textfield',
        } as React.CSSProperties}
      />
    </td>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

interface ObservationGridProps {
  section:    ScoutingSessionSectionDto
  sessionId:  string
  isEditable: boolean
  farmId:     string
  surveySpeciesCodes?: SpeciesCode[]
  onChanged:  () => void
}

export default function ObservationGrid({ section, sessionId, isEditable, farmId, surveySpeciesCodes, onChanged }: ObservationGridProps) {
  const [obsMap,     setObsMap]     = useState<Record<string, ScoutingObservationDto>>({})
  const [greenhouse, setGreenhouse] = useState<GreenhouseResponse | null>(null)
  const visibleColumns = useMemo(() => {
    if (!surveySpeciesCodes || surveySpeciesCodes.length === 0) return SPECIES_COLS
    const allowedCodes = new Set(surveySpeciesCodes)
    return SPECIES_COLS.filter(column => allowedCodes.has(column.code))
  }, [surveySpeciesCodes])
  const pestCount = visibleColumns.filter(column => column.cat === 'PEST').length
  const beneficialCount = visibleColumns.filter(column => column.cat === 'BENEFICIAL').length
  const diseaseCount = visibleColumns.filter(column => column.cat === 'DISEASE').length

  // Build obs map from section data
  useEffect(() => {
    const map: Record<string, ScoutingObservationDto> = {}
    for (const o of section.observations) {
      if (!o.deleted) {
        const key = obsKey(o.bayIndex, o.benchIndex, o.speciesCode)
        // keep the one with highest count if duplicates (multiple spots)
        if (!map[key] || o.count > map[key].count) map[key] = o
      }
    }
    setObsMap(map)
  }, [section.observations])

  // Load greenhouse dimensions so we can show a full empty grid for new sessions
  useEffect(() => {
    if (!section.greenhouseId || !farmId) return
    adminFarmsApi.listGreenhouses(farmId)
      .then(list => setGreenhouse(list.find(g => g.id === section.greenhouseId) ?? null))
      .catch(() => {})
  }, [section.greenhouseId, farmId])

  const rows = useMemo(
    () => buildRows(section, greenhouse),
    [section, greenhouse],
  )

  function handleSaved(key: string, updated: ScoutingObservationDto) {
    setObsMap(prev => ({ ...prev, [key]: updated }))
    onChanged()
  }

  // ── Shared cell/header styles ──────────────────────────────────────────────

  const thBase: React.CSSProperties = {
    padding: '5px 6px', fontSize: 10, fontWeight: 600,
    border: '0.5px solid #e5e7eb', whiteSpace: 'nowrap',
    textTransform: 'uppercase', letterSpacing: '0.4px',
  }

  const tdBase: React.CSSProperties = {
    padding: '5px 8px', fontSize: 11,
    border: '0.5px solid #e5e7eb', whiteSpace: 'nowrap',
  }

  if (rows.length === 0 && !isEditable) {
    return (
      <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
        No observations recorded yet.
      </p>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'auto' }}>
        <thead>

          {/* Category header */}
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

          {/* Species header */}
          <tr>
            <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bay</th>
            <th style={{ ...thBase, background: '#f3f4f6', color: '#374151', minWidth: 52 }}>Bed</th>
            {visibleColumns.map(col => (
              <th key={col.code} style={{
                ...thBase, minWidth: 38, textAlign: 'center',
                background:
                  col.cat === 'PEST'       ? '#fffbeb' :
                  col.cat === 'BENEFICIAL' ? '#f0fdf4' : '#fff5f5',
                color:
                  col.cat === 'PEST'       ? '#92400e' :
                  col.cat === 'BENEFICIAL' ? '#166534' : '#991b1b',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map(row => {
            const rowKey = `${row.bayIndex}-${row.benchIndex}`
            return (
              <tr key={rowKey} style={{ borderBottom: '0.5px solid #f3f4f6' }}>

                {/* Bay cell */}
                {row.rowSpan !== undefined && (
                  <td
                    rowSpan={row.rowSpan}
                    style={{
                      ...tdBase,
                      fontWeight: 600, textAlign: 'center',
                      background: '#f9fafb', color: '#374151',
                      verticalAlign: 'middle',
                      borderRight: '1px solid #d1d5db',
                    }}
                  >
                    {row.bayTag}
                  </td>
                )}

                {/* Bed cell */}
                <td style={{ ...tdBase, color: '#6b7280', fontFamily: 'DM Mono, monospace', fontSize: 10 }}>
                  {row.benchTag}
                </td>

                {/* Species count cells */}
                {visibleColumns.map(col => {
                  const key = obsKey(row.bayIndex, row.benchIndex, col.code)
                  const obs = obsMap[key]

                  if (isEditable) {
                    return (
                      <EditableCell
                        key={col.code}
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
                  const { bg, fg } = countColor(count, col.cat)
                  return (
                    <td key={col.code} style={{
                      ...tdBase,
                      background: bg, color: fg,
                      textAlign: 'center',
                      fontFamily: 'DM Mono, monospace', fontWeight: count !== null && count > 0 ? 600 : 400,
                      minWidth: 38,
                    }}>
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
  )
}
