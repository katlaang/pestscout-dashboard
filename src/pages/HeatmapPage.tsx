import { useState, useEffect } from 'react'
import { farmsApi, analyticsApi } from '@/services/api'
import type {
  FarmResponse,
  HeatmapResponse,
  HeatmapSectionResponse,
  MonthlyHeatmapResponse,
  MonthlyHeatmapWeekResponse,
} from '@/types'
import HeatmapGrid from '@/components/dashboard/HeatmapGrid'
import { SEVERITY_COLORS, SEVERITY_ORDER } from '@/utils'

function normalizeHeatmapSection(section: HeatmapSectionResponse): HeatmapSectionResponse {
  return {
    ...section,
    cells: Array.isArray(section.cells) ? section.cells : [],
    bayLayouts: Array.isArray(section.bayLayouts) ? section.bayLayouts : [],
  }
}

function normalizeMonthlyHeatmapResponse(
  data: MonthlyHeatmapResponse | HeatmapResponse | null | undefined,
  month: number,
  year: number,
): MonthlyHeatmapResponse {
  if (data && Array.isArray((data as MonthlyHeatmapResponse).weeklyHeatmaps)) {
    const monthly = data as MonthlyHeatmapResponse
    return {
      farmId: monthly.farmId,
      year: monthly.year ?? year,
      month: monthly.month ?? month,
      weeklyHeatmaps: monthly.weeklyHeatmaps.map(week => ({
        weekNumber: week.weekNumber,
        rangeStart: week.rangeStart,
        rangeEnd: week.rangeEnd,
        sections: Array.isArray(week.sections) ? week.sections.map(normalizeHeatmapSection) : [],
      })),
      legend: monthly.legend ?? [],
    }
  }

  const weekly = data as HeatmapResponse | null | undefined
  return {
    farmId: weekly?.farmId ?? '',
    year: weekly?.year ?? year,
    month: weekly?.month ?? month,
    weeklyHeatmaps: weekly?.sections
      ? [{
          weekNumber: weekly.week ?? 0,
          sections: weekly.sections.map(normalizeHeatmapSection),
        }]
      : [],
    legend: weekly?.legend ?? [],
  }
}

