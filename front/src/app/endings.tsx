import { useEffect, useRef, useState } from 'react'
import type { GameSnapshot } from '../game/types'
import { pad } from './hudText'
import type { DefeatStage, VictoryStage } from './sequence'

// Fins de partie, déclenchées uniquement par `gameStatus` du serveur, mises en
// scène par étapes (voir `sequence.ts`). Tout se passe dans l'onglet : la
// défaite est une séquence visuelle, rien d'autre n'est exécuté.

function hubLine({ hubSyncResult }: GameSnapshot): string {
  if (!hubSyncResult) return 'HUB · SYNCHRONISATION EN ATTENTE'
  return hubSyncResult.accepted ? `HUB · +${hubSyncResult.xpGained} XP` : 'HUB · SCORE REFUSÉ'
}

interface EndingProps {
  snapshot: GameSnapshot
  onReplay: () => void
}

// --- Défaite ------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Horodatage d'enregistrement, à la seconde (affiché par la caméra). */
function stamp(date: Date): string {
  const d = `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
  return `${d}  ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/** L'heure qui défile, relue quatre fois par seconde. */
function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 250)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
  return now
}

/**
 * Image de la caméra de surveillance du couloir : REC qui clignote,
 * horodatage, nom de la caméra ; un parasite traverse l'image à chaque coup.
 */
function SecurityFeed({ hits, beating }: { hits: readonly number[]; beating: boolean }) {
  const now = useClock()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!beating) return
    const timers = hits.map((at, i) => setTimeout(() => setCount(i + 1), at * 1000))
    return () => timers.forEach(clearTimeout)
  }, [hits, beating])
  return (
    <div className="cctv" aria-hidden>
      <div className="cctv__frame" />
      <p className="cctv__rec">
        <span className="cctv__dot">●</span> REC
      </p>
      <p className="cctv__cam">CAM 04 · NIVEAU 0 · COULOIR B-17</p>
      <p className="cctv__time">{now ? stamp(now) : '--/--/----  --:--:--'}</p>
      <p className="cctv__mode">{beating ? 'MOUVEMENT DÉTECTÉ' : 'NV · IR'}</p>
      {beating && count > 0 && <div key={count} className="cctv__tear" />}
    </div>
  )
}

/** Défaite : calques 2D par-dessus la scène. */
export function DefeatOverlay({ stage, hits }: { stage: DefeatStage; hits: readonly number[] }) {
  switch (stage) {
    case 'freeze':
      return <div className="dread dread--in" aria-hidden />
    case 'approach':
    case 'beat':
      // Même composant d'une étape à l'autre : l'horloge ne repart pas.
      return <SecurityFeed hits={hits} beating={stage === 'beat'} />
    case 'knockout':
      return (
        <div className="knockout" aria-hidden>
          <p className="knockout__lost">CAM 04 — SIGNAL PERDU</p>
        </div>
      )
    case 'wake':
      return (
        <div className="eyelids" aria-hidden>
          <div className="eyelids__top" />
          <div className="eyelids__bottom" />
        </div>
      )
    case 'infected':
    case 'over':
      return <VirusOverlay settled={stage === 'over'} />
    default:
      return null
  }
}

const VIRUS_MESSAGES = ['INJECTION TERMINÉE', 'SYSTÈME COMPROMIS', 'VIRUS DÉPLOYÉ', 'SUJET INFECTÉ', 'PROPAGATION 100 %']

