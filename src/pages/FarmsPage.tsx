import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { farmsApi, adminFarmsApi } from '@/services/api'
import type { FarmResponse, UpdateFarmRequest } from '@/types'
import { formatDate } from '@/utils'
import { useAuthStore } from '@/hooks/useAuth'

export default function FarmsPage() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    // Super admin uses adminFarmsApi for global list, others use farmsApi
    const fetch = isSuperAdmin ? adminFarmsApi.listAll() : farmsApi.list()
    fetch
      .then(data => {
        // Handle both plain array and paged { content: [...] }
        const list = Array.isArray(data) ? data : (data as any).content ?? []
        setFarms(list)
      })
      .catch(() => flash('Could not load farms. Check your connection and try refreshing.', 'error'))
      .finally(() => setLoading(false))
  }, [isSuperAdmin])

  function flash(msg: string, type: 'success' | 'error' = 'success') {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3000)
  }

  const tierColors: Record<string, { bg: string; border: string; color: string }> = {
    BASIC:    { bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280' },
    STANDARD: { bg: '#f0faf4', border: '#a7dcbc', color: '#1e5c3a' },
    PREMIUM:  { bg: '#fffbf0', border: '#fde68a', color: '#d97706' },
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#111827', marginBottom: 4 }}>Farms</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>All farms you have access to</p>
      </div>

      {banner && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          ...(banner.type === 'error'
            ? { background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030' }
            : { background: '#f0faf4', border: '0.5px solid #a7dcbc', color: '#1e5c3a' })
        }}>
          {banner.msg}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading farms…</p>
      ) : farms.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No farms found. Contact your administrator to get access.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {farms.map(farm => {
            const tier = tierColors[farm.subscriptionTier] ?? tierColors.BASIC
            const isExpired = farm.licenseExpiryDate && new Date(farm.licenseExpiryDate) < new Date()
            const isEditing = editingId === farm.id

            return (
              <div key={farm.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

                  {/* Left: identity */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: '#f0faf4', border: '0.5px solid #d6f0e0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, flexShrink: 0,
                    }}>
                      🌿
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{farm.name}</p>
                        <span style={{
                          fontSize: 10, fontWeight: 500,
                          background: tier.bg, borderColor: tier.border, color: tier.color,
                          border: '0.5px solid', borderRadius: 20, padding: '2px 8px',
                        }}>
                          {farm.subscriptionTier}
                        </span>
                        <span className={`badge ${farm.subscriptionStatus === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                          {farm.subscriptionStatus.replace('_', ' ').toLowerCase()}
                        </span>
                        {farm.accessLocked && <span className="badge badge-red">Locked</span>}
                      </div>
                      <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{farm.farmTag}</p>
                    </div>
                  </div>

                  {/* Right: meta + actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '5px 12px' }}
                        onClick={() => navigate(`/?farm=${farm.id}`)}
                      >
                        Dashboard →
                      </button>
                      {isSuperAdmin && (
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 12, padding: '5px 12px' }}
                          onClick={() => setEditingId(isEditing ? null : farm.id)}
                        >
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {farm.licenseExpiryDate && (
                        <MetaItem
                          label="Expires"
                          value={formatDate(farm.licenseExpiryDate)}
                          color={isExpired ? '#c53030' : undefined}
                        />
                      )}
                      {farm.licensedAreaHectares && (
                        <MetaItem label="Area" value={`${farm.licensedAreaHectares} ha`} />
                      )}
                      {(farm.city || farm.country) && (
                        <MetaItem label="Location" value={[farm.city, farm.country].filter(Boolean).join(', ')} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline edit form (super admin only) */}
                {isEditing && (
                  <EditFarmForm
                    farm={farm}
                    onSaved={updated => {
                      setFarms(prev => prev.map(f => f.id === updated.id ? updated : f))
                      setEditingId(null)
                      flash(`"${updated.name}" updated`)
                    }}
                    onCancel={() => setEditingId(null)}
                    onError={msg => flash(msg, 'error')}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Edit farm form ───────────────────────────────────────────────────────────

function EditFarmForm({ farm, onSaved, onCancel, onError }: {
  farm: FarmResponse
  onSaved: (f: FarmResponse) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<UpdateFarmRequest>({
    name: farm.name,
    description: farm.description ?? '',
    address: farm.address ?? '',
    city: farm.city ?? '',
    province: farm.province ?? '',
    postalCode: farm.postalCode ?? '',
    country: farm.country ?? '',
    contactName: farm.contactName ?? '',
    contactEmail: farm.contactEmail ?? '',
    contactPhone: farm.contactPhone ?? '',
    timezone: farm.timezone ?? '',
  })
  const set = (k: keyof UpdateFarmRequest, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      const updated = await adminFarmsApi.update(farm.id, form)
      onSaved(updated)
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      marginTop: 16,
      paddingTop: 16,
      borderTop: '0.5px solid #f3f4f6',
    }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Edit farm details</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
        <Field label="Farm name">
          <input className="input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label="Country">
          <input className="input" value={form.country ?? ''} onChange={e => set('country', e.target.value)} />
        </Field>
        <Field label="City">
          <input className="input" value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
        </Field>
        <Field label="Province / state">
          <input className="input" value={form.province ?? ''} onChange={e => set('province', e.target.value)} />
        </Field>
        <Field label="Postal code">
          <input className="input" value={form.postalCode ?? ''} onChange={e => set('postalCode', e.target.value)} />
        </Field>
        <Field label="Timezone">
          <input className="input" placeholder="America/Toronto" value={form.timezone ?? ''} onChange={e => set('timezone', e.target.value)} />
        </Field>
        <Field label="Contact name">
          <input className="input" value={form.contactName ?? ''} onChange={e => set('contactName', e.target.value)} />
        </Field>
        <Field label="Contact email">
          <input className="input" type="email" value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <input className="input" value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input className="input" value={form.address ?? ''} onChange={e => set('address', e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function MetaItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ fontSize: 10, color: '#9ca3af' }}>{label}</p>
      <p style={{ fontSize: 12, color: color ?? '#374151' }}>{value}</p>
    </div>
  )
}
