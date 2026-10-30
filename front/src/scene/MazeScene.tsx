import { Canvas, useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { Color, type FogExp2, type HemisphereLight } from 'three'
import type { Question } from '../api/client'
import { beatSchedule, CCTV_STAGES, type DefeatStage, type VictoryStage } from '../app/sequence'
import { toEntityState, toWorldState, upsetEntities, type EntityMood } from '../game/render'
import type { GameSnapshot } from '../game/types'
import { planApproach } from '../maze/approach'
import type { ExitRoom } from '../maze/exitRoom'
import { entityPlacement, tileCenter, type Maze } from '../maze/generate'
import type { Circle } from '../maze/physics'
import type { RadioSpot } from '../maze/radioSpot'
import { Effects } from './Effects'
import { entityLook, SIGN_HEIGHT, WALL_CLEARANCE, type EntityLook } from './entities/archetypes'
import { Entity, type DefeatRole, type Reaction } from './Entity'
import { EYE_HEIGHT, PALETTE } from './layout'
import { MazeWorld } from './MazeWorld'
import { DPR_CEILING } from './adaptiveDpr'
import { AdaptiveDpr, DevSceneHook, ParticleWarmup, ShaderWarmup } from './Performance'
import { Blood } from './Blood'
import { createProbe } from './defeatBody'
import { PlayerBody } from './PlayerBody'
import { SecurityCamera } from './SecurityCamera'
import { PlayerController, type EntityPose, type PlayerInfo } from './PlayerController'
import { RadioCorner } from './RadioCorner'
import { Sign } from './Sign'
import { SoundStage } from './SoundStage'
import { WakeRoom } from './WakeRoom'
import { WhiteRoom, type FreedEntity } from './WhiteRoom'

// Scène 3D pilotée par l'état dérivé du serveur (`toWorldState`, `toEntityState`)
// et par les étapes de mise en scène des fins. Elle n'appelle jamais l'API et
// ne connaît pas les règles.
//
// Trois mondes : le labyrinthe ; la pièce du réveil (défaite) ; la pièce
// blanche à la porte (victoire).

const ENTITY_RADIUS = 0.38
const NO_ENTITIES: EntityPose[] = []
const NO_OBSTACLES: Circle[] = []
const noop = () => {}
const never = () => false
const VOID = new Color(PALETTE.void)
const LIGHT = new Color('#fffaf0')

export interface MazeSceneProps {
  maze: Maze
  /** La radio et sa table, au milieu du niveau. */
  radio: RadioSpot | null
  /** Le joueur a le nez dans le journal : il ne bouge plus. */
  frozen: boolean
  exitRoom: ExitRoom
  snapshot: GameSnapshot
  defeatStage: DefeatStage | null
  victoryStage: VictoryStage | null
  /** Choix mis en évidence sur le panneau lu (survol, clavier, réponse donnée). */
  highlight: number | null
  /** Mode test (mock) : bonne réponse signalée sur le panneau. */
  answer: number | null
  onNearEntity: (id: number | null) => void
  onPlayerMoved: (info: PlayerInfo) => void
  onHoverChoice: (choice: number | null) => void
  onPickChoice?: (choice: number) => void
}

type World = 'maze' | 'wake' | 'white'

const MAZE_DEFEAT: readonly DefeatStage[] = ['freeze', 'approach', 'beat', 'knockout']

function worldFor(defeat: DefeatStage | null, victory: VictoryStage | null): World {
  if (defeat && !MAZE_DEFEAT.includes(defeat)) return 'wake'
  if (victory && victory !== 'release' && victory !== 'whiteout') return 'white'
  return 'maze'
}

/**
 * Lueur d'appoint de la défaite, froide (les silhouettes se détachent du noir
 * sur l'image de surveillance). Toujours montée, éteinte hors défaite : le
 * nombre de lumières ne change jamais, aucune matière n'a à recompiler.
 */
function DreadGlow({ on }: { on: boolean }) {
  const light = useRef<HemisphereLight>(null)
  useFrame((_, dt) => {
    if (light.current) light.current.intensity += ((on ? 0.7 : 0) - light.current.intensity) * Math.min(1, dt * 4)
  })
  return <hemisphereLight ref={light} args={['#4f5a52', '#0a0b0a', 0]} />
}

interface EntitySlotProps {
  id: number
  look: EntityLook
  x: number
  z: number
  yaw: number
  mood: EntityMood
  visible: boolean
  smileOnly: boolean
  engaged: boolean
  reaction: Reaction
  defeat: DefeatRole | null
  /** Pendant la défaite, elles lâchent leurs panneaux. */
  holdsSign: boolean
  question: Question | null
  showQuestion: boolean
  broken: boolean
  highlight: number | null
  answer: number | null
  onHover?: (choice: number | null) => void
  onPick?: (choice: number) => void
}

/**
 * Une entité et son panneau, en props primitives : seule celle dont l'état
 * change (celle qu'on lit, celle qui réagit) se re-rend.
 */
const EntitySlot = memo(function EntitySlot(props: EntitySlotProps) {
  const { id, look, x, z, yaw, mood, visible, smileOnly, engaged, reaction, defeat } = props
  const render = useMemo(() => ({ mood, visible, smileOnly }), [mood, visible, smileOnly])
  const position = useMemo<[number, number, number]>(() => [x, 0, z], [x, z])
  return (
    <Entity
      soundId={id}
      render={render}
      look={look}
      position={position}
      rotationY={yaw}
      engaged={engaged}
      reaction={reaction}
      defeat={defeat}
      sign={
        props.holdsSign ? (
          <Sign
            question={props.question}
            showQuestion={props.showQuestion}
            broken={props.broken}
            highlight={props.highlight}
            answer={props.answer}
            onHover={props.onHover}
            onPick={props.onPick}
          />
        ) : null
      }
    />
  )
})

/** Victoire : la lumière envahit le labyrinthe, le brouillard vire au blanc. */
function LightSurge({ active }: { active: boolean }) {
  const startedAt = useRef<number | null>(null)
  useFrame(({ clock, scene }) => {
    if (!active) {
      startedAt.current = null
      return
    }
    startedAt.current ??= clock.elapsedTime
    const k = Math.min(1, (clock.elapsedTime - startedAt.current) / 2.6)
    const level = k * k
    const fog = scene.fog as FogExp2 | null
    if (fog) {
      fog.color.lerpColors(VOID, LIGHT, level)
      fog.density = 0.12 + level * 0.1
    }
    if (scene.background instanceof Color) scene.background.lerpColors(VOID, LIGHT, level)
  })
  return null
}

function MazeContents(props: MazeSceneProps) {
  const { maze, radio, frozen, snapshot, highlight, answer, defeatStage, victoryStage } = props
  const { onNearEntity, onPlayerMoved, onHoverChoice, onPickChoice } = props
  const world = toWorldState(snapshot)

  const placements = useMemo(
    () =>
      maze.entities.map((spot) => {
        const look = entityLook(maze.seed, spot.id)
        return { id: spot.id, look, signY: SIGN_HEIGHT[look.archetype] * look.scale, ...entityPlacement(spot, WALL_CLEARANCE[look.archetype]) }
      }),
    [maze],
  )
  const slots = placements.map((p) => toEntityState(snapshot, p.id))
  const obstacles: Circle[] = placements
    .filter((_, i) => slots[i].entity.visible && slots[i].entity.mood !== 'smiling')
    .map((p) => ({ ...p.position, radius: ENTITY_RADIUS }))
  if (radio) obstacles.push(radio.obstacle)

  // Défaite : celles qu'on a fâchées reviennent par les couloirs et frappent, chacune son tour.
  const upset = upsetEntities(snapshot)
  const upsetKey = upset.join(',')
  const roles = useMemo(() => {
    const engaged = snapshot.engagedEntity
    const player = engaged !== null ? placements[engaged].reading : tileCenter(maze.spawn)
    const attackers = upset.map((id) => ({ entity: id, from: placements[id].position }))
    const { plans, facing, stand, camera } = planApproach(maze, player, attackers)
    const hits = beatSchedule(upset.length)
    return {
      plans: new Map(plans.map((plan, i) => [plan.entity, { plan, hits: hits.filter((h) => h.attacker === i).map((h) => h.at) }])),
      // Chaque coup, et d'où il vient (la place de l'assaillant) : le corps recule à l'opposé.
      bodyHits: hits.map((h) => ({ at: h.at, from: plans[h.attacker].path[plans[h.attacker].path.length - 1] })),
      // Le regard du joueur se tourne vers elles ; son corps leur fait face.
      faceYaw: Math.atan2(-facing.x, -facing.z),
      bodyYaw: Math.atan2(facing.x, facing.z),
      stand,
      camera,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, placements, upsetKey, snapshot.engagedEntity])

  const filmed = defeatStage !== null && CCTV_STAGES.includes(defeatStage)
  const probe = useRef(createProbe())

  const reactionOf = (id: number): Reaction => {
    if (snapshot.engagedEntity !== id || !snapshot.lastAnswer) return 'none'
    return snapshot.lastAnswer.isCorrect ? 'correct' : 'wrong'
  }
  // Rôles de défaite stables d'une image à l'autre (les créneaux sont mémoïsés).
  const defeatRoles = useMemo(() => {
    const out = new Map<number, DefeatRole>()
    if (!defeatStage) return out
    for (const [id, role] of roles.plans) out.set(id, { stage: defeatStage, plan: role.plan, hits: role.hits, target: roles.stand })
    return out
  }, [roles, defeatStage])

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fogExp2 attach="fog" args={[PALETTE.void, 0.12]} />
      <ambientLight color="#4a4026" intensity={world.lightsOff ? 0 : 0.02} />
      <LightSurge active={victoryStage === 'release'} />

      <PlayerController
        key={`maze-${maze.seed}`}
        maze={maze}
        entities={placements}
        obstacles={obstacles}
        readingEntity={defeatStage ? null : snapshot.engagedEntity}
        canMove={snapshot.phase === 'exploring' && !frozen}
        isEngageable={(id) => !slots[id]?.resolved}
        shake={world.shake}
        danger={world.danger}
        lightsOff={world.lightsOff}
        onNearEntity={onNearEntity}
        onPlayerMoved={onPlayerMoved}
        defeat={defeatStage ? { stage: defeatStage, faceYaw: roles.faceYaw, stand: roles.stand } : null}
        dazzled={victoryStage === 'release'}
      />

      <MazeWorld maze={maze} danger={world.danger} dark={world.lightsOff} surge={victoryStage === 'release' ? 1 : 0} />
      {radio && <RadioCorner spot={radio} dark={world.lightsOff} />}
      <DreadGlow on={filmed} />
      {/* Défaite filmée : son corps, son sang, la caméra du couloir. */}
      <PlayerBody stage={defeatStage} stand={roles.stand} yaw={roles.bodyYaw} hits={roles.bodyHits} probe={probe} />
      <Blood stage={defeatStage} hits={roles.bodyHits} probe={probe} />
      <SecurityCamera spot={roles.camera} active={filmed} />
      <ParticleWarmup />
      <ShaderWarmup deps={maze} />

      {placements.map((p, i) => {
        const slot = slots[i]
        return (
          <EntitySlot
            key={`${maze.seed}-${p.id}`}
            id={p.id}
            look={p.look}
            x={p.position.x}
            z={p.position.z}
            yaw={p.yaw}
            mood={slot.entity.mood}
            visible={slot.entity.visible}
            smileOnly={slot.entity.smileOnly}
            engaged={slot.engaged}
            reaction={reactionOf(p.id)}
            defeat={defeatRoles.get(p.id) ?? null}
            holdsSign={!defeatStage}
            question={slot.engaged ? snapshot.question : null}
            showQuestion={slot.sign.showQuestion}
            broken={slot.sign.broken}
            highlight={slot.engaged ? highlight : null}
            answer={slot.engaged ? answer : null}
            onHover={slot.engaged ? onHoverChoice : undefined}
            onPick={slot.engaged ? onPickChoice : undefined}
          />
        )
      })}

      <Effects danger={defeatStage ? (filmed ? 0.35 : 1) : world.danger} shake={world.shake} cctv={filmed} />
    </>
  )
}

function SceneContents(props: MazeSceneProps) {
  const { snapshot, defeatStage, victoryStage, exitRoom, maze, onPlayerMoved } = props
  const world = worldFor(defeatStage, victoryStage)
  const freed = useMemo<FreedEntity[]>(
    () =>
      snapshot.encounters
        .filter((e) => e.isCorrect)
        .map((e) => ({ id: e.entity, look: entityLook(maze.seed, e.entity) })),
    [snapshot.encounters, maze.seed],
  )

  if (world === 'wake' && defeatStage) {
    return (
      <>
        <WakeRoom
          stage={defeatStage}
          score={{
            pseudo: snapshot.pseudo,
            score: snapshot.score,
            scoreMax: snapshot.scoreMax,
            errors: snapshot.errors,
            maxErrors: snapshot.maxErrors,
          }}
        />
        <Effects danger={1} shake={defeatStage === 'inject' ? 1 : 0} />
      </>
    )
  }

  if (world === 'white') {
    return (
      <>
        <PlayerController
          key="exit-room"
          surface="hard"
          maze={exitRoom.maze}
          entities={NO_ENTITIES}
          obstacles={NO_OBSTACLES}
          readingEntity={null}
          canMove={victoryStage === 'room'}
          isEngageable={never}
          shake={0}
          danger={0}
          lightsOff={false}
          onNearEntity={noop}
          onPlayerMoved={onPlayerMoved}
          autoWalk={victoryStage === 'through'}
        />
        <WhiteRoom room={exitRoom} open={victoryStage === 'door' || victoryStage === 'through' || victoryStage === 'screen'} freed={freed} />
        <Effects danger={0} shake={0} bright />
      </>
    )
  }

  return <MazeContents {...props} />
}

export function MazeScene(props: MazeSceneProps) {
  const world = toWorldState(props.snapshot)
  return (
    <Canvas
      dpr={DPR_CEILING}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 70, near: 0.05, far: 45, position: [0, EYE_HEIGHT, 0] }}
      style={{ position: 'absolute', inset: 0, background: PALETTE.void }}
    >
      <AdaptiveDpr />
      <DevSceneHook />
      <SoundStage
        maze={worldFor(props.defeatStage, props.victoryStage) === 'maze' ? props.maze : null}
        radio={props.radio?.position ?? null}
        danger={world.danger}
        dark={world.lightsOff}
        surge={props.victoryStage === 'release' ? 1 : 0}
      />
      <SceneContents {...props} />
    </Canvas>
  )
}

export type { PlayerInfo }
