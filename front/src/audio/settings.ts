// Réglages du son choisis par le joueur, mémorisés d'une visite à l'autre.
// Stockage facultatif : s'il est inaccessible (navigation privée, iframe), le
// réglage vaut pour la visite.

export interface SoundSettings {
  /** 0..1 */
  volume: number
  muted: boolean
}

export interface SettingsStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const KEY = 'quizzhack.sound'
export const DEFAULT_SETTINGS: SoundSettings = { volume: 0.8, muted: false }

export function localStore(): SettingsStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadSettings(store: SettingsStore | null): SoundSettings {
  try {
    const raw: unknown = JSON.parse(store?.getItem(KEY) ?? 'null')
    if (raw === null || typeof raw !== 'object') return DEFAULT_SETTINGS
    const { volume, muted } = raw as Partial<SoundSettings>
    return {
      volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.volume,
      muted: muted === true,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(store: SettingsStore | null, settings: SoundSettings): void {
  try {
    store?.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Pas mémorisé, le réglage vaut pour cette visite.
  }
}
