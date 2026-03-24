import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { farmsApi, analyticsApi } from '@/services/api'
import type {
  FarmComparisonDto,
  FarmResponse,
  GreenhouseWeeklyTrendPointDto,
  GreenhouseWeeklyTrendResponse,
  GreenhouseWeeklyTrendSeriesDto,
  PestDistributionItemDto,
  ScoutPerformanceDto,
  SeverityTrendPointDto,
  SpeciesCode,
  WeeklyPestTrendDto,
} from '@/types'
import {
  PEST_CHART_COLORS,
  SPECIES_LABELS,
  currentWeek,
  exportToCsv,
  formatTrendWeekLabel,
  getDistributionCount,
} from '@/utils'

const PEST_SPECIES_OPTIONS: SpeciesCode[] = [
  'THRIPS',
  'RED_SPIDER_MITE',
  'WHITEFLIES',
  'MEALYBUGS',
  'CATERPILLARS',
  'FALSE_CODLING_MOTH',
  'PEST_OTHER',
]

type GreenhouseChartRow = {
  weekLabel: string
  sortYear: number
  sortWeek: number
  [greenhouseName: string]: number | string
}

function normalizeGreenhouseWeeklyResponse(data: GreenhouseWeeklyTrendResponse): GreenhouseWeeklyTrendPointDto[] {
  if (!Array.isArray(data)) return []

  const normalized: GreenhouseWeeklyTrendPointDto[] = []

  data.forEach(item => {
    const series = item as GreenhouseWeeklyTrendSeriesDto
    const seriesPoints = Array.isArray(series.points)
      ? series.points
      : Array.isArray(series.weeklyCounts)
      ? series.weeklyCounts
      : Array.isArray(series.values)
      ? series.values
      : null

    if (seriesPoints) {
      seriesPoints.forEach(point => {
        normalized.push({
          ...point,
          greenhouseId: point.greenhouseId ?? series.greenhouseId,
          greenhouseName: point.greenhouseName ?? series.greenhouseName,
        })
      })
      return
    }

    normalized.push(item as GreenhouseWeeklyTrendPointDto)
  })

  return normalized
    .map(point => ({
      ...point,
      greenhouseName: point.greenhouseName ?? point.greenhouseId ?? 'Unknown greenhouse',
      weekKey: point.weekKey ?? point.week,
      count: point.count ?? point.value ?? 0,
    }))
    .filter(point => typeof point.greenhouseName === 'string')
}

function compareWeekRows(a: GreenhouseChartRow, b: GreenhouseChartRow) {
  if (a.sortYear !== b.sortYear) return a.sortYear - b.sortYear
  return a.sortWeek - b.sortWeek
}

