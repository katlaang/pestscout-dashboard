import { useState, useEffect, useCallback, type ClipboardEvent } from 'react'
import { useAuthStore } from '@/hooks/useAuth'
import { adminFarmsApi, adminUsersApi } from '@/services/api'
import CreateFarmSetupForm from '@/components/farms/CreateFarmSetupForm'
import StructureDetailsList from '@/components/farms/StructureDetailsList'
import FarmStructureForm from '@/components/farms/StructureForm'
import { formatCoordinateInput, parseCoordinateInput } from '@/utils/coordinates'
import type {
  FarmResponse, GreenhouseResponse, FieldBlockResponse, FarmStructureType,
  UserDto, FarmMemberResponse,
  UpdateFarmLicenseRequest, UpdateFarmRequest,
  CreateFarmRequest, UpdateUserRequest,
} from '@/types'
import { formatDate } from '@/utils'

type Tab = 'farms' | 'users'

function preventPasswordPaste(event: ClipboardEvent<HTMLInputElement>) {
  event.preventDefault()
}

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
        {(['farms', 'users'] as Tab[]).map(t => (
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
    </div>
  )
}

// ─── FARMS TAB ────────────────────────────────────────────────────────────────

function FarmsTab() {
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFarm, setSelectedFarm] = useState<FarmResponse | null>(null)
  const [showCreateFarm, setShowCreateFarm] = useState(false)
  const [showEditFarm, setShowEditFarm] = useState(false)
  const [structures, setStructures] = useState<(GreenhouseResponse | FieldBlockResponse)[]>([])
  const [structLoading, setStructLoading] = useState(false)
  const [editingStructure, setEditingStructure] = useState<GreenhouseResponse | FieldBlockResponse | null>(null)
  const [showCreateStruct, setShowCreateStruct] = useState(false)
  const [expandedStructureId, setExpandedStructureId] = useState<string | null>(null)
  const [members, setMembers] = useState<FarmMemberResponse[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberCandidates, setMemberCandidates] = useState<UserDto[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberSaving, setMemberSaving] = useState(false)
  const [licensePanel, setLicensePanel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // Track accessLocked locally — backend mapToResponse doesn't include this field
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({})

  const isLocked = (farm: FarmResponse) => lockedMap[farm.id] ?? farm.accessLocked ?? false

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  const loadFarms = useCallback(() => {
    setLoading(true)
    adminFarmsApi.listAll()
      .then(data => {
        const list = Array.isArray(data) ? data : (data as any).content ?? []
        setFarms(list)
      })
      .catch(e => flash(`Could not load farms: ${e?.response?.data?.message ?? e?.message ?? 'Unknown error'}`, true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadFarms() }, [loadFarms])

  // Load structures + members when farm changes
  useEffect(() => {
    if (!selectedFarm) return
    setStructLoading(true)
    const structFetch = selectedFarm.structureType === 'FIELD'
      ? adminFarmsApi.listFieldBlocks(selectedFarm.id)
      : selectedFarm.structureType === 'GREENHOUSE'
        ? adminFarmsApi.listGreenhouses(selectedFarm.id)
        : Promise.resolve([])
    structFetch
      .then(setStructures)
      .catch(() => setStructures([]))
      .finally(() => setStructLoading(false))

    setMembersLoading(true)
    adminFarmsApi.listMembers(selectedFarm.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))

    adminUsersApi.list()
      .then(data => {
        const eligible = data
          .filter((user: UserDto) => !user.deleted && user.role !== 'SUPER_ADMIN' && user.role !== 'EDGE_SYNC')
          .sort((a: UserDto, b: UserDto) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
        setMemberCandidates(eligible)
      })
      .catch(() => setMemberCandidates([]))

    setMemberSearch('')
    setSelectedMemberId('')
  }, [selectedFarm])

  async function handleAddMember() {
    if (!selectedFarm) return
    if (!selectedMemberId) {
      flash('Choose an existing person to assign to this farm.', true)
      return
    }

    setMemberSaving(true)
    try {
      const selectedCandidate = memberCandidates.find(candidate => candidate.id === selectedMemberId)
      if (selectedCandidate?.role === 'MANAGER' || selectedCandidate?.role === 'FARM_ADMIN') {
        await adminFarmsApi.addMember(selectedFarm.id, selectedMemberId)
      } else {
        await adminUsersApi.update(selectedMemberId, { farmId: selectedFarm.id })
      }
      const updatedMembers = await adminFarmsApi.listMembers(selectedFarm.id)
      setMembers(updatedMembers)
      setSelectedMemberId('')
      setMemberSearch('')
      flash(selectedCandidate?.role === 'SCOUT' ? 'Scout assigned to farm' : 'User added to farm membership')
    } catch (e: any) {
      flash(e?.response?.data?.message ?? 'Failed to assign user to farm', true)
    } finally {
      setMemberSaving(false)
    }
  }

  async function handleLockToggle(farm: FarmResponse) {
    const newLocked = !isLocked(farm)
    // Update UI immediately — don't wait for backend round-trip
    setLockedMap(prev => ({ ...prev, [farm.id]: newLocked }))
    try {
      await adminFarmsApi.setAccessLocked(farm.id, newLocked, farm)
      flash(`Farm access ${newLocked ? 'locked' : 'unlocked'}`)
    } catch (e: any) {
      // Revert on failure
      setLockedMap(prev => ({ ...prev, [farm.id]: !newLocked }))
      flash(e?.response?.data?.message ?? 'Failed to update farm access', true)
    }
  }

  async function handleDeleteFarm(farm: FarmResponse) {
    if (!confirm(`Archive "${farm.name}"? The farm will be hidden from all users. This can be reversed via the License panel.`)) return
    try {
      await adminFarmsApi.delete(farm.id, farm)
      setFarms(prev => prev.filter(f => f.id !== farm.id))
      if (selectedFarm?.id === farm.id) setSelectedFarm(null)
      flash(`Farm "${farm.name}" archived`)
    } catch (e: any) { flash(e?.response?.data?.message ?? 'Archive failed', true) }
  }

  async function handleDeleteStruct(s: GreenhouseResponse | FieldBlockResponse) {
    if (!selectedFarm) return
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    try {
      if (selectedFarm.structureType === 'FIELD') {
        await adminFarmsApi.deleteFieldBlock(selectedFarm.id, s.id)
      } else {
        await adminFarmsApi.deleteGreenhouse(selectedFarm.id, s.id)
      }
      setStructures(prev => prev.filter(x => x.id !== s.id))
      setExpandedStructureId(current => current === s.id ? null : current)
      flash('Structure deleted')
    } catch (e: any) { flash(e?.response?.data?.message ?? 'Delete failed', true) }
  }

  const structLabel = selectedFarm?.structureType === 'FIELD' ? 'Field block' : 'Greenhouse'
  const existingMemberIds = new Set(
    members.map(member => member.userId ?? member.user?.id).filter(Boolean) as string[],
  )
  const availableMemberUsers = memberCandidates.filter(user => {
    if (existingMemberIds.has(user.id)) return false
    const query = memberSearch.trim().toLowerCase()
    if (!query) return true
    return [
      user.firstName,
      user.lastName,
      user.email,
      user.role,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
  const totalStructureArea = structures.reduce((sum, structure) => {
    const area = 'areaHectares' in structure ? Number(structure.areaHectares ?? 0) : 0
    return sum + (Number.isFinite(area) ? area : 0)
  }, 0)
  const remainingFarmArea = selectedFarm?.licensedAreaHectares != null
    ? Math.max(selectedFarm.licensedAreaHectares - totalStructureArea, 0)
    : Number.POSITIVE_INFINITY
  const remainingAreaForEdit = (structure?: GreenhouseResponse | FieldBlockResponse | null) => {
    if (!selectedFarm?.licensedAreaHectares) return Number.POSITIVE_INFINITY
    const currentArea = structure && 'areaHectares' in structure ? Number(structure.areaHectares ?? 0) : 0
    return Math.max(selectedFarm.licensedAreaHectares - (totalStructureArea - currentArea), 0)
  }
  const structureEditorOpen = showCreateStruct || !!editingStructure
  const anyEditorOpen = showEditFarm || licensePanel || structureEditorOpen

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
                  onClick={() => {
                    setSelectedFarm(farm)
                    setLicensePanel(false)
                    setShowCreateStruct(false)
                    setEditingStructure(null)
                    setShowEditFarm(false)
                    setExpandedStructureId(null)
                  }}
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
                    <p style={{ fontSize: 10, color: '#9ca3af' }}>
                      {farm.farmTag} · {farm.structureType ?? 'No type'}
                    </p>
                  </div>
                  <StatusDot status={farm.subscriptionStatus ?? ''} locked={isLocked(farm)} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: farm detail */}
        <div>
          {!selectedFarm ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Select a farm to manage it
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Farm header */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 16, color: '#111827', marginBottom: 2 }}>{selectedFarm.name}</h2>
                    <p style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{selectedFarm.id}</p>
                  </div>
                  {!anyEditorOpen && (
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => {
                        setShowEditFarm(true)
                        setLicensePanel(false)
                        setShowCreateStruct(false)
                        setEditingStructure(null)
                      }}>
                      Edit
                    </button>
                    <button
                      style={{
                        padding: '5px 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 500, border: '0.5px solid',
                        ...(isLocked(selectedFarm)
                          ? { background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }
                          : { background: '#f0faf4', borderColor: '#a7dcbc', color: '#1e5c3a' })
                      }}
                      onClick={() => handleLockToggle(selectedFarm)}>
                      {isLocked(selectedFarm) ? '🔒 Locked — click to unlock' : '🔓 Unlocked — click to lock'}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => {
                        setLicensePanel(true)
                        setShowEditFarm(false)
                        setShowCreateStruct(false)
                        setEditingStructure(null)
                      }}>
                      License
                    </button>
                    <button
                      style={{ padding: '5px 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, border: '0.5px solid #fca5a5', background: '#fff5f5', color: '#c53030' }}
                      onClick={() => handleDeleteFarm(selectedFarm)}>
                      Archive farm
                    </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <InfoCell label="Layout" value={selectedFarm.structureType ?? '—'} />
                  <InfoCell label="Tier" value={selectedFarm.subscriptionTier ?? '—'} />
                  <InfoCell label="Status" value={selectedFarm.subscriptionStatus?.replace('_', ' ') ?? '—'} />
                  <InfoCell label="Expires" value={selectedFarm.licenseExpiryDate ? formatDate(selectedFarm.licenseExpiryDate) : '—'} />
                  <InfoCell label="Area" value={selectedFarm.licensedAreaHectares ? `${selectedFarm.licensedAreaHectares} ha` : '—'} />
                  <InfoCell label="Location" value={[selectedFarm.city, selectedFarm.country].filter(Boolean).join(', ') || '—'} />
                  <InfoCell label="Access" value={isLocked(selectedFarm) ? '🔒 Locked' : '🔓 Open'} />
                </div>
              </div>

              {/* Inline edit form */}
              {showEditFarm && (
                <EditFarmDetailsForm
                  farm={selectedFarm}
                  onSaved={updated => {
                    setFarms(prev => prev.map(f => f.id === updated.id ? updated : f))
                    setSelectedFarm(updated)
                    setShowEditFarm(false)
                    flash('Farm updated')
                  }}
                  onCancel={() => setShowEditFarm(false)}
                  onError={msg => flash(msg, true)}
                />
              )}

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

              {/* Structures — only for GREENHOUSE or FIELD farms */}
              {selectedFarm.structureType !== 'OTHER' && (
                <div className="card">
                  <div className="card-title">
                    <span>{structLabel}s ({structures.length})</span>
                    {!showEditFarm && !licensePanel && !structureEditorOpen && (
                      <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => {
                          setShowCreateStruct(true)
                          setEditingStructure(null)
                          setShowEditFarm(false)
                          setLicensePanel(false)
                        }}>
                        + Add {structLabel.toLowerCase()}
                      </button>
                    )}
                  </div>

                  {selectedFarm.licensedAreaHectares != null && (
                    <div style={{
                      marginTop: 10,
                      marginBottom: 6,
                      padding: '8px 10px',
                      borderRadius: 7,
                      background: '#f0faf4',
                      border: '0.5px solid #a7dcbc',
                      fontSize: 12,
                      color: '#1e5c3a',
                    }}>
                      {`Allocated ${Math.round(totalStructureArea * 100) / 100} ha of ${selectedFarm.licensedAreaHectares} ha. Remaining ${Math.round(Math.max(remainingFarmArea, 0) * 100) / 100} ha.`}
                    </div>
                  )}

                  {showCreateStruct && (
                    <FarmStructureForm
                      farmId={selectedFarm.id}
                      farmType={selectedFarm.structureType ?? 'GREENHOUSE'}
                      farm={selectedFarm}
                      remainingAreaHectares={remainingFarmArea}
                      onSaved={s => {
                        setStructures(prev => [...prev, s])
                        setShowCreateStruct(false)
                        setExpandedStructureId(s.id)
                        flash(`${structLabel} created`)
                      }}
                      onCancel={() => setShowCreateStruct(false)}
                      onError={msg => flash(msg, true)}
                    />
                  )}

                  {editingStructure && (
                    <FarmStructureForm
                      farmId={selectedFarm.id}
                      farmType={selectedFarm.structureType ?? 'GREENHOUSE'}
                      farm={selectedFarm}
                      existing={editingStructure}
                      remainingAreaHectares={remainingAreaForEdit(editingStructure)}
                      onSaved={updated => {
                        setStructures(prev => prev.map(s => s.id === updated.id ? updated : s))
                        setEditingStructure(null)
                        setExpandedStructureId(updated.id)
                        flash(`${structLabel} updated`)
                      }}
                      onCancel={() => setEditingStructure(null)}
                      onError={msg => flash(msg, true)}
                    />
                  )}

                  {structLoading ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0' }}>Loading…</p>
                  ) : structures.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0' }}>
                      No {structLabel.toLowerCase()}s yet. Click "+ Add {structLabel.toLowerCase()}" to create one.
                    </p>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <StructureDetailsList
                        farmType={selectedFarm.structureType ?? 'GREENHOUSE'}
                        structures={structures}
                        expandedStructureId={expandedStructureId}
                        onToggleExpanded={structureId => setExpandedStructureId(current => current === structureId ? null : structureId)}
                        canEdit={!showEditFarm && !licensePanel && !structureEditorOpen}
                        onEdit={structure => {
                          setEditingStructure(structure)
                          setShowCreateStruct(false)
                          setShowEditFarm(false)
                          setLicensePanel(false)
                        }}
                        onDelete={structure => void handleDeleteStruct(structure)}
                      />
                    </div>
                  )}
                </div>
              )}

              {selectedFarm.structureType === 'OTHER' && (
                <div className="card" style={{ background: '#f9fafb' }}>
                  <p style={{ fontSize: 12, color: '#6b7280' }}>
                    This farm has layout type <strong>Other</strong>. Structures can be added once the layout type is updated via Edit.
                  </p>
                </div>
              )}

              {/* Members */}
              <div className="card">
                <div className="card-title">
                  <span>Farm members ({members.length})</span>
                </div>
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 8,
                    border: '0.5px solid #dbe7df',
                    background: '#f9fafb',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 2 }}>
                    Add existing person
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
                    Assign an existing user to this farm without changing their current role. Managers and farm admins keep existing farms; scouts move to this farm.
                  </div>
                  <input
                    className="input"
                    placeholder="Search by name or email"
                    value={memberSearch}
                    onChange={event => setMemberSearch(event.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      border: '0.5px solid #e5e7eb',
                      borderRadius: 8,
                      background: '#fff',
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {availableMemberUsers.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        No available people match this search.
                      </div>
                    ) : (
                      availableMemberUsers.map(user => (
                        <label
                          key={user.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 7,
                            cursor: 'pointer',
                            background: selectedMemberId === user.id ? '#f0faf4' : '#fff',
                          }}
                        >
                          <input
                            type="radio"
                            checked={selectedMemberId === user.id}
                            onChange={() => setSelectedMemberId(user.id)}
                          />
                          <div>
                            <div style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>
                              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>
                              {user.email} · {String(user.role).replace(/_/g, ' ')}
                            </div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleAddMember} disabled={memberSaving}>
                      {memberSaving ? 'Assigning...' : 'Assign to farm'}
                    </button>
                  </div>
                </div>
                {membersLoading ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Loading…</p>
                ) : members.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>
                    No members yet. Use the assign-person section above or create users via the Users tab.
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
                      {members.map((m: any) => {
                        // Backend may return user nested or flat on the member object
                        const firstName = m.user?.firstName ?? m.firstName ?? ''
                        const lastName  = m.user?.lastName  ?? m.lastName  ?? ''
                        const email     = m.user?.email     ?? m.email     ?? '—'
                        const role      = m.role ?? m.user?.role ?? '—'
                        const joinedAt  = m.joinedAt ?? m.createdAt ?? ''
                        return (
                          <tr key={m.userId ?? m.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                            <td style={{ padding: '8px', fontWeight: 500, color: '#111827' }}>{firstName} {lastName}</td>
                            <td style={{ padding: '8px', color: '#6b7280' }}>{email}</td>
                            <td style={{ padding: '8px' }}>
                              <span className={`badge ${role === 'MANAGER' ? 'badge-green' : role === 'FARM_ADMIN' ? 'badge-amber' : 'badge-gray'}`}>
                                {String(role).replace('_', ' ').toLowerCase()}
                              </span>
                            </td>
                            <td style={{ padding: '8px', color: '#9ca3af' }}>{joinedAt ? formatDate(joinedAt) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateFarm && (
        <Modal title="Create new farm" maxWidth={980} onClose={() => setShowCreateFarm(false)}>
          <CreateFarmSetupForm
            onCreated={farm => { setFarms(prev => [...prev, farm]); setSelectedFarm(farm); setShowCreateFarm(false); flash(`Farm "${farm.name}" created`) }}
            onCancel={() => setShowCreateFarm(false)}
            onError={msg => flash(msg, true)}
          />
        </Modal>
      )}
    </div>
  )
}

// ─── EDIT FARM DETAILS FORM ───────────────────────────────────────────────────

function EditFarmDetailsForm({ farm, onSaved, onCancel, onError }: {
  farm: FarmResponse; onSaved: (f: FarmResponse) => void; onCancel: () => void; onError: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [latitudeInput, setLatitudeInput] = useState(formatCoordinateInput(farm.latitude))
  const [longitudeInput, setLongitudeInput] = useState(formatCoordinateInput(farm.longitude))
  const [ownerId, setOwnerId] = useState(farm.ownerId ?? '')
  const [form, setForm] = useState<UpdateFarmRequest>({
    name: farm.name, city: farm.city ?? '', country: farm.country ?? '',
    province: farm.province ?? '', postalCode: farm.postalCode ?? '',
    address: farm.address ?? '', timezone: farm.timezone ?? '',
    contactName: farm.contactName ?? '', contactEmail: farm.contactEmail ?? '',
    contactPhone: farm.contactPhone ?? '', description: farm.description ?? '',
  })
  const s = (k: keyof UpdateFarmRequest, v: string | number | undefined) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    let latitude: number | undefined
    let longitude: number | undefined

    try {
      latitude = parseCoordinateInput(latitudeInput, 'latitude')
      longitude = parseCoordinateInput(longitudeInput, 'longitude')
    } catch (e: any) {
      onError(e?.message ?? 'Latitude or longitude is invalid')
      return
    }

    setSaving(true)
    try { onSaved(await adminFarmsApi.update(farm.id, farm, { ...form, latitude, longitude, ownerId: ownerId.trim() || undefined })) }
    catch (e: any) { onError(e?.response?.data?.message ?? 'Update failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="card" style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Edit farm details</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <FormField label="Name"><input className="input" value={form.name ?? ''} onChange={e => s('name', e.target.value)} /></FormField>
        <FormField label="Country"><input className="input" value={form.country ?? ''} onChange={e => s('country', e.target.value)} /></FormField>
        <FormField label="City"><input className="input" value={form.city ?? ''} onChange={e => s('city', e.target.value)} /></FormField>
        <FormField label="Province"><input className="input" value={form.province ?? ''} onChange={e => s('province', e.target.value)} /></FormField>
        <FormField label="Postal code"><input className="input" value={form.postalCode ?? ''} onChange={e => s('postalCode', e.target.value)} /></FormField>
        <FormField label="Timezone"><input className="input" placeholder="America/Toronto" value={form.timezone ?? ''} onChange={e => s('timezone', e.target.value)} /></FormField>
        <FormField label="Contact name"><input className="input" value={form.contactName ?? ''} onChange={e => s('contactName', e.target.value)} /></FormField>
        <FormField label="Contact email"><input className="input" type="email" value={form.contactEmail ?? ''} onChange={e => s('contactEmail', e.target.value)} /></FormField>
        <FormField label="Contact phone"><input className="input" value={form.contactPhone ?? ''} onChange={e => s('contactPhone', e.target.value)} /></FormField>
        <FormField label="Latitude">
          <input className="input" type="text" placeholder="e.g. 51.0447 N"
            value={latitudeInput} onChange={e => setLatitudeInput(e.target.value)} />
        </FormField>
        <FormField label="Longitude">
          <input className="input" type="text" placeholder="e.g. 114.0719 W"
            value={longitudeInput} onChange={e => setLongitudeInput(e.target.value)} />
        </FormField>
        <FormField label="Owner (User ID)">
          <input className="input" placeholder="User UUID" value={ownerId} onChange={e => setOwnerId(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Address"><input className="input" value={form.address ?? ''} onChange={e => s('address', e.target.value)} /></FormField>
      <div style={{ marginTop: 8 }}>
        <FormField label="Description"><input className="input" placeholder="Optional farm description" value={form.description ?? ''} onChange={e => s('description', e.target.value)} /></FormField>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
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
    try { onSaved(await adminFarmsApi.updateLicense(farm.id, form, farm)) }
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
            {['PENDING_ACTIVATION','ACTIVE','SUSPENDED','CANCELLED'].map(s => (
              <option key={s} value={s}>{s.replace('_',' ')}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Tier">
          <select className="input" value={form.subscriptionTier}
            onChange={e => setForm(p => ({ ...p, subscriptionTier: e.target.value as any }))}>
            {['BASIC','STANDARD','PREMIUM'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Licensed area (ha)">
          <input className="input" type="number" value={form.licensedAreaHectares ?? ''}
            onChange={e => setForm(p => ({ ...p, licensedAreaHectares: e.target.value ? Number(e.target.value) : undefined }))} />
        </FormField>
        <FormField label="License start date">
          <input className="input" type="date" value={(form as any).licenseStartDate?.slice(0,10) ?? ''}
            onChange={e => setForm(p => ({ ...p, licenseStartDate: e.target.value || undefined } as any))} />
        </FormField>
        <FormField label="Expiry date">
          <input className="input" type="date" value={form.licenseExpiryDate?.slice(0,10) ?? ''}
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
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save license'}</button>
      </div>
    </div>
  )
}

// ─── CREATE FARM FORM ─────────────────────────────────────────────────────────

function CreateFarmForm({ onCreated, onCancel, onError }: { onCreated: (f: FarmResponse) => void; onCancel: () => void; onError: (m: string) => void }) {
  const { user } = useAuthStore()
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'
  const [saving, setSaving] = useState(false)
  const [useNullOwner, setUseNullOwner] = useState(!user?.id)
  const [form, setForm] = useState<CreateFarmRequest>({
    name: '', ownerId: user?.id ?? NULL_UUID,
    subscriptionStatus: 'PENDING_ACTIVATION', licensedAreaHectares: 1,
    subscriptionTier: 'BASIC', structureType: 'GREENHOUSE',
    country: '', city: '', timezone: 'UTC', contactEmail: '',
    fieldBlocks: [], greenhouses: [],
  })
  const set = (k: keyof CreateFarmRequest, v: string | number | undefined) => setForm(p => ({ ...p, [k]: v }))

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
        <FormField label="Farm layout *">
          <select className="input" value={form.structureType} onChange={e => set('structureType', e.target.value)}>
            <option value="GREENHOUSE">Greenhouse</option>
            <option value="FIELD">Field</option>
            <option value="OTHER">Other</option>
          </select>
        </FormField>
        <FormField label="Subscription tier">
          <select className="input" value={form.subscriptionTier} onChange={e => set('subscriptionTier', e.target.value)}>
            <option value="BASIC">Basic</option>
            <option value="STANDARD">Standard</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </FormField>
        <FormField label="Initial status">
          <select className="input" value={form.subscriptionStatus} onChange={e => set('subscriptionStatus', e.target.value)}>
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
          <input className="input" value={form.country ?? ''} onChange={e => set('country', e.target.value)} />
        </FormField>
        <FormField label="City">
          <input className="input" value={form.city ?? ''} onChange={e => set('city', e.target.value)} />
        </FormField>
        <FormField label="Contact email">
          <input className="input" type="email" value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)} />
        </FormField>
        <FormField label="Timezone">
          <input className="input" placeholder="America/Toronto" value={form.timezone ?? ''} onChange={e => set('timezone', e.target.value)} />
        </FormField>
        <FormField label="Contact name">
          <input className="input" value={form.contactName ?? ''} onChange={e => set('contactName', e.target.value)} />
        </FormField>
        <FormField label="Contact phone">
          <input className="input" value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value)} />
        </FormField>
      </div>
      <div style={{
        marginBottom: 14,
        padding: '8px 10px',
        borderRadius: 7,
        background: '#f0faf4',
        border: '0.5px solid #a7dcbc',
        fontSize: 12,
        color: '#1e5c3a',
      }}>
        Farm creation starts with zero bays and beds shown. Add greenhouse or field structures explicitly after the farm is created.
      </div>
      <div style={{ display: 'none' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 8 }}>Default structure counts (optional — backend uses system defaults if blank)</p>
      <div style={{ display: 'none', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        <FormField label={form.structureType === 'FIELD' ? 'Default bays (rows)' : 'Default bays'}>
          <input className="input" type="number" min={1} placeholder="System default"
            value={form.defaultBayCount ?? ''} onChange={e => set('defaultBayCount', e.target.value ? Number(e.target.value) : undefined)} />
        </FormField>
        {form.structureType !== 'FIELD' && (
          <FormField label="Default benches/bay">
            <input className="input" type="number" min={1} placeholder="System default"
              value={form.defaultBenchesPerBay ?? ''} onChange={e => set('defaultBenchesPerBay', e.target.value ? Number(e.target.value) : undefined)} />
          </FormField>
        )}
        <FormField label={form.structureType === 'FIELD' ? 'Default spots/bay' : 'Default spots/bench'}>
          <input className="input" type="number" min={1} placeholder="System default"
            value={form.defaultSpotChecksPerBench ?? ''} onChange={e => set('defaultSpotChecksPerBench', e.target.value ? Number(e.target.value) : undefined)} />
        </FormField>
      </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FormField label="Farm owner (User ID) *">
          <input className="input" value={form.ownerId} disabled={useNullOwner}
            style={{ opacity: useNullOwner ? 0.5 : 1 }}
            onChange={e => set('ownerId', e.target.value)} />
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, cursor: 'pointer', fontSize: 12, color: '#374151' }}>
          <input type="checkbox" checked={useNullOwner} onChange={e => { setUseNullOwner(e.target.checked); set('ownerId', e.target.checked ? NULL_UUID : (user?.id ?? NULL_UUID)) }} />
          No owner yet — use placeholder (all zeroes)
        </label>
        {useNullOwner && (
          <div style={{ marginTop: 6, padding: '7px 10px', background: '#fffbf0', border: '0.5px solid #fde68a', borderRadius: 6, fontSize: 11, color: '#d97706' }}>
            Farm will be created with a placeholder owner. When you create the first Farm Admin or Manager for this farm, they will be automatically set as the owner.
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={create} disabled={saving}>{saving ? 'Creating…' : 'Create farm'}</button>
      </div>
    </div>
  )
}

// ─── STRUCTURE FORM (Greenhouse or Field block, create + edit) ────────────────

function StructureForm({ farmId, farmType, farm, existing, onSaved, onCancel, onError }: {
  farmId: string; farmType: FarmStructureType; farm: FarmResponse
  existing?: GreenhouseResponse | FieldBlockResponse | null
  onSaved: (s: GreenhouseResponse | FieldBlockResponse) => void
  onCancel: () => void; onError: (m: string) => void
}) {
  const isField = farmType === 'FIELD'
  const isEdit  = !!existing
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [bayCount, setBayCount] = useState(existing?.bayCount != null ? String(existing.bayCount) : '')
  const [benchesPerBay, setBenchesPerBay] = useState(
    !isField && (existing as GreenhouseResponse)?.benchesPerBay != null
      ? String((existing as GreenhouseResponse).benchesPerBay) : '')
  const [spotChecks, setSpotChecks] = useState(
    isField
      ? (existing as FieldBlockResponse)?.spotChecksPerBay != null ? String((existing as FieldBlockResponse).spotChecksPerBay) : ''
      : (existing as GreenhouseResponse)?.spotChecksPerBench != null ? String((existing as GreenhouseResponse).spotChecksPerBench) : '')
  const [bayTagsRaw, setBayTagsRaw] = useState(
    isField ? ((existing as FieldBlockResponse)?.bayTags ?? []).join(', ') : '')
  const [active, setActive] = useState(existing ? existing.active : true)

  async function save() {
    if (!name.trim()) { onError('Name is required'); return }
    setSaving(true)
    try {
      if (isField) {
        const body = { farmId, name, description: description || undefined,
          bayCount: bayCount ? Number(bayCount) : null,
          spotChecksPerBay: spotChecks ? Number(spotChecks) : null,
          bayTags: bayTagsRaw ? bayTagsRaw.split(',').map(t => t.trim()).filter(Boolean) : undefined, active }
        onSaved(isEdit ? await adminFarmsApi.updateFieldBlock(farmId, existing!.id, body) : await adminFarmsApi.createFieldBlock(farmId, body))
      } else {
        const body = { farmId, name, description: description || undefined,
          bayCount: bayCount ? Number(bayCount) : null,
          benchesPerBay: benchesPerBay ? Number(benchesPerBay) : null,
          spotChecksPerBench: spotChecks ? Number(spotChecks) : null, active }
        onSaved(isEdit ? await adminFarmsApi.updateGreenhouse(farmId, existing!.id, body) : await adminFarmsApi.createGreenhouse(farmId, body))
      }
    } catch (e: any) { onError(e?.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'}`) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
        {isEdit ? `Edit ${isField ? 'field block' : 'greenhouse'}` : `New ${isField ? 'field block' : 'greenhouse'}`}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
        <FormField label="Name *">
          <input className="input" placeholder={isField ? 'e.g. Block A' : 'e.g. Greenhouse A'}
            value={name} onChange={e => setName(e.target.value)} />
        </FormField>
        <FormField label="Description">
          <input className="input" value={description} onChange={e => setDescription(e.target.value)} />
        </FormField>
        <FormField label={`Bays${isField ? ' (rows)' : ''} — leave blank to use farm default${farm.defaultBayCount != null ? ` (${farm.defaultBayCount})` : ''}`}>
          <input className="input" type="number" min={1} placeholder="Blank = farm default"
            value={bayCount} onChange={e => setBayCount(e.target.value)} />
        </FormField>
        {!isField && (
          <FormField label={`Benches/bay — leave blank to use farm default${farm.defaultBenchesPerBay != null ? ` (${farm.defaultBenchesPerBay})` : ''}`}>
            <input className="input" type="number" min={1} placeholder="Blank = farm default"
              value={benchesPerBay} onChange={e => setBenchesPerBay(e.target.value)} />
          </FormField>
        )}
        <FormField label={`${isField ? 'Spots/bay' : 'Spots/bench'} — leave blank to use farm default${farm.defaultSpotChecksPerBench != null ? ` (${farm.defaultSpotChecksPerBench})` : ''}`}>
          <input className="input" type="number" min={1} placeholder="Blank = farm default"
            value={spotChecks} onChange={e => setSpotChecks(e.target.value)} />
        </FormField>
        {isField && (
          <FormField label="Bay tags — comma-separated (optional)">
            <input className="input" placeholder="Row-1, Row-2, Row-3"
              value={bayTagsRaw} onChange={e => setBayTagsRaw(e.target.value)} />
          </FormField>
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 10 }}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 11 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : `Create ${isField ? 'field block' : 'greenhouse'}`}
        </button>
      </div>
    </div>
  )
}



function UsersTab() {
  const [users, setUsers] = useState<UserDto[]>([])
  const [farms, setFarms] = useState<FarmResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null)
  const [roleFilter, setRoleFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [farmFilter, setFarmFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEditUser, setShowEditUser] = useState(false)
  const [passwordResetUser, setPasswordResetUser] = useState<UserDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    adminFarmsApi.listAll()
      .then(data => setFarms(Array.isArray(data) ? data : (data as any).content ?? []))
      .catch(() => {})
  }, [])

  const farmMap = Object.fromEntries(farms.map(f => [f.id, f]))

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(null), 3000) }
  }

  const loadUsers = useCallback(() => {
    setLoading(true)
    adminUsersApi.list({
      farmId: farmFilter || undefined,
      role:   roleFilter || undefined,
    }).then((items: UserDto[]) => {
      // Client-side filter by email since the backend doesn't support it as a param
      const filtered = emailFilter
        ? items.filter(u => u.email.toLowerCase().includes(emailFilter.toLowerCase()))
        : items
      setUsers(filtered)
      setTotal(filtered.length)
    }).catch((e: any) => {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Unknown error'
      console.error('[PestScout] Failed to load users:', e?.response?.status, msg, e?.response?.data)
      flash(`Could not load users: ${msg}`, true)
    }).finally(() => setLoading(false))
  }, [roleFilter, emailFilter, farmFilter])

  useEffect(() => { loadUsers() }, [roleFilter, emailFilter, farmFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(u: UserDto) {
    try {
      const updated = await adminUsersApi.setEnabled(u.id, !u.isEnabled)
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      if (selectedUser?.id === u.id) setSelectedUser(updated)
      flash(`User ${updated.isEnabled ? 'enabled' : 'disabled'}`)
    } catch { flash('Failed to update user', true) }
  }

  async function handleReactivate(u: UserDto) {
    try {
      const updated = await adminUsersApi.reactivate(u.id)
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      if (selectedUser?.id === u.id) setSelectedUser(updated)
      flash(`${u.firstName} ${u.lastName} reactivated`)
    } catch (e: any) { flash(e?.response?.data?.message ?? 'Reactivation failed', true) }
  }

  const ROLE_COLORS: Record<string, string> = {
    SUPER_ADMIN: '#1e5c3a', FARM_ADMIN: '#2d7a50', MANAGER: '#164530', SCOUT: '#4b5563', EDGE_SYNC: '#6b7280',
  }

  return (
    <div>
      {error && <Banner type="error">{error}</Banner>}
      {success && <Banner type="success">{success}</Banner>}

      {/* Filters */}
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
          {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{users.length} / {total} users</span>
        <button className="btn-primary" style={{ fontSize: 11, padding: '5px 12px' }}
          onClick={() => setShowCreate(true)}>+ New user</button>
      </div>

      {showCreate && (
        <Modal title="Create user" onClose={() => setShowCreate(false)}>
          <CreateUserForm
            onCreated={u => {
              setUsers(prev => [u, ...prev])
              setSelectedUser(u)
              setShowCreate(false)
              flash(`User ${u.email} created`)
            }}
            onCancel={() => setShowCreate(false)}
            onError={msg => flash(msg, true)}
          />
        </Modal>
      )}

      {passwordResetUser && (
        <Modal title="Assign temporary password" onClose={() => setPasswordResetUser(null)} maxWidth={460}>
          <TemporaryPasswordForm
            user={passwordResetUser}
            onSaved={updated => {
              setUsers(prev => prev.map(user => user.id === updated.id ? updated : user))
              if (selectedUser?.id === updated.id) setSelectedUser(updated)
              setPasswordResetUser(null)
              flash('Temporary password assigned. The user must change it after login.')
            }}
            onCancel={() => setPasswordResetUser(null)}
            onError={msg => flash(msg, true)}
          />
        </Modal>
      )}

      {loading ? <p style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 340px' : '1fr', gap: 16 }}>

          {/* User list */}
          <div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {['Name', 'Email', 'Role', 'Farm', 'Last login', 'Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '0.5px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const farm = u.farmId ? farmMap[u.farmId] : null
                    const isSelected = selectedUser?.id === u.id
                    return (
                      <tr key={u.id}
                        onClick={() => { setSelectedUser(isSelected ? null : u); setShowEditUser(false) }}
                        style={{
                          borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer',
                          background: isSelected ? '#f0faf4' : undefined,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 500, color: '#111827' }}>
                          {u.firstName} {u.lastName}
                        </td>
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
                            <span style={{ fontSize: 11, color: '#d97706' }}>No farm</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', color: '#9ca3af' }}>{u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span className={`badge ${u.isEnabled && u.active ? 'badge-green' : u.reactivationRequired ? 'badge-amber' : 'badge-gray'}`}>
                              {u.reactivationRequired ? 'Needs reactivation' : u.isEnabled && u.active ? 'Active' : 'Disabled'}
                            </span>
                            {u.passwordChangeRequired && (
                              <span className="badge badge-amber" style={{ fontSize: 9 }}>Pw change required</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* User detail panel */}
          {selectedUser && (
            <div className="card" style={{ alignSelf: 'start', position: 'sticky', top: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: '#f0faf4', border: '0.5px solid #a7dcbc',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 600, color: '#1e5c3a', marginBottom: 8,
                  }}>
                    {[selectedUser.firstName?.[0], selectedUser.lastName?.[0]].filter(Boolean).join('').toUpperCase()}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                    {selectedUser.firstName} {selectedUser.lastName}
                  </p>
                  <p style={{ fontSize: 11, color: '#6b7280' }}>{selectedUser.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    onClick={() => setShowEditUser(prev => !prev)}
                    className="btn-secondary"
                    style={{ fontSize: 11, padding: '4px 10px' }}>
                    {showEditUser ? 'Cancel' : 'Edit'}
                  </button>
                  <button onClick={() => { setSelectedUser(null); setShowEditUser(false) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}>×</button>
                </div>
              </div>

              {/* Role badge */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: ROLE_COLORS[selectedUser.role] ?? '#e5e7eb', color: ROLE_COLORS[selectedUser.role] ? '#fff' : '#374151' }}>
                  {selectedUser.role.replace('_', ' ')}
                </span>
              </div>

              {/* Inline edit form */}
              {showEditUser ? (
                <EditUserForm
                  user={selectedUser}
                  farms={farms}
                  onSaved={updated => {
                    setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
                    setSelectedUser(updated)
                    setShowEditUser(false)
                    flash(`${updated.firstName} ${updated.lastName} updated`)
                  }}
                  onCancel={() => setShowEditUser(false)}
                  onError={msg => flash(msg, true)}
                />
              ) : (
                <>
                  {/* Detail rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, marginBottom: 14 }}>
                    {[
                      { label: 'Customer #', value: selectedUser.customerNumber },
                      { label: 'Phone', value: selectedUser.phoneNumber || '—' },
                      { label: 'Country', value: selectedUser.country || '—' },
                      { label: 'Farm', value: selectedUser.farmId ? (farmMap[selectedUser.farmId]?.name ?? selectedUser.farmId.slice(0,8) + '…') : selectedUser.role === 'SUPER_ADMIN' ? 'Global (no farm)' : '—' },
                      { label: 'Farm tier', value: selectedUser.farmId ? (farmMap[selectedUser.farmId]?.subscriptionTier ?? '—') : '—' },
                      { label: 'Last login', value: selectedUser.lastLogin ? formatDate(selectedUser.lastLogin) : 'Never' },
                      { label: 'Last activity', value: selectedUser.lastActivityAt ? formatDate(selectedUser.lastActivityAt) : '—' },
                      { label: 'Created', value: formatDate(selectedUser.createdAt) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '0.5px solid #f9fafb' }}>
                        <span style={{ color: '#9ca3af', flexShrink: 0 }}>{label}</span>
                        <span style={{ color: '#374151', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status flags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                    <span className={`badge ${selectedUser.isEnabled && selectedUser.active ? 'badge-green' : 'badge-gray'}`}>
                      {selectedUser.isEnabled && selectedUser.active ? 'Active' : 'Disabled'}
                    </span>
                    {selectedUser.passwordChangeRequired && <span className="badge badge-amber">Pw change required</span>}
                    {selectedUser.reactivationRequired && <span className="badge badge-red">Needs reactivation</span>}
                    {selectedUser.deleted && <span className="badge badge-red">Deleted</span>}
                    {selectedUser.temporaryPasswordExpiresAt && (
                      <span className="badge badge-amber">
                        Temp pw expires {formatDate(selectedUser.temporaryPasswordExpiresAt)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <button
                      onClick={() => setPasswordResetUser(selectedUser)}
                      className="btn-secondary"
                      style={{ width: '100%', fontSize: 12 }}
                    >
                      Assign temporary password
                    </button>
                    <button
                      onClick={() => handleToggle(selectedUser)}
                      style={{
                        padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 500, border: '0.5px solid', width: '100%',
                        ...(selectedUser.isEnabled
                          ? { background: '#fff5f5', borderColor: '#fca5a5', color: '#c53030' }
                          : { background: '#f0faf4', borderColor: '#a7dcbc', color: '#1e5c3a' })
                      }}>
                      {selectedUser.isEnabled ? 'Disable account' : 'Enable account'}
                    </button>
                    {selectedUser.reactivationRequired && (
                      <button onClick={() => handleReactivate(selectedUser)}
                        style={{ padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, border: '0.5px solid #a7dcbc', background: '#f0faf4', color: '#1e5c3a', width: '100%' }}>
                        Reactivate account
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── EDIT USER FORM ───────────────────────────────────────────────────────────

function EditUserForm({ user, farms, onSaved, onCancel, onError }: {
  user: UserDto
  farms: FarmResponse[]
  onSaved: (u: UserDto) => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    firstName:   user.firstName   ?? '',
    lastName:    user.lastName    ?? '',
    email:       user.email       ?? '',
    phoneNumber: user.phoneNumber ?? '',
    country:     user.country     ?? '',
    role:        user.role        as string,
    isEnabled:   user.isEnabled   ?? true,
  })
  const s = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.email.trim()) { onError('Email is required'); return }
    if (!form.firstName.trim()) { onError('First name is required'); return }
    if (!form.lastName.trim()) { onError('Last name is required'); return }
    setSaving(true)
    try {
      const body: UpdateUserRequest = {
        email:       form.email       || undefined,
        firstName:   form.firstName   || undefined,
        lastName:    form.lastName    || undefined,
        phoneNumber: form.phoneNumber || undefined,
        country:     form.country     || undefined,
        role:        form.role        as any,
        isEnabled:   form.isEnabled,
      }
      onSaved(await adminUsersApi.update(user.id, body))
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const ROLES: string[] = ['SCOUT', 'MANAGER', 'FARM_ADMIN', 'SUPER_ADMIN']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <FormField label="First name *">
          <input className="input" value={form.firstName} onChange={e => s('firstName', e.target.value)} />
        </FormField>
        <FormField label="Last name *">
          <input className="input" value={form.lastName} onChange={e => s('lastName', e.target.value)} />
        </FormField>
        <FormField label="Email *">
          <input className="input" type="email" value={form.email} onChange={e => s('email', e.target.value)} />
        </FormField>
        <FormField label="Phone">
          <input className="input" value={form.phoneNumber} onChange={e => s('phoneNumber', e.target.value)} />
        </FormField>
        <FormField label="Country">
          <input className="input" placeholder="e.g. Canada" value={form.country} onChange={e => s('country', e.target.value)} />
        </FormField>
        <FormField label="Role">
          <select className="input" value={form.role} onChange={e => s('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </FormField>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form.isEnabled} onChange={e => s('isEnabled', e.target.checked)} />
        Account enabled (user can log in)
      </label>

      {form.role === 'SUPER_ADMIN' && (
        <div style={{ padding: '7px 10px', background: '#fffbf0', border: '0.5px solid #fde68a', borderRadius: 6, fontSize: 11, color: '#d97706' }}>
          Changing this user to SUPER_ADMIN will give them global access to all farms.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── CREATE USER FORM ─────────────────────────────────────────────────────────

function TemporaryPasswordForm({ user, onSaved, onCancel, onError }: {
  user: UserDto
  onSaved: (u: UserDto) => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState('')

  async function submit() {
    if (!temporaryPassword || !confirmTemporaryPassword) {
      onError('Temporary password and confirmation are required.')
      return
    }
    if (temporaryPassword.length < 8) {
      onError('Temporary password must be at least 8 characters.')
      return
    }
    if (temporaryPassword !== confirmTemporaryPassword) {
      onError('Temporary password and confirmation must match.')
      return
    }

    setSaving(true)
    try {
      onSaved(await adminUsersApi.setTemporaryPassword(user.id, { temporaryPassword }))
    } catch (e: any) {
      onError(e?.response?.data?.message ?? 'Failed to assign temporary password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: '#fffbf0',
          border: '0.5px solid #fde68a',
          fontSize: 12,
          color: '#92400e',
        }}
      >
        Assign a new temporary password for {user.firstName} {user.lastName}. They will be required to change it after login.
      </div>
      <FormField label="Temporary password">
        <input
          className="input"
          type="password"
          value={temporaryPassword}
          onChange={event => setTemporaryPassword(event.target.value)}
          onPaste={preventPasswordPaste}
          autoComplete="new-password"
        />
      </FormField>
      <FormField label="Confirm temporary password">
        <input
          className="input"
          type="password"
          value={confirmTemporaryPassword}
          onChange={event => setConfirmTemporaryPassword(event.target.value)}
          onPaste={preventPasswordPaste}
          autoComplete="new-password"
        />
      </FormField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn-primary" type="button" onClick={submit} disabled={saving}>
          {saving ? 'Assigning...' : 'Assign temporary password'}
        </button>
      </div>
    </div>
  )
}

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
      if (farmNeedsOwner && newUser.id && selectedFarm) {
        try { await adminFarmsApi.update(form.farmId, selectedFarm, { ownerId: newUser.id }) }
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
        <FormField label="Temporary password *"><input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} onPaste={preventPasswordPaste} /></FormField>
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


// ─── Shared small components ──────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
  maxWidth,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  maxWidth?: number
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        border: '0.5px solid #e5e7eb',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        width: '100%',
        maxWidth: maxWidth ?? 560,
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: 24,
      }}>
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
