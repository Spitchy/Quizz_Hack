import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  CatmullRomCurve3,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Group,
  type Material,
  type Texture,
} from 'three'
import type { DefeatStage } from '../app/sequence'
import { smoothNoise } from './entities/anim'
import { Ball, Limb, type V3 } from './entities/parts'

// Défaite, deuxième acte : le corps du joueur, vu par ses propres yeux. Assis,
// sanglé à une chaise de contention (avant-bras, poitrine, cuisses, chevilles),
// vêtements en sang. Deux poches de sang pendues à une potence, et le sang qui
// coule dans les tubulures jusqu'à son bras gauche.

const SHIRT = '#8b8576'
const TROUSERS = '#2c2f37'

/** Tissu taché de sang (canvas, une fois par matière). */
function stainedTexture(base: string, amount: number, seed: number): CanvasTexture {
  const el = document.createElement('canvas')
  el.width = el.height = 256
  const ctx = el.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 256)
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < amount; i++) {
    const x = rand() * 256
    const y = rand() * 256
    const r = 8 + rand() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(70,4,4,0.95)')
    g.addColorStop(0.6, 'rgba(90,8,6,0.75)')
    g.addColorStop(1, 'rgba(60,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // Coulures qui ont séché vers le bas.
  for (let i = 0; i < amount / 2; i++) {
    ctx.fillStyle = 'rgba(70,4,4,0.8)'
    ctx.fillRect(rand() * 256, rand() * 160, 2 + rand() * 4, 20 + rand() * 80)
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** Sang dans la tubulure : traits plus clairs qui défilent sur un fond sombre. */
function flowTexture(): CanvasTexture {
  const el = document.createElement('canvas')
  el.width = 128
  el.height = 4
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#4a0202'
  ctx.fillRect(0, 0, 128, 4)
  for (let x = 0; x < 128; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 24, 0)
    g.addColorStop(0, 'rgba(160,12,10,0)')
    g.addColorStop(0.5, 'rgba(190,20,16,1)')
    g.addColorStop(1, 'rgba(160,12,10,0)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, 24, 4)
  }
  const t = new CanvasTexture(el)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(6, 1)
  return t
}

function createMaterials() {
  const shirt = stainedTexture(SHIRT, 28, 11)
  const trousers = stainedTexture(TROUSERS, 10, 23)
  const flow = flowTexture()
  return {
    textures: [shirt, trousers, flow] as Texture[],
    flow,
    shirt: new MeshStandardMaterial({ map: shirt, roughness: 0.95 }),
    trousers: new MeshStandardMaterial({ map: trousers, roughness: 0.95 }),
    skin: new MeshStandardMaterial({ color: '#b9a28b', roughness: 0.7 }),
    bruise: new MeshStandardMaterial({ color: '#4a0606', roughness: 0.3 }),
    shoes: new MeshStandardMaterial({ color: '#131212', roughness: 0.6 }),
    leather: new MeshStandardMaterial({ color: '#3a2618', roughness: 0.55 }),
    buckle: new MeshStandardMaterial({ color: '#9a968c', metalness: 0.8, roughness: 0.35 }),
    frame: new MeshStandardMaterial({ color: '#4b4f50', metalness: 0.6, roughness: 0.5 }),
    seat: new MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 }),
    bag: new MeshStandardMaterial({ color: '#6e0606', roughness: 0.18, transparent: true, opacity: 0.88 }),
    label: new MeshStandardMaterial({ color: '#d8d4c8', roughness: 0.9 }),
    tape: new MeshStandardMaterial({ color: '#d9d3c2', roughness: 0.9 }),
    blood: new MeshBasicMaterial({ map: flow }),
    plastic: new MeshStandardMaterial({ color: '#d8e0e0', transparent: true, opacity: 0.3, roughness: 0.1 }),
  }
}

/** Fait défiler une texture le long de la tubulure (hors rendu React). */
function scroll(texture: Texture, amount: number) {
  texture.offset.x -= amount
}

/** Sangle de cuir autour d'un membre (anneau aplati) avec sa boucle. */
function Strap({ at, radius, axis, leather, buckle }: { at: V3; radius: number; axis: 'x' | 'z'; leather: Material; buckle: Material }) {
  const rotation: V3 = axis === 'z' ? [0, 0, 0] : [0, Math.PI / 2, 0]
  return (
    <group position={at} rotation={rotation}>
      <mesh material={leather} scale={[1, 1, 2.2]}>
        <torusGeometry args={[radius, 0.012, 6, 18]} />
      </mesh>
      <mesh position={[0, radius + 0.008, 0]} material={buckle}>
        <boxGeometry args={[0.035, 0.012, 0.03]} />
      </mesh>
    </group>
  )
}

/** Tubulure de perfusion : le sang y coule de la poche jusqu'au bras. */
function IvLine({ points, blood, plastic }: { points: V3[]; blood: Material; plastic: Material }) {
  const geometries = useMemo(() => {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)))
    return { inner: new TubeGeometry(curve, 48, 0.0045, 6), outer: new TubeGeometry(curve, 48, 0.007, 8) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.flat().join()])
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])
  return (
    <>
      <mesh geometry={geometries.inner} material={blood} />
      <mesh geometry={geometries.outer} material={plastic} />
    </>
  )
}

