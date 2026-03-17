import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/hooks/useAuth'
import { adminFarmsApi, adminUsersApi, adminCacheApi } from '@/services/api'
import type {
  FarmResponse, GreenhouseResponse, UserDto, FarmMemberResponse,
  UpdateFarmLicenseRequest, CreateFarmRequest, CreateGreenhouseRequest,
  CacheInfo,
} from '@/types'
import { formatDate } from '@/utils'

type Tab = 'farms' | 'users' | 'cache'

export default function SuperAdminPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('farms')

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div style={{
          background: '#fff5f5', border: '0.5px solid #fca5a5',
          borderRadius: 10, padding: 20, color: '#c53030', fontSize: 13
        }}>
          Access denied — Super Admin role required.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h1 style={{ color: '#111827' }}>Super Admin</h1>
          <span style={{
            fontSize: 10, fontWeight: 600, background: '#1e5c3a', color: '#fff',
            padding: '2px 8px', borderRadius: 20, letterSpacing: '0.5px'
          }}>
            GLOBAL
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          Manage all farms, users, and system resources across the platform
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {(['farms', 'users', 'cache'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
              fontWeight: tab === t ? 500 : 400,
              color: tab === t ? '#1e5c3a' : '#6b7280',
              borderBottom: `2px solid ${tab === t ? '#2d7a50' : 'transparent'}`,
              marginBottom: -1, transition: 'color 0.1s',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'farms' && <FarmsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'cache' && <CacheTab />}
    </div>
  )
}

// ─── FARMS TAB ────────────────────────────────────────────────────────────────