/** Veines qui s'étendent depuis les bords, messages qui clignotent. */
function VirusOverlay({ settled }: { settled: boolean }) {
  const veins = [
    'M0,120 C80,150 120,90 210,140 S330,120 380,190',
    'M0,520 C90,500 140,560 230,520 S340,560 420,500',
    'M1000,80 C920,120 880,60 790,110 S670,90 610,160',
    'M1000,600 C910,560 860,640 770,590 S650,620 600,560',
    'M500,0 C520,90 470,140 520,220',
    'M480,700 C460,620 520,580 490,500',
  ]
  return (
    <div className={`virus${settled ? ' virus--settled' : ''}`} aria-hidden>
      <svg viewBox="0 0 1000 700" preserveAspectRatio="none">
        {veins.map((d, i) => (
          <path key={i} d={d} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </svg>
      {!settled && (
        <div className="virus__messages">
          {VIRUS_MESSAGES.map((m, i) => (
            <p key={m} style={{ animationDelay: `${i * 0.35}s` }}>
              &gt; {m}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function GameOverOverlay({ snapshot, onReplay }: EndingProps) {
  const prompt = useRef<HTMLButtonElement>(null)
  useEffect(() => prompt.current?.focus(), [])

  return (
    <div className="screen gameover cursor-on">
      <h1 className="title title--danger">GAME OVER</h1>
      <p className="terminal gameover__stats">
        {`INFECTION 100%   ERREURS ${snapshot.errors}/${snapshot.maxErrors}\n`}
        {`SCORE ${pad(snapshot.score, 4)} / ${snapshot.scoreMax}\n`}
        {hubLine(snapshot)}
      </p>
      <button ref={prompt} type="button" className="prompt" onClick={onReplay}>
        [ RECOMMENCER ]
      </button>
    </div>
  )
}

// --- Victoire -----------------------------------------------------------------

/** Victoire : la lumière envahit tout, puis éblouissement à la porte. */
export function VictoryOverlay({ stage }: { stage: VictoryStage }) {
  switch (stage) {
    case 'release':
      return <div className="surge" aria-hidden />
    case 'whiteout':
      return <div className="whiteout whiteout--in" aria-hidden />
    case 'room':
      return <div className="whiteout whiteout--out" aria-hidden />
    case 'through':
      return <div className="whiteout whiteout--door" aria-hidden />
    default:
      return null
  }
}

/** Herbe au vent sous une lumière blanche : la sortie des Backrooms. */
function Grass() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return

    let width = 0
    let height = 0
    let blades: { x: number; h: number; lean: number; shade: number; phase: number }[] = []

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = el.clientWidth
      height = el.clientHeight
      el.width = width * dpr
      el.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(width * 1.4)
      blades = Array.from({ length: count }, (_, i) => {
        const depth = i / count
        return {
          x: Math.random() * width,
          h: (40 + Math.random() * 90) * (0.6 + depth * 0.9),
          lean: (Math.random() - 0.5) * 18,
          shade: depth,
          phase: Math.random() * Math.PI * 2,
        }
      })
    }

    let frame = 0
    const draw = (now: number) => {
      const t = now / 1000
      const sky = ctx.createLinearGradient(0, 0, 0, height)
      sky.addColorStop(0, '#fffdf4')
      sky.addColorStop(0.55, '#f4ecd2')
      sky.addColorStop(1, '#d9d2a8')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, width, height)

      const sun = ctx.createRadialGradient(width / 2, height * 0.18, 0, width / 2, height * 0.18, height * 0.6)
      sun.addColorStop(0, 'rgba(255,255,250,1)')
      sun.addColorStop(1, 'rgba(255,255,250,0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, width, height)

      const ground = height * 0.72
      // Sol fondu dans la lumière : pas de ligne d'horizon nette.
      const soil = ctx.createLinearGradient(0, ground - 30, 0, ground + 60)
      soil.addColorStop(0, 'rgba(125,143,85,0)')
      soil.addColorStop(1, '#7d8f55')
      ctx.fillStyle = soil
      ctx.fillRect(0, ground - 30, width, height - ground + 30)
      ctx.lineCap = 'round'
      for (const b of blades) {
        const baseY = ground + b.shade * (height - ground)
        const sway = Math.sin(t * 1.1 + b.x * 0.012 + b.phase * 0.3) * (6 + b.shade * 8)
        const light = 62 - b.shade * 30
        ctx.strokeStyle = `hsl(${78 + b.shade * 10}, ${26 + b.shade * 10}%, ${light}%)`
        ctx.lineWidth = 1 + b.shade * 2.2
        ctx.beginPath()
        ctx.moveTo(b.x, baseY)
        ctx.quadraticCurveTo(b.x + b.lean * 0.5, baseY - b.h * 0.6, b.x + b.lean + sway, baseY - b.h)
        ctx.stroke()
      }
      frame = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={canvas} aria-hidden />
}

/** Compteur qui défile de 0 à `target` après `delay` ms. */
function useCountUp(target: number, duration: number, delay: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(Math.round(target * (1 - (1 - k) ** 3)))
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, delay])
  return value
}

const TITLE = 'TU ES SORTI'
const POLLEN = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i * 0.73) % 9,
  duration: 9 + (i % 6) * 1.7,
  size: 2 + (i % 4),
}))

export function VictoryScreen({ snapshot, onReplay }: EndingProps) {
  const score = useCountUp(snapshot.score, 1800, 1400)
  const freed = snapshot.encounters.filter((e) => e.isCorrect).length + (snapshot.lastAnswer?.isCorrect ? 1 : 0)
  return (
    <div className="screen victory cursor-on">
      <Grass />
      <div className="rays" aria-hidden />
      <div className="pollen" aria-hidden>
        {POLLEN.map((p, i) => (
          <span
            key={i}
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}
      </div>
      <div className="flash" />
      <div className="victory__content">
        <h1 className="title victory__title" aria-label={TITLE}>
          {[...TITLE].map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.5 + i * 0.08}s` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </h1>
        <p className="terminal victory__stats">
          <span>{`SCORE ${pad(score, 4)} / ${snapshot.scoreMax}`}</span>
          <span>{`ENTITÉS LIBÉRÉES ${freed}/${snapshot.totalIntersections}   ERREURS ${snapshot.errors}/${snapshot.maxErrors}`}</span>
          <span className="victory__xp">{hubLine(snapshot)}</span>
        </p>
        <button type="button" className="prompt victory__replay" onClick={onReplay} autoFocus>
          [ REJOUER ]
        </button>
      </div>
    </div>
  )
}