/** Poche de sang pendue au crochet, avec sa chambre compte-gouttes. */
function BloodBag({ at, bag, label, plastic }: { at: V3; bag: Material; label: Material; plastic: Material }) {
  return (
    <group position={at}>
      <mesh scale={[1, 1, 0.32]} material={bag}>
        <capsuleGeometry args={[0.07, 0.16, 6, 12]} />
      </mesh>
      <mesh position={[0, 0.02, 0.025]} material={label}>
        <planeGeometry args={[0.08, 0.06]} />
      </mesh>
      <mesh position={[0, -0.16, 0]} material={plastic}>
        <cylinderGeometry args={[0.012, 0.012, 0.07, 10]} />
      </mesh>
      <mesh position={[0, 0.17, 0]} material={label}>
        <torusGeometry args={[0.018, 0.004, 6, 12]} />
      </mesh>
    </group>
  )
}

const BAGS: readonly V3[] = [
  [-0.7, 1.66, 1.18],
  [-0.56, 1.62, 1.24],
]
/** Point d'entrée de la perfusion, au creux du coude gauche. */
const IV_SITE: V3 = [-0.29, 0.745, 1.5]

export function WakeBody({ stage }: { stage: DefeatStage }) {
  const mats = useMemo(() => createMaterials(), [])
  useEffect(
    () => () => {
      mats.textures.forEach((t) => t.dispose())
      Object.values(mats).forEach((m) => {
        if (m instanceof MeshStandardMaterial || m instanceof MeshBasicMaterial) m.dispose()
      })
    },
    [mats],
  )
  const fists = useRef<(Group | null)[]>([])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    // Le sang descend la tubulure.
    scroll(mats.flow, dt * 0.9)
    // Il tire sur ses sangles : les poings se crispent par à-coups (lissés).
    const strain = stage === 'wake' || stage === 'inject' ? 1 : 0.4
    fists.current.forEach((g, i) => {
      if (!g) return
      g.rotation.x = smoothNoise(t * 2.3, i * 3) * 0.5 * strain
      g.rotation.z = smoothNoise(t * 1.7, i * 5 + 1) * 0.3 * strain
    })
  })

  const tube = (bag: V3, sag: number): V3[] => [
    [bag[0], bag[1] - 0.2, bag[2]],
    [bag[0] + 0.04, 1.2, bag[2] + 0.05],
    [-0.5 + sag, 0.86, 1.36],
    [-0.36, 0.78, 1.46],
    IV_SITE,
  ]

  return (
    <group>
      {/* Chaise de contention : assise, dossier, accoudoirs, pieds métalliques. */}
      <mesh position={[0, 0.45, 1.66]} material={mats.seat}>
        <boxGeometry args={[0.56, 0.07, 0.52]} />
      </mesh>
      <mesh position={[0, 0.98, 1.82]} rotation={[-0.1, 0, 0]} material={mats.seat}>
        <boxGeometry args={[0.52, 1.0, 0.06]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.3, 0.665, 1.5]} material={mats.seat}>
            <boxGeometry args={[0.08, 0.035, 0.56]} />
          </mesh>
          <Limb from={[side * 0.3, 0.65, 1.25]} to={[side * 0.3, 0.45, 1.25]} radius={0.016} material={mats.frame} taper={1} />
          <Limb from={[side * 0.25, 0.42, 1.43]} to={[side * 0.25, 0, 1.43]} radius={0.02} material={mats.frame} taper={1} />
          <Limb from={[side * 0.25, 0.42, 1.9]} to={[side * 0.25, 0, 1.9]} radius={0.02} material={mats.frame} taper={1} />
        </group>
      ))}

      {/* Le corps : torse, cuisses, tibias, bras posés sur les accoudoirs. */}
      {/* Torse : son sommet reste sous les yeux (la caméra n'entre jamais dedans). */}
      <mesh position={[0, 0.74, 1.61]} rotation={[-0.08, 0, 0]} scale={[1, 1, 0.62]} material={mats.shirt}>
        <capsuleGeometry args={[0.17, 0.26, 6, 14]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Limb from={[side * 0.1, 0.55, 1.66]} to={[side * 0.12, 0.56, 1.22]} radius={0.078} material={mats.trousers} taper={0.85} />
          <Limb from={[side * 0.12, 0.54, 1.22]} to={[side * 0.13, 0.1, 1.17]} radius={0.065} material={mats.trousers} taper={0.75} />
          <Ball position={[side * 0.13, 0.05, 1.12]} radius={0.06} material={mats.shoes} scale={[0.85, 0.55, 1.7]} />
          <Ball position={[side * 0.2, 0.96, 1.6]} radius={0.065} material={mats.shirt} />
          <Limb from={[side * 0.2, 0.96, 1.6]} to={[side * 0.28, 0.72, 1.64]} radius={0.05} material={mats.shirt} taper={0.9} />
          <Limb from={[side * 0.28, 0.72, 1.64]} to={[side * 0.29, 0.72, 1.27]} radius={0.045} material={mats.skin} taper={0.82} />
          {/* Poing crispé au bout de l'accoudoir. */}
          <group
            ref={(g) => {
              fists.current[side > 0 ? 1 : 0] = g
            }}
            position={[side * 0.29, 0.72, 1.25]}
          >
            <Ball position={[0, 0, -0.04]} radius={0.045} material={mats.skin} scale={[0.95, 0.75, 1.25]} />
          </group>
          {/* Sangles : poignet, avant-bras, cuisse, cheville. */}
          <Strap at={[side * 0.29, 0.72, 1.32]} radius={0.05} axis="z" leather={mats.leather} buckle={mats.buckle} />
          <Strap at={[side * 0.29, 0.72, 1.56]} radius={0.052} axis="z" leather={mats.leather} buckle={mats.buckle} />
          <Strap at={[side * 0.12, 0.56, 1.42]} radius={0.085} axis="z" leather={mats.leather} buckle={mats.buckle} />
          <Strap at={[side * 0.13, 0.2, 1.18]} radius={0.065} axis="x" leather={mats.leather} buckle={mats.buckle} />
        </group>
      ))}
      {/* Sangle de poitrine, en travers, plaquée contre le dossier. */}
      <mesh position={[0, 0.84, 1.6]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.62, 1]} material={mats.leather}>
        <torusGeometry args={[0.185, 0.02, 6, 24]} />
      </mesh>
      <mesh position={[0, 0.84, 1.487]} material={mats.buckle}>
        <boxGeometry args={[0.05, 0.04, 0.012]} />
      </mesh>

      {/* Plaies et ecchymoses sur les avant-bras. */}
      {([
        [-0.27, 0.765, 1.4, 1.4],
        [0.3, 0.765, 1.46, 1],
        [0.27, 0.76, 1.36, 0.8],
        [-0.3, 0.76, 1.6, 0.9],
      ] as const).map(([x, y, z, s], i) => (
        <Ball key={i} position={[x, y, z]} radius={0.022 * s} material={mats.bruise} scale={[1.2, 0.3, 1.8]} />
      ))}

      {/* Potence de perfusion, deux poches, tubulures jusqu'au coude gauche. */}
      <Limb from={[-0.63, 0, 1.2]} to={[-0.63, 1.95, 1.2]} radius={0.012} material={mats.frame} taper={1} />
      <Limb from={[-0.76, 1.88, 1.2]} to={[-0.5, 1.88, 1.2]} radius={0.008} material={mats.frame} taper={1} />
      {[-1, 1, 0].map((k) => (
        <Limb key={k} from={[-0.63, 0.03, 1.2]} to={[-0.63 + k * 0.18, 0.02, 1.2 + (k === 0 ? 0.2 : -0.1)]} radius={0.01} material={mats.frame} taper={1} />
      ))}
      {BAGS.map((bag, i) => (
        <group key={i}>
          <Limb from={[bag[0], 1.88, 1.2]} to={[bag[0], bag[1] + 0.19, bag[2]]} radius={0.003} material={mats.frame} taper={1} />
          <BloodBag at={bag} bag={mats.bag} label={mats.label} plastic={mats.plastic} />
          <IvLine points={tube(bag, i * 0.05)} blood={mats.blood} plastic={mats.plastic} />
        </group>
      ))}
      {/* Cathéter maintenu par du sparadrap. */}
      <mesh position={[IV_SITE[0], IV_SITE[1] + 0.005, IV_SITE[2]]} rotation={[-Math.PI / 2, 0, 0.2]} material={mats.tape}>
        <planeGeometry args={[0.06, 0.08]} />
      </mesh>
    </group>
  )
}
