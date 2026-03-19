import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CustomSpeciesModal from '@/components/scouting/CustomSpeciesModal'
import { customSpeciesApi } from '@/services/api'
import type {
  CustomSpecies,
  CustomSpeciesCategory,
  FarmStructureType,
  FieldBlockResponse,
  GreenhouseResponse,
  SpeciesCode,
} from '@/types'
import { SPECIES_LABELS } from '@/utils'
import {
  ensureOtherCode,
  mergeCustomSpecies,
  OTHER_CODE_BY_CATEGORY,
} from '@/utils/customSpecies'

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
  farmId: string
  farmStructureType?: FarmStructureType
  structures: PlannerStructure[]
  targets: SessionPlannerTargetDraft[]
  surveySpeciesCodes: SpeciesCode[]
  customSurveySpeciesIds: string[]
  onTargetsChange: (targets: SessionPlannerTargetDraft[]) => void
  onSurveySpeciesCodesChange: (codes: SpeciesCode[]) => void
  onCustomSurveySpeciesIdsChange: (ids: string[]) => void
  readOnly?: boolean
}

type SpeciesGroup = {
  title: string
  category: CustomSpeciesCategory
  options: Array<{ code: SpeciesCode; label: string; isOther?: boolean }>
}

const SPECIES_GROUPS: SpeciesGroup[] = [
  {
    title: 'Pests',
    category: 'PEST',
    options: [
      { code: 'THRIPS', label: SPECIES_LABELS.THRIPS },
      { code: 'RED_SPIDER_MITE', label: SPECIES_LABELS.RED_SPIDER_MITE },
      { code: 'WHITEFLIES', label: SPECIES_LABELS.WHITEFLIES },
      { code: 'MEALYBUGS', label: SPECIES_LABELS.MEALYBUGS },
      { code: 'CATERPILLARS', label: SPECIES_LABELS.CATERPILLARS },
      { code: 'FALSE_CODLING_MOTH', label: SPECIES_LABELS.FALSE_CODLING_MOTH },
      { code: 'PEST_OTHER', label: SPECIES_LABELS.PEST_OTHER, isOther: true },
    ],
  },
  {
    title: 'Beneficial insects',
    category: 'BENEFICIAL',
    options: [
      { code: 'BENEFICIAL_PP', label: SPECIES_LABELS.BENEFICIAL_PP },
      { code: 'BENEFICIAL_OTHER', label: SPECIES_LABELS.BENEFICIAL_OTHER, isOther: true },
    ],
  },
  {
    title: 'Diseases',
    category: 'DISEASE',
    options: [
      { code: 'DOWNY_MILDEW', label: SPECIES_LABELS.DOWNY_MILDEW },
      { code: 'POWDERY_MILDEW', label: SPECIES_LABELS.POWDERY_MILDEW },
      { code: 'BOTRYTIS', label: SPECIES_LABELS.BOTRYTIS },
      { code: 'VERTICILLIUM', label: SPECIES_LABELS.VERTICILLIUM },
      { code: 'BACTERIAL_WILT', label: SPECIES_LABELS.BACTERIAL_WILT },
      { code: 'DISEASE_OTHER', label: SPECIES_LABELS.DISEASE_OTHER, isOther: true },
    ],
  },
]

