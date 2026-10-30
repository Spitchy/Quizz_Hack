import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Object3D, ShaderMaterial, Vector3, type CanvasTexture, type Group, type InstancedMesh, type MeshBasicMaterial } from 'three'
import { createRandom, hashSeed } from '../../maze/random'
import { BeamMaterial } from '../BeamMaterial'
import { ParkedCar } from './IntroVehicles'
import { SODIUM, type IntroTextures } from './introTextures'

// La rue de l'intro : une nuit de pluie et de brouillard. Bitume noyé, briques,
// rideaux de fer, néons, lampadaires au sodium. La pluie et ses éclaboussures
// sont entièrement calculées dans le shader : une seule passe chacune.

/** Lampadaires du trottoir, en x ; ceux de l'autre côté sont décalés. */
const NEAR_LAMPS = [-50, -26, -2, 22, 46]
const FAR_LAMPS = [-38, -14, 10, 34]
const NEAR_Z = -1.35
const FAR_Z = -10.7
const LAMP_HEIGHT = 6

const SIDEWALK = { near: -1.6, far: 3.4 } as const

// --- La pluie ------------------------------------------------------------------

const RAIN_BOX = 26
const RAIN_HEIGHT = 11
const RAIN_DROPS = 2600

const rainVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute float aEnd;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float fall = uTime * (9.0 + fract(p.x * 13.7) * 3.0);
    p.y = mod(p.y - fall, ${RAIN_HEIGHT.toFixed(1)});
    float wind = uTime * 0.9;
    p.x = mod(p.x + wind - uCenter.x, ${RAIN_BOX.toFixed(1)}) - ${(RAIN_BOX / 2).toFixed(1)} + uCenter.x;
    p.z = mod(p.z - uCenter.z, ${RAIN_BOX.toFixed(1)}) - ${(RAIN_BOX / 2).toFixed(1)} + uCenter.z;
    p += aEnd * vec3(-0.035, 0.42, 0.0);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    float d = length(view.xyz);
    // Rien tout contre l'œil : la pluie ne passe jamais devant l'écran du téléphone.
    vAlpha = smoothstep(0.75, 1.5, d) * (1.0 - smoothstep(9.0, 15.0, d)) * (1.0 - aEnd * 0.8);
    gl_Position = projectionMatrix * view;
  }
`

const rainFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.66, 0.73, 0.8, vAlpha * 0.5);
  }
`

function rainGeometry() {
  const random = createRandom(hashSeed('pluie'))
  const positions = new Float32Array(RAIN_DROPS * 6)
  const ends = new Float32Array(RAIN_DROPS * 2)
  for (let i = 0; i < RAIN_DROPS; i++) {
    const x = random() * RAIN_BOX
    const y = random() * RAIN_HEIGHT
    const z = random() * RAIN_BOX
    positions.set([x, y, z, x, y, z], i * 6)
    ends[i * 2 + 1] = 1
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('aEnd', new BufferAttribute(ends, 1))
  return g
}

const SPLASHES = 900

const splashVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute float aPhase;
  varying float vLife;
  void main() {
    vec3 p = position;
    vLife = fract(uTime * (1.6 + aPhase) + aPhase * 17.0);
    float cycle = floor(uTime * (1.6 + aPhase) + aPhase * 17.0);
    // Chaque goutte tombe ailleurs.
    p.x += fract(cycle * 0.37) * 9.0;
    p.z += fract(cycle * 0.73) * 9.0;
    p.x = mod(p.x - uCenter.x, 22.0) - 11.0 + uCenter.x;
    p.z = mod(p.z - uCenter.z, 22.0) - 11.0 + uCenter.z;
    // Le trottoir est plus haut que la chaussée.
    p.y = p.z > ${SIDEWALK.near.toFixed(1)} && p.z < ${SIDEWALK.far.toFixed(1)} ? 0.13 : 0.02;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.5 + vLife * 7.0) * (5.0 / max(1.2, -view.z));
    gl_Position = projectionMatrix * view;
  }