function FarmsTab() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFarm, setSelectedFarm] = useState<FarmResponse | null>(null)
  const [showCreateFarm, setShowCreateFarm] = useState(false)
  const [greenhouses, setGreenhouses] = useState<GreenhouseResponse[]>([])
  const [ghLoading, setGhLoading] = useState(false)
  const [showCreateGh, setShowCreateGh] = useState(false)
  const [licensePanel, setLicensePanel] = useState(false)
  const [members, setMembers] = useState<FarmMemberResponse[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  const loadFarms = useCallback(() => {
    setLoading(true)
    adminFarmsApi.listAll()
      .then(data => {
        // Handle both plain array and paged response { content: [...] }
        const farms = Array.isArray(data) ? data : (data as any).content ?? []
        setFarms(farms)
      })
      .catch(e => {
        flash(`Could not load farms: ${e?.response?.data?.message ?? e?.message ?? 'Unknown error'}`, true)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadFarms() }, [loadFarms])

  useEffect(() => {
    if (!selectedFarm) return
    setGhLoading(true)
    adminFarmsApi.listGreenhouses(selectedFarm.id)
      .then(setGreenhouses)
      .finally(() => setGhLoading(false))
    setMembersLoading(true)
    adminFarmsApi.listMembers(selectedFarm.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [selectedFarm])

  async function handleLockToggle(farm: FarmResponse) {
    try {
      const updated = await adminFarmsApi.setAccessLocked(farm.id, !farm.accessLocked)
      setFarms(prev => prev.map(f => f.id === farm.id ? updated : f))
      if (selectedFarm?.id === farm.id) setSelectedFarm(updated)
      flash(`Farm ${updated.accessLocked ? 'locked' : 'unlocked'}`)
    } catch { flash('Failed to update farm access', true) }
  }

  async function handleDeleteGh(gh: GreenhouseResponse) {
    if (!selectedFarm) return
    if (!confirm(`Delete "${gh.name}"? This cannot be undone.`)) return
    try {
      await adminFarmsApi.deleteGreenhouse(selectedFarm.id, gh.id)
      setGreenhouses(prev => prev.filter(g => g.id !== gh.id))
      flash('Structure deleted')
    } catch { flash('Delete failed', true) }
  }

  return (
    <div>
      {error && <Banner type="error">{error}</Banner>}
      {success && <Banner type="success">{success}</Banner>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>

        {/* Left: farm list */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>All farms ({farms.length})</p>
            <button className="btn-primary" style={{ fontSize: 11, padding: '5px 12px' }}
              onClick={() => setShowCreateFarm(true)}>+ New farm</button>
          </div>
          {loading ? (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {farms.map(farm => (
                <button key={farm.id}
                  onClick={() => { setSelectedFarm(farm); setLicensePanel(false); setShowCreateGh(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 8, border: '0.5px solid',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    ...(selectedFarm?.id === farm.id
                      ? { background: '#f0faf4', borderColor: '#a7dcbc' }
                      : { background: '#fff', borderColor: '#e5e7eb' }),
                  }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 1 }}>{farm.name}</p>
                    <p style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{farm.farmTag}</p>
                  </div>
                  <StatusDot status={farm.subscriptionStatus} locked={farm.accessLocked} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div>
          {!selectedFarm ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Select a farm to manage it
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Farm header card */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 16, color: '#111827', marginBottom: 2 }}>{selectedFarm.name}</h2>
                    <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{selectedFarm.id}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={{
                        padding: '5px 12px', fontSize: 11, borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 500, border: '0.5px solid',
                        ...(selectedFarm.accessLocked
                          ? { background: '#f0faf4', borderColor: '#a7dcbc', color: '#1e5c3a' }
                          : { background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' })
                      }}
                      onClick={() => handleLockToggle(selectedFarm)}>
                      {selectedFarm.accessLocked ? '🔓 Unlock' : '🔒 Lock'}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 12px' }}
                      onClick={() => setLicensePanel(!licensePanel)}>
                      License
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <InfoCell label="Tier" value={selectedFarm.subscriptionTier} />
                  <InfoCell label="Status" value={selectedFarm.subscriptionStatus.replace('_', ' ')} />
                  <InfoCell label="Expires" value={selectedFarm.licenseExpiryDate ? formatDate(selectedFarm.licenseExpiryDate) : '—'} />
                  <InfoCell label="Area" value={selectedFarm.licensedAreaHectares ? `${selectedFarm.licensedAreaHectares} ha` : '—'} />
                  <InfoCell label="Location" value={[selectedFarm.city, selectedFarm.country].filter(Boolean).join(', ') || '—'} />
                  <InfoCell label="Tag" value={selectedFarm.farmTag} mono />
                </div>
              </div>

              {/* License panel */}
              {licensePanel && (
                <LicensePanel
                  farm={selectedFarm}
                  onSaved={updated => {
                    setFarms(prev => prev.map(f => f.id === updated.id ? updated : f))
                    setSelectedFarm(updated)
                    flash('License updated')
                    setLicensePanel(false)
                  }}
                  onError={msg => flash(msg, true)}
                />
              )}

              {/* Structures */}
              <div className="card">
                <div className="card-title">
                  <span>Structures ({greenhouses.length})</span>
                  <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setShowCreateGh(true)}>+ Add structure</button>
                </div>

                {showCreateGh && (
                  <CreateGreenhouseForm
                    farmId={selectedFarm.id}
                    onCreated={gh => { setGreenhouses(prev => [...prev, gh]); setShowCreateGh(false); flash('Structure created') }}
                    onCancel={() => setShowCreateGh(false)}
                    onError={msg => flash(msg, true)}
                  />
                )}

                {ghLoading ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0' }}>Loading…</p>
                ) : greenhouses.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0' }}>
                    No structures yet. Click "+ Add structure" to create a greenhouse or field block.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                        {['Name', 'Type', 'Bays', 'Benches/bay', 'Created', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {greenhouses.map(gh => (
                        <tr key={gh.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>{gh.name}</td>
                          <td style={{ padding: '8px' }}>
                            <span className={`badge ${gh.structureType === 'GREENHOUSE' ? 'badge-green' : 'badge-gray'}`}>
                              {gh.structureType.toLowerCase()}
                            </span>
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{gh.bayCount}</td>
                          <td style={{ padding: '8px', fontFamily: 'DM Mono, monospace' }}>{gh.benchesPerBay}</td>
                          <td style={{ padding: '8px', color: '#9ca3af' }}>{formatDate(gh.createdAt)}</td>
                          <td style={{ padding: '8px' }}>
                            <button onClick={() => handleDeleteGh(gh)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', fontSize: 11, fontFamily: 'inherit', padding: '2px 6px' }}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Members */}
              <div className="card">
                <div className="card-title">
                  <span>Farm members ({members.length})</span>
                </div>
                {membersLoading ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Loading…</p>
                ) : members.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
                    No members found. Add users via the Users tab and assign them this farm's ID.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                        {['Name', 'Email', 'Role', 'Joined'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '5px 8px 8px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.userId} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                          <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>
                            {m.user.firstName} {m.user.lastName}
                          </td>
                          <td style={{ padding: '8px', color: '#6b7280' }}>{m.user.email}</td>
                          <td style={{ padding: '8px' }}>
                            <span className={`badge ${m.role === 'MANAGER' ? 'badge-green' : m.role === 'FARM_ADMIN' ? 'badge-amber' : 'badge-gray'}`}>
                              {m.role.replace('_', ' ').toLowerCase()}
                            </span>
                          </td>
                          <td style={{ padding: '8px', color: '#9ca3af' }}>{formatDate(m.joinedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateFarm && (
        <Modal title="Create new farm" onClose={() => setShowCreateFarm(false)}>
          <CreateFarmForm
            onCreated={farm => { setFarms(prev => [...prev, farm]); setSelectedFarm(farm); setShowCreateFarm(false); flash(`Farm "${farm.name}" created`) }}
            onCancel={() => setShowCreateFarm(false)}
            onError={msg => flash(msg, true)}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── LICENSE PANEL ────────────────────────────────────────────────────────────

function LicensePanel({ farm, onSaved, onError }: { farm: FarmResponse; onSaved: (f: FarmResponse) => void; onError: (m: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<UpdateFarmLicenseRequest>({
    subscriptionStatus: farm.subscriptionStatus,
    subscriptionTier: farm.subscriptionTier,
    licensedAreaHectares: farm.licensedAreaHectares ?? undefined,
    licenseExpiryDate: farm.licenseExpiryDate ?? undefined,
    autoRenewEnabled: farm.autoRenewEnabled,
    billingEmail: farm.billingEmail ?? '',
  })

  async function save() {
    setSaving(true)
    try { onSaved(await adminFarmsApi.updateLicense(farm.id, form)) }
    catch (e: any) { onError(e?.response?.data?.message ?? 'License update failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 14 }}>Update license</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <FormField label="Status">
          <select className="input" value={form.subscriptionStatus}
            onChange={e => setForm(p => ({ ...p, subscriptionStatus: e.target.value as any }))}>
            {['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Tier">
          <select className="input" value={form.subscriptionTier}
            onChange={e => setForm(p => ({ ...p, subscriptionTier: e.target.value as any }))}>
            {['BASIC', 'STANDARD', 'PREMIUM'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Licensed area (ha)">
          <input className="input" type="number" value={form.licensedAreaHectares ?? ''}
            onChange={e => setForm(p => ({ ...p, licensedAreaHectares: e.target.value ? Number(e.target.value) : undefined }))} />
        </FormField>
        <FormField label="License start date">
          <input className="input" type="date" value={(form as any).licenseStartDate?.slice(0, 10) ?? ''}
            onChange={e => setForm(p => ({ ...p, licenseStartDate: e.target.value || undefined } as any))} />
        </FormField>
        <FormField label="Expiry date">
          <input className="input" type="date" value={form.licenseExpiryDate?.slice(0, 10) ?? ''}
            onChange={e => setForm(p => ({ ...p, licenseExpiryDate: e.target.value || undefined }))} />
        </FormField>
        <FormField label="Billing email">
          <input className="input" type="email" value={form.billingEmail ?? ''}
            onChange={e => setForm(p => ({ ...p, billingEmail: e.target.value }))} />
        </FormField>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.autoRenewEnabled ?? false}
            onChange={e => setForm(p => ({ ...p, autoRenewEnabled: e.target.checked }))} />
          Auto-renew enabled
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save license'}
        </button>
      </div>
    </div>
  )
}

// ─── CREATE FARM FORM ─────────────────────────────────────────────────────────

function CreateFarmForm({ onCreated, onCancel, onError }: { onCreated: (f: FarmResponse) => void; onCancel: () => void; onError: (m: string) => void }) {
  const { user } = useAuthStore()

  // Use current super admin's ID if available, otherwise the null UUID as placeholder
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'
  const defaultOwnerId = user?.id ?? NULL_UUID

  const [saving, setSaving] = useState(false)
  const [useNullOwner, setUseNullOwner] = useState(!user?.id)
  const [form, setForm] = useState<CreateFarmRequest>({
    name: '',
    ownerId: defaultOwnerId,
    subscriptionStatus: 'PENDING_ACTIVATION',
    licensedAreaHectares: 1,
    subscriptionTier: 'BASIC',
    country: '',
    city: '',
    timezone: 'UTC',
    contactEmail: '',
  })

  const set = (k: keyof CreateFarmRequest, v: string | number) =>
    setForm(p => ({ ...p, [k]: v }))

  function handleUseNullOwner(checked: boolean) {
    setUseNullOwner(checked)
    set('ownerId', checked ? NULL_UUID : (user?.id ?? NULL_UUID))
  }

  async function create() {
    if (!form.name.trim()) { onError('Farm name is required'); return }
    if (!form.licensedAreaHectares || form.licensedAreaHectares <= 0) { onError('Licensed area must be greater than 0'); return }
    setSaving(true)
    try { onCreated(await adminFarmsApi.create(form)) }
    catch (e: any) { onError(e?.response?.data?.message ?? 'Failed to create farm') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <FormField label="Farm name *">
          <input className="input" placeholder="e.g. Green Valley Greenhouse"
            value={form.name} onChange={e => set('name', e.target.value)} />
        </FormField>
        <FormField label="Subscription tier">
          <select className="input" value={form.subscriptionTier}
            onChange={e => set('subscriptionTier', e.target.value)}>
            <option value="BASIC">Basic</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </FormField>
        <FormField label="Initial status">
          <select className="input" value={form.subscriptionStatus}
            onChange={e => set('subscriptionStatus', e.target.value)}>
            <option value="PENDING_ACTIVATION">Pending activation</option>
            <option value="ACTIVE">Active</option>
          </select>
        </FormField>
        <FormField label="Licensed area (ha) *">
          <input className="input" type="number" min={0.1} step={0.1}
            value={form.licensedAreaHectares}
            onChange={e => set('licensedAreaHectares', parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Country">
          <input className="input" placeholder="e.g. Canada"
            value={form.country ?? ''} onChange={e => set('country', e.target.value)} />
        </FormField>
        <FormField label="City">
          <input className="input" placeholder="e.g. Leamington"
            value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
        </FormField>
        <FormField label="Contact email">
          <input className="input" type="email"
            value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)} />
        </FormField>
        <FormField label="Timezone">
          <input className="input" placeholder="America/Toronto"
            value={form.timezone ?? ''} onChange={e => set('timezone', e.target.value)} />
        </FormField>
        <FormField label="Contact name">
          <input className="input"
            value={form.contactName ?? ''} onChange={e => set('contactName', e.target.value)} />
        </FormField>
        <FormField label="Contact phone">
          <input className="input"
            value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value)} />
        </FormField>
      </div>

      {/* Owner ID section */}
      <div style={{ marginBottom: 14 }}>
        <FormField label="Farm owner (User ID) *">
          <input
            className="input"
            placeholder="UUID of the farm owner"
            value={form.ownerId}
            disabled={useNullOwner}
            style={{ opacity: useNullOwner ? 0.5 : 1 }}
            onChange={e => set('ownerId', e.target.value)}
          />
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input
            type="checkbox"
            checked={useNullOwner}
            onChange={e => handleUseNullOwner(e.target.checked)}
          />
          No owner yet — use placeholder ID (all zeroes)
        </label>
        {useNullOwner && (
          <div style={{ marginTop: 6, padding: '7px 10px', background: '#fffbf0', border: '0.5px solid #fde68a', borderRadius: 6, fontSize: 11, color: '#d97706' }}>
            Farm will be created with a placeholder owner ID. When you create the first Farm Admin or Manager user and assign them this farm, their user ID will be automatically set as the owner.
          </div>
        )}
        {!useNullOwner && user?.id && form.ownerId === user.id && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 5 }}>
            Pre-filled with your user ID. Change to assign ownership to a different user.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={create} disabled={saving}>
          {saving ? 'Creating…' : 'Create farm'}
        </button>
      </div>
    </div>
  )
}

// ─── CREATE GREENHOUSE FORM ───────────────────────────────────────────────────

function CreateGreenhouseForm({ farmId, onCreated, onCancel, onError }: { farmId: string; onCreated: (g: GreenhouseResponse) => void; onCancel: () => void; onError: (m: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateGreenhouseRequest>({ farmId, name: '', structureType: 'GREENHOUSE', bayCount: 10, benchesPerBay: 7 })

  async function create() {
    if (!form.name.trim()) { onError('Structure name is required'); return }
    setSaving(true)
    try { onCreated(await adminFarmsApi.createGreenhouse(form)) }
    catch (e: any) { onError(e?.response?.data?.message ?? 'Failed to create structure') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#f9fafb', border: '0.5px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>New structure</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        <FormField label="Name *">
          <input className="input" placeholder="e.g. Greenhouse A" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </FormField>
        <FormField label="Type">
          <select className="input" value={form.structureType}
            onChange={e => setForm(p => ({ ...p, structureType: e.target.value as any }))}>
            <option value="GREENHOUSE">Greenhouse</option>
            <option value="FIELD">Field</option>
            <option value="OTHER">Other</option>
          </select>
        </FormField>
        <FormField label="Bays">
          <input className="input" type="number" min={1} max={200} value={form.bayCount}
            onChange={e => setForm(p => ({ ...p, bayCount: Number(e.target.value) }))} />
        </FormField>
        <FormField label="Benches / bay">
          <input className="input" type="number" min={1} max={50} value={form.benchesPerBay}
            onChange={e => setForm(p => ({ ...p, benchesPerBay: Number(e.target.value) }))} />
        </FormField>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 11 }} onClick={create} disabled={saving}>
          {saving ? 'Creating…' : 'Create structure'}
        </button>
      </div>
    </div>
  )
}

// ─── USERS TAB ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserDto[]>([])
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const PAGE_SIZE = 25

  // Load all farms once so we can resolve farm name from farmId
  useEffect(() => {
    adminFarmsApi.listAll().then(setFarms).catch(() => {})
  }, [])

  const farmMap = Object.fromEntries(farms.map(f => [f.id, f]))

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  const loadUsers = useCallback((reset = false) => {
    const nextPage = reset ? 0 : page
    if (reset) setPage(0)
    const isFirst = reset || nextPage === 0
    isFirst ? setLoading(true) : setLoadingMore(true)
    adminUsersApi.search({
      role: roleFilter as any || undefined,
      email: emailFilter || undefined,
      farmId: farmFilter || undefined,
      page: nextPage,
      size: PAGE_SIZE,
    }).then(data => {
      if (isFirst) setUsers(data.content)
      else setUsers(prev => [...prev, ...data.content])
      setTotal(data.totalElements)
      if (!reset) setPage(nextPage + 1)
    }).catch(e => {
      flash(`Could not load users: ${e?.response?.data?.message ?? e?.message ?? 'Unknown error'}`, true)
    }).finally(() => {
      setLoading(false)
      setLoadingMore(false)
    })
  }, [roleFilter, emailFilter, farmFilter, page])

  // Reset and reload when filters change
  useEffect(() => { loadUsers(true) }, [roleFilter, emailFilter, farmFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(u: UserDto) {
    try {
      const updated = await adminUsersApi.setEnabled(u.id, !u.isEnabled)
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      flash(`User ${updated.isEnabled ? 'enabled' : 'disabled'}`)
    } catch { flash('Failed to update user', true) }
  }

  async function handleReactivate(u: UserDto) {
    try {
      const updated = await adminUsersApi.reactivate(u.id)
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      flash(`${u.firstName} ${u.lastName} reactivated`)
    } catch (e: any) { flash(e?.response?.data?.message ?? 'Reactivation failed', true) }
  }

  const ROLE_COLORS: Record<string, string> = {
    SUPER_ADMIN: '#1e5c3a', FARM_ADMIN: '#2d7a50', MANAGER: '#164530', SCOUT: '#4b5563', EDGE_SYNC: '#6b7280',
  }

  const hasMore = users.length < total

  return (
    <div>
      {error && <Banner type="error">{error}</Banner>}
      {success && <Banner type="success">{success}</Banner>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ width: 200 }} placeholder="Filter by email…"
          value={emailFilter} onChange={e => setEmailFilter(e.target.value)} />
        <select className="input" style={{ width: 150 }} value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {['SUPER_ADMIN', 'FARM_ADMIN', 'MANAGER', 'SCOUT', 'EDGE_SYNC'].map(r => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>
        <select className="input" style={{ width: 180 }} value={farmFilter}
          onChange={e => setFarmFilter(e.target.value)}>
          <option value="">All farms</option>
          {farms.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {users.length} / {total} users
        </span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 12px' }}
          onClick={() => setShowCreate(true)}>+ New user</button>
      </div>

      {showCreate && (
        <Modal title="Create user" onClose={() => setShowCreate(false)}>
          <CreateUserForm
            onCreated={u => { setUsers(prev => [u, ...prev]); setShowCreate(false); flash(`User ${u.email} created`) }}
            onCancel={() => setShowCreate(false)}
            onError={msg => flash(msg, true)}
          />
        </Modal>
      )}

      {loading ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p> : (
        <>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  {['Name', 'Email', 'Role', 'Farm', 'Last login', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const farm = u.farmId ? farmMap[u.farmId] : null
                  return (
                  <tr key={u.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: '#111827' }}>{u.firstName} {u.lastName}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280' }}>{u.email}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: ROLE_COLORS[u.role] ?? '#e5e7eb', color: ROLE_COLORS[u.role] ? '#fff' : '#374151' }}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {farm ? (
                        <div>
                          <p style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>{farm.name}</p>
                          <p style={{ fontSize: 10, color: '#9ca3af' }}>{farm.subscriptionTier}</p>
                        </div>
                      ) : u.role === 'SUPER_ADMIN' ? (
                        <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Global</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#d97706' }}>Unknown farm</span>
                      )}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#9ca3af' }}>{u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span className={`badge ${u.isEnabled && u.active ? 'badge-green' : u.reactivationRequired ? 'badge-amber' : 'badge-gray'}`}>
                          {u.reactivationRequired ? 'Needs reactivation' : u.isEnabled && u.active ? 'Active' : 'Disabled'}
                        </span>
                        {u.passwordChangeRequired && (
                          <span className="badge badge-amber" style={{ fontSize: 9 }}>Password change required</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button onClick={() => handleToggle(u)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: u.isEnabled ? '#e05252' : '#2d7a50', fontSize: 11, fontFamily: 'inherit', padding: '2px 0', textAlign: 'left' }}>
                          {u.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                        {u.reactivationRequired && (
                          <button onClick={() => handleReactivate(u)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2d7a50', fontSize: 11, fontFamily: 'inherit', padding: '2px 0', textAlign: 'left', fontWeight: 500 }}>
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
                {users.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                className="btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => loadUsers(false)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : `Load more (${total - users.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── CREATE USER FORM ─────────────────────────────────────────────────────────

const NULL_UUID = '00000000-0000-0000-0000-000000000000'

function CreateUserForm({ onCreated, onCancel, onError }: { onCreated: (u: UserDto) => void; onCancel: () => void; onError: (m: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'MANAGER', farmId: '', phoneNumber: '', country: '' })
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    adminFarmsApi.listAll().then(setFarms).catch(() => {})
  }, [])

  const isScout = form.role === 'SCOUT'
  const isSuperAdmin = form.role === 'SUPER_ADMIN'
  const needsFarm = !isSuperAdmin
  const selectedFarm = farms.find(f => f.id === form.farmId)

  // Farm created with null-UUID placeholder needs owner set when first admin/manager assigned
  const farmNeedsOwner = selectedFarm &&
    (form.role === 'FARM_ADMIN' || form.role === 'MANAGER') &&
    (selectedFarm as any).ownerId === NULL_UUID

  async function create() {
    if (!form.email || !form.password || !form.firstName || !form.lastName) { onError('Email, password, first and last name are required'); return }
    if (needsFarm && !form.farmId) {
      onError(isScout ? 'A scout must be assigned to a farm' : 'Farm is required for this role')
      return
    }
    setSaving(true)
    try {
      const body: any = { email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName, role: form.role, phoneNumber: form.phoneNumber || undefined, country: form.country || undefined }
      if (needsFarm) body.farmId = form.farmId
      const newUser = await adminUsersApi.create(body)
      // Auto-update farm owner if it was created with the null-UUID placeholder
      if (farmNeedsOwner && newUser.id) {
        try { await adminFarmsApi.update(form.farmId, { ownerId: newUser.id } as any) }
        catch { console.warn('Could not auto-update farm ownerId') }
      }
      onCreated(newUser)
    } catch (e: any) { onError(e?.response?.data?.message ?? 'Failed to create user') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <FormField label="First name *"><input className="input" value={form.firstName} onChange={e => set('firstName', e.target.value)} /></FormField>
        <FormField label="Last name *"><input className="input" value={form.lastName} onChange={e => set('lastName', e.target.value)} /></FormField>
        <FormField label="Email *"><input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></FormField>
        <FormField label="Temporary password *"><input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} /></FormField>
        <FormField label="Role">
          <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="FARM_ADMIN">Farm Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="SCOUT">Scout</option>
          </select>
        </FormField>
        <FormField label="Phone"><input className="input" value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} /></FormField>
        <FormField label="Country"><input className="input" value={form.country} onChange={e => set('country', e.target.value)} /></FormField>
      </div>

      {/* Farm assignment — shown for all non-super-admin roles */}
      {needsFarm && (
        <div style={{ marginBottom: 12 }}>
          <FormField label={isScout ? 'Assign scout to farm *' : 'Farm *'}>
            <select className="input" value={form.farmId} onChange={e => set('farmId', e.target.value)}>
              <option value="">— Select a farm —</option>
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name} ({f.subscriptionTier})</option>
              ))}
            </select>
          </FormField>

          {/* Auto-owner notice */}
          {farmNeedsOwner && (
            <div style={{ marginTop: 6, padding: '7px 10px', background: '#f0faf4', border: '0.5px solid #a7dcbc', borderRadius: 6, fontSize: 11, color: '#1e5c3a' }}>
              ✓ This farm has no owner yet. <strong>{form.firstName || 'This user'}</strong> will be automatically set as the farm owner when created.
            </div>
          )}

          {isScout && form.farmId && (
            <p style={{ fontSize: 11, color: '#2d7a50', marginTop: 5 }}>
              ✓ Scout will be assigned to {farms.find(f => f.id === form.farmId)?.name}. They can record observations in the mobile app but cannot create or manage sessions.
            </p>
          )}
        </div>
      )}

      {/* Role-specific notices */}
      {isSuperAdmin && (
        <div style={{ background: '#fffbf0', border: '0.5px solid #fde68a', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#d97706', marginBottom: 12 }}>
          Super Admin users are global — not tied to any farm. They can create farms, manage all users, and access all data.
        </div>
      )}
      {isScout && (
        <div style={{ background: '#f0faf4', border: '0.5px solid #a7dcbc', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#1e5c3a', marginBottom: 12 }}>
          Scouts record pest observations in the mobile app. Sessions must be created by a Manager, Farm Admin, or Super Admin before scouts can record data.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create user'}</button>
      </div>
    </div>
  )
}

// ─── CACHE TAB ────────────────────────────────────────────────────────────────

function CacheTab() {
  const [info, setInfo] = useState<CacheInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  const load = useCallback(() => {
    setLoading(true)
    adminCacheApi.info().then(setInfo).catch(() => setInfo(null)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function clearOne(name: string) {
    setClearing(name)
    try { await adminCacheApi.clearNamed(name); flash(`Cache "${name}" cleared`); load() }
    catch { flash('Failed to clear cache', true) }
    finally { setClearing(null) }
  }

  async function clearAll() {
    if (!confirm('Clear ALL caches? This may temporarily slow down the application.')) return
    setClearing('__all__')
    try { await adminCacheApi.clearAll(); flash('All caches cleared'); load() }
    catch { flash('Failed to clear caches', true) }
    finally { setClearing(null) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {error && <Banner type="error">{error}</Banner>}
      {success && <Banner type="success">{success}</Banner>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Redis cache</p>
          {info && <p style={{ fontSize: 12, color: '#6b7280' }}>{info.totalKeys} total keys</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 11 }} onClick={load}>Refresh</button>
          <button style={{ padding: '6px 14px', fontSize: 11, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, border: '0.5px solid #fca5a5', background: '#fff5f5', color: '#c53030' }}
            onClick={clearAll} disabled={clearing === '__all__'}>
            {clearing === '__all__' ? 'Clearing…' : 'Clear all'}
          </button>
        </div>
      </div>

      {loading ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading cache info…</p>
        : !info ? (
          <div style={{ background: '#fff5f5', border: '0.5px solid #fca5a5', borderRadius: 8, padding: 16, fontSize: 12, color: '#c53030' }}>
            Could not load cache stats. The cache admin endpoint may not be available.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  {['Cache name', 'Keys', 'Hit rate', 'Evictions', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {info.caches.map(c => (
                  <tr key={c.name} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Mono, monospace', color: '#111827' }}>{c.name}</td>
                    <td style={{ padding: '9px 14px', fontFamily: 'DM Mono, monospace' }}>{c.size}</td>
                    <td style={{ padding: '9px 14px', color: '#6b7280' }}>{c.hitRate != null ? `${(c.hitRate * 100).toFixed(1)}%` : '—'}</td>
                    <td style={{ padding: '9px 14px', color: '#6b7280' }}>{c.evictions ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <button onClick={() => clearOne(c.name)} disabled={clearing === c.name}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', fontSize: 11, fontFamily: 'inherit', padding: '2px 6px', opacity: clearing === c.name ? 0.5 : 1 }}>
                        {clearing === c.name ? 'Clearing…' : 'Clear'}
                      </button>
                    </td>
                  </tr>
                ))}
                {info.caches.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No caches found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ─── Shared small components ──────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: '100%', maxWidth: 560, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 14, color: '#111827' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 7, padding: '8px 10px' }}>
      <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 12, color: '#374151', fontFamily: mono ? 'DM Mono, monospace' : undefined }}>{value}</p>
    </div>
  )
}

function StatusDot({ status, locked }: { status: string; locked?: boolean }) {
  const color = locked ? '#e05252' : status === 'ACTIVE' ? '#2d7a50' : status === 'SUSPENDED' ? '#d97706' : '#9ca3af'
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function Banner({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 12, ...(type === 'error' ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' } : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' }) }}>
      {children}
    </div>
  )
}
