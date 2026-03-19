import { useEffect, useMemo, useState } from 'react'
import type { GreenhouseBayRequest } from '@/types'

interface GreenhouseBayEditorProps {
  bays: GreenhouseBayRequest[]
  onChange: (next: GreenhouseBayRequest[]) => void
  title?: string
  description?: string
}

function normalizeBedTags(count: number, bedTags?: string[]) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => bedTags?.[index] ?? '')
}

function updateBayAt(
  bays: GreenhouseBayRequest[],
  index: number,
  next: Partial<GreenhouseBayRequest>,
) {
  return bays.map((bay, currentIndex) => (
    currentIndex === index
      ? { ...bay, ...next }
      : bay
  ))
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

export default function GreenhouseBayEditor({
  bays,
  onChange,
  title = 'Bays',
  description = 'Start with zero bays. Add each bay explicitly, then name each bed inside it.',
}: GreenhouseBayEditorProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  useEffect(() => {
    setExpanded(previous => {
      const next: Record<number, boolean> = {}
      bays.forEach((_, index) => {
        next[index] = previous[index] ?? true
      })
      return next
    })
  }, [bays.length])

  const totalBeds = useMemo(
    () => bays.reduce((sum, bay) => sum + Math.max(1, Number(bay.bedCount ?? 1)), 0),
    [bays],
  )

  function addBay() {
    onChange([
      ...bays,
      {
        bayTag: '',
        bedCount: 1,
        bedTags: [''],
      },
    ])
  }

  function updateBay(index: number, next: Partial<GreenhouseBayRequest>) {
    onChange(updateBayAt(bays, index, next))
  }

  function updateBedCount(index: number, rawValue: string) {
    const nextCount = Math.max(1, Number(rawValue) || 1)
    const currentBay = bays[index]
    onChange(updateBayAt(bays, index, {
      bedCount: nextCount,
      bedTags: normalizeBedTags(nextCount, currentBay.bedTags),
    }))
  }

  function updateBedTag(index: number, bedIndex: number, value: string) {
    const currentBay = bays[index]
    const nextTags = normalizeBedTags(Math.max(1, Number(currentBay.bedCount ?? 1)), currentBay.bedTags)
    nextTags[bedIndex] = value
    updateBay(index, { bedTags: nextTags })
  }

  function removeBay(index: number) {
    onChange(bays.filter((_, currentIndex) => currentIndex !== index))
    setExpanded(previous => {
      const next: Record<number, boolean> = {}
      Object.entries(previous).forEach(([key, value]) => {
        const numericKey = Number(key)
        if (!value || numericKey === index) return
        next[numericKey > index ? numericKey - 1 : numericKey] = value
      })
      return next
    })
  }

  function toggleBeds(index: number) {
    setExpanded(previous => ({ ...previous, [index]: !previous[index] }))
  }

  return (
    <div
      style={{
        border: '0.5px solid #dbe7df',
        borderRadius: 8,
        background: '#fff',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#111827' }}>{title}</p>
          <p style={{ fontSize: 11, color: '#6b7280' }}>
            {description}
          </p>
        </div>
        <button className="btn-secondary" type="button" style={{ fontSize: 11 }} onClick={addBay}>
          + Add bay
        </button>
      </div>

      {bays.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9ca3af' }}>
          No bays added yet.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 10, fontSize: 11, color: '#6b7280' }}>
            {bays.length} bays / {totalBeds} beds
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bays.map((bay, index) => {
              const bedCount = Math.max(1, Number(bay.bedCount ?? 1))
              const bedTags = normalizeBedTags(bedCount, bay.bedTags)
              const isExpanded = !!expanded[index]

              return (
                <div
                  key={`bay-${index}`}
                  style={{
                    border: '0.5px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 10,
                    background: '#fbfdfb',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 0.8fr auto auto',
                      gap: 8,
                      alignItems: 'end',
                    }}
                  >
                    <FormField label={`Bay ${index + 1} name / ID`}>
                      <input
                        className="input"
                        placeholder={`Bay ${index + 1}`}
                        value={bay.bayTag}
                        onChange={event => updateBay(index, { bayTag: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Beds">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        step={1}
                        value={bedCount}
                        onChange={event => updateBedCount(index, event.target.value)}
                      />
                    </FormField>
                    <button className="btn-secondary" type="button" style={{ fontSize: 11 }} onClick={() => toggleBeds(index)}>
                      {isExpanded ? 'Hide beds' : 'Show beds'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBay(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#dc2626',
                        fontSize: 12,
                        fontFamily: 'inherit',
                        paddingBottom: 10,
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 10,
                        borderTop: '0.5px solid #e5e7eb',
                        paddingTop: 10,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 8,
                      }}
                    >
                      {bedTags.map((bedTag, bedIndex) => (
                        <FormField key={`${index}-${bedIndex}`} label={`Bed ${bedIndex + 1} name / ID`}>
                          <input
                            className="input"
                            placeholder={`Bed ${bedIndex + 1}`}
                            value={bedTag}
                            onChange={event => updateBedTag(index, bedIndex, event.target.value)}
                          />
                        </FormField>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
