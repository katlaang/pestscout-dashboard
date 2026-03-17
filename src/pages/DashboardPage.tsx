import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { farmsApi, analyticsApi, sessionsApi } from '@/services/api'
import type { FarmResponse, DashboardDto, ScoutingSessionDetailDto } from '@/types'
import KpiCard from '@/components/dashboard/KpiCard'
import HeatmapGrid from '@/components/dashboard/HeatmapGrid'
import AlertCard from '@/components/dashboard/AlertCard'
import SessionsTable from '@/components/scouting/SessionsTable'
import { useAuthStore } from '@/hooks/useAuth'
import { currentWeek, PEST_CHART_COLORS } from '@/utils'

const ALL_FARMS_VALUE = '__all__'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [selectedId, setSelectedId] = useState<string>('')          // farm id OR '__all__'
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null)
  const [allDashboards, setAllDashboards] = useState<DashboardDto[]>([]) // for aggregate view
  const [sessions, setSessions] = useState<ScoutingSessionDetailDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { week, year } = currentWeek()
  const isAggregate = selectedId === ALL_FARMS_VALUE

  // ── Load farms ──────────────────────────────────────────────────────────────
  useEffect(() => {
    farmsApi.list()
      .then(data => {
        setFarms(data)
        if (data.length > 0) {
          const paramId = searchParams.get('farm')
          if (paramId === ALL_FARMS_VALUE && isSuperAdmin) {
            setSelectedId(ALL_FARMS_VALUE)
          } else {
            const found = paramId ? data.find(f => f.id === paramId) : undefined
            setSelectedId(found?.id ?? data[0].id)
          }
        }
      })
      .catch(() => setError('Could not load farms. Is the backend running?'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function select(id: string) {
    setSelectedId(id)
    setSearchParams({ farm: id }, { replace: true })
  }

  // ── Load data when selection changes ────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setError(null)
    setDashboard(null)
    setAllDashboards([])
    setSessions([])

    if (isAggregate) {
      // Fetch all farms in parallel and merge
      Promise.all(farms.map(f => analyticsApi.fullDashboard(f.id)))
        .then(results => setAllDashboards(results))
        .catch(() => setError('Could not load aggregate data.'))
        .finally(() => setLoading(false))
    } else {
      Promise.all([
        analyticsApi.fullDashboard(selectedId),
        sessionsApi.list(selectedId),
      ])
        .then(([dash, sess]) => { setDashboard(dash); setSessions(sess) })
        .catch(() => setError('Could not load dashboard data.'))
        .finally(() => setLoading(false))
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Aggregate computed values ────────────────────────────────────────────────
  const agg = isAggregate && allDashboards.length > 0 ? {
    totalSessions: allDashboards.reduce((s, d) => s + (d.summary?.totalSessions ?? 0), 0),
    pestsDetected: allDashboards.reduce((s, d) => s + (d.summary?.pestsDetectedThisWeek ?? 0), 0),
    alerts: allDashboards.flatMap(d => d.alerts ?? []),
    activeScouts: allDashboards.reduce((s, d) => s + (d.summary?.activeScouts ?? 0), 0),
    weeklyTrends: mergeWeeklyTrends(allDashboards),
    pestDistribution: mergePestDistribution(allDashboards),
    recommendations: allDashboards.flatMap(d => d.recommendations ?? []),
  } : null

  // ── Single-farm values ───────────────────────────────────────────────────────
  const summary = dashboard?.summary
  const heatmapSections = summary?.currentWeekHeatmap?.[0]?.sections ?? []
  const alerts = dashboard?.alerts ?? []
  const weeklyTrends = dashboard?.weeklyTrends ?? []
  const pestDistribution = dashboard?.pestDistribution ?? []
  const sevDeltaUp = summary
    ? summary.averageSeverityThisWeek > summary.averageSeverityLastWeek
    : false

  const selectedFarmName = farms.find(f => f.id === selectedId)?.name ?? ''

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Week {week}, {year} ·{' '}
            {isAggregate
              ? `Aggregate view across ${farms.length} farm${farms.length !== 1 ? 's' : ''}`
              : 'Overview of pest pressure and scouting activity'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            className="input"
            style={{ width: 220 }}
            value={selectedId}
            onChange={e => select(e.target.value)}
          >
            {/* Super admin gets an "All farms" option at the top */}
            {isSuperAdmin && (
              <option value={ALL_FARMS_VALUE}>🌐 All farms (aggregate)</option>
            )}
            {farms.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {!isAggregate && (
            <button className="btn-primary" onClick={() => navigate('/heatmap')}>
              Full heat map
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20, color: '#c53030', fontSize: 13 }}>
          {error} — Check that <code style={{ fontSize: 12 }}>http://localhost:8080</code> is reachable.
        </div>
      )}

      {/* Loading shimmer */}
      {loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card" style={{ height: 96, background: '#f3f4f6' }} />
          ))}
        </div>
      )}

      {/* ── AGGREGATE VIEW (super admin, all farms) ─────────────────────────── */}
      {!loading && isAggregate && agg && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <KpiCard label="Total sessions" value={agg.totalSessions} delta={`Across ${farms.length} farms`} icon={<SessionIcon />} />
            <KpiCard label="Pests detected" value={agg.pestsDetected} delta="This week, all farms" icon={<PestIcon />} />
            <KpiCard
              label="Active alerts"
              value={agg.alerts.length}
              delta={agg.alerts.length > 0 ? 'Requires attention' : 'All clear'}
              deltaPositive={agg.alerts.length === 0}
              color={agg.alerts.length > 0 ? '#c53030' : undefined}
              icon={<AlertIcon />}
            />
            <KpiCard label="Active scouts" value={agg.activeScouts} delta="Across all farms" icon={<ScoutIcon />} />
          </div>

          {/* Per-farm breakdown table */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>Per-farm overview</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{farms.length} farms</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  {['Farm', 'Sessions', 'Pests this week', 'Alerts', 'Avg severity', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '5px 10px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {farms.map((farm, i) => {
                  const d = allDashboards[i]
                  if (!d) return null
                  const farmAlerts = d.alerts?.length ?? 0
                  const avgSev = d.summary?.averageSeverityThisWeek ?? 0
                  return (
                    <tr
                      key={farm.id}
                      style={{ borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                      onClick={() => select(farm.id)}
                    >
                      <td style={{ padding: '9px 10px' }}>
                        <p style={{ fontWeight: 500, color: '#111827' }}>{farm.name}</p>
                        <p style={{ fontSize: 10, color: '#9ca3af' }}>{farm.subscriptionTier}</p>
                      </td>
                      <td style={{ padding: '9px 10px', fontFamily: 'DM Mono, monospace' }}>{d.summary?.totalSessions ?? '—'}</td>
                      <td style={{ padding: '9px 10px', fontFamily: 'DM Mono, monospace' }}>{d.summary?.pestsDetectedThisWeek ?? '—'}</td>
                      <td style={{ padding: '9px 10px' }}>
                        {farmAlerts > 0
                          ? <span className="badge badge-red">{farmAlerts}</span>
                          : <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 48, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              width: `${Math.min(avgSev * 20, 100)}%`,
                              background: avgSev >= 4 ? '#e05252' : avgSev >= 2 ? '#f59e0b' : '#71c49a',
                            }} />
                          </div>
                          <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{avgSev.toFixed(1)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 10px' }}>
                        <span className={`badge ${farm.subscriptionStatus === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                          {farm.subscriptionStatus.replace('_', ' ').toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
              Click a row to switch to that farm's dashboard
            </p>
          </div>

          {/* Aggregate alerts + trends */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">
                <span>All active alerts</span>
                <button className="card-action" onClick={() => navigate('/alerts')}>View all →</button>
              </div>
              {agg.alerts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {agg.alerts.slice(0, 5).map((a, i) => <AlertCard key={i} alert={a} compact />)}
                  {agg.alerts.length > 5 && (
                    <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingTop: 4 }}>
                      +{agg.alerts.length - 5} more
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState message="No active alerts — all clear" positive />
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Combined weekly pest trends</span>
                <button className="card-action" onClick={() => navigate('/analytics')}>Analytics →</button>
              </div>
              {agg.weeklyTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={agg.weeklyTrends} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 7 }} cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="thrips"     stackId="a" fill="#e05252" maxBarSize={20} />
                    <Bar dataKey="redSpider"  stackId="a" fill="#f59e0b" maxBarSize={20} />
                    <Bar dataKey="whiteflies" stackId="a" fill="#71c49a" radius={[3,3,0,0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No trend data yet" />
              )}
            </div>
          </div>

          {/* Aggregate pest distribution */}
          {agg.pestDistribution.length > 0 && (
            <div className="card">
              <div className="card-title">Pest distribution — all farms</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agg.pestDistribution.slice(0, 6).map((p, i) => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PEST_CHART_COLORS[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <div style={{ flex: 2, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
                      <div style={{ height: '100%', background: PEST_CHART_COLORS[i], borderRadius: 2, width: `${p.percentage}%` }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'DM Mono, monospace', minWidth: 32, textAlign: 'right' }}>{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SINGLE FARM VIEW ─────────────────────────────────────────────────── */}
      {!loading && !isAggregate && (
        <>
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <KpiCard label="Total sessions" value={summary?.totalSessions ?? '—'} delta="This period" icon={<SessionIcon />} />
            <KpiCard
              label="Pests detected"
              value={summary?.pestsDetectedThisWeek ?? '—'}
              delta={sevDeltaUp ? '↑ pressure rising' : '↓ stable or improving'}
              deltaPositive={!sevDeltaUp}
              color={sevDeltaUp ? '#d97706' : undefined}
              icon={<PestIcon />}
            />
            <KpiCard
              label="Active alerts"
              value={alerts.filter(a => ['emergency','critical','high'].includes(a.severity.toLowerCase())).length}
              delta={alerts.length > 0 ? 'Requires attention' : 'All clear'}
              deltaPositive={alerts.length === 0}
              color={alerts.length > 0 ? '#c53030' : undefined}
              icon={<AlertIcon />}
            />
            <KpiCard label="Active scouts" value={summary?.activeScouts ?? '—'} delta="Assigned this week" icon={<ScoutIcon />} />
          </div>

          {/* Main grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">
                <span>Heat map — {selectedFarmName}</span>
                <button className="card-action" onClick={() => navigate('/heatmap')}>All greenhouses →</button>
              </div>
              {heatmapSections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {heatmapSections.slice(0, 2).map(sec => (
                    <div key={sec.targetId}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 8 }}>{sec.targetName}</p>
                      <HeatmapGrid section={sec} cellSize={22} showLegend={false} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
                    {[
                      { label: 'Zero', bg: '#e9f5ee' }, { label: 'Low', bg: '#a7dcbc' },
                      { label: 'Moderate', bg: '#71c49a' }, { label: 'High', bg: '#f59e0b' },
                      { label: 'Very high', bg: '#e05252' }, { label: 'Emergency', bg: '#9b1c1c' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, border: '0.5px solid rgba(0,0,0,0.06)' }} />
                        <span style={{ fontSize: 10, color: '#6b7280' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="No heat map data for this week" />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card" style={{ flex: 1 }}>
                <div className="card-title">
                  <span>Active alerts</span>
                  <button className="card-action" onClick={() => navigate('/alerts')}>View all</button>
                </div>
                {alerts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {alerts.slice(0, 4).map((a, i) => <AlertCard key={i} alert={a} compact />)}
                  </div>
                ) : (
                  <EmptyState message="No active alerts — all clear" positive />
                )}
              </div>

              <div className="card">
                <div className="card-title">
                  <span>Weekly trends</span>
                  <button className="card-action" onClick={() => navigate('/analytics')}>Analytics →</button>
                </div>
                {weeklyTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={weeklyTrends} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 7 }} cursor={{ fill: '#f9fafb' }} />
                      <Bar dataKey="thrips"     stackId="a" fill="#e05252" maxBarSize={20} />
                      <Bar dataKey="redSpider"  stackId="a" fill="#f59e0b" maxBarSize={20} />
                      <Bar dataKey="whiteflies" stackId="a" fill="#71c49a" radius={[3,3,0,0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="No trend data yet" />
                )}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title"><span>Pest distribution</span></div>
              {pestDistribution.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pestDistribution.slice(0, 6).map((p, i) => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PEST_CHART_COLORS[i], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <div style={{ flex: 1.5, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
                        <div style={{ height: '100%', background: PEST_CHART_COLORS[i], borderRadius: 2, width: `${p.percentage}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'DM Mono, monospace', minWidth: 28, textAlign: 'right' }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No observation data" />
              )}
            </div>
            <div className="card">
              <div className="card-title">
                <span>Recent sessions</span>
                <button className="card-action" onClick={() => navigate('/sessions')}>All sessions →</button>
              </div>
              <SessionsTable sessions={sessions} compact />
            </div>
          </div>

          {/* Recommendations */}
          {(dashboard?.recommendations ?? []).length > 0 && (
            <div className="card">
              <div className="card-title">
                <span>Scout recommendations</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{dashboard!.recommendations.length} pending</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dashboard!.recommendations.slice(0, 5).map((r, i) => {
                  const priorityColor = r.priority === 'HIGH' ? '#c53030' : r.priority === 'MEDIUM' ? '#d97706' : '#6b7280'
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '0.5px solid #e5e7eb' }}>
                      <div style={{ width: 3, flexShrink: 0, alignSelf: 'stretch', background: priorityColor, borderRadius: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{r.scout}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>{r.location}</span>
                        </div>
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{r.text}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 500, color: priorityColor, background: priorityColor + '14', border: `0.5px solid ${priorityColor}44`, borderRadius: 20, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {r.priority?.toLowerCase()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Helpers — merge multi-farm data ─────────────────────────────────────────

function mergeWeeklyTrends(dashboards: DashboardDto[]) {
  const map = new Map<string, Record<string, number | string>>()
  dashboards.forEach(d => {
    (d.weeklyTrends ?? []).forEach(wt => {
      const existing = map.get(wt.week) ?? {}
      map.set(wt.week, {
        week: wt.week,
        thrips:      ((existing.thrips      as number) ?? 0) + (wt.thrips      ?? 0),
        redSpider:   ((existing.redSpider   as number) ?? 0) + (wt.redSpider   ?? 0),
        whiteflies:  ((existing.whiteflies  as number) ?? 0) + (wt.whiteflies  ?? 0),
        mealybugs:   ((existing.mealybugs   as number) ?? 0) + (wt.mealybugs   ?? 0),
        caterpillars:((existing.caterpillars as number)?? 0) + (wt.caterpillars?? 0),
        otherPests:  ((existing.otherPests  as number) ?? 0) + (wt.otherPests  ?? 0),
      })
    })
  })
  return Array.from(map.values()).sort((a, b) => String(a.week).localeCompare(String(b.week)))
}

function mergePestDistribution(dashboards: DashboardDto[]) {
  const map = new Map<string, number>()
  dashboards.forEach(d => {
    (d.pestDistribution ?? []).forEach(p => {
      map.set(p.name, (map.get(p.name) ?? 0) + p.value)
    })
  })
  const total = Array.from(map.values()).reduce((s, v) => s + v, 0)
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, percentage: total > 0 ? (value / total) * 100 : 0, severity: '' }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ message, positive = false }: { message: string; positive?: boolean }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: positive ? '#2d7a50' : '#9ca3af', fontSize: 12 }}>
      {positive ? '✓ ' : ''}{message}
    </div>
  )
}

function SessionIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="2" width="12" height="10" rx="2"/><line x1="4" y1="6" x2="10" y2="6"/><line x1="4" y1="8.5" x2="8" y2="8.5"/></svg>
}
function PestIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><line x1="7" y1="1" x2="7" y2="4"/><line x1="7" y1="10" x2="7" y2="13"/><line x1="1" y1="7" x2="4" y2="7"/><line x1="10" y1="7" x2="13" y2="7"/></svg>
}
function AlertIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1L13 12H1L7 1z"/><line x1="7" y1="5" x2="7" y2="8"/><circle cx="7" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>
}
function ScoutIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="7" cy="4.5" r="2.5"/><path d="M1.5 13c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/></svg>
}
