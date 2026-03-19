import type {
  FarmStructureType,
  FieldBlockResponse,
  GreenhouseResponse,
} from '@/types'

type StructureRecord = GreenhouseResponse | FieldBlockResponse

interface StructureDetailsListProps {
  farmType: FarmStructureType
  structures: StructureRecord[]
  expandedStructureId?: string | null
  onToggleExpanded: (structureId: string) => void
  canEdit?: boolean
  onEdit?: (structure: StructureRecord) => void
  onDelete?: (structure: StructureRecord) => void
}

function infoText(value?: string | number | null) {
  if (value == null || value === '') return '—'
  return String(value)
}

function countGreenhouseBeds(structure: GreenhouseResponse) {
  if (structure.bays?.length) {
    return structure.bays.reduce((sum, bay) => sum + Number(bay.bedCount ?? 0), 0)
  }

  if (structure.bayCount && structure.benchesPerBay) {
    return structure.bayCount * structure.benchesPerBay
  }

  return 0
}

export default function StructureDetailsList({
  farmType,
  structures,
  expandedStructureId,
  onToggleExpanded,
  canEdit = false,
  onEdit,
  onDelete,
}: StructureDetailsListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {structures.map(structure => {
        const isExpanded = expandedStructureId === structure.id
        const isField = farmType === 'FIELD'
        const field = structure as FieldBlockResponse
        const greenhouse = structure as GreenhouseResponse
        const greenhouseBays = greenhouse.bays?.slice().sort((a, b) => a.position - b.position) ?? []

        return (
          <div
            key={structure.id}
            style={{
              border: '0.5px solid #e5e7eb',
              borderRadius: 10,
              background: '#fff',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', marginBottom: 4 }}>
                  {structure.name}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  {isField
                    ? `${infoText(field.areaHectares != null ? `${field.areaHectares} ha` : null)} · ${infoText(field.bayCount)} rows${field.cropType ? ` · ${field.cropType}` : ''}`
                    : `${infoText(greenhouse.areaHectares != null ? `${greenhouse.areaHectares} ha` : null)} · ${greenhouseBays.length || greenhouse.bayCount || 0} bays · ${countGreenhouseBeds(greenhouse)} beds`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className={`badge ${structure.active ? 'badge-green' : 'badge-gray'}`}>
                  {structure.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: '5px 10px' }}
                  onClick={() => onToggleExpanded(structure.id)}
                >
                  {isExpanded ? 'Hide details' : 'Show details'}
                </button>
                {canEdit && onEdit && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2d7a50', fontSize: 11, fontFamily: 'inherit', padding: 0 }}
                    onClick={() => onEdit(structure)}
                  >
                    Edit
                  </button>
                )}
                {canEdit && onDelete && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05252', fontSize: 11, fontFamily: 'inherit', padding: 0 }}
                    onClick={() => onDelete(structure)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {isExpanded && (
              <div style={{ borderTop: '0.5px solid #f3f4f6', background: '#f9fafb', padding: 14 }}>
                {structure.description && (
                  <div style={{ marginBottom: 10, fontSize: 12, color: '#374151' }}>
                    {structure.description}
                  </div>
                )}

                {isField ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <InfoCard label="Area" value={field.areaHectares != null ? `${field.areaHectares} ha` : '—'} />
                    <InfoCard label="Crop" value={field.cropType ?? '—'} />
                    <InfoCard label="Rows" value={field.bayCount ?? '—'} />
                    <InfoCard label="Spot checks / row" value={field.spotChecksPerBay ?? '—'} />
                    <InfoCard label="Bay tags" value={field.bayTags?.join(', ') || '—'} fullWidth />
                  </div>
                ) : greenhouseBays.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {greenhouseBays.map((bay, index) => (
                      <div
                        key={`${bay.bayTag}-${index}`}
                        style={{
                          border: '0.5px solid #dbe7df',
                          borderRadius: 8,
                          background: '#fff',
                          padding: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>
                            {bay.bayTag || `Bay ${index + 1}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {Number(bay.bedCount ?? 0)} beds
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(bay.bedTags ?? []).length > 0 ? (
                            bay.bedTags?.map((bedTag, bedIndex) => (
                              <span
                                key={`${bay.bayTag}-${bedIndex}`}
                                style={{
                                  fontSize: 11,
                                  color: '#374151',
                                  background: '#f3f4f6',
                                  border: '0.5px solid #e5e7eb',
                                  borderRadius: 999,
                                  padding: '3px 8px',
                                }}
                              >
                                {bedTag}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>
                              No bed IDs returned yet.
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                    No bay details returned yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function InfoCard({
  label,
  value,
  fullWidth,
}: {
  label: string
  value: string | number
  fullWidth?: boolean
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #e5e7eb',
        borderRadius: 8,
        padding: '10px 12px',
        gridColumn: fullWidth ? '1 / -1' : undefined,
      }}
    >
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#374151' }}>{value}</div>
    </div>
  )
}
