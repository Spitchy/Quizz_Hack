import { useEffect, useState, useSyncExternalStore } from 'react'
import { getSoundSettings, subscribeSoundSettings, updateSoundSettings } from '../audio/engine'

// Réglage du son : une ligne de terminal, à la souris ou au clavier ([M] coupe,
// [-] et [+] règlent). Le choix est mémorisé d'une visite à l'autre.

const STEP = 0.1
const SHOW_MS = 1400

export function SoundControl() {
  const { volume, muted } = useSyncExternalStore(subscribeSoundSettings, getSoundSettings)
  const [touched, setTouched] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const current = getSoundSettings()
      const nudged = (by: number) => Math.round(Math.min(1, Math.max(0, current.volume + by)) * 10) / 10
      if (key === 'm') updateSoundSettings({ muted: !current.muted })
      else if (key === '-') updateSoundSettings({ volume: nudged(-STEP), muted: false })
      else if (key === '+' || key === '=') updateSoundSettings({ volume: nudged(STEP), muted: false })
      else return
      setTouched((n) => n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // La jauge reste lisible un instant après un réglage au clavier.
  useEffect(() => {
    if (!touched) return
    const id = setTimeout(() => setTouched(0), SHOW_MS)
    return () => clearTimeout(id)
  }, [touched])

  const shown = muted ? 0 : volume
  return (
    <div className={`sound cursor-on${touched ? ' sound--touched' : ''}`}>
      <button type="button" className="sound__toggle" onClick={(e) => {
        updateSoundSettings({ muted: !muted })
        e.currentTarget.blur()
      }}>
        {muted ? '[M] MUET' : '[M] SON '}
      </button>
      <input
        type="range"
        className="sound__level"
        aria-label="Volume"
        min={0}
        max={1}
        step={STEP}
        value={shown}
        style={{ '--filled': `${shown * 100}%` } as React.CSSProperties}
        onChange={(e) => updateSoundSettings({ volume: Number(e.target.value), muted: false })}
        // Le clavier retourne au jeu : les flèches ne doivent pas régler le son en marchant.
        onPointerUp={(e) => e.currentTarget.blur()}
      />
    </div>
  )
}
