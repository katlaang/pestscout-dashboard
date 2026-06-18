import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { farmsApi, analyticsApi } from '@/services/api'
import { useCurrentFarmStore } from '@/hooks/useCurrentFarm'
import type { FarmResponse, AlertDto } from '@/types'
import { formatDateTime } from '@/utils'
import { useAlertCount } from '@/hooks/useAlertCount'

const ALL_FARMS_VALUE = '__all__'
const SEVERITY_ORDER = ['EMERGENCY', 'CRITICAL', 'VERY_HIGH', 'HIGH', 'MODERATE', 'LOW', 'ZERO']
const SEVERITY_FILTERS = ['ALL', 'EMERGENCY', 'CRITICAL', 'VERY_HIGH', 'HIGH', 'MODERATE', 'LOW']
const SEVERITY_LABELS: Record<string, string> = {
  ALL: 'All',
  EMERGENCY: 'Emergency',
  CRITICAL: 'Critical',
  VERY_HIGH: 'Very high',
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW: 'Low',
}

const SEVERITY_VISUALS: Record<string, {
  cardBackground: string
  cardBorder: string
  accent: string
  text: string
  countBackground: string
  badgeBackground: string
}> = {
  EMERGENCY: {
    cardBackground: '#fff1f2',
    cardBorder: '#fda4af',
    accent: '#dc2626',
    text: '#7f1d1d',
    countBackground: '#fee2e2',
    badgeBackground: '#fecdd3',
  },
  CRITICAL: {
    cardBackground: '#fff7ed',
    cardBorder: '#fdba74',
    accent: '#ea580c',
    text: '#9a3412',
    countBackground: '#ffedd5',
    badgeBackground: '#fed7aa',
  },
  VERY_HIGH: {
    cardBackground: '#fffbea',
    cardBorder: '#fde68a',
    accent: '#ca8a04',
    text: '#854d0e',
    countBackground: '#fef3c7',
    badgeBackground: '#fde68a',
  },
  HIGH: {
    cardBackground: '#fffbea',
    cardBorder: '#fde68a',
    accent: '#ca8a04',
    text: '#854d0e',
    countBackground: '#fef3c7',
    badgeBackground: '#fde68a',
  },
  MODERATE: {
    cardBackground: '#f8fafc',
    cardBorder: '#cbd5e1',
    accent: '#64748b',
    text: '#334155',
    countBackground: '#e2e8f0',
    badgeBackground: '#e2e8f0',
  },
  LOW: {
    cardBackground: '#f0faf4',
    cardBorder: '#a7dcbc',
    accent: '#1e5c3a',
    text: '#1e5c3a',
    countBackground: '#dcfce7',
    badgeBackground: '#dcfce7',
  },
  ZERO: {
    cardBackground: '#f9fafb',
    cardBorder: '#e5e7eb',
    accent: '#6b7280',
    text: '#374151',
    countBackground: '#f3f4f6',
    badgeBackground: '#f3f4f6',
  },
}

type FarmAlert = AlertDto & {
  farmId: string
  farmName: string
}

function severityRank(value: string) {
  const idx = SEVERITY_ORDER.indexOf(normalizeSeverity(value))
  return idx === -1 ? 99 : idx
}

function isHotSeverity(value: string) {
  const normalized = normalizeSeverity(value)
  return normalized === 'EMERGENCY' || normalized === 'CRITICAL' || normalized === 'VERY_HIGH' || normalized === 'HIGH'
}

function normalizeSeverity(value: string) {
  return value.toUpperCase().replace(/\s+/g, '_')
}

function getSeverityVisuals(value: string) {
  return SEVERITY_VISUALS[normalizeSeverity(value)] ?? SEVERITY_VISUALS.MODERATE
}

