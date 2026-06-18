// Generic autosave hook — persists in-progress form state to localStorage so a
// reload, accidental logout, or browser crash doesn't wipe unsaved work.
//
// Usage:
//
//   const [form, setForm] = useState<MyForm>(initialValues)
//   const { hasDraft, restoreDraft, clearDraft } = useFormDraft(
//     'session-create-draft',   // unique key scoped to this form/context
//     form,
//     setForm,
//   )
//
//   // Offer to restore on mount:
//   useEffect(() => {
//     if (!hasDraft) return
//     if (window.confirm('You have unsaved work from earlier — restore it?')) {
//       restoreDraft()
//     } else {
//       clearDraft()
//     }
//   }, [])                      // intentionally runs once
//
//   // Clear after a successful submit:
//   await api.createSession(form)
//   clearDraft()

import { useCallback, useEffect, useRef, useState } from 'react'

const DRAFT_PREFIX = 'pestscout-draft:'
const DEFAULT_DEBOUNCE_MS = 800

interface UseFormDraftResult {
  hasDraft: boolean
  restoreDraft: () => void
  clearDraft: () => void
}

export function useFormDraft<T>(
  draftKey: string,
  formState: T,
  setFormState: (value: T) => void,
  options: { debounceMs?: number } = {},
): UseFormDraftResult {
  const { debounceMs = DEFAULT_DEBOUNCE_MS } = options
  const storageKey = `${DRAFT_PREFIX}${draftKey}`
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    try { return window.localStorage.getItem(storageKey) !== null } catch { return false }
  })

  // Autosave on every formState change, debounced so we're not writing on
  // every keystroke.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)

    debounceTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(formState))
        setHasDraft(true)
      } catch (err) {
        // Non-fatal: quota exceeded, private-browsing restrictions, etc.
        console.warn('[useFormDraft] autosave failed:', err)
      }
    }, debounceMs)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formState), storageKey, debounceMs])

  const restoreDraft = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) setFormState(JSON.parse(raw) as T)
    } catch (err) {
      console.warn('[useFormDraft] restore failed:', err)
    }
  }, [storageKey, setFormState])

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey)
      setHasDraft(false)
    } catch (err) {
      console.warn('[useFormDraft] clear failed:', err)
    }
  }, [storageKey])

  return { hasDraft, restoreDraft, clearDraft }
}