const CATEGORY_ACTION_LABEL: Record<CustomSpeciesCategory, string> = {
  PEST: 'Other pest',
  DISEASE: 'Other disease',
  BENEFICIAL: 'Other beneficial insect',
}

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
  farmId,
  farmStructureType,
  structures,
  targets,
  surveySpeciesCodes,
  customSurveySpeciesIds,
  onTargetsChange,
  onSurveySpeciesCodesChange,
  onCustomSurveySpeciesIdsChange,
  readOnly = false,
}: SessionPlannerFieldsProps) {
  const [customSpeciesByCategory, setCustomSpeciesByCategory] = useState<Record<CustomSpeciesCategory, CustomSpecies[]>>({
    PEST: [],
    DISEASE: [],
    BENEFICIAL: [],
  })
  const [modalCategory, setModalCategory] = useState<CustomSpeciesCategory | null>(null)

  useEffect(() => {
    let alive = true
    if (!farmId) {
      setCustomSpeciesByCategory({ PEST: [], DISEASE: [], BENEFICIAL: [] })
      return
    }

    Promise.all([
      customSpeciesApi.list(farmId, 'PEST').catch(() => [] as CustomSpecies[]),
      customSpeciesApi.list(farmId, 'DISEASE').catch(() => [] as CustomSpecies[]),
      customSpeciesApi.list(farmId, 'BENEFICIAL').catch(() => [] as CustomSpecies[]),
    ]).then(([pests, diseases, beneficials]) => {
      if (!alive) return
      setCustomSpeciesByCategory({
        PEST: pests,
        DISEASE: diseases,
        BENEFICIAL: beneficials,
      })
    })

    return () => {
      alive = false
    }
  }, [farmId])

  const customSpeciesById = useMemo(() => {
    const byId = new Map<string, CustomSpecies>()
    Object.values(customSpeciesByCategory).flat().forEach(item => byId.set(item.id, item))
    return byId
  }, [customSpeciesByCategory])

  const targetLabel = farmStructureType === 'FIELD' ? 'fields' : farmStructureType === 'GREENHOUSE' ? 'greenhouses' : 'structures'

  const visibleStructures = useMemo(() => {
    if (farmStructureType === 'GREENHOUSE') {
      return structures.filter(structure => isGreenhouse(structure))
    }
    if (farmStructureType === 'FIELD') {
      return structures.filter(structure => !isGreenhouse(structure))
    }
    return structures
  }, [farmStructureType, structures])

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

  function customIdsForCategory(category: CustomSpeciesCategory) {
    return customSurveySpeciesIds.filter(id => customSpeciesById.get(id)?.category === category)
  }

  function openCustomModal(category: CustomSpeciesCategory) {
    if (readOnly) return
    const ensured = ensureOtherCode(surveySpeciesCodes, category)
    if (ensured !== surveySpeciesCodes) {
      onSurveySpeciesCodesChange(ensured)
    }
    setModalCategory(category)
  }

  function toggleBuiltInSpecies(code: SpeciesCode, category: CustomSpeciesCategory, isOther = false) {
    const currentlySelected = surveySpeciesCodes.includes(code)

    if (currentlySelected) {
      const nextCodes = surveySpeciesCodes.filter(item => item !== code)
      onSurveySpeciesCodesChange(nextCodes)
      if (isOther) {
        const nextCustomIds = customSurveySpeciesIds.filter(id => customSpeciesById.get(id)?.category !== category)
        if (nextCustomIds.length !== customSurveySpeciesIds.length) {
          onCustomSurveySpeciesIdsChange(nextCustomIds)
        }
      }
      return
    }

    const nextCodes = [...surveySpeciesCodes, code]
    onSurveySpeciesCodesChange(nextCodes)
    if (isOther) {
      setModalCategory(category)
    }
  }

  function toggleCustomSpecies(category: CustomSpeciesCategory, customSpeciesId: string) {
    const selected = customSurveySpeciesIds.includes(customSpeciesId)
    if (selected) {
      onCustomSurveySpeciesIdsChange(customSurveySpeciesIds.filter(id => id !== customSpeciesId))
      return
    }

    onCustomSurveySpeciesIdsChange([...customSurveySpeciesIds, customSpeciesId])
    onSurveySpeciesCodesChange(ensureOtherCode(surveySpeciesCodes, category))
  }

  function handleCustomSpeciesCreated(created: CustomSpecies[]) {
    if (!modalCategory || created.length === 0) return

    setCustomSpeciesByCategory(previous => ({
      ...previous,
      [modalCategory]: mergeCustomSpecies(previous[modalCategory], created),
    }))

    onCustomSurveySpeciesIdsChange(Array.from(new Set([
      ...customSurveySpeciesIds,
      ...created.map(item => item.id),
    ])))
    onSurveySpeciesCodesChange(ensureOtherCode(surveySpeciesCodes, modalCategory))
    setModalCategory(null)
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '12px', borderRadius: 8, border: '0.5px solid #e5e7eb', background: '#f9fafb' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#111827', marginBottom: 6 }}>Targets</p>
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
            Select the {targetLabel} for this session. Greenhouse targets can narrow down by bay and bed; field targets stay at field level.
          </p>

          {visibleStructures.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>No {targetLabel} available on this farm yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleStructures.map(structure => {
                const structureId = getStructureId(structure)
                const selected = targets.find(target => target.structureId === structureId)
                const bayTags = getBayTags(structure)
                const bedTags = getBedTags(structure)
                const greenhouseStructure = isGreenhouse(structure)

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
                        <div style={{ display: 'grid', gridTemplateColumns: greenhouseStructure ? '1fr 1fr 1fr' : '1fr', gap: 10 }}>
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
                          {greenhouseStructure && (
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
                          )}
                          {greenhouseStructure && (
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

                        {greenhouseStructure && !selected.includeAllBays && bayTags.length > 0 && (
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

                        {greenhouseStructure && !selected.includeAllBenches && bedTags.length > 0 && (
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
            Choose which pests, beneficial insects, and diseases should appear in this session. Use Other to add farm-specific items without leaving the page.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {SPECIES_GROUPS.map(group => {
              const customOptions = customSpeciesByCategory[group.category]
              const selectedCustomIds = customIdsForCategory(group.category)
              const otherCode = OTHER_CODE_BY_CATEGORY[group.category]
              const otherSelected = surveySpeciesCodes.includes(otherCode)

              return (
                <div key={group.title} style={{ background: '#fff', border: '0.5px solid #dbe7df', borderRadius: 8, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{group.title}</p>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 10, padding: '4px 8px' }}
                        onClick={() => openCustomModal(group.category)}
                      >
                        + Add custom
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.options.map(option => (
                      <label key={option.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={surveySpeciesCodes.includes(option.code)}
                          disabled={readOnly}
                          onChange={() => toggleBuiltInSpecies(option.code, group.category, option.isOther)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid #f3f4f6' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                      Farm-specific
                    </div>

                    {customOptions.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        {otherSelected
                          ? `No saved ${group.title.toLowerCase()} yet. Click ${CATEGORY_ACTION_LABEL[group.category]} or Add custom.`
                          : `No saved ${group.title.toLowerCase()} yet.`}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {customOptions.map(item => (
                          <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#374151', cursor: readOnly ? 'default' : 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedCustomIds.includes(item.id)}
                              disabled={readOnly}
                              onChange={() => toggleCustomSpecies(group.category, item.id)}
                            />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span>{item.name}</span>
                              <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'DM Mono, monospace' }}>{item.code}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <CustomSpeciesModal
        farmId={farmId}
        category={modalCategory}
        open={!!modalCategory}
        existingItems={modalCategory ? customSpeciesByCategory[modalCategory] : []}
        onClose={() => setModalCategory(null)}
        onCreated={handleCustomSpeciesCreated}
      />
    </>
  )
}