export default function AlertsPage() {
  const { farmId: currentFarmId } = useCurrentFarmStore()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [selectedFarmId, setSelectedFarmId] = useState('')
  const [alerts, setAlerts] = useState<FarmAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const { setCount } = useAlertCount()

  useEffect(() => {
    farmsApi.list().then(data => {
      const farmParam = searchParams.get('farm')
      const matchedFarm = farmParam ? data.find(farm => farm.id === farmParam) : undefined

      setFarms(data)

      if (farmParam === ALL_FARMS_VALUE || (!farmParam && !currentFarmId && data.length > 1)) {
        setSelectedFarmId(ALL_FARMS_VALUE)
        return
      }

      if (matchedFarm) {
        setSelectedFarmId(matchedFarm.id)
        return
      }

      if (data.length > 0) {
        setSelectedFarmId(currentFarmId ?? data[0].id)
      }
    })
  }, [searchParams, currentFarmId])

  useEffect(() => {
    if (!selectedFarmId) return

    setLoading(true)

    const loadAlerts = async () => {
      if (selectedFarmId === ALL_FARMS_VALUE) {
        const dashboards = await Promise.all(
          farms.map(async farm => {
            const dashboard = await analyticsApi.fullDashboard(farm.id)
            return (dashboard.alerts ?? []).map(alert => ({
              ...alert,
              farmId: farm.id,
              farmName: farm.name,
            }))
          }),
        )

        return dashboards.flat()
      }

      const selectedFarm = farms.find(farm => farm.id === selectedFarmId)
      const dashboard = await analyticsApi.fullDashboard(selectedFarmId)
      return (dashboard.alerts ?? []).map(alert => ({
        ...alert,
        farmId: selectedFarmId,
        farmName: selectedFarm?.name ?? alert.farmName ?? 'Unknown farm',
      }))
    }

    loadAlerts()
      .then(nextAlerts => {
        setAlerts(nextAlerts)
        setCount(nextAlerts.filter(alert => isHotSeverity(alert.severity)).length)
      })
      .finally(() => setLoading(false))
  }, [farms, selectedFarmId, setCount])

  const filtered = useMemo(() => (
    alerts
      .filter(alert => {
        const normalizedSeverity = normalizeSeverity(alert.severity)
        const matchesSeverity = severityFilter === 'ALL' || normalizedSeverity === severityFilter
        const query = search.trim().toLowerCase()
        const matchesSearch =
          !query ||
          alert.pest.toLowerCase().includes(query) ||
          alert.location.toLowerCase().includes(query) ||
          alert.farmName.toLowerCase().includes(query)

        return matchesSeverity && matchesSearch
      })
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  ), [alerts, search, severityFilter])

  const emergencyCount = alerts.filter(alert => normalizeSeverity(alert.severity) === 'EMERGENCY').length
  const criticalCount = alerts.filter(alert => normalizeSeverity(alert.severity) === 'CRITICAL').length
  const highCount = alerts.filter(alert => {
    const normalized = normalizeSeverity(alert.severity)
    return normalized === 'HIGH' || normalized === 'VERY_HIGH'
  }).length

  function handleFarmSelection(nextFarmId: string) {
    setSelectedFarmId(nextFarmId)
    setSearchParams({ farm: nextFarmId }, { replace: true })
  }

  function openFarm(alert: FarmAlert) {
    navigate(`/dashboard?farm=${alert.farmId}`)
  }

  const hasFarmSwitcher = farms.length > 0
  const emptyMessage =
    selectedFarmId === ALL_FARMS_VALUE
      ? 'No high-severity detections found across your farms this period.'
      : 'No high-severity detections found for this farm this period.'

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Alerts</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Alert board across all available farms, with optional farm drill-down
          </p>
        </div>

        <select className="input" style={{ width: 240 }} value={selectedFarmId} onChange={event => handleFarmSelection(event.target.value)}>
          {hasFarmSwitcher && <option value={ALL_FARMS_VALUE}>All farms</option>}
          {farms.map(farm => (
            <option key={farm.id} value={farm.id}>{farm.name}</option>
          ))}
        </select>
      </div>

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20, maxWidth: 760 }}>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Total alerts</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: '#111827', letterSpacing: '-0.02em' }}>{alerts.length}</p>
          </div>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Emergency</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: emergencyCount > 0 ? '#9b1c1c' : '#111827', letterSpacing: '-0.02em' }}>{emergencyCount}</p>
          </div>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Critical</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: criticalCount > 0 ? '#c2410c' : '#111827', letterSpacing: '-0.02em' }}>{criticalCount}</p>
          </div>
          <div className="card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>High / very high</p>
            <p style={{ fontSize: 24, fontWeight: 500, color: highCount > 0 ? '#a16207' : '#111827', letterSpacing: '-0.02em' }}>{highCount}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Search pest, location, or farm..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEVERITY_FILTERS.map(filterValue => (
            <button
              key={filterValue}
              onClick={() => setSeverityFilter(filterValue)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: '0.5px solid',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
                ...(severityFilter === filterValue
                  ? { background: '#1e5c3a', color: '#fff', borderColor: '#1e5c3a' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }),
              }}
            >
              {SEVERITY_LABELS[filterValue]}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading alerts...</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          {alerts.length === 0 ? (
            <>
              <p style={{ fontSize: 24, marginBottom: 8 }}>OK</p>
              <p style={{ fontSize: 13, color: '#2d7a50', fontWeight: 500 }}>All clear - no active alerts</p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{emptyMessage}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No alerts match your filters</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((alert, index) => {
            const normalizedSeverity = normalizeSeverity(alert.severity)
            const visuals = getSeverityVisuals(alert.severity)

            return (
              <button
                key={`${alert.farmId}:${alert.location}:${alert.pest}:${index}`}
                type="button"
                onClick={() => openFarm(alert)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: visuals.cardBackground,
                  border: `0.5px solid ${visuals.cardBorder}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  borderLeft: `4px solid ${visuals.accent}`,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    flexShrink: 0,
                    background: visuals.countBackground,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: visuals.text,
                    border: `0.5px solid ${visuals.cardBorder}`,
                  }}
                >
                  {alert.count}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{alert.pest}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 7px',
                        borderRadius: 20,
                        background: visuals.badgeBackground,
                        color: visuals.text,
                        border: `0.5px solid ${visuals.cardBorder}`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {normalizedSeverity.toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 10, color: '#14532d', background: 'rgba(255,255,255,0.72)', border: '0.5px solid rgba(20, 83, 45, 0.24)', borderRadius: 999, padding: '2px 8px' }}>
                      {alert.farmName}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    {alert.location} {alert.time ? `· ${formatDateTime(alert.time)}` : ''}
                  </p>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: visuals.accent }}>Open farm</p>
                  <p style={{ fontSize: 10, color: '#9ca3af' }}>{alert.farmId.slice(0, 8)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
