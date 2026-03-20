import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts'
import { farmsApi, analyticsApi } from '@/services/api'
import type {
  FarmResponse, WeeklyPestTrendDto, SeverityTrendPointDto,
  PestDistributionItemDto, FarmComparisonDto, ScoutPerformanceDto
} from '@/types'
import { PEST_CHART_COLORS, exportToCsv } from '@/utils'

export default function AnalyticsPage() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [farmId, setFarmId] = useState('')
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyPestTrendDto[]>([])
  const [severityTrend, setSeverityTrend] = useState<SeverityTrendPointDto[]>([])
  const [pestDist, setPestDist] = useState<PestDistributionItemDto[]>([])
  const [farmComparison, setFarmComparison] = useState<FarmComparisonDto[]>([])
  const [scoutPerf, setScoutPerf] = useState<ScoutPerformanceDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    farmsApi.list().then(data => {
      setFarms(data)
      if (data.length > 0) setFarmId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!farmId) return
    setLoading(true)
    Promise.all([
      analyticsApi.weeklyTrends(farmId),
      analyticsApi.severityTrend(farmId),
      analyticsApi.fullDashboard(farmId),
    ])
      .then(([wt, sev, dash]) => {
        setWeeklyTrends(wt)
        setSeverityTrend(sev)
        setPestDist(dash.pestDistribution ?? [])
        setFarmComparison(dash.farmComparison ?? [])
        setScoutPerf(dash.scoutPerformance ?? [])
      })
      .finally(() => setLoading(false))
  }, [farmId])

  const SEVERITY_COLORS_CHART = {
    zero: '#e9f5ee', low: '#a7dcbc', medium: '#f59e0b', high: '#e05252', critical: '#9b1c1c'
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Trends, severity, and pest pressure over time</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => weeklyTrends.length > 0 && exportToCsv(`weekly-trends-${farmId}.csv`, weeklyTrends)}
            disabled={weeklyTrends.length === 0}
          >
            ↓ Export trends CSV
          </button>
          <select className="input" style={{ width: 200 }} value={farmId} onChange={e => setFarmId(e.target.value)}>
            {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading analytics…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Weekly pest stacked bar */}
          <div className="card">
            <div className="card-title">Weekly pest observations by type</div>
            {weeklyTrends.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyTrends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }} cursor={{ fill: '#f9fafb' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="thrips"      name="Thrips"          stackId="a" fill="#e05252" />
                  <Bar dataKey="redSpider"   name="Red spider mite" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="whiteflies"  name="Whiteflies"      stackId="a" fill="#71c49a" />
                  <Bar dataKey="mealybugs"   name="Mealybugs"       stackId="a" fill="#a7dcbc" />
                  <Bar dataKey="caterpillars" name="Caterpillars"   stackId="a" fill="#2d7a50" />
                  <Bar dataKey="otherPests"  name="Other"           stackId="a" fill="#d1d5db" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Severity trend */}
          <div className="card">
            <div className="card-title">Severity distribution over time</div>
            {severityTrend.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={severityTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="zero"     name="Zero"     fill="#e9f5ee" stroke="#a7dcbc" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="low"      name="Low"      fill="#a7dcbc" stroke="#71c49a" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="medium"   name="Medium"   fill="#f59e0b" stroke="#d97706" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="high"     name="High"     fill="#e05252" stroke="#c53030" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="critical" name="Critical" fill="#9b1c1c" stroke="#7f1d1d" stackId="1" fillOpacity={0.8} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Two column: pest distribution + scout performance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Pest distribution donut */}
            <div className="card">
              <div className="card-title">Pest distribution this period</div>
              {pestDist.length === 0 ? (
                <EmptyChart />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pestDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                        {pestDist.map((_, i) => <Cell key={i} fill={PEST_CHART_COLORS[i % PEST_CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 7 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pestDist.map((p, i) => (
                      <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PEST_CHART_COLORS[i % PEST_CHART_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{p.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Scout performance */}
            <div className="card">
              <div className="card-title">Scout performance</div>
              {scoutPerf.length === 0 ? (
                <EmptyChart message="No scout performance data yet" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                      {['Scout', 'Observations', 'Reviewed', 'Accuracy', 'Avg time'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scoutPerf.map(s => (
                      (() => {
                        const hasReviewedComparisons = s.reviewedComparisons > 0
                        const accuracyColor = s.accuracy >= 80 ? '#2d7a50' : s.accuracy >= 60 ? '#f59e0b' : '#e05252'

                        return (
                      <tr key={s.scout} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                        <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>{s.scout}</td>
                        <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{s.observations}</td>
                        <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{s.reviewedComparisons}</td>
                        <td style={{ padding: '8px' }}>
                          {hasReviewedComparisons ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: `${s.accuracy}%`, background: accuracyColor, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 10, color: '#374151', fontFamily: 'DM Mono, monospace', minWidth: 28 }}>{s.accuracy.toFixed(0)}%</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>N/A</span>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: '#6b7280', fontSize: 11 }}>{s.avgTime}</td>
                      </tr>
                        )
                      })()
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Farm comparison */}
          {farmComparison.length > 0 && (
            <div className="card">
              <div className="card-title">
                <span>Farm comparison</span>
                <button className="card-action" onClick={() => exportToCsv('farm-comparison.csv', farmComparison)}>
                  ↓ Export
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    {['Farm', 'Avg severity', 'Observations', 'Alerts'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {farmComparison.map(f => (
                    <tr key={f.farm} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                      <td style={{ padding: '9px 8px', fontWeight: 500, color: '#111827' }}>{f.farm}</td>
                      <td style={{ padding: '9px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2, maxWidth: 80 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(f.avgSeverity * 20, 100)}%`,
                              background: f.avgSeverity >= 4 ? '#e05252' : f.avgSeverity >= 2 ? '#f59e0b' : '#71c49a',
                              borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{f.avgSeverity.toFixed(1)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 8px', fontFamily: 'DM Mono, monospace' }}>{f.observations}</td>
                      <td style={{ padding: '9px 8px' }}>
                        {f.alerts > 0
                          ? <span className="badge badge-red">{f.alerts}</span>
                          : <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

function EmptyChart({ message = 'No data for this period' }: { message?: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
      {message}
    </div>
  )
}
