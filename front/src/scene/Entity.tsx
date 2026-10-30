import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Color, MeshBasicMaterial, MeshStandardMaterial, Vector3, type Group } from 'three'
import { APPROACH_SECONDS, type DefeatStage } from '../app/sequence'
import { playEntityStep, reportEntity } from '../audio/stage'
import type { EntityRender } from '../game/render'
import { pathLength, pointAlong, type ApproachPlan } from '../maze/approach'
import type { Archetype, EntityLook } from './entities/archetypes'
import { Crawler } from './entities/Crawler'
import { CrtSuit } from './entities/CrtSuit'
import { Disintegration } from './entities/Disintegration'
import { sampleCloud, type ParticleCloud } from './entities/particles'
import { FleshCluster } from './entities/FleshCluster'
import { Mannequin } from './entities/Mannequin'
import { breakFor, writeGesture } from './entities/signBreak'
import {
  angerTarget,
  attackEnvelope,
  clamp01,
  damp,
  getTeethTexture,
  initialMotion,
  type ArchetypeProps,
  type EntityMaterials,
} from './entities/anim'
import { RaincoatChild } from './entities/RaincoatChild'
import { TallMan } from './entities/TallMan'
import { PALETTE } from './layout'

// Une entité du labyrinthe : place, humeur (état du serveur), regard, marche et
// coups pendant la défaite, désintégration quand on l'a franchie. Le corps
// lui-même vient de son archétype (`entities/`).

export type Reaction = 'none' | 'correct' | 'wrong'

const MODELS: Record<Archetype, ComponentType<ArchetypeProps>> = {
  tall: TallMan,
  mannequin: Mannequin,
  crawler: Crawler,
  child: RaincoatChild,
  crt: CrtSuit,
  cluster: FleshCluster,
}

/** Matières propres à chaque monstre : peau mate, plastique lustré, chair humide… */
const SURFACE: Record<Archetype, { roughness: number; metalness: number }> = {
  tall: { roughness: 1, metalness: 0 },
  mannequin: { roughness: 0.28, metalness: 0.05 },
  crawler: { roughness: 0.75, metalness: 0 },
  child: { roughness: 0.45, metalness: 0 },
  crt: { roughness: 0.9, metalness: 0 },
  cluster: { roughness: 0.35, metalness: 0.08 },
}

const ANGRY_EYES = new Color(PALETTE.danger).multiplyScalar(2.4)
/** Au-delà, le brouillard (densité 0,12) a tout avalé : inutile de la dessiner. */
const CULL_DISTANCE = 20
const toCamera = new Vector3()
/** Vitesse de course vers le joueur (m/s) : elle part d'autant plus tard qu'elle est près. */
const CHARGE_SPEED = 3.4
/** Elle frappe à cette distance de lui : plus loin, elle fait un pas pour l'atteindre (m). */
const STRIKE_REACH = 0.72
/** Accélère jusqu'au bout : elle arrive lancée, sans ralentir. */
const charge = (k: number) => k * k * (2 - k)

export interface DefeatRole {
  stage: DefeatStage
  plan: ApproachPlan
  /** Instants (s, depuis le début du passage à tabac) où cette entité frappe. */
  hits: number[]
  /** Instant où elle arrive sur lui (s, depuis le début du passage à tabac). */
  arrival: number
  /** Instant où il est à terre : elle se penche pour continuer. */
  fallAt: number
  /** Le joueur (son corps, là où il a reculé) : elles s'y tournent et le fixent. */
  target: { x: number; z: number }
}

interface EntityProps {
  render: EntityRender
  look: EntityLook
  position: [number, number, number]
  /** Rotation Y : le modèle regarde vers +z. */
  rotationY?: number
  /** Le joueur lit son panneau. */
  engaged?: boolean
  /** Réaction en cours à la réponse donnée sur son panneau. */
  reaction?: Reaction
  /** Défaite : elle vient frapper le joueur. */
  defeat?: DefeatRole | null
  /** Victoire : silhouette translucide qui laisse passer le joueur. */
  ghost?: boolean
  /** Identifiant pour le son : sans lui, l'entité est muette (les ombres de la pièce blanche). */
  soundId?: number
  sign: ReactNode
}

