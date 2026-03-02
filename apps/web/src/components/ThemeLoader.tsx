import { useEffect } from 'react'
import { fetchTheme, applyTheme, getTheme, onThemeUpdated } from '@/lib/theme'

/** Uygulama başlangıcında temayı yükler ve uygular */
export function ThemeLoader() {
  useEffect(() => {
    const load = async () => {
      const theme = await fetchTheme()
      if (Object.keys(theme).length > 0) applyTheme(theme)
      else applyTheme(getTheme())
    }
    load()
    return onThemeUpdated(() => {
      applyTheme(getTheme())
    })
  }, [])
  return null
}
