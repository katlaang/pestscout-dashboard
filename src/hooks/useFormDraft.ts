import { useCallback, useEffect, useRef, useState } from 'react'

const DRAFT_PREFIX = 'pestscout-draft:'
const DEFAULT_DEBOUNCE_MS = 800

interface DraftEnvelope<T> {
  data: T
  savedAt: number  // epoch ms
}

interface UseFormDraftResult {
  hasDraft: boolean
  draftAge: number | null  // ms since last save, null if no draft
  restoreDraft: () => void
  clearDraft: () => void
}

export function useFormDraft<T>(
  draftKey: string,
  formState: T,
  setFormState: (value: T) => void,
  options: { debounceMs?: number; expiryMs?: number } = {},
): UseFormDraftResult {
  const { debounceMs = DEFAULT_DEBOUNCE_MS, expiryMs } = options
  const storageKey = `${DRAFT_PREFIX}${draftKey}`
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const readEnvelope = useCallback((): DraftEnvelope<T> | null => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return null
      const envelope = JSON.parse(raw) as DraftEnvelope<T>
      if (expiryMs && Date.now() - envelope.savedAt > expiryMs) {
        window.localStorage.removeItem(storageKey)
        return null
      }
      return envelope
    } catch {
      return null
    }
  }, [storageKey, expiryMs])

  const [hasDraft, setHasDraft] = useState<boolean>(() => readEnvelope() !== null)
  const [draftAge, setDraftAge] = useState<number | null>(() => {
    const e = readEnvelope()
    return e ? Date.now() - e.savedAt : null
  })

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(() => {
      try {
        const envelope: DraftEnvelope<T> = { data: formState, savedAt: Date.now() }
        window.localStorage.setItem(storageKey, JSON.stringify(envelope))
        setHasDraft(true)
        setDraftAge(0)
      } catch (err) {
        console.warn('[useFormDraft] autosave failed:', err)
      }
    }, debounceMs)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formState), storageKey, debounceMs])

  const restoreDraft = useCallback(() => {
    const envelope = readEnvelope()
    if (envelope) setFormState(envelope.data)
  }, [readEnvelope, setFormState])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey)
      setHasDraft(false)
      setDraftAge(null)
    } catch (err) {
      console.warn('[useFormDraft] clear failed:', err)
    }
  }, [storageKey])

  return { hasDraft, draftAge, restoreDraft, clearDraft }
}
