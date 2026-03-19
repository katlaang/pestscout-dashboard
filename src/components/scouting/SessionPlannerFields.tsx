import type { ReactNode } from 'react'
import type {
  FieldBlockResponse,
  GreenhouseResponse,
  SpeciesCode,
} from '@/types'
import { SPECIES_LABELS } from '@/utils'

type PlannerStructure = GreenhouseResponse | FieldBlockResponse

export interface SessionPlannerTargetDraft {
  structureId: string
  structureType: 'GREENHOUSE' | 'FIELD'
  includeAllBays: boolean
  includeAllBenches: boolean
  bayTags: string[]
  benchTags: string[]
  areaHectares: string
}

interface SessionPlannerFieldsProps {
  structures: PlannerStructure[]
  targets: SessionPlannerTargetDraft[]
  surveySpeciesCodes: SpeciesCode[]
  onTargetsChange: (targets: SessionPlannerTargetDraft[]) => void
  onSurveySpeciesCodesChange: (codes: SpeciesCode[]) => void
  readOnly?: boolean
}

const SPECIES_GROUPS: { title: string; codes: SpeciesCode[] }[] = [
  {
    title: 'Pests',
    codes: [
      'THRIPS',
      'RED_SPIDER_MITE',
      'WHITEFLIES',
      'MEALYBUGS',
      'CATERPILLARS',
      'FALSE_CODLING_MOTH',
      'PEST_OTHER',
    ],
  },
  {
    title: 'Beneficial insects',
    codes: ['BENEFICIAL_PP'],
  },
  {
    title: 'Diseases',
    codes: [
      'DOWNY_MILDEW',
      'POWDERY_MILDEW',
      'BOTRYTIS',
      'VERTICILLIUM',
      'BACTERIAL_WILT',
      'DISEASE_OTHER',
    ],
  },
]

function isGreenhouse(structure: PlannerStructure): structure is GreenhouseResponse {
  return 'spotChecksPerBench' in structure || 'bays' in structure || 'benchesPerBay' in structure
}

function getStructureId(structure: PlannerStructure) {
  return structure.id
}

function getStructureType(structure: PlannerStructure): 'GREENHOUSE' | 'FIELD' {
  return isGreenhouse(structure) ? 'GREENHOUSE' : 'FIELD'
}

function getBayTags(structure: PlannerStructure): string[] {
  if (isGreenhouse(structure)) {
    if (structure.bays && structure.bays.length > 0) {
      return structure.bays
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((bay, index) => bay.bayTag || `Bay ${index + 1}`)
    }
    if (structure.bayTags && structure.bayTags.length > 0) {
      return structure.bayTags
    }
    return Array.from({ length: structure.bayCount ?? 0 }, (_, index) => `Bay ${index + 1}`)
  }

  if (structure.bayTags && structure.bayTags.length > 0) {
    return structure.bayTags
  }
  return Array.from({ length: structure.bayCount ?? 0 }, (_, index) => `Row ${index + 1}`)
}

