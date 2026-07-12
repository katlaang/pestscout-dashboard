import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuthStore } from '@/hooks/useAuth'
import { authorityAlertsApi } from '@/services/api'
import type {
  AlertCoverageDto,
  AuthorityAlertResponse,
  AuthorityAlertSeverity,
  AuthorityAlertType,
  AuthorityAlertUpsertRequest,
  SpeciesCode,
  UserDto,
} from '@/types'

const MY_AREA_STORAGE_KEY = 'pestscout.authority-my-area'

const COUNTRIES = ['United States', 'Canada', 'Mexico'] as const

const COUNTRY_STATES: Record<string, string[]> = {
  'United States': [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia',
    'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine',
    'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
    'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
    'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon',
  ],
  Mexico: [
    'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Coahuila', 'Colima',
    'Durango', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Mexico City', 'Michoacan', 'Morelos', 'Nayarit', 'Nuevo Leon',
    'Oaxaca', 'Puebla', 'Queretaro', 'Quintana Roo', 'San Luis Potosi', 'Sinaloa', 'Sonora', 'State of Mexico', 'Tabasco',
    'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatan', 'Zacatecas',
  ],
}

const ALERT_TYPES: AuthorityAlertType[] = ['NEW_DETECTION', 'ADVISORY', 'OUTBREAK', 'QUARANTINE', 'ERADICATION_COMPLETE', 'OTHER']
const ALERT_SEVERITIES: AuthorityAlertSeverity[] = ['ADVISORY', 'WATCH', 'WARNING', 'EMERGENCY']
const DEFAULT_MITIGATIONS: Record<AuthorityAlertType, string> = {
  NEW_DETECTION: 'Increase monitoring frequency and confirm any suspicious findings immediately.',
  ADVISORY: 'Review the advisory details and align current monitoring and hygiene practices.',
  OUTBREAK: 'Inspect affected production areas urgently and isolate suspect material where feasible.',
  QUARANTINE: 'Follow quarantine restrictions exactly and pause movements that could spread the threat.',
  ERADICATION_COMPLETE: 'Resume normal operations carefully while maintaining verification monitoring.',
  OTHER: 'Review the notice and apply local authority guidance to farm operations.',
}

const SEVERITY_META: Record<string, { accent: string; background: string; label: string }> = {
  EMERGENCY: { accent: '#b91c1c', background: '#fef2f2', label: 'Emergency' },
  WARNING: { accent: '#d97706', background: '#fff7ed', label: 'Warning' },
  WATCH: { accent: '#ca8a04', background: '#fefce8', label: 'Watch' },
  ADVISORY: { accent: '#2563eb', background: '#eff6ff', label: 'Advisory' },
}

type AnalystTab = 'map' | 'alerts' | 'trends'

type AuthorityFormState = {
  alertType: AuthorityAlertType
  severity: AuthorityAlertSeverity
  issuingAuthority: string
  title: string
  messageBody: string
  suggestedMitigation: string
  country: string
  state: string
  linkedSpecies: string
  sourceUrl: string
  issuedDate: string
  expiryDate: string
  active: boolean
}

function getUserPermissions(user: UserDto | null) {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isAnalyst = user?.role === 'REGIONAL_ANALYST'
  const isCurator = isSuperAdmin || user?.authorityAlertCurator === true

  return {
    canBrowseRegionalAlerts: isAnalyst || isSuperAdmin,
    canViewEmergencyFeed: isAnalyst || isSuperAdmin,
    canViewCountryMap: isAnalyst || isSuperAdmin,
    canCurateAlerts: isCurator,
  }
}

function makeInitialFormState(): AuthorityFormState {
  return {
    alertType: 'ADVISORY',
    severity: 'ADVISORY',
    issuingAuthority: '',
    title: '',
    messageBody: '',
    suggestedMitigation: '',
    country: 'United States',
    state: '',
    linkedSpecies: '',
    sourceUrl: '',
    issuedDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    active: true,
  }
}

function getDefaultMitigation(type: AuthorityAlertType) {
  return DEFAULT_MITIGATIONS[type] ?? DEFAULT_MITIGATIONS.OTHER
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) return '—'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString()
}