export default function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [farmId, setFarmId] = useState('')
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyPestTrendDto[]>([])
  const [severityTrend, setSeverityTrend] = useState<SeverityTrendPointDto[]>([])
  const [pestDist, setPestDist] = useState<PestDistributionItemDto[]>([])
  const [farmComparison, setFarmComparison] = useState<FarmComparisonDto[]>([])
  const [scoutPerf, setScoutPerf] = useState<ScoutPerformanceDto[]>([])
  const [greenhouseWeekly, setGreenhouseWeekly] = useState<GreenhouseWeeklyTrendPointDto[]>([])
  const [loading, setLoading] = useState(true)
  const [greenhouseLoading, setGreenhouseLoading] = useState(true)

  const { year: currentIsoYear } = currentWeek()
  const [greenhouseYear, setGreenhouseYear] = useState(currentIsoYear)
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesCode>('THRIPS')

  useEffect(() => {
    farmsApi.list().then(data => {
      const farmParam = searchParams.get('farm')
      const matchedFarm = farmParam ? data.find(farm => farm.id === farmParam) : undefined

      setFarms(data)
      if (matchedFarm) {
        setFarmId(matchedFarm.id)
        return
      }
      if (data.length > 0) {
        setFarmId(data[0].id)
      }
    })
  }, [searchParams])

  useEffect(() => {
    if (!farmId) return

    setLoading(true)
    Promise.all([
      analyticsApi.weeklyTrends(farmId),
      analyticsApi.severityTrend(farmId),
      analyticsApi.fullDashboard(farmId),
    ])
      .then(([weekly, severity, dashboard]) => {
        setWeeklyTrends(weekly)
        setSeverityTrend(severity)
        setPestDist(dashboard.pestDistribution ?? [])
        setFarmComparison(dashboard.farmComparison ?? [])
        setScoutPerf(dashboard.scoutPerformance ?? [])
      })
      .finally(() => setLoading(false))
  }, [farmId])

  useEffect(() => {
    if (!farmId) return

    setGreenhouseLoading(true)
    analyticsApi.greenhouseWeekly(farmId, greenhouseYear, selectedSpecies)
      .then(response => setGreenhouseWeekly(normalizeGreenhouseWeeklyResponse(response)))
      .catch(() => setGreenhouseWeekly([]))
      .finally(() => setGreenhouseLoading(false))
  }, [farmId, greenhouseYear, selectedSpecies])

  function handleFarmChange(nextFarmId: string) {
    setFarmId(nextFarmId)
    setSearchParams({ farm: nextFarmId }, { replace: true })
  }

  const weeklyTrendChartData = useMemo(() => (
    weeklyTrends.map(point => ({
      ...point,
      weekLabel: formatTrendWeekLabel(point),
    }))
  ), [weeklyTrends])

  const severityChartData = useMemo(() => (
    severityTrend.map(point => ({
      ...point,
      weekLabel: formatTrendWeekLabel(point),
    }))
  ), [severityTrend])

  const pestDistributionData = useMemo(() => (
    pestDist.map(item => ({
      ...item,
      total: getDistributionCount(item),
    }))
  ), [pestDist])

  const greenhouseChart = useMemo(() => {
    const greenhouseNames: string[] = []
    const rowMap = new Map<string, GreenhouseChartRow>()

    greenhouseWeekly.forEach(point => {
      const greenhouseName = point.greenhouseName ?? point.greenhouseId ?? 'Unknown greenhouse'
      if (!greenhouseNames.includes(greenhouseName)) {
        greenhouseNames.push(greenhouseName)
      }

      const weekLabel = formatTrendWeekLabel(point)
      const rowKey = point.weekKey ?? `${point.year ?? 0}-${point.weekNumber ?? 0}`
      const row = rowMap.get(rowKey) ?? {
        weekLabel,
        sortYear: point.year ?? 0,
        sortWeek: point.weekNumber ?? 0,
      }

      row[greenhouseName] = point.count ?? point.value ?? 0
      rowMap.set(rowKey, row)
    })

    return {
      greenhouseNames,
      rows: Array.from(rowMap.values()).sort(compareWeekRows),
    }
  }, [greenhouseWeekly])

  const severityColors = {
    zero: '#e9f5ee',
    low: '#a7dcbc',
    medium: '#f59e0b',
    high: '#e05252',
    critical: '#9b1c1c',
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Trends, severity, and greenhouse pressure by ISO week</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => weeklyTrendChartData.length > 0 && exportToCsv(`weekly-trends-${farmId}.csv`, weeklyTrendChartData)}
            disabled={weeklyTrendChartData.length === 0}
          >
            Export trends CSV
          </button>
          <select className="input" style={{ width: 220 }} value={farmId} onChange={event => handleFarmChange(event.target.value)}>
            {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading analytics...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title">Weekly pest observations by type</div>
            {weeklyTrendChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyTrendChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }} cursor={{ fill: '#f9fafb' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="thrips" name="Thrips" stackId="a" fill="#e05252" />
                  <Bar dataKey="redSpider" name="Red spider mite" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="whiteflies" name="Whiteflies" stackId="a" fill="#71c49a" />
                  <Bar dataKey="mealybugs" name="Mealybugs" stackId="a" fill="#a7dcbc" />
                  <Bar dataKey="caterpillars" name="Caterpillars" stackId="a" fill="#2d7a50" />
                  <Bar dataKey="otherPests" name="Other" stackId="a" fill="#d1d5db" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-title">Severity distribution over time</div>
            {severityChartData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={severityChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="zero" name="Zero" fill={severityColors.zero} stroke="#a7dcbc" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="low" name="Low" fill={severityColors.low} stroke="#71c49a" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="medium" name="Medium" fill={severityColors.medium} stroke="#d97706" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="high" name="High" fill={severityColors.high} stroke="#c53030" stackId="1" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="critical" name="Critical" fill={severityColors.critical} stroke="#7f1d1d" stackId="1" fillOpacity={0.8} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>Greenhouse weekly series</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="input" style={{ width: 220 }} value={selectedSpecies} onChange={event => setSelectedSpecies(event.target.value as SpeciesCode)}>
                  {PEST_SPECIES_OPTIONS.map(speciesCode => (
                    <option key={speciesCode} value={speciesCode}>
                      {SPECIES_LABELS[speciesCode]}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  min={2020}
                  max={2099}
                  style={{ width: 96 }}
                  value={greenhouseYear}
                  onChange={event => setGreenhouseYear(Number(event.target.value) || currentIsoYear)}
                />
              </div>
            </div>
            {greenhouseLoading ? (
              <EmptyChart message="Loading greenhouse weekly series..." />
            ) : greenhouseChart.rows.length === 0 ? (
              <EmptyChart message="No greenhouse weekly data for this pest and year" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={greenhouseChart.rows} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {greenhouseChart.greenhouseNames.map((greenhouseName, index) => (
                    <Line
                      key={greenhouseName}
                      type="monotone"
                      dataKey={greenhouseName}
                      name={greenhouseName}
                      stroke={PEST_CHART_COLORS[index % PEST_CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title">Pest distribution this period</div>
              {pestDistributionData.length === 0 ? (
                <EmptyChart />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pestDistributionData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                        {pestDistributionData.map((_, index) => (
                          <Cell key={index} fill={PEST_CHART_COLORS[index % PEST_CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 7 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pestDistributionData.map((item, index) => (
                      <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: PEST_CHART_COLORS[index % PEST_CHART_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'DM Mono, monospace' }}>{item.total}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{item.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">Scout performance</div>
              {scoutPerf.length === 0 ? (
                <EmptyChart message="No scout performance data yet" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                      {['Scout', 'Observations', 'Reviewed', 'Accuracy', 'Avg time'].map(header => (
                        <th key={header} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scoutPerf.map(item => {
                      const hasReviewedComparisons = item.reviewedComparisons > 0
                      const accuracyColor = item.accuracy >= 80 ? '#2d7a50' : item.accuracy >= 60 ? '#f59e0b' : '#e05252'

                      return (
                        <tr key={item.scout} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>{item.scout}</td>
                          <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{item.observations}</td>
                          <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{item.reviewedComparisons}</td>
                          <td style={{ padding: '8px' }}>
                            {hasReviewedComparisons ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
                                  <div style={{ height: '100%', width: `${item.accuracy}%`, background: accuracyColor, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 10, color: '#374151', fontFamily: 'DM Mono, monospace', minWidth: 28 }}>{item.accuracy.toFixed(0)}%</span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>N/A</span>
                            )}
                          </td>
                          <td style={{ padding: '8px', color: '#6b7280', fontSize: 11 }}>{item.avgTime}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {farmComparison.length > 0 && (
            <div className="card">
              <div className="card-title">
                <span>Farm comparison</span>
                <button className="card-action" onClick={() => exportToCsv('farm-comparison.csv', farmComparison)}>
                  Export
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    {['Farm', 'Avg severity', 'Observations', 'Alerts'].map(header => (
                      <th key={header} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {farmComparison.map(item => (
                    <tr key={item.farm} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                      <td style={{ padding: '9px 8px', fontWeight: 500, color: '#111827' }}>{item.farm}</td>
                      <td style={{ padding: '9px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 2, maxWidth: 80 }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(item.avgSeverity * 20, 100)}%`,
                                background: item.avgSeverity >= 4 ? '#e05252' : item.avgSeverity >= 2 ? '#f59e0b' : '#71c49a',
                                borderRadius: 2,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#374151' }}>{item.avgSeverity.toFixed(1)}</span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 8px', fontFamily: 'DM Mono, monospace' }}>{item.observations}</td>
                      <td style={{ padding: '9px 8px' }}>
                        {item.alerts > 0
                          ? <span className="badge badge-red">{item.alerts}</span>
                          : <span style={{ fontSize: 11, color: '#9ca3af' }}>-</span>}
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
