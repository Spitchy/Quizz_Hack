import { useEffect, useState } from 'react'

/** Vrai une fois la police chargée (le canvas doit être redessiné à ce moment-là). */
export function useFontReady(font: string): boolean {
  const [ready, setReady] = useState(() => document.fonts.check(font))
  useEffect(() => {
    if (ready) return
    let cancelled = false
    document.fonts
      .load(font)
      .catch(() => [])
      .then(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [font, ready])
  return ready
}
