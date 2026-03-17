import { useState, useEffect } from 'react'
import { farmsApi, analyticsApi } from '@/services/api'
import type { FarmResponse, AlertDto } from '@/types'
import { SEVERITY_COLORS, formatDateTime } from '@/utils'
import { useAlertCount } from '@/hooks/useAlertCount'

const SEVERITY_ORDER = ['EMERGENCY', 'VERY_HIGH', 'HIGH', 'MODERATE', 'LOW', 'ZERO']

function severityRank(s: string) {
  const idx = SEVERITY_ORDER.indexOf(s.toUpperCase().replace(' ', '_'))
  return idx === -1 ? 99 : idx
}

export default function AlertsPage() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [farmId, setFarmId] = useState('')
  const [alerts, setAlerts] = useState<AlertDto[]>([])
  const [loading, setLoading] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const { setCount } = useAlertCount()

  useEffect(() => {
    farmsApi.list().then(data => {
      setFarms(data)
      if (data.length > 0) setFarmId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!farmId) return
    setLoading(true)
    analyticsApi.fullDashboard(farmId)
      .then(d => {
        const a = d.alerts ?? []
        setAlerts(a)
        const hot = a.filter(x => {
          const s = x.severity.toUpperCase().replace(' ', '_')
          return s === 'EMERGENCY' || s === 'VERY_HIGH' || s === 'HIGH'
        }).length
        setCount(hot)
      })
      .finally(() => setLoading(false))
  }, [farmId])

  const SEVERITY_FILTERS = ['ALL', 'EMERGENCY', 'VERY_HIGH', 'HIGH', 'MODERATE', 'LOW']
  const SEVERITY_LABELS: Record<string, string> = {
    ALL: 'All', EMERGENCY: 'Emergency', VERY_HIGH: 'Very high',
    HIGH: 'High', MODERATE: 'Moderate', LOW: 'Low',
  }

  const filtered = alerts
    .filter(a => {
      const normSev = a.severity.toUpperCase().replace(' ', '_')
      const matchSev = severityFilter === 'ALL' || normSev === severityFilter
      const matchSearch = !search ||
        a.pest.toLowerCase().includes(search.toLowerCase()) ||
        a.location.toLowerCase().includes(search.toLowerCase())
      return matchSev && matchSearch
    })
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  const emergencyCount = alerts.filter(a => a.severity.toUpperCase().includes('EMERGENCY')).length
  const highCount = alerts.filter(a => {
    const s = a.severity.toUpperCase()
    return s.includes('HIGH') || s.includes('VERY_HIGH')
  }).length

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Alerts</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            High-severity pest detections requiring attention
          </p>
        </div>
        <select className="input" style={{ width: 200 }} value={farmId} onChange={e => setFarmId(e.target.value)}>
          {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Summary KPIs */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20, maxWidth: 560 }}>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Total alerts</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: '#111827', letterSpacing: '-0.02em' }}>{alerts.length}</p>
          </div>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Emergency</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: emergencyCount > 0 ? '#9b1c1c' : '#111827', letterSpacing: '-0.02em' }}>{emergencyCount}</p>
          </div>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>High / very high</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: highCount > 0 ? '#c53030' : '#111827', letterSpacing: '-0.02em' }}>{highCount}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input" style={{ width: 220 }}
          placeholder="Search pest or location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEVERITY_FILTERS.map(s => (
            <button key={s}
              onClick={() => setSeverityFilter(s)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: '0.5px solid',
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                ...(severityFilter === s
                  ? { background: '#1e5c3a', color: '#fff', borderColor: '#1e5c3a' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' })
              }}>
              {SEVERITY_LABELS[s]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading alerts…</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          {alerts.length === 0 ? (
            <>
              <p style={{ fontSize: 24, marginBottom: 8 }}>✓</p>
              <p style={{ fontSize: 13, color: '#2d7a50', fontWeight: 500 }}>All clear — no active alerts</p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>No high-severity detections found for this farm this period.</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No alerts match your filters</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((alert, i) => {
            const normSev = alert.severity.toUpperCase().replace(/ /g, '_')
            const bg = SEVERITY_COLORS[normSev as keyof typeof SEVERITY_COLORS] ?? '#f3f4f6'
            const isHot = normSev === 'EMERGENCY' || normSev === 'VERY_HIGH'

            return (
              <div key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  background: '#fff',
                  border: `0.5px solid ${isHot ? '#fca5a5' : '#e5e7eb'}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  borderLeft: `3px solid ${bg}`,
                }}
              >
                {/* Severity swatch */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                  border: '0.5px solid rgba(0,0,0,0.06)',
                }}>
                  {normSev === 'EMERGENCY' ? '🚨' : normSev === 'VERY_HIGH' ? '⚠️' : normSev === 'HIGH' ? '🔶' : '🟡'}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
                      {alert.pest}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                      background: bg, color: isHot ? '#7f1d1d' : '#374151',
                      border: '0.5px solid rgba(0,0,0,0.06)',
                    }}>
                      {alert.severity}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    📍 {alert.location}
                  </p>
                </div>

                {/* Count + time */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 20, fontWeight: 600, color: isHot ? '#c53030' : '#374151', fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em' }}>
                    {alert.count}
                  </p>
                  <p style={{ fontSize: 10, color: '#9ca3af' }}>
                    {alert.time ? formatDateTime(alert.time) : 'Recent'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