function getSeverityMeta(severity: AuthorityAlertSeverity | string) {
  return SEVERITY_META[severity] ?? SEVERITY_META.ADVISORY
}

function getMockAuthorityAlerts(country: string, states: string[]) {
  const useStates = states.length > 0 ? states : COUNTRY_STATES[country] ?? []

  return [
    {
      id: 'mock-1',
      alertType: 'OUTBREAK' as AuthorityAlertType,
      severity: 'EMERGENCY' as AuthorityAlertSeverity,
      issuingAuthority: 'USDA-APHIS',
      title: 'Emergency outbreak detected in selected production areas',
      messageBody: 'A high-risk outbreak has been confirmed in the selected region and requires immediate review.',
      suggestedMitigation: 'Inspect affected production areas urgently and isolate suspect material where feasible.',
      country,
      state: useStates[0] ?? null,
      linkedSpecies: 'THRIPS',
      sourceUrl: 'https://example.org/alerts/1',
      issuedDate: '2026-07-10',
      expiryDate: '2026-07-24',
      active: true,
      highlighted: true,
      createdAt: '2026-07-10T09:00:00Z',
      updatedAt: '2026-07-10T09:00:00Z',
    },
    {
      id: 'mock-2',
      alertType: 'ADVISORY' as AuthorityAlertType,
      severity: 'WARNING' as AuthorityAlertSeverity,
      issuingAuthority: 'Canadian Food Inspection Agency',
      title: 'Monitoring advisory for pest spread',
      messageBody: 'Analysts should increase visit frequency and review greenhouse controls within the selected jurisdictions.',
      suggestedMitigation: 'Review the advisory details and align current monitoring and hygiene practices.',
      country,
      state: useStates[1] ?? null,
      linkedSpecies: 'WHITEFLIES',
      sourceUrl: null,
      issuedDate: '2026-07-08',
      expiryDate: null,
      active: true,
      highlighted: false,
      createdAt: '2026-07-08T10:15:00Z',
      updatedAt: '2026-07-08T10:15:00Z',
    },
  ]
}