/** Écart d'angle le plus court (rad). */
function shortestAngle(from: number, to: number): number {
  return ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

export function Entity({
  render,
  look,
  position,
  rotationY = 0,
  engaged = false,
  reaction = 'none',
  defeat = null,
  ghost = false,
  soundId,
  sign,
}: EntityProps) {
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const motion = useRef(initialMotion())
  const breakStyle = useMemo(() => breakFor(look), [look])
  const [cloud, setCloud] = useState<ParticleCloud | null>(null)

  const mats = useMemo<EntityMaterials>(() => {
    if (ghost) {
      const shade = new MeshBasicMaterial({ color: '#6f6a61', transparent: true, opacity: 0.6 })
      return { body: shade, secondary: shade, eye: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), dark: shade, teeth: shade }
    }
    const surface = SURFACE[look.archetype]
    return {
      body: new MeshStandardMaterial({ color: look.palette.body, ...surface }),
      secondary: new MeshStandardMaterial({ color: look.palette.secondary, ...surface }),
      eye: new MeshBasicMaterial({ toneMapped: false }),
      dark: new MeshBasicMaterial({ color: '#020203' }),
      teeth: new MeshBasicMaterial({ map: getTeethTexture(), transparent: true, alphaTest: 0.4, toneMapped: false }),
    }
  }, [look, ghost])
  useEffect(
    () => () => {
      for (const m of new Set(Object.values(mats))) m.dispose()
    },
    [mats],
  )
  const calmEyes = useMemo(() => new Color(look.palette.glow).multiplyScalar(0.35), [look])
  const watchingEyes = useMemo(() => new Color(look.palette.glow).multiplyScalar(1), [look])

  const s = useRef({
    wasVisible: render.visible,
    reaction: 'none' as Reaction,
    reactionStart: 0,
    stage: null as DefeatStage | null,
    approachStart: 0,
    beatStart: 0,
    walked: 0,
    footfall: 0,
    /** Instant de la mauvaise réponse : le geste qui détruit le panneau part de là. */
    brokeAt: null as number | null,
    placed: false,
    springs: {
      look: { value: 0, velocity: 0 },
      anger: { value: 0, velocity: 0 },
      fresh: { value: 0, velocity: 0 },
      menace: { value: 0, velocity: 0 },
      walk: { value: 0, velocity: 0 },
      heading: { value: rotationY, velocity: 0 },
      lunge: { value: 0, velocity: 0 },
      stoop: { value: 0, velocity: 0 },
    },
  })

  useFrame(({ clock, camera }, rawDt) => {
    const r = root.current
    const b = body.current
    if (!r || !b) return
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const st = s.current
    const sp = st.springs
    const m = motion.current
    m.t = t
    m.ghost = ghost

    // --- Franchie : elle se désintègre en particules. ---
    if (!render.visible) {
      if (st.wasVisible && !cloud) setCloud(sampleCloud(b, r, ghost ? '#6f6a61' : look.palette.body, ghost ? 0 : 0.3))
      st.wasVisible = false
      b.visible = false
      if (soundId !== undefined) reportEntity(soundId, look.archetype, r.position.x, r.position.z, 'calm', false, t)
      return
    }
    st.wasVisible = true

    // --- Humeur et réaction en cours (lissées : aucun geste ne démarre d'un coup). ---
    if (reaction !== st.reaction) {
      st.reaction = reaction
      st.reactionStart = t
      if (reaction === 'wrong' && st.brokeAt === null) st.brokeAt = t
    }
    writeGesture(m, breakStyle, st.brokeAt === null ? null : t - st.brokeAt)
    const since = t - st.reactionStart
    m.mood = render.mood === 'angry' ? 'angry' : render.mood === 'smiling' || defeat ? 'menace' : 'calm'
    m.angerSince = reaction === 'wrong' ? since : null
    m.approvalSince = reaction === 'correct' ? since : null
    m.engaged = engaged
    m.anger = damp(sp.anger, angerTarget(m.mood, m.angerSince), 0.12, dt)
    const freshTarget = m.angerSince !== null && m.angerSince < 2.4 ? 1 : 0
    m.fresh = damp(sp.fresh, freshTarget, freshTarget > sp.fresh.value ? 0.08 : 0.45, dt)
    m.menace = damp(sp.menace, m.mood === 'menace' ? 1 : 0, 0.3, dt)

    // --- Défaite : marche jusqu'à sa place autour du joueur, puis coups. ---
    let walking = 0
    m.attack = 0
    let heading = rotationY
    if (defeat) {
      if (defeat.stage !== st.stage) {
        st.stage = defeat.stage
        if (defeat.stage === 'approach') st.approachStart = t
        if (defeat.stage === 'beat') st.beatStart = t
      }
      const path = defeat.plan.path
      const total = pathLength(path)
      // Une seule horloge pour la course et les coups, en secondes depuis le début du passage à tabac.
      const clock =
        defeat.stage === 'freeze' ? -Infinity : defeat.stage === 'approach' ? t - st.approachStart - APPROACH_SECONDS : t - st.beatStart
      // Elle court, part juste à temps et arrive lancée à l'instant où le passage à tabac la réclame.
      const available = APPROACH_SECONDS + defeat.arrival
      const travel = Math.min(available, Math.max(0.4, total / CHARGE_SPEED))
      const k = clamp01((clock + APPROACH_SECONDS - (available - travel)) / travel)
      const dist = Math.max(st.walked, total * charge(k))
      const speed = Math.max(0, dist - st.walked) / Math.max(dt, 1e-3)
      walking = Math.min(1, speed / 0.6)
      m.walkPhase += Math.max(0, dist - st.walked) * 3.2
      // Un pied touche le sol à chaque demi-cycle de marche.
      const footfall = Math.floor(m.walkPhase / Math.PI)
      if (footfall !== st.footfall) {
        st.footfall = footfall
        if (soundId !== undefined) playEntityStep(look.archetype, r.position.x, r.position.z)
      }
      st.walked = dist
      const at = pointAlong(path, dist)
      // Le geste commence dans la foulée : elle arme son coup en arrivant.
      if (clock > -2) m.attack = attackEnvelope(defeat.hits, clock)
      // Trop loin pour l'atteindre : elle fait un pas dans le coup, puis revient.
      const toX = defeat.target.x - at.x
      const toZ = defeat.target.z - at.z
      const gap = Math.hypot(toX, toZ) || 1
      const strike = Math.max(0, m.attack)
      const lunge = damp(sp.lunge, strike * Math.max(0, gap - STRIKE_REACH), 0.05, dt)
      r.position.set(at.x + (toX / gap) * lunge, 0, at.z + (toZ / gap) * lunge)
      // En marche, face au chemin ; arrivée, elle se tourne vers le joueur.
      heading = walking > 0.2 && dist < total - 0.05 ? at.heading : Math.atan2(toX, toZ)
      // Il est à terre : elle se penche sur lui pour continuer.
      const down = clamp01((clock - defeat.fallAt) / 0.7)
      b.rotation.x = damp(sp.stoop, down * (0.3 + 0.4 * strike), 0.1, dt)
    } else {
      st.stage = null
      st.walked = 0
      b.rotation.x = 0
      r.position.set(position[0], 0, position[2])
    }
    if (soundId !== undefined) reportEntity(soundId, look.archetype, r.position.x, r.position.z, m.mood, true, t)
    m.walk = damp(sp.walk, walking, 0.18, dt)
    // Rotation amortie, par le plus court chemin.
    if (!st.placed) sp.heading.value = heading
    st.placed = true
    const wrapped = sp.heading.value + shortestAngle(sp.heading.value, heading)
    r.rotation.y = damp(sp.heading, wrapped, defeat ? 0.16 : 0.01, dt)

    // Perdue dans le brouillard : ni dessinée, ni éclairée.
    b.visible = camera.position.distanceToSquared(r.position) < CULL_DISTANCE * CULL_DISTANCE

    // --- Regard vers le joueur (les curieux, celle qu'on lit, les fâchées). ---
    // Pendant la défaite, c'est son corps qu'elles fixent, pas la caméra de surveillance.
    if (defeat) toCamera.set(defeat.target.x, 1.5, defeat.target.z)
    else toCamera.copy(camera.position)
    r.worldToLocal(toCamera)
    const distance = Math.hypot(toCamera.x, toCamera.z)
    const tracking = !ghost && (look.watches || engaged || m.mood !== 'calm') && distance < 10
    const targetYaw = tracking ? Math.max(-1.2, Math.min(1.2, Math.atan2(toCamera.x, toCamera.z))) : 0
    m.lookYaw = damp(sp.look, targetYaw, 0.32, dt)

    // --- Yeux : pâles au repos, vifs quand ils fixent, rouges de colère (en fondu). ---
    if (!ghost) {
      const eyes = m.mood === 'calm' ? (tracking ? watchingEyes : calmEyes) : ANGRY_EYES
      mats.eye.color.lerp(eyes, Math.min(1, dt * 8))
    }
  })

  const Model = MODELS[look.archetype]
  return (
    <group ref={root} name={`entity-${look.archetype}`} position={position} rotation={[0, rotationY, 0]}>
      <group ref={body} scale={look.scale}>
        <Model look={look} motion={motion} mats={mats} sign={sign} ghost={ghost} />
      </group>
      {cloud && <Disintegration cloud={cloud} additive={!ghost} />}
    </group>
  )
}
