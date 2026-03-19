import { useEffect, useMemo, useState } from 'react'
import { customSpeciesApi } from '@/services/api'
import type { CustomSpecies, CustomSpeciesCategory } from '@/types'
import {
  customSpeciesDuplicateKey,
  normalizeCustomSpeciesName,
} from '@/utils/customSpecies'

const CATEGORY_LABELS: Record<CustomSpeciesCategory, string> = {
  PEST: 'pest',
  DISEASE: 'disease',
  BENEFICIAL: 'beneficial insect',
}

interface CustomSpeciesModalProps {
  farmId: string
  category: CustomSpeciesCategory | null
  open: boolean
  existingItems: CustomSpecies[]
  onClose: () => void
  onCreated: (created: CustomSpecies[]) => void
}

export default function CustomSpeciesModal({
  farmId,
  category,
  open,
  existingItems,
  onClose,
  onCreated,
}: CustomSpeciesModalProps) {
  const [inputValue, setInputValue] = useState('')
  const [pendingNames, setPendingNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setInputValue('')
    setPendingNames([])
    setSaving(false)
    setErrorMessage(null)
  }, [open, category])

  const existingKeys = useMemo(
    () => new Set(existingItems.map(item => customSpeciesDuplicateKey(item.name))),
    [existingItems],
  )

  if (!open || !category) return null
  const currentCategory = category

  function addPendingName() {
    const cleaned = normalizeCustomSpeciesName(inputValue)
    if (!cleaned) {
      setErrorMessage(`Enter a ${CATEGORY_LABELS[currentCategory]} name before adding it.`)
      return
    }

    const key = customSpeciesDuplicateKey(cleaned)
    if (existingKeys.has(key)) {
      setErrorMessage(`"${cleaned}" already exists on this farm.`)
      return
    }

    if (pendingNames.some(name => customSpeciesDuplicateKey(name) === key)) {
      setErrorMessage(`"${cleaned}" is already in the list.`)
      return
    }

    setPendingNames(previous => [...previous, cleaned])
    setInputValue('')
    setErrorMessage(null)
  }

  function removePendingName(name: string) {
    setPendingNames(previous => previous.filter(item => item !== name))
  }

  async function save() {
    if (!category || pendingNames.length === 0) {
      setErrorMessage(`Add at least one ${CATEGORY_LABELS[currentCategory]} before saving.`)
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      const created = await customSpeciesApi.create(farmId, currentCategory, pendingNames)
      onCreated(created)
      onClose()
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? `Could not save ${CATEGORY_LABELS[currentCategory]} items.`)
    } finally {
      setSaving(false)
    }
  }

  const title = `Add custom ${CATEGORY_LABELS[currentCategory]}${pendingNames.length > 1 ? 's' : ''}`

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={event => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#fff',
          borderRadius: 12,
          border: '0.5px solid #e5e7eb',
          boxShadow: '0 12px 36px rgba(0,0,0,0.16)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 14, color: '#111827', marginBottom: 4 }}>{title}</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Add names one at a time. Saving will attach them to this farm and select them immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={inputValue}
            placeholder={`Enter ${CATEGORY_LABELS[currentCategory]} name`}
            onChange={event => setInputValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addPendingName()
              }
            }}
          />
          <button className="btn-secondary" type="button" onClick={addPendingName} disabled={saving}>
            Add
          </button>
        </div>

        <div
          style={{
            minHeight: 96,
            borderRadius: 8,
            border: '0.5px solid #e5e7eb',
            background: '#f9fafb',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {pendingNames.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              No custom {CATEGORY_LABELS[category]} names added yet.
            </div>
          ) : (
            pendingNames.map(name => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'center',
                  background: '#fff',
                  borderRadius: 7,
                  border: '0.5px solid #dbe7df',
                  padding: '6px 8px',
                  fontSize: 12,
                  color: '#111827',
                }}
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => removePendingName(name)}
                  disabled={saving}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 11, fontFamily: 'inherit' }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: '#fff5f5',
              border: '0.5px solid #fca5a5',
              color: '#c53030',
              fontSize: 12,
            }}
          >
            {errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