`

const splashFragment = /* glsl */ `
  varying float vLife;
  void main() {
    // Un rond vu de biais, au ras du sol : une ellipse.
    vec2 c = (gl_PointCoord - 0.5) * vec2(2.0, 5.0);
    float d = length(c);
    float ring = smoothstep(1.0, 0.72, d) * smoothstep(0.3, 0.7, d);
    gl_FragColor = vec4(0.6, 0.67, 0.75, ring * (1.0 - vLife) * 0.22);
  }
`

function splashGeometry() {
  const random = createRandom(hashSeed('flaques'))
  const positions = new Float32Array(SPLASHES * 3)
  const phases = new Float32Array(SPLASHES)
  for (let i = 0; i < SPLASHES; i++) {
    positions.set([random() * 22, 0.02, random() * 22], i * 3)
    phases[i] = random()
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setAttribute('aPhase', new BufferAttribute(phases, 1))
  return g
}

function driveRain(material: ShaderMaterial | null, time: number, x: number, y: number, z: number) {
  if (!material) return
  material.uniforms.uTime.value = time
  material.uniforms.uCenter.value.set(x, y, z)
}

export function Rain() {
  const geometries = useMemo(() => ({ rain: rainGeometry(), splash: splashGeometry() }), [])
  const uniforms = useMemo(
    () => ({
      rain: { uTime: { value: 0 }, uCenter: { value: new Vector3() } },
      splash: { uTime: { value: 0 }, uCenter: { value: new Vector3() } },
    }),
    [],
  )
  useEffect(
    () => () => {
      geometries.rain.dispose()
      geometries.splash.dispose()
    },
    [geometries],
  )
  const rain = useRef<ShaderMaterial>(null)
  const splash = useRef<ShaderMaterial>(null)
  useFrame(({ clock, camera }) => {
    const { x, y, z } = camera.position
    driveRain(rain.current, clock.elapsedTime, x, y, z)
    driveRain(splash.current, clock.elapsedTime, x, y, z)
  })
  return (
    <>
      <lineSegments geometry={geometries.rain} frustumCulled={false}>
        <shaderMaterial ref={rain} vertexShader={rainVertex} fragmentShader={rainFragment} uniforms={uniforms.rain} transparent depthWrite={false} />
      </lineSegments>
      <points geometry={geometries.splash} frustumCulled={false}>
        <shaderMaterial ref={splash} vertexShader={splashVertex} fragmentShader={splashFragment} uniforms={uniforms.splash} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
    </>
  )
}

// --- Le brouillard -------------------------------------------------------------

const BANKS = [
  { x: -4, y: 1.6, z: -5, s: 16, o: 0.17, speed: 0.11 },
  { x: 9, y: 2.3, z: -8, s: 22, o: 0.16, speed: 0.08 },
  { x: -14, y: 1.2, z: -3, s: 20, o: 0.2, speed: 0.1 },
  { x: 18, y: 1.1, z: -2.5, s: 18, o: 0.2, speed: 0.13 },
  { x: 30, y: 2.4, z: -6, s: 26, o: 0.16, speed: 0.07 },
  { x: -28, y: 2.5, z: -7, s: 26, o: 0.2, speed: 0.09 },
  { x: -45, y: 2, z: -4, s: 30, o: 0.22, speed: 0.06 },
  { x: 2, y: 0.5, z: -1.2, s: 13, o: 0.13, speed: 0.14 },
  { x: 14, y: 0.5, z: 0.4, s: 13, o: 0.14, speed: 0.12 },
] as const

/** Des nappes qui dérivent, toujours face à la caméra : elles accrochent les lumières. */
export function FogBanks({ map }: { map: CanvasTexture }) {
  const group = useRef<Group>(null)
  useFrame(({ clock, camera }) => {
    const g = group.current
    if (!g) return
    g.children.forEach((card, i) => {
      const bank = BANKS[i]
      card.position.x = bank.x + Math.sin(clock.elapsedTime * bank.speed + i) * 3
      card.position.y = bank.y + Math.sin(clock.elapsedTime * bank.speed * 0.7 + i * 2) * 0.25
      card.quaternion.copy(camera.quaternion)
    })
  })
  return (
    <group ref={group}>
      {BANKS.map((bank) => (
        <mesh key={bank.x} position={[bank.x, bank.y, bank.z]} scale={[bank.s, bank.s * 0.55, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={map} color="#9aa9ba" transparent opacity={bank.o} depthWrite={false} blending={AdditiveBlending} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

// --- La rue --------------------------------------------------------------------

const dummy = new Object3D()
const color = new Color()

function buildCity() {
  const random = createRandom(hashSeed('immeubles'))
  const blocks: { x: number; z: number; w: number; h: number; d: number; tint: number }[] = []
  for (const [z, d] of [
    [SIDEWALK.far + 4, 8],
    [-17, 8],
  ] as const) {
    let x = -92
    while (x < 92) {
      const w = 9 + random() * 8
      blocks.push({ x: x + w / 2, z, w, h: 11 + random() * 12, d, tint: 0.55 + random() * 0.65 })
      x += w + 0.06
    }
  }
  const windows: { x: number; y: number; z: number; flip: boolean; lit: boolean; warm: number }[] = []
  const shops: { x: number; z: number; w: number; flip: boolean; tint: number }[] = []
  for (const b of blocks) {
    const front = b.z < 0
    const faceZ = front ? b.z + b.d / 2 + 0.02 : b.z - b.d / 2 - 0.02
    shops.push({ x: b.x, z: faceZ, w: b.w - 0.5, flip: !front, tint: 0.5 + random() * 0.6 })
    for (let col = 0; col < Math.floor(b.w / 2.6); col++) {
      for (let row = 0; row < Math.floor((b.h - 4) / 3); row++) {
        windows.push({
          x: b.x - b.w / 2 + 1.4 + col * 2.6,
          y: 4.9 + row * 3,
          z: faceZ,
          flip: !front,
          lit: random() < 0.1,
          warm: random(),
        })
      }
    }
  }
  const puddles = Array.from({ length: 34 }, () => ({
    x: -60 + random() * 120,
    z: random() < 0.7 ? -9.6 + random() * 7.6 : SIDEWALK.near + 0.3 + random() * 4.2,
    w: 0.8 + random() * 2.6,
    d: 0.4 + random() * 1.2,
    a: random() * Math.PI,
  }))
  return { blocks, windows, shops, puddles }
}

/** Enseigne au néon, et sa traînée sur le bitume mouillé. */
function NeonSign({ map, glow, streak, tint, x, z, w, flip = false }: { map: CanvasTexture; glow: CanvasTexture; streak: CanvasTexture; tint: string; x: number; z: number; w: number; flip?: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, flip ? Math.PI : 0, 0]}>
      <mesh position={[0, 3.45, 0.03]}>
        <planeGeometry args={[w, w * 0.2]} />
        <meshBasicMaterial map={map} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <sprite position={[0, 3.45, 0.2]} scale={[w * 1.9, w * 0.95, 1]}>
        <spriteMaterial map={glow} color={tint} transparent opacity={0.34} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.135, 2.6]}>
        <planeGeometry args={[w * 1.05, 5]} />
        <meshBasicMaterial map={streak} color={tint} transparent opacity={0.22} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  )
}

/** La croix verte de la pharmacie, qui clignote. */
function PharmacyCross({ glow, x, z }: { glow: CanvasTexture; x: number; z: number }) {
  const arms = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const beat = Math.sin(clock.elapsedTime * 2.1) > -0.25 ? 1 : 0.25
    if (arms.current) arms.current.color.setRGB(0.1 * beat, 1.5 * beat, 0.55 * beat)
  })
  return (
    <group position={[x, 4.55, z + 0.4]}>
      <mesh>
        <boxGeometry args={[0.72, 0.24, 0.08]} />
        <meshBasicMaterial ref={arms} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.24, 0.72, 0.08]} />
        <meshBasicMaterial color="#25f886" toneMapped={false} />
      </mesh>
      <sprite scale={[4, 4, 1]}>
        <spriteMaterial map={glow} color="#35f08a" transparent opacity={0.45} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
    </group>
  )
}

export function IntroStreet({ textures }: { textures: IntroTextures }) {
  const { glow, streak } = textures
  const city = useMemo(() => buildCity(), [])
  const blocks = useRef<InstancedMesh>(null)
  const windows = useRef<InstancedMesh>(null)
  const shops = useRef<InstancedMesh>(null)
  const puddles = useRef<InstancedMesh>(null)
  const bollards = useRef<InstancedMesh>(null)
  const BOLLARDS = 44

  useLayoutEffect(() => {
    dummy.rotation.set(0, 0, 0)
    city.blocks.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z)
      dummy.scale.set(b.w, b.h, b.d)
      dummy.updateMatrix()
      blocks.current?.setMatrixAt(i, dummy.matrix)
      blocks.current?.setColorAt(i, color.setScalar(b.tint))
    })
    city.windows.forEach((w, i) => {
      dummy.position.set(w.x, w.y, w.z)
      dummy.rotation.set(0, w.flip ? Math.PI : 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      windows.current?.setMatrixAt(i, dummy.matrix)
      windows.current?.setColorAt(i, w.lit ? color.set('#b08a4c').multiplyScalar(0.5 + w.warm * 0.8) : color.set('#0b0f14'))
    })
    city.shops.forEach((s, i) => {
      dummy.position.set(s.x, 1.72, s.z)
      dummy.rotation.set(0, s.flip ? Math.PI : 0, 0)
      dummy.scale.set(s.w, 3.1, 1)
      dummy.updateMatrix()
      shops.current?.setMatrixAt(i, dummy.matrix)
      shops.current?.setColorAt(i, color.setScalar(s.tint))
    })
    city.puddles.forEach((p, i) => {
      const onWalk = p.z > SIDEWALK.near
      dummy.position.set(p.x, onWalk ? 0.126 : 0.012, p.z)
      dummy.rotation.set(-Math.PI / 2, 0, p.a)
      dummy.scale.set(p.w, p.d, 1)
      dummy.updateMatrix()
      puddles.current?.setMatrixAt(i, dummy.matrix)
    })
    for (let i = 0; i < BOLLARDS; i++) {
      dummy.position.set(-66 + i * 3, 0.5, SIDEWALK.near + 0.32)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      bollards.current?.setMatrixAt(i, dummy.matrix)
    }
    for (const mesh of [blocks.current, windows.current, shops.current, puddles.current, bollards.current]) {
      if (!mesh) continue
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [city])

  const lamps = [...NEAR_LAMPS.map((x) => [x, NEAR_Z] as const), ...FAR_LAMPS.map((x) => [x, FAR_Z] as const)]
  return (
    <group>
      {/* Bitume noyé : presque un miroir sombre, plus lisse là où l'eau stagne. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]}>
        <planeGeometry args={[240, 18]} />
        <meshStandardMaterial map={textures.road} roughnessMap={textures.roadRough} roughness={0.72} metalness={0.42} />
      </mesh>
      {/* Bandes blanches, mal effacées. */}
      {[-60, -48, -36, -24, -12, 0, 12, 24, 36, 48].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.006, -6.1]}>
          <planeGeometry args={[4.5, 0.13]} />
          <meshStandardMaterial color="#6d6f6c" roughness={0.4} />
        </mesh>
      ))}
      {/* Trottoirs, dalles, bordures. */}
      <mesh position={[0, 0.06, (SIDEWALK.near + SIDEWALK.far) / 2]}>
        <boxGeometry args={[240, 0.12, SIDEWALK.far - SIDEWALK.near]} />
        <meshStandardMaterial map={textures.sidewalk} roughness={0.42} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.07, SIDEWALK.near + 0.1]}>
        <boxGeometry args={[240, 0.14, 0.2]} />
        <meshStandardMaterial color="#47484a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.06, -12.4]}>
        <boxGeometry args={[240, 0.12, 3.4]} />
        <meshStandardMaterial map={textures.sidewalk} roughness={0.42} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.07, -10.8]}>
        <boxGeometry args={[240, 0.14, 0.2]} />
        <meshStandardMaterial color="#47484a" roughness={0.6} />
      </mesh>

      {/* Flaques : une surface qui ne fait que refléter. */}
      <instancedMesh ref={puddles} args={[undefined, undefined, city.puddles.length]}>
        <circleGeometry args={[0.5, 22]} />
        <meshStandardMaterial color="#07090c" roughness={0.05} metalness={0.8} transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={bollards} args={[undefined, undefined, BOLLARDS]}>
        <cylinderGeometry args={[0.045, 0.055, 0.8, 10]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.35} metalness={0.7} />
      </instancedMesh>

      <instancedMesh ref={blocks} args={[undefined, undefined, city.blocks.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={textures.brick} roughness={0.72} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={windows} args={[undefined, undefined, city.windows.length]}>
        <planeGeometry args={[1.3, 1.9]} />
        <meshBasicMaterial map={textures.window} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={shops} args={[undefined, undefined, city.shops.length]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial map={textures.shutter} roughness={0.5} metalness={0.5} />
      </instancedMesh>

      {/* Ce qui reste ouvert, la nuit. */}
      <NeonSign map={textures.pharmacy} glow={glow} streak={streak} tint="#35f08a" x={6.5} z={-12.95} w={4} />
      <PharmacyCross glow={glow} x={9.8} z={-12.95} />
      <NeonSign map={textures.hotel} glow={glow} streak={streak} tint="#ff3a3a" x={-16} z={-12.95} w={3} />
      <NeonSign map={textures.bar} glow={glow} streak={streak} tint="#ffbd59" x={24} z={3.35} w={2.4} flip />

      <ParkedCar x={-19} z={-9.6} />
      <ParkedCar x={13.5} z={-9.6} />
      <ParkedCar x={36} z={-9.6} />

      {lamps.map(([x, z]) => {
        const toward = z === NEAR_Z ? -1 : 1
        return (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <mesh position={[0, LAMP_HEIGHT / 2, 0]}>
              <cylinderGeometry args={[0.05, 0.08, LAMP_HEIGHT, 10]} />
              <meshStandardMaterial color="#1b1c20" roughness={0.45} metalness={0.7} />
            </mesh>
            <mesh position={[0, LAMP_HEIGHT - 0.02, toward * 0.45]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
              <meshStandardMaterial color="#1b1c20" roughness={0.45} metalness={0.7} />
            </mesh>
            <mesh position={[0, LAMP_HEIGHT - 0.08, toward * 0.9]}>
              <boxGeometry args={[0.2, 0.06, 0.5]} />
              <meshBasicMaterial color={SODIUM} toneMapped={false} />
            </mesh>
            {/* Le halo dans le brouillard, le cône de lumière dans la pluie, le reflet au sol. */}
            <sprite position={[0, LAMP_HEIGHT - 0.1, toward * 0.9]} scale={[8, 8, 1]}>
              <spriteMaterial map={glow} color={SODIUM} transparent opacity={0.8} depthWrite={false} blending={AdditiveBlending} />
            </sprite>
            <mesh position={[0, LAMP_HEIGHT / 2 - 0.1, toward * 0.9]}>
              <coneGeometry args={[2.8, LAMP_HEIGHT - 0.1, 26, 1, true]} />
              <BeamMaterial color={SODIUM} opacity={0.2} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, toward * 4.5]}>
              <planeGeometry args={[3.2, 8.5]} />
              <meshBasicMaterial map={streak} color={SODIUM} transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} />
            </mesh>
          </group>
        )
      })}

      {/* Seuls les deux lampadaires où il se trouve éclairent vraiment. */}
      <pointLight position={[-2, LAMP_HEIGHT - 0.5, NEAR_Z - 0.9]} color={SODIUM} intensity={62} distance={32} decay={1.9} />
      <pointLight position={[22, LAMP_HEIGHT - 0.5, NEAR_Z - 0.9]} color={SODIUM} intensity={62} distance={32} decay={1.9} />
      <hemisphereLight args={['#2c3a4c', '#07080b', 0.5]} />
    </group>
  )
}
