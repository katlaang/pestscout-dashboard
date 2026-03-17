import { useState, useEffect } from 'react'
import { farmsApi, analyticsApi } from '@/services/api'
import type { FarmResponse, HeatmapResponse } from '@/types'
import HeatmapGrid from '@/components/dashboard/HeatmapGrid'
import { currentWeek, SEVERITY_COLORS, SEVERITY_ORDER } from '@/utils'

export default function HeatmapPage() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [farmId, setFarmId] = useState('')
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  const { week, year } = currentWeek()
  const [weekInput, setWeekInput] = useState(week)
  const [yearInput, setYearInput] = useState(year)

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
    analyticsApi.heatmap(farmId, weekInput, yearInput)
      .then(data => {
        setHeatmap(data)
        if (data.sections.length > 0) setSelectedSection(data.sections[0].targetId)
      })
      .finally(() => setLoading(false))
  }

  const activeSection = heatmap?.sections.find(s => s.targetId === selectedSection) ?? heatmap?.sections[0]

  // Compute summary stats for active section
  const totalCells = activeSection?.cells.length ?? 0
  const alertCells = activeSection?.cells.filter(c =>
    c.severityLevel === 'EMERGENCY' || c.severityLevel === 'VERY_HIGH'
  ).length ?? 0
  const highCells = activeSection?.cells.filter(c => c.severityLevel === 'HIGH').length ?? 0
  const totalObs = activeSection?.cells.reduce((a, c) => a + c.totalCount, 0) ?? 0

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Heat maps</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Pest pressure by bay and bench — hover any cell for details
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 180 }} value={farmId} onChange={e => setFarmId(e.target.value)}>
            {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Week</label>
            <input
              className="input"
              type="number"
              min={1} max={53}
              style={{ width: 64 }}
              value={weekInput}
              onChange={e => setWeekInput(Number(e.target.value))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Year</label>
            <input
              className="input"
              type="number"
              min={2020} max={2099}
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
          Loading heat map…
        </div>
      )}

      {!loading && heatmap && (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>

          {/* Sidebar: section list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', paddingLeft: 4, marginBottom: 4 }}>
              Structures
            </p>
            {heatmap.sections.map(sec => {
              const hasEmergency = sec.cells.some(c => c.severityLevel === 'EMERGENCY')
              const hasHigh = sec.cells.some(c => c.severityLevel === 'VERY_HIGH' || c.severityLevel === 'HIGH')
              const isActive = sec.targetId === selectedSection

              return (
                <button
                  key={sec.targetId}
                  onClick={() => setSelectedSection(sec.targetId)}
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
                  <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400 }}>{sec.targetName}</span>
                  {hasEmergency && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9b1c1c', flexShrink: 0 }} />
                  )}
                  {!hasEmergency && hasHigh && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e05252', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}

            {heatmap.sections.length === 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', paddingLeft: 4 }}>
                No structures with data this week
              </p>
            )}

            {/* Legend card */}
            <div className="card" style={{ marginTop: 8, padding: '12px' }}>
              <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                Severity scale
              </p>
              {SEVERITY_ORDER.map(level => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: SEVERITY_COLORS[level],
                    border: '0.5px solid rgba(0,0,0,0.06)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {level.charAt(0) + level.slice(1).toLowerCase().replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Main: heatmap + stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Stats row */}
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

            {/* Grid */}
            {activeSection ? (
              <div className="card">
                <div style={{ marginBottom: 14 }}>
                  <h2 style={{ fontSize: 14, color: '#111827', marginBottom: 2 }}>
                    {activeSection.targetName}
                  </h2>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    {activeSection.bayCount} bays × {activeSection.benchesPerBay} benches · W{heatmap.week} {heatmap.year}
                  </p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <HeatmapGrid
                    section={activeSection}
                    cellSize={28}
                    gap={4}
                    showLegend={false}
                  />
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Select a structure on the left to view its heat map
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !heatmap && (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          Select a farm and click Load to view the heat map
        </div>
      )}
    </div>
  )
}
