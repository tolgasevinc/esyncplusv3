import { useState, useCallback, useEffect } from 'react'

const STORAGE_PREFIX = 'list-state:'

/**
 * Liste sayfalarında arama, filtre, sayfa, sıralama vb. durumu sessionStorage'da saklar.
 * Sayfa değiştirilip geri dönüldüğünde son durum korunur.
 */
export function usePersistedListState<T extends Record<string, unknown>>(
  key: string,
  defaults: T
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_PREFIX + key)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<T>
        return { ...defaults, ...parsed }
      }
    } catch {
      /* ignore */
    }
    return defaults
  })

  const update = useCallback((updates: Partial<T>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [key, state])

  return [state, update]
}
