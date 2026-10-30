import { useEffect, useRef } from 'react'
import type { GameError } from '../game/types'

// Écrans 2D légers (titre, chargement, erreur) : aucun import de Three.js,
// pour qu'ils s'affichent avant le chargement de la scène 3D.

interface TitleScreenProps {
  onEnter: () => void
}

export function TitleScreen({ onEnter }: TitleScreenProps) {
  const prompt = useRef<HTMLButtonElement>(null)
  useEffect(() => prompt.current?.focus(), [])

  return (
    <div className="screen fx">
      <h1 className="title">GUESS OR DIE</h1>
      <p className="subtitle">QUIZZ_HACK</p>
      <button ref={prompt} type="button" className="prompt" onClick={onEnter}>
        [ ENTRER ]
      </button>
      <p className="terminal dim">plein écran · [souris] viser · [1-4] répondre · [M] son</p>
    </div>
  )
}

export function LoadingScreen({ label = 'CONNEXION AU LABYRINTHE' }: { label?: string }) {
  return (
    <div className="screen fx">
      <p className="terminal caret">&gt; {label}</p>
    </div>
  )
}

const ERROR_TITLES: Record<string, string> = {
  NETWORK_ERROR: 'SIGNAL PERDU',
  NO_TOKEN: 'IDENTITÉ INCONNUE',
  INVALID_TOKEN: 'IDENTITÉ REJETÉE',
  SESSION_NOT_FOUND: 'SESSION ÉVAPORÉE',
}

interface ErrorScreenProps {
  error: GameError
  onRetry?: () => void
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="screen fx">
      <p className="terminal terminal--danger">&gt; {ERROR_TITLES[error.code] ?? 'ERREUR SYSTÈME'}</p>
      <p className="terminal">{error.message}</p>
      <p className="terminal dim">
        code {error.code}
        {error.status ? ` · HTTP ${error.status}` : ''}
      </p>
      {onRetry && (
        <button type="button" className="prompt" onClick={onRetry}>
          [ RÉESSAYER ]
        </button>
      )}
    </div>
  )
}
