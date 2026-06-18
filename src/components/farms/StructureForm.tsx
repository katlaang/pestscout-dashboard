import { useMemo, useState, type ReactNode } from 'react'
import { adminFarmsApi } from '@/services/api'
import GreenhouseBayEditor from './GreenhouseBayEditor'
import type {
  FarmResponse,
  FarmStructureType,
  FieldBlockResponse,
  GreenhouseBayRequest,
  GreenhouseResponse,
} from '@/types'

type StructureRecord = GreenhouseResponse | FieldBlockResponse

interface StructureFormProps {
  farmId: string
  farmType: FarmStructureType
  farm: FarmResponse
  existing?: StructureRecord | null
  remainingAreaHectares: number
  onSaved: (structure: StructureRecord) => void
  onCancel: () => void
  onError: (message: string) => void
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function roundArea(value: number) {
  return Math.round(value * 100) / 100
}

function existingGreenhouseBays(existing: GreenhouseResponse | null | undefined): GreenhouseBayRequest[] {
  if (!existing) return []

  if (existing.bays && existing.bays.length > 0) {
    return existing.bays
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(bay => ({
        bayTag: bay.bayTag ?? '',
        bedCount: Math.max(1, Number(bay.bedCount ?? existing.benchesPerBay ?? 1)),
        bedTags: Array.from(
          { length: Math.max(1, Number(bay.bedCount ?? existing.benchesPerBay ?? 1)) },
          (_, index) => bay.bedTags?.[index] ?? '',
        ),
      }))
  }

  if (!existing.bayCount) return []

  return Array.from({ length: existing.bayCount }, (_, index) => ({
    bayTag: existing.bayTags?.[index] ?? '',
    bedCount: Math.max(1, Number(existing.benchesPerBay ?? 1)),
    bedTags: Array.from(
      { length: Math.max(1, Number(existing.benchesPerBay ?? 1)) },
      (_, bedIndex) => existing.benchTags?.[bedIndex] ?? '',
    ),
  }))
}

export default function StructureForm({
  farmId,
  farmType,
  farm,
  existing,
  remainingAreaHectares,
  onSaved,
  onCancel,
  onError,
}: StructureFormProps) {
  const isField = farmType === 'FIELD'
  const isEdit = !!existing
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [areaHectares, setAreaHectares] = useState(
    existing && 'areaHectares' in existing && existing.areaHectares != null ? String(existing.areaHectares) : '',
  )
  const [spotChecks, setSpotChecks] = useState(
    isField
      ? (existing as FieldBlockResponse | null)?.spotChecksPerBay != null
        ? String((existing as FieldBlockResponse).spotChecksPerBay)
        : ''
      : '',
  )
  const [active, setActive] = useState(existing ? existing.active : true)

  const [bays, setBays] = useState<GreenhouseBayRequest[]>(
    isField ? [] : existingGreenhouseBays(existing as GreenhouseResponse | null | undefined),
  )
  const [cropType, setCropType] = useState(
    isField ? ((existing as FieldBlockResponse | null)?.cropType ?? '') : '',
  )

  const parsedArea = areaHectares === '' ? null : Number(areaHectares)
  const areaError =
    parsedArea != null &&
    (!Number.isFinite(parsedArea) || parsedArea < 0 || parsedArea > remainingAreaHectares + 1e-6)
  const areaLabel = useMemo(() => {
    if (farm.licensedAreaHectares == null) return null
    return `Remaining farm area: ${roundArea(Math.max(remainingAreaHectares, 0))} ha`
  }, [farm.licensedAreaHectares, remainingAreaHectares])

  async function save() {
    if (!name.trim()) {
      onError('Name is required')
      return
    }

    if (areaError) {
      onError('Structure area exceeds the remaining licensed area')
      return
    }

    setSaving(true)
    try {
      if (isField) {
        const body = {
          farmId,
          name: name.trim(),
          description: description.trim() || undefined,
          spotChecksPerBay: spotChecks === '' ? null : Number(spotChecks),
          cropType: cropType.trim() || undefined,
          areaHectares: parsedArea,
          active,
        }

        onSaved(
          isEdit
            ? await adminFarmsApi.updateFieldBlock(farmId, existing!.id, body)
            : await adminFarmsApi.createFieldBlock(farmId, body),
        )
        return
      }

      const cleanedBays = bays
        .map(bay => ({
          bayTag: bay.bayTag.trim(),
          bedCount: Number(bay.bedCount),
          bedTags: Array.from(
            { length: Math.max(1, Number(bay.bedCount)) },
            (_, index) => bay.bedTags?.[index]?.trim() || `Bed ${index + 1}`,
          ),
        }))
        .filter(bay => bay.bayTag && Number.isFinite(bay.bedCount) && bay.bedCount > 0)

      if (cleanedBays.length === 0) {
        onError('Add at least one bay with a name and bed count')
        return
      }


      const body = {
        farmId,
        name: name.trim(),
        description: description.trim() || undefined,
        bayCount: cleanedBays.length,
        benchesPerBay: null,
        areaHectares: parsedArea,
        bays: cleanedBays,
        active,
      }

      onSaved(
        isEdit
          ? await adminFarmsApi.updateGreenhouse(farmId, existing!.id, body)
          : await adminFarmsApi.createGreenhouse(farmId, body),
      )
    } catch (error: any) {
      onError(error?.response?.data?.message ?? `Failed to ${isEdit ? 'update' : 'create'} structure`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#f9fafb', border: '0.5px solid #d6f0e0', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
        {isEdit ? `Edit ${isField ? 'field block' : 'greenhouse'}` : `New ${isField ? 'field block' : 'greenhouse'}`}
      </p>

      {areaLabel && (
        <div style={{
          marginBottom: 12,
          padding: '8px 10px',
          borderRadius: 7,
          background: '#f0faf4',
          border: '0.5px solid #a7dcbc',
          fontSize: 12,
          color: '#1e5c3a',
        }}>
          {areaLabel}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
        <FormField label="Name *">
          <input
            className="input"
            placeholder={isField ? 'e.g. North Field' : 'e.g. Greenhouse A'}
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </FormField>
        <FormField label="Description">
          <input className="input" value={description} onChange={event => setDescription(event.target.value)} />
        </FormField>
        <FormField label="Area (ha)">
          <input
            className="input"
            type="number"
            min={0}
            step={0.01}
            value={areaHectares}
            onChange={event => setAreaHectares(event.target.value)}
            style={areaError ? { borderColor: '#fca5a5' } : undefined}
          />
        </FormField>

        {isField ? (
          <>
            <FormField label="Spot checks">
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={spotChecks}
                onChange={event => setSpotChecks(event.target.value)}
              />
            </FormField>
            <FormField label="Crop type">
              <input
                className="input"
                placeholder="e.g. Tomato"
                value={cropType}
                onChange={event => setCropType(event.target.value)}
              />
            </FormField>
          </>
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            <GreenhouseBayEditor
              bays={bays}
              onChange={setBays}
            />
          </div>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151', cursor: 'pointer', marginBottom: 10 }}>
        <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Active
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" style={{ fontSize: 11 }} onClick={onCancel}>Cancel</button>
        <button className="btn-primary" style={{ fontSize: 11 }} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : `Create ${isField ? 'field block' : 'greenhouse'}`}
        </button>
      </div>
    </div>
  )
}