function getBedTags(structure: PlannerStructure): string[] {
  if (!isGreenhouse(structure)) return []

  const fromBays = structure.bays?.flatMap(bay => bay.bedTags ?? []) ?? []
  if (fromBays.length > 0) {
    return Array.from(new Set(fromBays))
  }

  if (structure.benchTags && structure.benchTags.length > 0) {
    return structure.benchTags
  }

  return []
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

export default function SessionPlannerFields({
  structures,
  targets,
  surveySpeciesCodes,
  onTargetsChange,
  onSurveySpeciesCodesChange,
  readOnly = false,
}: SessionPlannerFieldsProps) {
  function updateTarget(structureId: string, updater: (target: SessionPlannerTargetDraft) => SessionPlannerTargetDraft) {
    onTargetsChange(targets.map(target => target.structureId === structureId ? updater(target) : target))
  }

  function toggleStructure(structure: PlannerStructure) {
    const structureId = getStructureId(structure)
    const existing = targets.find(target => target.structureId === structureId)

    if (existing) {
      onTargetsChange(targets.filter(target => target.structureId !== structureId))
      return
    }

    onTargetsChange([
      ...targets,
      {
        structureId,
        structureType: getStructureType(structure),
        includeAllBays: true,
        includeAllBenches: true,
        bayTags: [],
        benchTags: [],
        areaHectares: '',
      },
    ])
  }

  function toggleSpecies(code: SpeciesCode) {
    if (surveySpeciesCodes.includes(code)) {
      onSurveySpeciesCodesChange(surveySpeciesCodes.filter(item => item !== code))
      return
    }
    onSurveySpeciesCodesChange([...surveySpeciesCodes, code])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '12px', borderRadius: 8, border: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Targets</p>
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
          Select the greenhouse or field targets for this session. Bays and beds stay explicit; nothing is auto-created from defaults.
        </p>

        {structures.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9ca3af' }}>No structures available on this farm yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {structures.map(structure => {
              const structureId = getStructureId(structure)
              const selected = targets.find(target => target.structureId === structureId)
              const bayTags = getBayTags(structure)
              const bedTags = getBedTags(structure)

              return (
                <div key={structureId} style={{ border: '0.5px solid #dbe7df', borderRadius: 8, background: '#fff', padding: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!selected}
                      disabled={readOnly}
                      onChange={() => toggleStructure(structure)}
                    />
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{structure.name}</span>
                  </label>

                  {selected && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isGreenhouse(structure) ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                        <Field label="Area override (ha)">
                          <input
                            className="input"
                            type="number"
                            min={0}
                            step={0.01}
                            disabled={readOnly}
                            value={selected.areaHectares}
                            onChange={event => updateTarget(structureId, target => ({
                              ...target,
                              areaHectares: event.target.value,
                            }))}
                          />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer', paddingTop: 22 }}>
                          <input
                            type="checkbox"
                            checked={selected.includeAllBays}
                            disabled={readOnly}
                            onChange={event => updateTarget(structureId, target => ({
                              ...target,
                              includeAllBays: event.target.checked,
                              bayTags: event.target.checked ? [] : target.bayTags,
                            }))}
                          />
                          Include all bays
                        </label>
                        {isGreenhouse(structure) && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer', paddingTop: 22 }}>
                            <input
                              type="checkbox"
                              checked={selected.includeAllBenches || bedTags.length === 0}
                              disabled={readOnly || bedTags.length === 0}
                              onChange={event => updateTarget(structureId, target => ({
                                ...target,
                                includeAllBenches: event.target.checked,
                                benchTags: event.target.checked ? [] : target.benchTags,
                              }))}
                            />
                            Include all beds
                          </label>
                        )}
                      </div>

                      {!selected.includeAllBays && bayTags.length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Specific bays</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {bayTags.map(bayTag => (
                              <label key={bayTag} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={selected.bayTags.includes(bayTag)}
                                  disabled={readOnly}
                                  onChange={event => updateTarget(structureId, target => ({
                                    ...target,
                                    bayTags: event.target.checked
                                      ? [...target.bayTags, bayTag]
                                      : target.bayTags.filter(item => item !== bayTag),
                                  }))}
                                />
                                {bayTag}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {!selected.includeAllBenches && bedTags.length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 6 }}>Specific beds</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {bedTags.map(bedTag => (
                              <label key={bedTag} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={selected.benchTags.includes(bedTag)}
                                  disabled={readOnly}
                                  onChange={event => updateTarget(structureId, target => ({
                                    ...target,
                                    benchTags: event.target.checked
                                      ? [...target.benchTags, bedTag]
                                      : target.benchTags.filter(item => item !== bedTag),
                                  }))}
                                />
                                {bedTag}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ padding: '12px', borderRadius: 8, border: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Survey species</p>
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
          Choose which pests, beneficial insects, and diseases should appear in this session.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {SPECIES_GROUPS.map(group => (
            <div key={group.title} style={{ background: '#fff', border: '0.5px solid #dbe7df', borderRadius: 8, padding: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{group.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.codes.map(code => (
                  <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={surveySpeciesCodes.includes(code)}
                      disabled={readOnly}
                      onChange={() => toggleSpecies(code)}
                    />
                    {SPECIES_LABELS[code]}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
