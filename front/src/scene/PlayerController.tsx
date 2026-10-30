import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, Vector3, type PointLight } from 'three'
import { CCTV_STAGES, type DefeatStage } from '../app/sequence'
import { isFloor, tileAt, tileCenter, type Maze, type Tile } from '../maze/generate'
import { moveWithCollisions, type Circle, type Vec2 } from '../maze/physics'
import { neonFlicker } from './flicker'
import { EYE_HEIGHT, PALETTE } from './layout'
import { baseTremor, decayTrauma, headBob, shakeOffset } from './motion'

// Contrôle à la première personne : déplacement au clavier (ZQSD/WASD, flèches),
// regard à la souris (pointer lock) ou aux flèches gauche/droite, collisions
// avec les murs et les entités. Quand le joueur lit un panneau, la caméra se
// place d'elle-même face à l'entité.

export interface EntityPose {
  id: number
  position: Vec2
  /** Où se tient le joueur pour lire le panneau. */
  reading: Vec2
  /** Hauteur du centre du panneau : la caméra s'incline pour le lire. */
  signY: number
}

export interface PlayerInfo {
  tile: Tile
  yaw: number
}

interface PlayerControllerProps {
  maze: Maze
  entities: readonly EntityPose[]
  /** Entités présentes physiquement (collisions). */
  obstacles: readonly Circle[]
  /** Entité dont on lit le panneau : la caméra s'y place. */
  readingEntity: number | null
  /** Le joueur peut se déplacer (phase d'exploration). */
  canMove: boolean
  isEngageable: (id: number) => boolean
  shake: number
  danger: number
  lightsOff: boolean
  onNearEntity: (id: number | null) => void
  onPlayerMoved: (info: PlayerInfo) => void
  /** Clic sur une entité proche : l'aborder. */
  onEngage: (id: number) => void
  /**
   * Défaite : le joueur est figé, ne peut que tourner la tête ; puis la caméra
   * de surveillance prend le relais (elle pose la caméra, lui n'y touche plus).
   */
  defeat?: { stage: DefeatStage; faceYaw: number; stand: Vec2 } | null
  /** Victoire : il avance seul et traverse la porte, sans collisions. */
  autoWalk?: boolean
  /** Victoire : la lumière envahit tout, le regard s'élève. */
  dazzled?: boolean
}

const WALK_SPEED = 2.8
const RUN_SPEED = 4.6
const TURN_SPEED = 2.2
const MOUSE_SENSITIVITY = 0.0022
const MAX_PITCH = 1.1
const ENGAGE_DISTANCE = 2.9
const READING_TRANSITION = 0.55
const HALO_INTENSITY = 2.6
const EMERGENCY = new Color(PALETTE.danger)
const NEON = new Color(PALETTE.halo)
/** Étapes de la défaite où le joueur, figé, peut encore tourner la tête. */
const LOOK_ONLY: readonly DefeatStage[] = ['freeze', 'approach', 'beat']

const forward = new Vector3()
const smooth = (t: number) => t * t * (3 - 2 * t)