export default function HeatmapPage() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [farmId, setFarmId] = useState('')
  const [heatmap, setHeatmap] = useState<MonthlyHeatmapResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  const now = new Date()
  const [monthInput, setMonthInput] = useState(now.getMonth() + 1)
  const [yearInput, setYearInput] = useState(now.getFullYear())

  useEffect(() => {
    farmsApi.list().then(data => {
      setFarms(data)
      if (data.length > 0) setFarmId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!farmId) return
    fetchHeatmap()
  }, [farmId])

  function fetchHeatmap() {
    if (!farmId) return
    setLoading(true)
    setError(null)
    analyticsApi.heatmap(farmId, monthInput, yearInput)
      .then(data => {
        const normalized = normalizeMonthlyHeatmapResponse(data, monthInput, yearInput)
        const weeklyHeatmaps = Array.isArray(normalized.weeklyHeatmaps) ? normalized.weeklyHeatmaps : []
        const firstWeek = weeklyHeatmaps[0]
        const firstSection = firstWeek?.sections?.[0]

        setHeatmap(normalized)
        setSelectedWeek(firstWeek?.weekNumber ?? null)
        setSelectedSection(firstSection?.targetId ?? null)
      })
      .catch((fetchError: any) => {
        setHeatmap(null)
        setSelectedWeek(null)
        setSelectedSection(null)
        if (fetchError?.response?.status === 403) {
          setError('You do not have access to heat maps for this farm.')
          return
        }
        setError(fetchError?.response?.data?.message ?? 'Could not load the monthly heat map.')
      })
      .finally(() => setLoading(false))
  }

  const activeWeek =
    heatmap?.weeklyHeatmaps?.find(week => week.weekNumber === selectedWeek) ??
    heatmap?.weeklyHeatmaps?.[0] ??
    null
  const activeSection =
    activeWeek?.sections?.find(section => section.targetId === selectedSection) ??
    activeWeek?.sections?.[0] ??
    null
  const activeCells = Array.isArray(activeSection?.cells) ? activeSection.cells : []
  const totalCells = activeCells.length
  const alertCells = activeCells.filter(cell =>
    cell.severityLevel === 'EMERGENCY' || cell.severityLevel === 'VERY_HIGH',
  ).length ?? 0
  const highCells = activeCells.filter(cell => cell.severityLevel === 'HIGH').length ?? 0
  const totalObs = activeCells.reduce((acc, cell) => acc + cell.totalCount, 0)

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
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Heat maps</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Pest pressure by Bay ID and Bed ID - hover any cell for details
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 180 }} value={farmId} onChange={e => setFarmId(e.target.value)}>
            {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Month</label>
            <input
              className="input"
              type="number"
              min={1}
              max={12}
              style={{ width: 64 }}
              value={monthInput}
              onChange={e => setMonthInput(Number(e.target.value))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Year</label>
            <input
              className="input"
              type="number"
              min={2020}
              max={2099}
              style={{ width: 80 }}
              value={yearInput}
              onChange={e => setYearInput(Number(e.target.value))}
            />
          </div>
          <button className="btn-primary" onClick={fetchHeatmap}>
            Load
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Loading heat map...
        </div>
      )}

      {!loading && error && (
        <div
          className="card"
          style={{
            padding: 24,
            marginBottom: 16,
            background: '#fff5f5',
            border: '0.5px solid #fca5a5',
            color: '#c53030',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {!loading && heatmap && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p
              style={{
                fontSize: 10,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.7px',
                paddingLeft: 4,
                marginBottom: 4,
              }}
            >
              Weeks
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {(heatmap.weeklyHeatmaps ?? []).map((week: MonthlyHeatmapWeekResponse) => {
                const isActive = week.weekNumber === activeWeek?.weekNumber
                return (
                  <button
                    key={week.weekNumber}
                    onClick={() => {
                      setSelectedWeek(week.weekNumber)
                      setSelectedSection(week.sections?.[0]?.targetId ?? null)
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '0.5px solid',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      ...(isActive
                        ? { background: '#f0faf4', borderColor: '#a7dcbc', color: '#1e5c3a' }
                        : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }),
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 500 }}>W{week.weekNumber}</div>
                    {(week.rangeStart || week.rangeEnd) && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                        {[week.rangeStart, week.rangeEnd].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            <p
              style={{
                fontSize: 10,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.7px',
                paddingLeft: 4,
                marginBottom: 4,
              }}
            >
              Structures
            </p>
            {(activeWeek?.sections ?? []).map(section => {
              const sectionCells = Array.isArray(section.cells) ? section.cells : []
              const hasEmergency = sectionCells.some(cell => cell.severityLevel === 'EMERGENCY')
              const hasHigh = sectionCells.some(cell => cell.severityLevel === 'VERY_HIGH' || cell.severityLevel === 'HIGH')
              const isActive = section.targetId === selectedSection

              return (
                <button
                  key={section.targetId}
                  onClick={() => setSelectedSection(section.targetId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '0.5px solid',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    transition: 'all 0.1s',
                    ...(isActive
                      ? { background: '#f0faf4', borderColor: '#a7dcbc', color: '#1e5c3a' }
                      : { background: '#fff', borderColor: '#e5e7eb', color: '#374151' }),
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400 }}>{section.targetName}</span>
                  {hasEmergency && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9b1c1c', flexShrink: 0 }} />
                  )}
                  {!hasEmergency && hasHigh && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e05252', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}

            {(activeWeek?.sections?.length ?? 0) === 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', paddingLeft: 4 }}>
                No structures with data in this week
              </p>
            )}

            <div className="card" style={{ marginTop: 8, padding: '12px' }}>
              <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                Severity scale
              </p>
              {SEVERITY_ORDER.map(level => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: SEVERITY_COLORS[level],
                      border: '0.5px solid rgba(0,0,0,0.06)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {level.charAt(0) + level.slice(1).toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Total cells scouted', value: totalCells, color: undefined },
                { label: 'Emergency / very high', value: alertCells, color: alertCells > 0 ? '#c53030' : undefined },
                { label: 'High pressure cells', value: highCells, color: highCells > 0 ? '#d97706' : undefined },
                { label: 'Total observations', value: totalObs, color: undefined },
              ].map(stat => (
                <div key={stat.label} className="card" style={{ padding: '10px 12px' }}>
                  <p style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{stat.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 500, color: stat.color ?? '#111827', letterSpacing: '-0.02em' }}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {activeSection ? (
              <div className="card">
                <div style={{ marginBottom: 14 }}>
                  <h2 style={{ fontSize: 14, color: '#111827', marginBottom: 2 }}>{activeSection.targetName}</h2>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    {activeSection.bayCount} bays x {activeSection.benchesPerBay} beds - {heatmap.month ?? monthInput}/{heatmap.year} - W{activeWeek?.weekNumber ?? '-'}
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <HeatmapGrid section={activeSection} cellSize={28} gap={4} showLegend={false} />
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {(heatmap.weeklyHeatmaps?.length ?? 0) === 0
                  ? 'No heat map data is available for this month'
                  : 'Select a week and structure on the left to view its heat map'}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !heatmap && !error && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Select a farm and click Load to view the heat map
        </div>
      )}
    </div>
  )
}
