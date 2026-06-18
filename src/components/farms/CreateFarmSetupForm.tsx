import { useEffect, useMemo, useState } from 'react'
import { adminFarmsApi, adminUsersApi } from '@/services/api'
import { parseCoordinateInput } from '@/utils/coordinates'
import GreenhouseBayEditor from './GreenhouseBayEditor'
import type {
  CreateFarmRequest,
  FarmFieldBlockDraftRequest,
  FarmGreenhouseDraftRequest,
  FarmLayoutPreviewPoint,
  FarmLayoutPreviewPolygon,
  FarmLayoutPreviewResponse,
  FarmResponse,
  GreenhouseBayRequest,
  UserDto,
} from '@/types'

const NULL_UUID = '00000000-0000-0000-0000-000000000000'

function roundArea(value: number) {
  return Math.round(value * 100) / 100
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function createGreenhouseDraft(): FarmGreenhouseDraftRequest {
  return {
    name: '',
    description: '',
    areaHectares: null,
    active: true,
    bays: [],
  }
}

function createFieldDraft(): FarmFieldBlockDraftRequest {
  return {
    name: '',
    description: '',
    areaHectares: null,
    cropType: '',
    spotChecksPerBay: null,
    active: true,
  }
}

type PreviewPolygon = {
  id: string
  name: string
  points: Array<{ x: number; y: number }>
}

const PREVIEW_COLORS = ['#1e5c3a', '#2d7a50', '#5ba87a', '#87c59f', '#b2dec1', '#dbeee2']

function parsePreviewCoordinate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function polygonPoints(polygon: FarmLayoutPreviewPolygon): FarmLayoutPreviewPoint[] {
  if (Array.isArray(polygon.points)) return polygon.points
  if (Array.isArray(polygon.polygon)) return polygon.polygon
  if (Array.isArray(polygon.coordinates)) return polygon.coordinates
  return []
}

function normalizePreviewPolygons(response: FarmLayoutPreviewResponse | FarmLayoutPreviewPolygon[]): PreviewPolygon[] {
  const rawPolygons = Array.isArray(response) ? response : (Array.isArray(response.polygons) ? response.polygons : [])

  return rawPolygons
    .map((polygon, index) => {
      const points = polygonPoints(polygon)
        .map(point => {
          const x = parsePreviewCoordinate(point.x ?? point.lng ?? point.longitude)
          const y = parsePreviewCoordinate(point.y ?? point.lat ?? point.latitude)
          return x == null || y == null ? null : { x, y }
        })
        .filter((point): point is { x: number; y: number } => point != null)

      if (points.length < 3) return null

      return {
        id: polygon.id ?? `preview-${index}`,
        name: polygon.greenhouseName ?? polygon.targetName ?? polygon.label ?? polygon.name ?? `Greenhouse ${index + 1}`,
        points,
      }
    })
    .filter((polygon): polygon is PreviewPolygon => polygon != null)
}

function formatUserLabel(user: UserDto) {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
  return `${name} (${user.email})`
}

function filterUsers(users: UserDto[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return users
  return users.filter(user => {
    const haystack = [
      user.firstName,
      user.lastName,
      user.email,
      user.role,
      user.phoneNumber,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

async function assignUserToFarm(farmId: string, user: UserDto) {
  if (user.role === 'MANAGER' || user.role === 'FARM_ADMIN') {
    await adminFarmsApi.addMember(farmId, user.id)
    return
  }

  await adminUsersApi.update(user.id, { farmId })
}

function UserSelector({
  users,
  selectedIds,
  onToggle,
  type,
}: {
  users: UserDto[]
  selectedIds: Set<string>
  onToggle: (userId: string) => void
  type: 'radio' | 'checkbox'
}) {
  if (users.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        No matching users found.
      </div>
    )
  }

  return (
    <div
      style={{
        maxHeight: 180,
        overflowY: 'auto',
        border: '0.5px solid #e5e7eb',
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {users.map(user => {
        const checked = selectedIds.has(user.id)
        return (
          <label
            key={user.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 7,
              cursor: 'pointer',
              background: checked ? '#f0faf4' : '#fff',
            }}
          >
            <input
              type={type}
              checked={checked}
              onChange={() => onToggle(user.id)}
            />
            <div>
              <div style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>{formatUserLabel(user)}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{String(user.role).replace(/_/g, ' ')}</div>
            </div>
          </label>
        )
      })}
    </div>
  )
}

function LayoutPreview({ polygons }: { polygons: PreviewPolygon[] }) {
  const width = 640
  const height = 320
  const padding = 28
  const allPoints = polygons.flatMap(polygon => polygon.points)
  const xValues = allPoints.map(point => point.x)
  const yValues = allPoints.map(point => point.y)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)
  const xSpan = Math.max(maxX - minX, 1)
  const ySpan = Math.max(maxY - minY, 1)
  const scale = Math.min((width - padding * 2) / xSpan, (height - padding * 2) / ySpan)

  function toSvgPoint(point: { x: number; y: number }) {
    const x = padding + (point.x - minX) * scale
    const y = height - padding - (point.y - minY) * scale
    return `${x},${y}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ borderRadius: 10, border: '0.5px solid #dbe7df', background: '#f8fbf9', padding: 10 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block', borderRadius: 8, background: 'linear-gradient(180deg, #ffffff 0%, #f3f7f4 100%)' }}>
          {polygons.map((polygon, index) => (
            <g key={polygon.id}>
              <polygon
                points={polygon.points.map(toSvgPoint).join(' ')}
                fill={`${PREVIEW_COLORS[index % PREVIEW_COLORS.length]}1F`}
                stroke={PREVIEW_COLORS[index % PREVIEW_COLORS.length]}
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {polygons.map((polygon, index) => (
          <div key={polygon.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#f9fafb', border: '0.5px solid #e5e7eb' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: PREVIEW_COLORS[index % PREVIEW_COLORS.length], flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{polygon.name}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{polygon.points.length} points</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CreateFarmSetupForm({
  onCreated,
  onCancel,
  onError,
}: {
  onCreated: (farm: FarmResponse) => void
  onCancel: () => void
  onError: (message: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [usersLoading, setUsersLoading] = useState(true)
  const [users, setUsers] = useState<UserDto[]>([])
  const [ownerSearch, setOwnerSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [useNullOwner, setUseNullOwner] = useState(true)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [greenhouses, setGreenhouses] = useState<FarmGreenhouseDraftRequest[]>([])
  const [fieldBlocks, setFieldBlocks] = useState<FarmFieldBlockDraftRequest[]>([])
  const [latitudeInput, setLatitudeInput] = useState('')
  const [longitudeInput, setLongitudeInput] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPolygons, setPreviewPolygons] = useState<PreviewPolygon[]>([])
  const [form, setForm] = useState<CreateFarmRequest>({
    name: '',
    ownerId: NULL_UUID,
    subscriptionStatus: 'PENDING_ACTIVATION',
    subscriptionTier: 'BASIC',
    licensedAreaHectares: 1,
    structureType: 'GREENHOUSE',
    description: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    timezone: 'UTC',
    latitude: undefined,
    longitude: undefined,
    greenhouses: [],
    fieldBlocks: [],
  })

  useEffect(() => {
    let alive = true
    setUsersLoading(true)
    adminUsersApi.list()
      .then(data => {
        if (!alive) return
        const sorted = data
          .filter((user: UserDto) => !user.deleted && user.role !== 'SUPER_ADMIN' && user.role !== 'EDGE_SYNC')
          .sort((a: UserDto, b: UserDto) => formatUserLabel(a).localeCompare(formatUserLabel(b)))
        setUsers(sorted)
      })
      .catch(() => {
        if (alive) setUsers([])
      })
      .finally(() => {
        if (alive) setUsersLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  const filteredOwnerUsers = useMemo(() => filterUsers(users, ownerSearch), [users, ownerSearch])
  const filteredMemberUsers = useMemo(() => filterUsers(users, memberSearch), [users, memberSearch])

  const selectedOwner = users.find(user => user.id === form.ownerId)
  const allocatedArea = roundArea(
    (form.structureType === 'GREENHOUSE' ? greenhouses : fieldBlocks).reduce((sum, structure) => {
      const area = Number(structure.areaHectares ?? 0)
      return sum + (Number.isFinite(area) ? area : 0)
    }, 0),
  )
  const remainingArea = roundArea((Number(form.licensedAreaHectares) || 0) - allocatedArea)
  const overAllocated = remainingArea < 0
  const greenhousePreviewKey = greenhouses.map(greenhouse => greenhouse.name.trim()).join('|')

  function setField<K extends keyof CreateFarmRequest>(key: K, value: CreateFarmRequest[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
  }

  function toggleOwner(userId: string) {
    setUseNullOwner(false)
    setField('ownerId', form.ownerId === userId ? '' : userId)
  }

  function toggleMember(userId: string) {
    setMemberIds(previous => (
      previous.includes(userId)
        ? previous.filter(id => id !== userId)
        : [...previous, userId]
    ))
  }

  function addGreenhouse() {
    setGreenhouses(previous => [...previous, createGreenhouseDraft()])
  }

  function updateGreenhouse(index: number, next: Partial<FarmGreenhouseDraftRequest>) {
    setGreenhouses(previous => previous.map((greenhouse, currentIndex) => (
      currentIndex === index
        ? { ...greenhouse, ...next }
        : greenhouse
    )))
  }

  function removeGreenhouse(index: number) {
    setGreenhouses(previous => previous.filter((_, currentIndex) => currentIndex !== index))
  }

  function addFieldBlock() {
    setFieldBlocks(previous => [...previous, createFieldDraft()])
  }

  function updateFieldBlock(index: number, next: Partial<FarmFieldBlockDraftRequest>) {
    setFieldBlocks(previous => previous.map((fieldBlock, currentIndex) => (
      currentIndex === index
        ? { ...fieldBlock, ...next }
        : fieldBlock
    )))
  }

  function removeFieldBlock(index: number) {
    setFieldBlocks(previous => previous.filter((_, currentIndex) => currentIndex !== index))
  }

  useEffect(() => {
    setPreviewPolygons([])
    setPreviewError(null)
  }, [form.structureType, latitudeInput, longitudeInput, greenhousePreviewKey])

  function cleanGreenhouses() {
    return greenhouses.map(greenhouse => ({
      ...greenhouse,
      name: greenhouse.name.trim(),
      description: greenhouse.description?.trim() || undefined,
      areaHectares: greenhouse.areaHectares == null ? null : Number(greenhouse.areaHectares),
      bays: (greenhouse.bays ?? []).map((bay: GreenhouseBayRequest) => ({
        bayTag: bay.bayTag.trim(),
        bedCount: Math.max(1, Number(bay.bedCount)),
        bedTags: Array.from({ length: Math.max(1, Number(bay.bedCount)) }, (_, index) => bay.bedTags?.[index]?.trim() || `Bed ${index + 1}`),
      })),
    }))
  }

function cleanFieldBlocks() {
  return fieldBlocks.map(fieldBlock => ({
    ...fieldBlock,
    name: fieldBlock.name.trim(),
    description: fieldBlock.description?.trim() || undefined,
    cropType: fieldBlock.cropType?.trim() || undefined,
    areaHectares: fieldBlock.areaHectares == null ? null : Number(fieldBlock.areaHectares),
    spotChecksPerBay: fieldBlock.spotChecksPerBay == null ? null : Number(fieldBlock.spotChecksPerBay),
    bayCount: undefined,
    bayTags: undefined,
  }))
}

  async function createFarm() {
    if (!form.name.trim()) {
      onError('Farm name is required')
      return
    }

    if (!form.licensedAreaHectares || form.licensedAreaHectares <= 0) {
      onError('Licensed area must be greater than 0')
      return
    }

    if (!useNullOwner && !form.ownerId.trim()) {
      onError('Select an owner or keep the placeholder owner option enabled')
      return
    }

    if (overAllocated) {
      onError('Allocated greenhouse or field area exceeds the licensed farm area')
      return
    }

    const cleanedGreenhouses = cleanGreenhouses()
    const cleanedFieldBlocks = cleanFieldBlocks()

    if (form.structureType === 'GREENHOUSE') {
      for (const greenhouse of cleanedGreenhouses) {
        if (!greenhouse.name) {
          onError('Each greenhouse needs a name')
          return
        }
        for (const bay of greenhouse.bays ?? []) {
          if (!bay.bayTag) {
            onError('Each greenhouse bay needs a name or ID')
            return
          }
        }
      }
    }

    if (form.structureType === 'FIELD') {
      for (const fieldBlock of cleanedFieldBlocks) {
        if (!fieldBlock.name) {
          onError('Each field needs a name')
          return
        }
      }
    }

    let latitude: number | undefined
    let longitude: number | undefined

    try {
      latitude = parseCoordinateInput(latitudeInput, 'latitude')
      longitude = parseCoordinateInput(longitudeInput, 'longitude')
    } catch (error: any) {
      onError(error?.message ?? 'Latitude or longitude is invalid')
      return
    }

    const body: CreateFarmRequest = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      address: form.address?.trim() || undefined,
      city: form.city?.trim() || undefined,
      province: form.province?.trim() || undefined,
      postalCode: form.postalCode?.trim() || undefined,
      country: form.country?.trim() || undefined,
      contactName: form.contactName?.trim() || undefined,
      contactEmail: form.contactEmail?.trim() || undefined,
      contactPhone: form.contactPhone?.trim() || undefined,
      timezone: form.timezone?.trim() || undefined,
      latitude,
      longitude,
      ownerId: useNullOwner ? NULL_UUID : form.ownerId,
      greenhouses: form.structureType === 'GREENHOUSE' ? cleanedGreenhouses : [],
      fieldBlocks: form.structureType === 'FIELD' ? cleanedFieldBlocks : [],
    }

    setSaving(true)
    try {
      const created = await adminFarmsApi.create(body)
      const assignments = Array.from(new Set([
        ...(useNullOwner || !form.ownerId ? [] : [form.ownerId]),
        ...memberIds,
      ]))

      if (assignments.length > 0) {
        const results = await Promise.allSettled(
          assignments.map(userId => {
            const assignedUser = users.find(user => user.id === userId)
            return assignedUser
              ? assignUserToFarm(created.id, assignedUser)
              : adminUsersApi.update(userId, { farmId: created.id })
          }),
        )

        const failedAssignments = results.filter(result => result.status === 'rejected').length
        if (failedAssignments > 0) {
          onError(`Farm created, but ${failedAssignments} user assignment${failedAssignments === 1 ? '' : 's'} failed. Open the farm to retry.`)
        }
      }

      onCreated(created)
    } catch (error: any) {
      onError(error?.response?.data?.message ?? 'Failed to create farm')
    } finally {
      setSaving(false)
    }
  }

  async function handlePreviewLayout() {
    if (form.structureType !== 'GREENHOUSE') return

    const greenhouseNames = greenhouses.map(greenhouse => greenhouse.name.trim())

    if (greenhouseNames.length === 0) {
      onError('Add at least one greenhouse before generating a layout preview')
      return
    }

    if (greenhouseNames.some(name => !name)) {
      onError('Name every greenhouse before generating the layout preview')
      return
    }

    if (!latitudeInput.trim() || !longitudeInput.trim()) {
      onError('Enter both latitude and longitude before generating the layout preview')
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)

    try {
      const response = await adminFarmsApi.previewLayout({
        latitude: latitudeInput.trim(),
        longitude: longitudeInput.trim(),
        greenhouseCount: greenhouseNames.length,
        greenhouseNames,
      })
      const normalized = normalizePreviewPolygons(response)

      if (normalized.length === 0) {
        setPreviewPolygons([])
        setPreviewError('The preview endpoint returned no polygons for this layout.')
        return
      }

      setPreviewPolygons(normalized)
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Could not generate the layout preview'
      setPreviewPolygons([])
      setPreviewError(message)
      onError(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <FormField label="Farm name *">
          <input
            className="input"
            placeholder="e.g. Green Valley Farm"
            value={form.name}
            onChange={event => setField('name', event.target.value)}
          />
        </FormField>
        <FormField label="Farm layout *">
          <select className="input" value={form.structureType} onChange={event => setField('structureType', event.target.value as CreateFarmRequest['structureType'])}>
            <option value="GREENHOUSE">Greenhouse</option>
            <option value="FIELD">Field</option>
          </select>
        </FormField>
        <FormField label="Subscription tier">
          <select className="input" value={form.subscriptionTier} onChange={event => setField('subscriptionTier', event.target.value as CreateFarmRequest['subscriptionTier'])}>
            <option value="BASIC">Basic</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </FormField>
        <FormField label="Initial status">
          <select className="input" value={form.subscriptionStatus} onChange={event => setField('subscriptionStatus', event.target.value as CreateFarmRequest['subscriptionStatus'])}>
            <option value="PENDING_ACTIVATION">Pending activation</option>
            <option value="ACTIVE">Active</option>
          </select>
        </FormField>
        <FormField label="Licensed area (ha) *">
          <input
            className="input"
            type="number"
            min={0.01}
            step={0.01}
            value={form.licensedAreaHectares}
            onChange={event => setField('licensedAreaHectares', Number(event.target.value) || 0)}
          />
        </FormField>
        <FormField label="Timezone">
          <input
            className="input"
            placeholder="America/Chicago"
            value={form.timezone ?? ''}
            onChange={event => setField('timezone', event.target.value)}
          />
        </FormField>
        <FormField label="Country">
          <input className="input" value={form.country ?? ''} onChange={event => setField('country', event.target.value)} />
        </FormField>
        <FormField label="Province / State">
          <input className="input" value={form.province ?? ''} onChange={event => setField('province', event.target.value)} />
        </FormField>
        <FormField label="City">
          <input className="input" value={form.city ?? ''} onChange={event => setField('city', event.target.value)} />
        </FormField>
        <FormField label="Postal code">
          <input className="input" value={form.postalCode ?? ''} onChange={event => setField('postalCode', event.target.value)} />
        </FormField>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Address">
            <input className="input" value={form.address ?? ''} onChange={event => setField('address', event.target.value)} />
          </FormField>
        </div>
        <FormField label="Latitude">
          <input
            className="input"
            type="text"
            placeholder="e.g. 51.0447 N"
            value={latitudeInput}
            onChange={event => setLatitudeInput(event.target.value)}
          />
        </FormField>
        <FormField label="Longitude">
          <input
            className="input"
            type="text"
            placeholder="e.g. 114.0719 W"
            value={longitudeInput}
            onChange={event => setLongitudeInput(event.target.value)}
          />
        </FormField>
        <FormField label="Contact name">
          <input className="input" value={form.contactName ?? ''} onChange={event => setField('contactName', event.target.value)} />
        </FormField>
        <FormField label="Contact email">
          <input className="input" type="email" value={form.contactEmail ?? ''} onChange={event => setField('contactEmail', event.target.value)} />
        </FormField>
        <FormField label="Contact phone">
          <input className="input" value={form.contactPhone ?? ''} onChange={event => setField('contactPhone', event.target.value)} />
        </FormField>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Description">
            <input className="input" value={form.description ?? ''} onChange={event => setField('description', event.target.value)} />
          </FormField>
        </div>
      </div>

      <div
        style={{
          marginBottom: 16,
          padding: '10px 12px',
          borderRadius: 8,
          background: overAllocated ? '#fff5f5' : '#f0faf4',
          border: `0.5px solid ${overAllocated ? '#fca5a5' : '#a7dcbc'}`,
          color: overAllocated ? '#c53030' : '#1e5c3a',
          fontSize: 12,
        }}
      >
        Allocated area: {allocatedArea} ha of {roundArea(Number(form.licensedAreaHectares) || 0)} ha. Remaining: {remainingArea} ha.
      </div>

      {form.structureType === 'GREENHOUSE' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', marginBottom: 2 }}>Generated layout preview</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Enter coordinates and greenhouse names, then preview the generated farm polygons before saving.
              </div>
            </div>
            <button className="btn-secondary" type="button" style={{ fontSize: 12 }} onClick={handlePreviewLayout} disabled={previewLoading}>
              {previewLoading ? 'Generating...' : 'Preview layout'}
            </button>
          </div>

          {previewError && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#fff5f5', border: '0.5px solid #fca5a5', color: '#c53030', fontSize: 12 }}>
              {previewError}
            </div>
          )}

          {previewPolygons.length > 0 ? (
            <LayoutPreview polygons={previewPolygons} />
          ) : (
            <div style={{ border: '0.5px dashed #d1d5db', borderRadius: 10, padding: '22px 16px', textAlign: 'center', fontSize: 12, color: '#9ca3af', background: '#f9fafb' }}>
              No preview generated yet.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            border: '0.5px solid #e5e7eb',
            borderRadius: 10,
            padding: 12,
            background: '#fafafa',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 2 }}>Farm owner</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Select an existing owner account, or keep the placeholder owner until the farm team is ready.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', marginBottom: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useNullOwner}
              onChange={event => {
                const nextValue = event.target.checked
                setUseNullOwner(nextValue)
                setField('ownerId', nextValue ? NULL_UUID : '')
              }}
            />
            No owner yet. Use placeholder owner for now.
          </label>
          {!useNullOwner && (
            <>
              <input
                className="input"
                placeholder="Search by name or email"
                value={ownerSearch}
                onChange={event => setOwnerSearch(event.target.value)}
                style={{ marginBottom: 10 }}
              />
              {usersLoading ? (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading users...</div>
              ) : (
                <UserSelector
                  users={filteredOwnerUsers}
                  selectedIds={new Set(form.ownerId ? [form.ownerId] : [])}
                  onToggle={toggleOwner}
                  type="radio"
                />
              )}
              {selectedOwner && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#1e5c3a' }}>
                  Selected owner: {formatUserLabel(selectedOwner)}
                </div>
              )}
            </>
          )}
        </div>

        <div
          style={{
            border: '0.5px solid #e5e7eb',
            borderRadius: 10,
            padding: 12,
            background: '#fafafa',
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 2 }}>Farm members</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Add existing users during creation. Managers and farm admins keep their current farm access; scouts are reassigned to this farm.
            </div>
          </div>
          <input
            className="input"
            placeholder="Search by name or email"
            value={memberSearch}
            onChange={event => setMemberSearch(event.target.value)}
            style={{ marginBottom: 10 }}
          />
          {usersLoading ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading users...</div>
          ) : (
            <UserSelector
              users={filteredMemberUsers}
              selectedIds={new Set(memberIds)}
              onToggle={toggleMember}
              type="checkbox"
            />
          )}
          <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
            {memberIds.length} member{memberIds.length === 1 ? '' : 's'} selected
          </div>
          {memberIds.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
              Manager and farm admin selections become additional memberships. Scout selections become this scout's assigned farm.
            </div>
          )}
        </div>
      </div>

      {form.structureType === 'GREENHOUSE' && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Greenhouses</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Start with zero greenhouses and add each one explicitly, including its bays and bed IDs.
              </div>
            </div>
            <button className="btn-primary" type="button" style={{ fontSize: 11 }} onClick={addGreenhouse}>
              + Add greenhouse
            </button>
          </div>

          {greenhouses.length === 0 ? (
            <div className="card" style={{ padding: 18, color: '#9ca3af', fontSize: 12 }}>
              No greenhouses added yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {greenhouses.map((greenhouse, index) => (
                <div key={index} className="card" style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>Greenhouse {index + 1}</div>
                    <button
                      type="button"
                      onClick={() => removeGreenhouse(index)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
                    <FormField label="Greenhouse name *">
                      <input
                        className="input"
                        value={greenhouse.name}
                        onChange={event => updateGreenhouse(index, { name: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Description">
                      <input
                        className="input"
                        value={greenhouse.description ?? ''}
                        onChange={event => updateGreenhouse(index, { description: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Area (ha)">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={greenhouse.areaHectares ?? ''}
                        onChange={event => updateGreenhouse(index, { areaHectares: parseOptionalNumber(event.target.value) })}
                      />
                    </FormField>
                  </div>
                  <GreenhouseBayEditor
                    bays={greenhouse.bays ?? []}
                    onChange={next => updateGreenhouse(index, { bays: next })}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', marginTop: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={greenhouse.active ?? true}
                      onChange={event => updateGreenhouse(index, { active: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {form.structureType === 'FIELD' && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Fields</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Add each field explicitly. Field area can vary as long as the total stays within the farm area.
              </div>
            </div>
            <button className="btn-primary" type="button" style={{ fontSize: 11 }} onClick={addFieldBlock}>
              + Add field
            </button>
          </div>

          {fieldBlocks.length === 0 ? (
            <div className="card" style={{ padding: 18, color: '#9ca3af', fontSize: 12 }}>
              No fields added yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fieldBlocks.map((fieldBlock, index) => (
                <div key={index} className="card" style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>Field {index + 1}</div>
                    <button
                      type="button"
                      onClick={() => removeFieldBlock(index)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <FormField label="Field name *">
                      <input
                        className="input"
                        value={fieldBlock.name}
                        onChange={event => updateFieldBlock(index, { name: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Description">
                      <input
                        className="input"
                        value={fieldBlock.description ?? ''}
                        onChange={event => updateFieldBlock(index, { description: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Area (ha)">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step={0.01}
                        value={fieldBlock.areaHectares ?? ''}
                        onChange={event => updateFieldBlock(index, { areaHectares: parseOptionalNumber(event.target.value) })}
                      />
                    </FormField>
                    <FormField label="Crop type">
                      <input
                        className="input"
                        value={fieldBlock.cropType ?? ''}
                        onChange={event => updateFieldBlock(index, { cropType: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Spot checks">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        step={1}
                        value={fieldBlock.spotChecksPerBay ?? ''}
                        onChange={event => updateFieldBlock(index, { spotChecksPerBay: parseOptionalNumber(event.target.value) })}
                      />
                    </FormField>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151', marginTop: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fieldBlock.active ?? true}
                      onChange={event => updateFieldBlock(index, { active: event.target.checked })}
                    />
                    Active
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={createFarm} disabled={saving}>
          {saving ? 'Creating...' : 'Create farm'}
        </button>
      </div>
    </div>
  )
}