function yawFacing(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function shortestAngle(from: number, to: number): number {
  return ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

/** Pas de mur entre deux points (échantillonnage le long du segment). */
function lineOfSight(maze: Maze, a: Vec2, b: Vec2): boolean {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25)
  for (let i = 1; i < steps; i++) {
    const t = tileAt(a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps)
    if (!isFloor(maze, t.x, t.y)) return false
  }
  return true
}

export function PlayerController(props: PlayerControllerProps) {
  const { maze, readingEntity, canMove, lightsOff, shake, defeat = null, autoWalk = false, dazzled = false } = props
  const gl = useThree((state) => state.gl)
  const halo = useRef<PointLight>(null)

  const start = tileCenter(maze.spawn)
  const pose = useRef({
    x: start.x,
    z: start.z,
    yaw: Math.atan2(-maze.spawn.facing.dx, -maze.spawn.facing.dy),
    pitch: 0,
  })
  const keys = useRef(new Set<string>())
  const transition = useRef<{ from: typeof pose.current; startedAt: number | null; entity: number } | null>(null)
  const trauma = useRef(0)
  const bob = useRef(0)
  // Dans le noir de la défaite, le joueur lève les yeux vers les silhouettes qui l'entourent.
  const lookUp = useRef(0)
  const near = useRef<number | null>(null)
  const reported = useRef<{ key: string; yaw: number } | null>(null)
  // Défaite : début du figement (les néons meurent).
  const frozen = useRef({ stage: null as DefeatStage | null, freezeStart: 0 })
  // Les props changent à chaque rendu ; la boucle d'animation lit toujours les dernières.
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  // Clavier : on mémorise les touches physiques enfoncées (ZQSD sur AZERTY = WASD).
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code)
    const up = (e: KeyboardEvent) => keys.current.delete(e.code)
    const clear = () => keys.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // Souris : regard en pointer lock ; clic = verrouiller, ou aborder l'entité visée.
  useEffect(() => {
    const canvas = gl.domElement
    const onClick = () => {
      const lookOnly = latest.current.defeat && LOOK_ONLY.includes(latest.current.defeat.stage)
      if (!latest.current.canMove && !lookOnly) {
        return
      }
      if (lookOnly) {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {})
        return
      }
      if (near.current !== null && document.pointerLockElement === canvas) {
        latest.current.onEngage(near.current)
        return
      }
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()?.catch?.(() => {})
      }
    }
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const lookOnly = latest.current.defeat && LOOK_ONLY.includes(latest.current.defeat.stage)
      if (lookOnly) {
        // Figé : seul le regard gauche / droite répond.
        pose.current.yaw -= e.movementX * MOUSE_SENSITIVITY
        return
      }
      if (!latest.current.canMove) return
      pose.current.yaw -= e.movementX * MOUSE_SENSITIVITY
      pose.current.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pose.current.pitch - e.movementY * MOUSE_SENSITIVITY))
    }
    canvas.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMove)
    return () => {
      canvas.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMove)
    }
  }, [gl])

  // Lecture d'un panneau : on libère la souris pour viser les choix.
  useEffect(() => {
    if (readingEntity === null) {
      transition.current = null
      return
    }
    if (document.pointerLockElement) document.exitPointerLock()
    transition.current = { from: { ...pose.current }, startedAt: null, entity: readingEntity }
  }, [readingEntity])

  useEffect(() => {
    if (shake > 0) trauma.current = Math.max(trauma.current, shake)
  }, [shake])

  // Outil de test, absent du build de production : se téléporter dans le labyrinthe.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhTeleport?: (x: number, z: number, yaw: number, pitch?: number) => void }
    debug.__qhTeleport = (x, z, yaw, pitch = 0) => {
      Object.assign(pose.current, { x, z, yaw, pitch })
    }
    return () => {
      delete debug.__qhTeleport
    }
  }, [])

  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const { entities, obstacles, isEngageable, danger, onNearEntity, onPlayerMoved } = latest.current
    const p = pose.current
    let moved = 0

    const reading = transition.current
    if (reading) {
      // Placement automatique face à l'entité.
      const target = entities.find((e) => e.id === reading.entity)
      if (target) {
        reading.startedAt ??= t
        const k = smooth(Math.min(1, (t - reading.startedAt) / READING_TRANSITION))
        const yaw = yawFacing(target.reading, target.position)
        // Le regard s'incline vers le panneau, qu'il soit brandi en l'air ou tenu bas.
        const span = Math.hypot(target.reading.x - target.position.x, target.reading.z - target.position.z)
        const pitch = Math.atan2(target.signY - EYE_HEIGHT, span) - 0.02
        p.x = reading.from.x + (target.reading.x - reading.from.x) * k
        p.z = reading.from.z + (target.reading.z - reading.from.z) * k
        p.yaw = reading.from.yaw + shortestAngle(reading.from.yaw, yaw) * k
        p.pitch = reading.from.pitch + (pitch - reading.from.pitch) * k
      }
    } else if (canMove) {
      const k = keys.current
      const pressed = (...codes: string[]) => codes.some((c) => k.has(c))
      const ahead = (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0)
      const side = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0)
      const turn = (pressed('ArrowLeft') ? 1 : 0) - (pressed('ArrowRight') ? 1 : 0)
      p.yaw += turn * TURN_SPEED * dt

      if (ahead || side) {
        const speed = pressed('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED
        const fx = -Math.sin(p.yaw)
        const fz = -Math.cos(p.yaw)
        const rx = Math.cos(p.yaw)
        const rz = -Math.sin(p.yaw)
        let dx = fx * ahead + rx * side
        let dz = fz * ahead + rz * side
        const len = Math.hypot(dx, dz)
        dx = (dx / len) * speed * dt
        dz = (dz / len) * speed * dt
        const next = moveWithCollisions(maze, p, { x: dx, z: dz }, obstacles)
        moved = Math.hypot(next.x - p.x, next.z - p.z) / (WALK_SPEED * dt)
        p.x = next.x
        p.z = next.z
      }

      // Entité abordable : assez près, devant soi, sans mur entre les deux.
      let best: number | null = null
      let bestDistance = ENGAGE_DISTANCE
      const fx = -Math.sin(p.yaw)
      const fz = -Math.cos(p.yaw)
      for (const e of entities) {
        if (!isEngageable(e.id)) continue
        const dx = e.position.x - p.x
        const dz = e.position.z - p.z
        const d = Math.hypot(dx, dz)
        if (d >= bestDistance || (fx * dx + fz * dz) / d < 0.55) continue
        if (!lineOfSight(maze, p, e.position)) continue
        best = e.id
        bestDistance = d
      }
      if (best !== near.current) {
        near.current = best
        onNearEntity(best)
      }
    }
    // Défaite : figé, il ne peut que tourner la tête (flèches, A/D ou Q/D, souris).
    if (defeat && LOOK_ONLY.includes(defeat.stage)) {
      const k = keys.current
      const turn = (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0) - (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0)
      p.yaw += turn * TURN_SPEED * 0.8 * dt
      // À la paralysie, la tête se tourne d'elle-même vers d'où elles viennent.
      if (defeat.stage === 'freeze') {
        p.yaw += shortestAngle(p.yaw, defeat.faceYaw) * Math.min(1, dt * 2.2)
        // Il recule en titubant jusqu'au milieu du couloir.
        p.x += (defeat.stand.x - p.x) * Math.min(1, dt * 2.5)
        p.z += (defeat.stand.z - p.z) * Math.min(1, dt * 2.5)
        moved = 0.6
      }
      p.pitch += (0 - p.pitch) * Math.min(1, dt * 3)
    }
    // Victoire : il franchit la porte de lui-même.
    if (autoWalk) {
      p.x += -Math.sin(p.yaw) * 1.5 * dt
      p.z += -Math.cos(p.yaw) * 1.5 * dt
      moved = 0.55
    }
    if (!canMove && near.current !== null) {
      near.current = null
      onNearEntity(null)
    }

    // Position signalée au HUD (signal, direction) seulement quand elle change vraiment.
    const tile = tileAt(p.x, p.z)
    const key = `${tile.x},${tile.y}`
    if (!reported.current || reported.current.key !== key || Math.abs(reported.current.yaw - p.yaw) > 0.4) {
      reported.current = { key, yaw: p.yaw }
      onPlayerMoved({ tile, yaw: p.yaw })
    }

    // Head-bob proportionnel à la vitesse, secousses, tremblement selon le danger.
    bob.current += (Math.min(1.4, moved) - bob.current) * Math.min(1, dt * 8)
    const b = headBob(t, bob.current)
    const hurt = frozen.current
    if (defeat && defeat.stage !== hurt.stage) {
      hurt.stage = defeat.stage
      if (defeat.stage === 'freeze') hurt.freezeStart = t
    }
    // Filmé par la caméra de surveillance : la vue n'est plus la sienne.
    const filmed = !!defeat && CCTV_STAGES.includes(defeat.stage)

    trauma.current = decayTrauma(trauma.current, dt)
    const tremor = defeat ? Math.max(trauma.current, 0.12) : lightsOff ? 0 : Math.max(trauma.current, baseTremor(danger))
    const s = shakeOffset(tremor, t)
    const breathe = Math.sin(t * (defeat ? 3.2 : 1.3)) * (defeat ? 0.014 : 0.006)

    const lookTarget = defeat ? 0.16 : dazzled ? 0.14 : lightsOff ? 0.34 : 0
    lookUp.current += (lookTarget - lookUp.current) * Math.min(1, dt * 1.2)

    if (!filmed) {
      camera.rotation.order = 'YXZ'
      camera.position.set(p.x + b.x + s.x, EYE_HEIGHT + b.y + s.y + breathe, p.z)
      camera.rotation.set(p.pitch + lookUp.current + s.pitch, p.yaw + s.yaw, b.roll + s.roll)
    }

    if (halo.current && filmed && defeat) {
      // Le dernier néon qui tient encore, juste au-dessus de lui, et qui grésille.
      halo.current.position.set(defeat.stand.x, 2.3, defeat.stand.z)
      halo.current.color.copy(NEON)
      halo.current.intensity = HALO_INTENSITY * 1.25 * (0.35 + 0.65 * neonFlicker(t, 0.7, 3))
    } else if (halo.current) {
      camera.getWorldDirection(forward)
      halo.current.position.copy(camera.position).addScaledVector(forward, 0.4)
      halo.current.position.y += 0.25
      if (defeat) {
        // Les néons meurent ; une lueur rouge d'urgence prend le relais, au rythme du cœur.
        const sinceFreeze = t - hurt.freezeStart
        const dying = defeat.stage === 'freeze' && sinceFreeze < 0.9
        const beat = Math.max(0, Math.sin(t * 7.5)) ** 6
        halo.current.color.copy(dying ? NEON : EMERGENCY)
        halo.current.intensity = dying
          ? HALO_INTENSITY * neonFlicker(t * 3, 1, 5) * (1 - sinceFreeze / 0.9)
          : defeat.stage === 'knockout'
            ? 0
            : 2.6 * Math.min(1, (sinceFreeze - 0.9) / 0.8) * (0.7 + 0.5 * beat)
      } else {
        halo.current.color.copy(NEON)
        halo.current.intensity = lightsOff ? 0 : HALO_INTENSITY * (dazzled ? 2.5 : 0.65 + 0.35 * neonFlicker(t, danger, 99))
      }
    }
  })

  return <pointLight ref={halo} color={PALETTE.halo} distance={8} decay={2} />
}
