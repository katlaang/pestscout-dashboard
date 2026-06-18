import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { analyticsApi, farmsApi, sessionsApi } from '@/services/api'
import type {
  DashboardDto,
  DashboardOverviewDto,
  DashboardOverviewFarmDto,
  FarmResponse,
  LicenseAlertDto,
  PestDistributionItemDto,
  ScoutingSessionDetailDto,
} from '@/types'
import AlertCard from '@/components/dashboard/AlertCard'
import KpiCard from '@/components/dashboard/KpiCard'
import SessionsTable from '@/components/scouting/SessionsTable'
import { useAuthStore } from '@/hooks/useAuth'
import { useCurrentFarmStore } from '@/hooks/useCurrentFarm'
import { formatDate, formatTrendWeekLabel, getDistributionCount, PEST_CHART_COLORS } from '@/utils'

const ALL_FARMS_VALUE = '__all__'

export default function DashboardPage() {
  const { user } = useAuthStore()

  if (user?.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard />
  }

  return <ManagerDashboard />
}

function ManagerDashboard() {
  const { farmId: currentFarmId } = useCurrentFarmStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [overview, setOverview] = useState<DashboardOverviewDto | null>(null)
  const [selectedFarmId, setSelectedFarmId] = useState(ALL_FARMS_VALUE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      farmsApi.list(),
      analyticsApi.dashboardOverview(),
    ])
      .then(([farmList, dashboardOverview]) => {
        const farmParam = searchParams.get('farm')
        const matchedFarm = farmParam ? farmList.find(farm => farm.id === farmParam) : undefined

        setFarms(farmList)
        setOverview(dashboardOverview)
        setSelectedFarmId(matchedFarm?.id ?? currentFarmId ?? ALL_FARMS_VALUE)
      })
      .catch(() => setError('Could not load your attached farms dashboard.'))
      .finally(() => setLoading(false))
  }, [searchParams, currentFarmId])

  function handleFarmSelection(nextFarmId: string) {
    setSelectedFarmId(nextFarmId)
    setSearchParams({ farm: nextFarmId }, { replace: true })
  }

  const farmMetaById = useMemo(() => (
    Object.fromEntries(farms.map(farm => [farm.id, farm]))
  ), [farms])

  const visibleFarms = (overview?.farms ?? []).filter(farm => (
    selectedFarmId === ALL_FARMS_VALUE || farm.farmId === selectedFarmId
  ))

  const visibleAlerts = (overview?.licenseAlerts ?? []).filter(alert => (
    selectedFarmId === ALL_FARMS_VALUE || alert.farmId === selectedFarmId
  ))

  const lockedFarmCount = (overview?.farms ?? []).filter(farm => farm.accessLocked).length
  const expiringSoonCount = (overview?.farms ?? []).filter(farm => {
    const daysRemaining = farm.daysUntilLicenseExpiry ?? Number.POSITIVE_INFINITY
    return daysRemaining >= 0 && daysRemaining <= 30
  }).length

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1440 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Multi-farm overview for your attached farms, license status, and quick drill-down actions
          </p>
        </div>

        <select className="input" style={{ width: 240 }} value={selectedFarmId} onChange={event => handleFarmSelection(event.target.value)}>
          <option value={ALL_FARMS_VALUE}>All attached farms</option>
          {farms.map(farm => (
            <option key={farm.id} value={farm.id}>{farm.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20, color: '#c53030', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[...Array(4)].map((_, index) => (
            <div key={index} className="card" style={{ height: 96, background: '#f3f4f6' }} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <KpiCard label="Attached farms" value={overview?.farmCount ?? 0} delta="Loaded from your memberships" icon={<FarmIcon />} />
            <KpiCard label="License alerts" value={visibleAlerts.length} delta={visibleAlerts.length > 0 ? 'Needs attention' : 'No urgent license alerts'} deltaPositive={visibleAlerts.length === 0} color={visibleAlerts.length > 0 ? '#c53030' : undefined} icon={<AlertIcon />} />
            <KpiCard label="Locked farms" value={lockedFarmCount} delta={lockedFarmCount > 0 ? 'Access is currently restricted' : 'All farm access is open'} deltaPositive={lockedFarmCount === 0} color={lockedFarmCount > 0 ? '#d97706' : undefined} icon={<LockIcon />} />
            <KpiCard label="Expiring in 30 days" value={expiringSoonCount} delta="License renewal window" color={expiringSoonCount > 0 ? '#d97706' : undefined} icon={<CalendarIcon />} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>License alerts</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{visibleAlerts.length} visible</span>
            </div>
            {visibleAlerts.length === 0 ? (
              <EmptyState message="No active license alerts for the selected farms" positive />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {visibleAlerts.map(alert => (
                  <LicenseAlertTile
                    key={`${alert.farmId}:${alert.status}`}
                    alert={alert}
                    onOpenFarm={() => navigate(`/dashboard?farm=${alert.farmId}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {visibleFarms.map(farm => (
              <FarmOverviewCard
                key={farm.farmId}
                farm={farm}
                meta={farmMetaById[farm.farmId]}
                onOpenSessions={() => navigate(`/sessions?farm=${farm.farmId}`)}
                onOpenAnalytics={() => navigate(`/analytics?farm=${farm.farmId}`)}
              />
            ))}
          </div>

          {visibleFarms.length === 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <EmptyState message="No farm cards are available for this filter yet." />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState(ALL_FARMS_VALUE)
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null)
  const [allDashboards, setAllDashboards] = useState<DashboardDto[]>([])
  const [sessions, setSessions] = useState<ScoutingSessionDetailDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    farmsApi.list()
      .then(data => {
        const farmParam = searchParams.get('farm')
        const matchedFarm = farmParam ? data.find(farm => farm.id === farmParam) : undefined

        setFarms(data)
        setSelectedFarmId(matchedFarm?.id ?? ALL_FARMS_VALUE)
      })
      .catch(() => setError('Could not load farms.'))
  }, [searchParams])

  useEffect(() => {
    if (farms.length === 0 && selectedFarmId !== ALL_FARMS_VALUE) return

    setLoading(true)
    setError(null)
    setDashboard(null)
    setAllDashboards([])
    setSessions([])

    if (selectedFarmId === ALL_FARMS_VALUE) {
      Promise.all([
        Promise.all(farms.map(farm => analyticsApi.fullDashboard(farm.id))),
        sessionsApi.list(),
      ])
        .then(([dashboards, allSessions]) => {
          setAllDashboards(dashboards)
          setSessions(allSessions)
        })
        .catch(() => setError('Could not load aggregate dashboard data.'))
        .finally(() => setLoading(false))
      return
    }

    Promise.all([
      analyticsApi.fullDashboard(selectedFarmId),
      sessionsApi.list(selectedFarmId),
    ])
      .then(([farmDashboard, farmSessions]) => {
        setDashboard(farmDashboard)
        setSessions(farmSessions)
      })
      .catch(() => setError('Could not load farm dashboard data.'))
      .finally(() => setLoading(false))
  }, [farms, selectedFarmId])

  function handleFarmSelection(nextFarmId: string) {
    setSelectedFarmId(nextFarmId)
    setSearchParams({ farm: nextFarmId }, { replace: true })
  }

  const aggregate = useMemo(() => {
    if (selectedFarmId !== ALL_FARMS_VALUE || allDashboards.length === 0) return null

    return {
      totalSessions: allDashboards.reduce((sum, item) => sum + (item.summary?.totalSessions ?? 0), 0),
      pestsDetected: allDashboards.reduce((sum, item) => sum + (item.summary?.pestsDetectedThisWeek ?? 0), 0),
      activeScouts: allDashboards.reduce((sum, item) => sum + (item.summary?.activeScouts ?? 0), 0),
      alerts: allDashboards.flatMap((item, index) => (item.alerts ?? []).map(alert => ({
        ...alert,
        farmId: farms[index]?.id,
        farmName: farms[index]?.name ?? alert.farmName,
      }))),
      weeklyTrends: mergeWeeklyTrends(allDashboards),
      pestDistribution: mergePestDistribution(allDashboards),
      sessions,
    }
  }, [allDashboards, farms, selectedFarmId, sessions])

  const selectedFarm = farms.find(farm => farm.id === selectedFarmId) ?? null
  const singleFarmWeeklyTrends = (dashboard?.weeklyTrends ?? []).map(point => ({
    ...point,
    weekLabel: formatTrendWeekLabel(point),
  }))

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1440 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Super admin operational view across all farms or one selected farm
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 240 }} value={selectedFarmId} onChange={event => handleFarmSelection(event.target.value)}>
            <option value={ALL_FARMS_VALUE}>All farms</option>
            {farms.map(farm => (
              <option key={farm.id} value={farm.id}>{farm.name}</option>
            ))}
          </select>
          {selectedFarmId !== ALL_FARMS_VALUE && (
            <button className="btn-primary" onClick={() => navigate(`/analytics?farm=${selectedFarmId}`)}>
              Analytics
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 10, padding: '14px 16px', marginBottom: 20, color: '#c53030', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[...Array(4)].map((_, index) => (
            <div key={index} className="card" style={{ height: 96, background: '#f3f4f6' }} />
          ))}
        </div>
      ) : selectedFarmId === ALL_FARMS_VALUE && aggregate ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <KpiCard label="Tracked farms" value={farms.length} delta="Accessible across the platform" icon={<FarmIcon />} />
            <KpiCard label="Total sessions" value={aggregate.totalSessions} delta="Across all farms" icon={<SessionIcon />} />
            <KpiCard label="Pests detected" value={aggregate.pestsDetected} delta="This week" icon={<PestIcon />} />
            <KpiCard label="Active scouts" value={aggregate.activeScouts} delta="Cross-farm coverage" icon={<ScoutIcon />} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">Combined weekly pest trends</div>
              {aggregate.weeklyTrends.length === 0 ? (
                <EmptyState message="No cross-farm trend data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={aggregate.weeklyTrends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8 }} />
                    <Bar dataKey="thrips" stackId="a" fill="#e05252" />
                    <Bar dataKey="redSpider" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="whiteflies" stackId="a" fill="#71c49a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Active alerts</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{aggregate.alerts.length} alerts</span>
              </div>
              {aggregate.alerts.length === 0 ? (
                <EmptyState message="No active alerts across farms" positive />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aggregate.alerts.slice(0, 6).map((alert, index) => (
                    <AlertCard key={index} alert={alert} compact />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>Recent sessions</span>
              <button className="card-action" onClick={() => navigate('/sessions?farm=__all__')}>Open board</button>
            </div>
            <SessionsTable sessions={aggregate.sessions} compact showFarm />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
            {farms.map((farm, index) => {
              const farmDashboard = allDashboards[index]
              return (
                <div key={farm.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{farm.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af' }}>{farm.farmTag}</p>
                    </div>
                    <span className={`badge ${farm.accessLocked ? 'badge-orange' : 'badge-green'}`}>
                      {farm.accessLocked ? 'locked' : 'open'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <MiniMetric label="Sessions" value={farmDashboard?.summary?.totalSessions ?? 0} />
                    <MiniMetric label="Pests" value={farmDashboard?.summary?.pestsDetectedThisWeek ?? 0} />
                    <MiniMetric label="Alerts" value={farmDashboard?.alerts?.length ?? 0} />
                  </div>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => handleFarmSelection(farm.id)}>
                    Open farm dashboard
                  </button>
                </div>
              )
            })}
          </div>

          {aggregate.pestDistribution.length > 0 && (
            <div className="card">
              <div className="card-title">Pest distribution across all farms</div>
              <DistributionList items={aggregate.pestDistribution} />
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <KpiCard label="Farm" value={selectedFarm?.name ?? '-'} delta={selectedFarm?.farmTag ?? 'Selected farm'} icon={<FarmIcon />} />
            <KpiCard label="Total sessions" value={dashboard?.summary?.totalSessions ?? 0} delta="Current dashboard window" icon={<SessionIcon />} />
            <KpiCard label="Pests detected" value={dashboard?.summary?.pestsDetectedThisWeek ?? 0} delta="This week" icon={<PestIcon />} />
            <KpiCard label="Active alerts" value={dashboard?.alerts?.length ?? 0} delta={dashboard?.alerts?.length ? 'Needs attention' : 'All clear'} deltaPositive={(dashboard?.alerts?.length ?? 0) === 0} color={(dashboard?.alerts?.length ?? 0) > 0 ? '#c53030' : undefined} icon={<AlertIcon />} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">Weekly trends</div>
              {singleFarmWeeklyTrends.length === 0 ? (
                <EmptyState message="No weekly trend data yet" />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={singleFarmWeeklyTrends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid #e5e7eb', borderRadius: 8 }} />
                    <Bar dataKey="thrips" stackId="a" fill="#e05252" />
                    <Bar dataKey="redSpider" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="whiteflies" stackId="a" fill="#71c49a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Recent sessions</span>
                <button className="card-action" onClick={() => navigate(`/sessions?farm=${selectedFarmId}`)}>Open board</button>
              </div>
              <SessionsTable sessions={sessions} compact />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title">Active alerts</div>
              {(dashboard?.alerts?.length ?? 0) === 0 ? (
                <EmptyState message="No active alerts for this farm" positive />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(dashboard?.alerts ?? []).slice(0, 5).map((alert, index) => (
                    <AlertCard key={index} alert={alert} compact />
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">Pest distribution</div>
              {(dashboard?.pestDistribution?.length ?? 0) === 0 ? (
                <EmptyState message="No pest distribution data yet" />
              ) : (
                <DistributionList items={dashboard?.pestDistribution ?? []} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FarmOverviewCard({
  farm,
  meta,
  onOpenSessions,
  onOpenAnalytics,
}: {
  farm: DashboardOverviewFarmDto
  meta?: FarmResponse
  onOpenSessions: () => void
  onOpenAnalytics: () => void
}) {
  const isExpired = (farm.daysUntilLicenseExpiry ?? Number.POSITIVE_INFINITY) < 0
  const isExpiringSoon = (farm.daysUntilLicenseExpiry ?? Number.POSITIVE_INFINITY) >= 0 && (farm.daysUntilLicenseExpiry ?? Number.POSITIVE_INFINITY) <= 30
  const licenseTone = isExpired ? '#c53030' : isExpiringSoon ? '#d97706' : '#2d7a50'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <h2 style={{ fontSize: 15, color: '#111827', margin: 0 }}>{farm.farmName}</h2>
            <span className="badge badge-gray">{farm.farmTag}</span>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            {meta?.subscriptionTier ?? 'Tier unavailable'} {meta?.structureType ? `· ${meta.structureType.toLowerCase()}` : ''}
          </p>
        </div>
        <span className={`badge ${farm.accessLocked ? 'badge-orange' : 'badge-green'}`}>
          {farm.accessLocked ? 'Access locked' : 'Access open'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MiniMetric label="License expiry" value={farm.licenseExpiryDate ? formatDate(farm.licenseExpiryDate) : 'Not set'} />
        <MiniMetric
          label="Days remaining"
          value={farm.daysUntilLicenseExpiry == null ? '-' : farm.daysUntilLicenseExpiry}
          color={farm.daysUntilLicenseExpiry == null ? undefined : licenseTone}
        />
      </div>

      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: `${licenseTone}12`,
          border: `0.5px solid ${licenseTone}44`,
          color: licenseTone,
          fontSize: 12,
        }}
      >
        {isExpired
          ? 'License expired. Review the farm before allowing further access.'
          : isExpiringSoon
          ? 'License is within the renewal window.'
          : 'License status is in a healthy range.'}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onOpenSessions}>Sessions</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={onOpenAnalytics}>Analytics</button>
      </div>
    </div>
  )
}

function LicenseAlertTile({ alert, onOpenFarm }: { alert: LicenseAlertDto; onOpenFarm: () => void }) {
  const tone = alert.status.toLowerCase().includes('expired')
    ? '#c53030'
    : alert.status.toLowerCase().includes('warning') || alert.status.toLowerCase().includes('grace')
    ? '#d97706'
    : '#1e5c3a'

  return (
    <div style={{ border: `0.5px solid ${tone}44`, borderRadius: 10, background: `${tone}10`, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{alert.farmName}</p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>{alert.licenseExpiryDate ? formatDate(alert.licenseExpiryDate) : 'No expiry date'}</p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {alert.status}
        </span>
      </div>
      <p style={{ fontSize: 12, color: tone }}>
        {typeof alert.daysUntilExpiry === 'number'
          ? `${alert.daysUntilExpiry} day${Math.abs(alert.daysUntilExpiry) === 1 ? '' : 's'} until expiry`
          : 'Expiry timeline unavailable'}
      </p>
      <button className="btn-secondary" style={{ marginTop: 10, fontSize: 12 }} onClick={onOpenFarm}>
        Open farm
      </button>
    </div>
  )
}

function DistributionList({ items }: { items: PestDistributionItemDto[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.slice(0, 6).map((item, index) => (
        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: PEST_CHART_COLORS[index % PEST_CHART_COLORS.length], flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          <div style={{ flex: 1.5, height: 4, background: '#f3f4f6', borderRadius: 2 }}>
            <div style={{ height: '100%', background: PEST_CHART_COLORS[index % PEST_CHART_COLORS.length], borderRadius: 2, width: `${item.percentage}%` }} />
          </div>
          <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'DM Mono, monospace', minWidth: 28, textAlign: 'right' }}>{getDistributionCount(item)}</span>
        </div>
      ))}
    </div>
  )
}

function MiniMetric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f9fafb', border: '0.5px solid #e5e7eb' }}>
      <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: color ?? '#111827' }}>{value}</p>
    </div>
  )
}

function mergeWeeklyTrends(dashboards: DashboardDto[]) {
  const map = new Map<string, Record<string, number | string>>()

  dashboards.forEach(dashboard => {
    ;(dashboard.weeklyTrends ?? []).forEach(point => {
      const weekKey = point.weekKey ?? point.week
      const existing = map.get(weekKey) ?? {}

      map.set(weekKey, {
        weekLabel: formatTrendWeekLabel(point),
        sortKey: weekKey,
        thrips: ((existing.thrips as number) ?? 0) + (point.thrips ?? 0),
        redSpider: ((existing.redSpider as number) ?? 0) + (point.redSpider ?? 0),
        whiteflies: ((existing.whiteflies as number) ?? 0) + (point.whiteflies ?? 0),
        mealybugs: ((existing.mealybugs as number) ?? 0) + (point.mealybugs ?? 0),
        caterpillars: ((existing.caterpillars as number) ?? 0) + (point.caterpillars ?? 0),
        otherPests: ((existing.otherPests as number) ?? 0) + (point.otherPests ?? 0),
      })
    })
  })

  return Array.from(map.values()).sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))
}

function mergePestDistribution(dashboards: DashboardDto[]) {
  const map = new Map<string, number>()

  dashboards.forEach(dashboard => {
    ;(dashboard.pestDistribution ?? []).forEach(item => {
      map.set(item.name, (map.get(item.name) ?? 0) + getDistributionCount(item))
    })
  })

  const total = Array.from(map.values()).reduce((sum, value) => sum + value, 0)

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({
      name,
      value,
      count: value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      severity: '',
    }))
}

function EmptyState({ message, positive = false }: { message: string; positive?: boolean }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: positive ? '#2d7a50' : '#9ca3af', fontSize: 12 }}>
      {positive ? 'OK ' : ''}{message}
    </div>
  )
}

function SessionIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="1" y="2" width="12" height="10" rx="2" /><line x1="4" y1="6" x2="10" y2="6" /><line x1="4" y1="8.5" x2="8" y2="8.5" /></svg>
}

function PestIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="7" cy="7" r="3" /><line x1="7" y1="1" x2="7" y2="4" /><line x1="7" y1="10" x2="7" y2="13" /><line x1="1" y1="7" x2="4" y2="7" /><line x1="10" y1="7" x2="13" y2="7" /></svg>
}

function AlertIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 1L13 12H1L7 1z" /><line x1="7" y1="5" x2="7" y2="8" /><circle cx="7" cy="10" r="0.6" fill="currentColor" stroke="none" /></svg>
}

function ScoutIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="7" cy="4.5" r="2.5" /><path d="M1.5 13c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" /></svg>
}

function FarmIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12V6.5L7 2.5l5 4V12" /><path d="M5 12V8h4v4" /></svg>
}

function LockIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="9" height="6" rx="1.5" /><path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" /></svg>
}

function CalendarIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5" /><path d="M4 1.5v2" /><path d="M10 1.5v2" /><path d="M1.5 5h11" /></svg>
}
