import { useEffect, useState } from 'react'
import type { HudState } from '../game/render'
import type { GameSnapshot } from '../game/types'
import { corrupt, infectionBar, pad, signalBar } from './hudText'

// HUD style terminal dans les coins. La barre d'infection glitche quand elle
// monte, et se dégrade en permanence quand le danger est élevé.

const BURST_MS = 650
const TICK_MS = 90

/** Texte qui se corrompt brièvement à chaque changement, puis selon `noise` (0..1). */
function useGlitchText(text: string, noise: number): string {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    const start = performance.now()
    const id = setInterval(() => {
      const bursting = performance.now() - start < BURST_MS
      if (!bursting && noise <= 0) {
        setShown(text)
        clearInterval(id)
        return
      }
      setShown(corrupt(text, bursting ? 0.35 : noise))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [text, noise])
  return shown
}

function logLine(snapshot: GameSnapshot): { text: string; danger: boolean } | null {
  if (snapshot.phase === 'question' && snapshot.error?.retryable) {
    return { text: '> CONNEXION INSTABLE · RÉESSAIE', danger: true }
  }
  if (snapshot.phase === 'submitting') return { text: '> ANALYSE…', danger: false }
  if (snapshot.phase === 'feedback' && snapshot.lastAnswer) {
    return snapshot.lastAnswer.isCorrect
      ? { text: '> ACCÈS AUTORISÉ', danger: false }
      : { text: '> INTRUSION DÉTECTÉE', danger: true }
  }
  return null
}

export interface HudProps {
  hud: HudState
  snapshot: GameSnapshot
  danger: number
  /** Force du signal (0..5) vers l'entité non interrogée la plus proche. */
  signal: number
  /** Une entité est à portée : on peut lire son panneau. */
  canEngage: boolean
  /** Le journal de la table est à portée. */
  canRead: boolean
  /** La souris pilote le regard (pointer lock actif). */
  mouseLook: boolean
}

export function Hud({ hud, snapshot, danger, signal, canEngage, canRead, mouseLook }: HudProps) {
  const critical = hud.infectionPercent >= 50
  // Le bruit permanent n'apparaît qu'à partir de la moitié de l'infection.
  const noise = critical ? (danger - 0.4) * 0.12 : 0
  const infection = useGlitchText(`INFECTION ${infectionBar(hud.infectionPercent)} ${pad(hud.infectionPercent, 3)}%`, noise)
  const errors = useGlitchText(`ERREURS   ${hud.errors}/${hud.maxErrors}`, noise)
  const log = logLine(snapshot)
  const exploring = snapshot.phase === 'exploring'

  if (!hud.visible) return null

  let hint: string | null = null
  if (exploring && canEngage) hint = '[E] LIRE LE PANNEAU'
  else if (exploring && canRead) hint = '[E] LIRE LE JOURNAL'
  else if (exploring && !mouseLook) hint = '[ZQSD/FLÈCHES] AVANCER · [CLIC] REGARDER À LA SOURIS · [MAJ] COURIR'
  else if (exploring) hint = '[ZQSD] AVANCER · [MAJ] COURIR · [ÉCHAP] LIBÉRER LA SOURIS'
  else if (snapshot.phase === 'question' && !log) hint = '[1-4] RÉPONDRE · [↑↓] VISER · [ENTRÉE] VALIDER · [ÉCHAP] RECULER'

  return (
    <div className="hud" aria-live="polite">
      <div className="hud__corner hud__tl">
        <span className={`${critical ? 'hud__danger' : ''} ${danger >= 0.66 ? 'hud__jitter' : ''}`}>{infection}</span>
        {'\n'}
        <span className={critical ? 'hud__danger' : ''}>{errors}</span>
        {'\n'}
        <span className="dim">{`SIGNAL    ${signalBar(signal)}`}</span>
      </div>
      <div className="hud__corner hud__tr">
        {`ENTITÉS ${pad(hud.found, 2)}/${pad(hud.totalIntersections, 2)}\n`}
        {`SCORE ${pad(hud.score, 4)}\n`}
        {`NIVEAU ${hud.level}`}
      </div>
      <div className="hud__corner hud__bl">
        {log ? <span className={log.danger ? 'hud__danger' : ''}>{log.text}</span> : hint && <span className={canEngage || canRead ? '' : 'dim'}>{hint}</span>}
      </div>
      {exploring && <div className={`hud__crosshair${canEngage ? ' hud__crosshair--active' : ''}`} />}
    </div>
  )
}