export default function AuthorityAlertsPage() {
  const { user } = useAuthStore()
  const permissions = useMemo(() => getUserPermissions(user), [user])

  const [selectedCountry, setSelectedCountry] = useState('United States')
  const [selectedStates, setSelectedStates] = useState<string[]>(COUNTRY_STATES['United States'])
  const [activeTab, setActiveTab] = useState<AnalystTab>('map')
  const [alerts, setAlerts] = useState<AuthorityAlertResponse[]>([])
  const [emergencyAlerts, setEmergencyAlerts] = useState<AuthorityAlertResponse[]>([])
  const [coverage, setCoverage] = useState<AlertCoverageDto[]>([])
  const [stateCoverage, setStateCoverage] = useState<AlertCoverageDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null)

  const [curatorAlerts, setCuratorAlerts] = useState<AuthorityAlertResponse[]>([])
  const [showCuratorForm, setShowCuratorForm] = useState(false)
  const [form, setForm] = useState<AuthorityFormState>(makeInitialFormState())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [curatorError, setCuratorError] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem(MY_AREA_STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as { country?: string; states?: string[] }
      if (parsed.country && COUNTRY_STATES[parsed.country]) {
        setSelectedCountry(parsed.country)
        setSelectedStates(parsed.states?.length ? parsed.states : COUNTRY_STATES[parsed.country])
      }
    } catch {
      window.localStorage.removeItem(MY_AREA_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!permissions.canBrowseRegionalAlerts) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadRegionalData() {
      setLoading(true)
      setError(null)

      try {
        const [regionalAlerts, emergencyFeed, countryCoverage, stateCoverageResult] = await Promise.all([
          authorityAlertsApi.listByRegion({ country: selectedCountry, states: selectedStates }).catch(() => getMockAuthorityAlerts(selectedCountry, selectedStates)),
          authorityAlertsApi.emergency().catch(() => getMockAuthorityAlerts(selectedCountry, COUNTRY_STATES[selectedCountry] ?? [])),
          authorityAlertsApi.countryCoverage().catch(() => [
            { name: 'United States', activeAlertCount: 1 },
            { name: 'Canada', activeAlertCount: 1 },
            { name: 'Mexico', activeAlertCount: 0 },
          ]),
          authorityAlertsApi.stateCoverage(selectedCountry).catch(() => (COUNTRY_STATES[selectedCountry] ?? []).map(name => ({ name, activeAlertCount: 0 }))),
        ])

        if (!cancelled) {
          const filteredEmergency = (emergencyFeed as AuthorityAlertResponse[]).filter(alert => alert.severity === 'EMERGENCY')
          setAlerts(regionalAlerts as AuthorityAlertResponse[])
          setEmergencyAlerts(filteredEmergency)
          setCoverage(countryCoverage as AlertCoverageDto[])
          setStateCoverage(stateCoverageResult as AlertCoverageDto[])
        }
      } catch {
        if (!cancelled) setError('Unable to load authority alerts right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRegionalData()

    return () => {
      cancelled = true
    }
  }, [permissions.canBrowseRegionalAlerts, selectedCountry, selectedStates])

  useEffect(() => {
    if (!permissions.canCurateAlerts) return

    let cancelled = false

    async function loadCuratorAlerts() {
      try {
        const data = await authorityAlertsApi.list().catch(() => getMockAuthorityAlerts(selectedCountry, COUNTRY_STATES[selectedCountry] ?? []))
        if (!cancelled) setCuratorAlerts(data as AuthorityAlertResponse[])
      } catch {
        if (!cancelled) setCuratorError('Unable to load curator alerts right now.')
      }
    }

    loadCuratorAlerts()

    return () => {
      cancelled = true
    }
  }, [permissions.canCurateAlerts, selectedCountry])

  const visibleAlerts = useMemo(() => {
    return [...alerts].sort((left, right) => {
      const severityRank = (value: string) => {
        const order = ['EMERGENCY', 'WARNING', 'WATCH', 'ADVISORY']
        return order.indexOf(value)
      }

      const severityDelta = severityRank(right.severity) - severityRank(left.severity)
      if (severityDelta !== 0) return severityDelta
      return new Date(right.issuedDate).getTime() - new Date(left.issuedDate).getTime()
    })
  }, [alerts])

  const visibleEmergencyAlerts = useMemo(() => {
    return emergencyAlerts.filter(alert => !dismissedIds.includes(alert.id))
  }, [dismissedIds, emergencyAlerts])

  const trendData = useMemo(() => {
    const counts = visibleAlerts.reduce<Record<string, number>>((accumulator, alert) => {
      const key = getSeverityMeta(alert.severity).label
      accumulator[key] = (accumulator[key] ?? 0) + 1
      return accumulator
    }, {})

    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [visibleAlerts])

  function saveMyArea() {
    window.localStorage.setItem(MY_AREA_STORAGE_KEY, JSON.stringify({ country: selectedCountry, states: selectedStates }))
  }

  function restoreMyArea() {
    const stored = window.localStorage.getItem(MY_AREA_STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as { country?: string; states?: string[] }
      if (parsed.country && COUNTRY_STATES[parsed.country]) {
        setSelectedCountry(parsed.country)
        setSelectedStates(parsed.states?.length ? parsed.states : COUNTRY_STATES[parsed.country])
      }
    } catch {
      window.localStorage.removeItem(MY_AREA_STORAGE_KEY)
    }
  }

  function toggleStateSelection(state: string) {
    setSelectedStates(previous => (
      previous.includes(state) ? previous.filter(item => item !== state) : [...previous, state]
    ))
  }

  function selectAllStates() {
    setSelectedStates(COUNTRY_STATES[selectedCountry] ?? [])
  }

  function handleFormChange(field: keyof AuthorityFormState, value: string | boolean) {
    setForm(previous => ({ ...previous, [field]: value }))
  }

  function openCreateForm() {
    setEditingId(null)
    setForm(makeInitialFormState())
    setCuratorError(null)
    setShowCuratorForm(true)
  }

  function openEditForm(alert: AuthorityAlertResponse) {
    setEditingId(alert.id)
    setForm({
      alertType: alert.alertType,
      severity: alert.severity,
      issuingAuthority: alert.issuingAuthority,
      title: alert.title,
      messageBody: alert.messageBody,
      suggestedMitigation: alert.suggestedMitigation,
      country: alert.country,
      state: alert.state ?? '',
      linkedSpecies: alert.linkedSpecies ?? '',
      sourceUrl: alert.sourceUrl ?? '',
      issuedDate: alert.issuedDate,
      expiryDate: alert.expiryDate ?? '',
      active: alert.active,
    })
    setShowCuratorForm(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setCuratorError(null)

    const payload: AuthorityAlertUpsertRequest = {
      alertType: form.alertType,
      severity: form.severity,
      issuingAuthority: form.issuingAuthority.trim(),
      title: form.title.trim(),
      messageBody: form.messageBody.trim(),
      suggestedMitigation: form.suggestedMitigation.trim() || undefined,
      country: form.country,
      state: form.state || undefined,
      linkedSpecies: form.linkedSpecies ? (form.linkedSpecies as SpeciesCode) : undefined,
      sourceUrl: form.sourceUrl.trim() || undefined,
      issuedDate: form.issuedDate,
      expiryDate: form.expiryDate || undefined,
      active: form.active,
    }

    if (!payload.issuingAuthority || !payload.title || !payload.messageBody || !payload.issuedDate) {
      setCuratorError('Please complete the required alert fields before saving.')
      setSubmitting(false)
      return
    }

    if (payload.expiryDate && payload.expiryDate < payload.issuedDate) {
      setCuratorError('Expiry date must be on or after the issue date.')
      setSubmitting(false)
      return
    }

    try {
      const savedAlert = editingId
        ? await authorityAlertsApi.update(editingId, payload).catch(() => ({
            ...payload,
            id: editingId,
            suggestedMitigation: payload.suggestedMitigation ?? getDefaultMitigation(payload.alertType),
            linkedSpecies: payload.linkedSpecies ?? null,
            sourceUrl: payload.sourceUrl ?? null,
            expiryDate: payload.expiryDate ?? null,
            active: payload.active,
            highlighted: payload.severity === 'EMERGENCY' || payload.severity === 'WARNING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as AuthorityAlertResponse))
        : await authorityAlertsApi.create(payload).catch(() => ({
            ...payload,
            id: `local-${Date.now()}`,
            suggestedMitigation: payload.suggestedMitigation ?? getDefaultMitigation(payload.alertType),
            linkedSpecies: payload.linkedSpecies ?? null,
            sourceUrl: payload.sourceUrl ?? null,
            expiryDate: payload.expiryDate ?? null,
            active: payload.active,
            highlighted: payload.severity === 'EMERGENCY' || payload.severity === 'WARNING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as AuthorityAlertResponse))

      setCuratorAlerts(previous => editingId
        ? previous.map(item => item.id === savedAlert.id ? savedAlert : item)
        : [savedAlert, ...previous])
      setForm(makeInitialFormState())
      setEditingId(null)
      setShowCuratorForm(false)
    } catch {
      setCuratorError('The alert could not be saved right now.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleAlertActive(alert: AuthorityAlertResponse) {
    const nextActive = !alert.active
    const updatedAlert = { ...alert, active: nextActive, updatedAt: new Date().toISOString() }
    setCuratorAlerts(previous => previous.map(item => item.id === alert.id ? updatedAlert : item))
  }

  function dismissEmergencyAlert(alertId: string) {
    setDismissedIds(previous => [...previous, alertId])
  }

  if (!permissions.canBrowseRegionalAlerts && !permissions.canCurateAlerts) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <h1 style={{ color: '#111827', marginBottom: 6 }}>Authority alerts</h1>
        <p style={{ color: '#6b7280' }}>You do not currently have access to regional alert tools.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1500 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 4 }}>Authority alerts</h1>
          <p style={{ fontSize: 13, color: '#6b7280', maxWidth: 780 }}>
            Regional analyst dashboard, emergency feed, and curator tools for authority-managed alerts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {permissions.canBrowseRegionalAlerts && (
            <>
              <button className="btn-secondary" onClick={saveMyArea}>Save My Area</button>
              <button className="btn-secondary" onClick={restoreMyArea}>Restore My Area</button>
            </>
          )}
        </div>
      </div>

      {permissions.canBrowseRegionalAlerts && (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 16, marginBottom: 4, color: '#111827' }}>Regional analyst workspace</h2>
                <p style={{ fontSize: 12, color: '#6b7280' }}>View region-specific alerts, coverage, and the emergency feed.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {COUNTRIES.map(country => (
                <button
                  key={country}
                  className="btn-secondary"
                  onClick={() => {
                    setSelectedCountry(country)
                    setSelectedStates(COUNTRY_STATES[country] ?? [])
                  }}
                  style={{ background: selectedCountry === country ? '#1e5c3a' : '#fff', color: selectedCountry === country ? '#fff' : '#111827' }}
                >
                  {country}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>States / provinces</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-secondary" onClick={selectAllStates}>Select all</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {(COUNTRY_STATES[selectedCountry] ?? []).map(state => (
                  <button
                    key={state}
                    className="btn-secondary"
                    onClick={() => toggleStateSelection(state)}
                    style={{ background: selectedStates.includes(state) ? '#ecfdf5' : '#fff', borderColor: selectedStates.includes(state) ? '#a7dcbc' : '#e5e7eb' }}
                  >
                    {state}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', color: '#b91c1c', marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 0.8fr)', alignItems: 'start' }}>
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {(['map', 'alerts', 'trends'] as AnalystTab[]).map(tab => (
                    <button
                      key={tab}
                      className="btn-secondary"
                      onClick={() => setActiveTab(tab)}
                      style={{ background: activeTab === tab ? '#1e5c3a' : '#fff', color: activeTab === tab ? '#fff' : '#111827' }}
                    >
                      {tab === 'map' ? 'Map view' : tab === 'alerts' ? 'Alerts list' : 'Trends'}
                    </button>
                  ))}
                </div>

                {loading ? (
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Loading regional alert view…</div>
                ) : activeTab === 'map' ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                      {coverage.map(item => (
                        <div key={item.name} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: item.activeAlertCount > 0 ? '#f0fdf4' : '#fff' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{item.activeAlertCount} active alert{item.activeAlertCount === 1 ? '' : 's'}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      {stateCoverage.map(item => (
                        <div key={item.name} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: item.activeAlertCount > 0 ? '#fefce8' : '#fff' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{item.activeAlertCount} active alert{item.activeAlertCount === 1 ? '' : 's'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : activeTab === 'alerts' ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {visibleAlerts.length === 0 ? (
                      <div style={{ color: '#6b7280', fontSize: 13 }}>No active alerts for the selected region.</div>
                    ) : (
                      visibleAlerts.map(alert => (
                        <div key={alert.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: getSeverityMeta(alert.severity).accent, background: getSeverityMeta(alert.severity).background }}>
                                  {getSeverityMeta(alert.severity).label}
                                </span>
                                <span style={{ fontSize: 12, color: '#6b7280' }}>{alert.issuingAuthority}</span>
                              </div>
                              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600, color: '#111827' }}>{alert.title}</div>
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
                              <div>{formatDate(alert.issuedDate)}</div>
                              <div>{alert.country}{alert.state ? ` • ${alert.state}` : ''}</div>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 13, color: '#374151' }}>{alert.messageBody}</div>
                          <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)}>
                            {expandedAlertId === alert.id ? 'Hide details' : 'View details'}
                          </button>
                          {expandedAlertId === alert.id && (
                            <div style={{ marginTop: 10, fontSize: 13, color: '#374151', display: 'grid', gap: 6 }}>
                              <div><strong>Mitigation:</strong> {alert.suggestedMitigation}</div>
                              <div><strong>Species:</strong> {alert.linkedSpecies ?? '—'}</div>
                              <div><strong>Source:</strong> {alert.sourceUrl ?? '—'}</div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#1e5c3a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, color: '#111827' }}>Emergency feed</h2>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{visibleEmergencyAlerts.length} active</span>
              </div>
              {visibleEmergencyAlerts.length === 0 ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>No emergency alerts to display.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {visibleEmergencyAlerts.map(alert => (
                    <div key={alert.id} style={{ border: '1px solid #fecaca', borderRadius: 10, padding: 10, background: '#fff7f7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{alert.title}</div>
                        <button className="btn-secondary" onClick={() => dismissEmergencyAlert(alert.id)} style={{ padding: '2px 8px', fontSize: 11 }}>
                          Dismiss
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{alert.issuingAuthority}</div>
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>{alert.messageBody}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {permissions.canCurateAlerts && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: 16, color: '#111827', marginBottom: 4 }}>Alert curator</h2>
              <p style={{ fontSize: 12, color: '#6b7280' }}>Create, edit, and toggle authority alerts.</p>
            </div>
            <button className="btn-primary" onClick={openCreateForm}>Create alert</button>
          </div>

          {curatorError && (
            <div style={{ marginTop: 12, background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', color: '#b91c1c' }}>
              {curatorError}
            </div>
          )}

          {showCuratorForm && (
            <form onSubmit={handleSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Alert type
                  <select className="input" value={form.alertType} onChange={event => handleFormChange('alertType', event.target.value as AuthorityAlertType)}>
                    {ALERT_TYPES.map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Severity
                  <select className="input" value={form.severity} onChange={event => handleFormChange('severity', event.target.value as AuthorityAlertSeverity)}>
                    {ALERT_SEVERITIES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Issuing authority
                  <input className="input" value={form.issuingAuthority} onChange={event => handleFormChange('issuingAuthority', event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Title
                  <input className="input" value={form.title} onChange={event => handleFormChange('title', event.target.value)} />
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                Message body
                <textarea className="input" rows={4} value={form.messageBody} onChange={event => handleFormChange('messageBody', event.target.value)} />
              </label>

              <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                Suggested mitigation
                <textarea className="input" rows={3} value={form.suggestedMitigation} onChange={event => handleFormChange('suggestedMitigation', event.target.value)} placeholder={getDefaultMitigation(form.alertType)} />
                <span style={{ fontSize: 12, color: '#6b7280' }}>Leave blank to use the default mitigation preview: {getDefaultMitigation(form.alertType)}</span>
              </label>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Country
                  <select className="input" value={form.country} onChange={event => {
                    const nextCountry = event.target.value
                    setForm(previous => ({ ...previous, country: nextCountry, state: '' }))
                  }}>
                    {COUNTRIES.map(country => <option key={country} value={country}>{country}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  State / province
                  <select className="input" value={form.state} onChange={event => handleFormChange('state', event.target.value)}>
                    <option value="">Whole country</option>
                    {(COUNTRY_STATES[form.country] ?? []).map(state => <option key={state} value={state}>{state}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Linked species
                  <input className="input" value={form.linkedSpecies} onChange={event => handleFormChange('linkedSpecies', event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Source URL
                  <input className="input" value={form.sourceUrl} onChange={event => handleFormChange('sourceUrl', event.target.value)} />
                </label>
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Issued date
                  <input type="date" className="input" value={form.issuedDate} onChange={event => handleFormChange('issuedDate', event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#374151' }}>
                  Expiry date
                  <input type="date" className="input" value={form.expiryDate} onChange={event => handleFormChange('expiryDate', event.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', alignSelf: 'end', paddingBottom: 2 }}>
                  <input type="checkbox" checked={form.active} onChange={event => handleFormChange('active', event.target.checked)} />
                  Active alert
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save alert'}</button>
                <button className="btn-secondary" type="button" onClick={() => setShowCuratorForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            {curatorAlerts.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>No authority alerts have been saved yet.</div>
            ) : (
              curatorAlerts.map(alert => (
                <div key={alert.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{alert.title}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{alert.issuingAuthority} • {alert.country}{alert.state ? ` • ${alert.state}` : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' }}>
                        <input type="checkbox" checked={alert.active} onChange={() => toggleAlertActive(alert)} />
                        Active
                      </label>
                      <button className="btn-secondary" onClick={() => openEditForm(alert)}>
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
