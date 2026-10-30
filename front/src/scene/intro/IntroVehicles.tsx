import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { AdditiveBlending, DoubleSide, ExtrudeGeometry, MeshStandardMaterial, Object3D, Shape, type CanvasTexture, type Group, type MeshBasicMaterial, type SpotLight } from 'three'
import { BeamMaterial } from '../BeamMaterial'
import { doorOpen, vanDip, VAN_LANE_Z, vanLights, vanX } from './introMotion'

// La camionnette noire et les voitures garées : un profil dessiné, extrudé sur la
// largeur, aux arêtes arrondies. Le capot, le pare-brise, le toit tiennent dans le trait.

function extrudeProfile(profile: Shape, width: number) {
  return new ExtrudeGeometry(profile, { depth: width, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10 }).translate(0, 0, -width / 2)
}

function vanProfile() {
  const s = new Shape()
  s.moveTo(-2.6, 0.42)
  s.lineTo(-2.6, 2.0)
  s.quadraticCurveTo(-2.6, 2.22, -2.35, 2.22)
  s.lineTo(0.95, 2.22)
  s.quadraticCurveTo(1.2, 2.2, 1.35, 1.98)
  s.lineTo(1.95, 1.32)
  s.quadraticCurveTo(2.05, 1.24, 2.3, 1.2)
  s.lineTo(2.5, 1.15)
  s.quadraticCurveTo(2.72, 1.1, 2.72, 0.86)
  s.lineTo(2.72, 0.42)
  s.closePath()
  return s
}

function carProfile() {
  const s = new Shape()
  s.moveTo(-2.05, 0.34)
  s.quadraticCurveTo(-2.15, 0.7, -2.0, 0.84)
  s.lineTo(-1.45, 0.9)
  s.quadraticCurveTo(-1.05, 1.36, -0.7, 1.38)
  s.lineTo(0.35, 1.38)
  s.quadraticCurveTo(0.65, 1.36, 1.05, 0.94)
  s.lineTo(1.95, 0.82)
  s.quadraticCurveTo(2.15, 0.7, 2.1, 0.34)
  s.closePath()
  return s
}

/** Vitre latérale de la cabine, côté trottoir. */
function cabWindow() {
  const s = new Shape()
  s.moveTo(0.58, 1.42)
  s.lineTo(0.58, 2.02)
  s.lineTo(1.16, 2.02)
  s.lineTo(1.74, 1.42)
  s.closePath()
  return s
}

function createVanMaterials() {
  return {
    paint: new MeshStandardMaterial({ color: '#171a1f', roughness: 0.2, metalness: 0.55 }),
    seam: new MeshStandardMaterial({ color: '#020203', roughness: 0.9 }),
    trim: new MeshStandardMaterial({ color: '#07080a', roughness: 0.65 }),
    glass: new MeshStandardMaterial({ color: '#080b10', roughness: 0.06, metalness: 0.95, side: DoubleSide }),
    tyre: new MeshStandardMaterial({ color: '#050505', roughness: 0.82 }),
    rim: new MeshStandardMaterial({ color: '#2c2d30', roughness: 0.32, metalness: 0.85 }),
    plate: new MeshStandardMaterial({ color: '#b8b5a8', roughness: 0.5 }),
  }
}

type VanMaterials = ReturnType<typeof createVanMaterials>

function Wheel({ x, z, mats, radius = 0.36 }: { x: number; z: number; mats: VanMaterials; radius?: number }) {
  return (
    <group position={[x, radius, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.tyre}>
        <cylinderGeometry args={[radius, radius, 0.26, 26]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, z > 0 ? 0.132 : -0.132]} material={mats.rim}>
        <cylinderGeometry args={[radius * 0.56, radius * 0.56, 0.012, 20]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * radius * 0.34, Math.sin((i / 5) * Math.PI * 2) * radius * 0.34, z > 0 ? 0.14 : -0.14]} rotation={[Math.PI / 2, 0, 0]} material={mats.trim}>
          <cylinderGeometry args={[radius * 0.045, radius * 0.045, 0.012, 8]} />
        </mesh>
      ))}
    </group>
  )
}

const FORWARD_BEAM = 15

export function Van({ time, glow, streak }: { time: RefObject<number>; glow: CanvasTexture; streak: CanvasTexture }) {
  const mats = useMemo(() => createVanMaterials(), [])
  const shell = useMemo(() => extrudeProfile(vanProfile(), 1.92), [])
  const window = useMemo(() => cabWindow(), [])
  useEffect(
    () => () => {
      shell.dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats, shell],
  )
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const door = useRef<Group>(null)
  const left = useRef<SpotLight>(null)
  const right = useRef<SpotLight>(null)
  const interior = useRef<MeshBasicMaterial>(null)
  const wheels = useRef<Group>(null)
  const targets = useMemo(() => [new Object3D(), new Object3D()], [])
  const beams = useRef<Group>(null)

  useFrame(() => {
    const t = time.current
    const x = vanX(t)
    const on = vanLights(t)
    const r = root.current
    if (r) r.position.x = x
    if (body.current) body.current.rotation.z = vanDip(t)
    if (door.current) door.current.position.x = -1.5 * doorOpen(t)
    if (left.current) left.current.intensity = on * 46
    if (right.current) right.current.intensity = on * 46
    if (beams.current) beams.current.visible = on > 0
    // Le plafonnier s'allume quand la porte s'ouvre.
    if (interior.current) interior.current.opacity = 0.2 + doorOpen(t) * 0.8
    wheels.current?.children.forEach((w) => {
      w.rotation.z = -x / 0.36
    })
  })

  return (
    <group ref={root} position={[-79, 0, VAN_LANE_Z]}>
      {/* L'ombre qu'elle pose sur le bitume. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, 0.018, 0]}>
        <planeGeometry args={[8, 4.2]} />
        <meshBasicMaterial map={glow} color="#000000" transparent opacity={1} depthWrite={false} />
      </mesh>
      <group ref={body}>
        <mesh geometry={shell} material={mats.paint} />
        {/* Pare-brise, sur la pente du profil. */}
        <group position={[1.67, 1.67, 0]} rotation={[0, 0, 0.738]}>
          <mesh rotation={[0, Math.PI / 2, 0]} position={[0.058, 0, 0]} material={mats.glass}>
            <planeGeometry args={[1.72, 0.84]} />
          </mesh>
        </group>
        {/* Vitres de la cabine : rien ne se voit à l'intérieur. */}
        <mesh position={[0, 0, 1.012]} material={mats.glass}>
          <shapeGeometry args={[window]} />
        </mesh>
        <mesh position={[0, 0, -1.012]} material={mats.glass}>
          <shapeGeometry args={[window]} />
        </mesh>
        {/* Baguette, pare-chocs, joints de portes, rétroviseur, plaque, poignée de cabine. */}
        <mesh position={[-0.2, 0.74, 1.014]} material={mats.trim}>
          <boxGeometry args={[4.8, 0.08, 0.01]} />
        </mesh>
        <mesh position={[2.42, 0.48, 0]} material={mats.trim}>
          <boxGeometry args={[0.72, 0.17, 2.08]} />
        </mesh>
        <mesh position={[-2.62, 0.48, 0]} material={mats.trim}>
          <boxGeometry args={[0.14, 0.17, 2.08]} />
        </mesh>
        {[-1.12, 0.42, 1.76].map((x) => (
          <mesh key={x} position={[x, 1.24, 1.014]} material={mats.seam}>
            <boxGeometry args={[0.016, 1.56, 0.006]} />
          </mesh>
        ))}
        <mesh position={[0.42, 1.28, 1.016]} material={mats.seam}>
          <boxGeometry args={[3, 0.012, 0.004]} />
        </mesh>
        {[1.04, -1.04].map((z) => (
          <mesh key={z} position={[1.74, 1.64, z * 1.04]} material={mats.trim}>
            <boxGeometry args={[0.11, 0.2, 0.1]} />
          </mesh>
        ))}
        <mesh position={[1.05, 1.18, 1.018]} material={mats.rim}>
          <boxGeometry args={[0.16, 0.035, 0.012]} />
        </mesh>
        <mesh position={[2.778, 0.68, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.trim}>
          <planeGeometry args={[1.16, 0.28]} />
        </mesh>
        {[-0.2, -0.1, 0, 0.1, 0.2].map((z) => (
          <mesh key={z} position={[2.782, 0.68, z * 2.4]} material={mats.rim}>
            <boxGeometry args={[0.004, 0.25, 0.012]} />
          </mesh>
        ))}
        <mesh position={[2.79, 0.48, 0]} rotation={[0, Math.PI / 2, 0]} material={mats.plate}>
          <planeGeometry args={[0.52, 0.11]} />
        </mesh>

        {/* Feux : blancs devant, rouges derrière. */}
        {[-0.72, 0.72].map((z) => (
          <group key={z}>
            <mesh position={[2.778, 0.94, z]} rotation={[0, Math.PI / 2, 0]}>
              <circleGeometry args={[0.13, 22]} />
              <meshBasicMaterial color="#fff3d6" toneMapped={false} />
            </mesh>
            <sprite position={[2.9, 0.94, z]} scale={[2.5, 2.5, 1]}>
              <spriteMaterial map={glow} color="#ffeccb" transparent opacity={0.85} depthWrite={false} blending={AdditiveBlending} />
            </sprite>
            <mesh position={[-2.654, 1.08, z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[0.16, 0.34]} />
              <meshBasicMaterial color="#c01010" toneMapped={false} />
            </mesh>
            <sprite position={[-2.8, 1.08, z]} scale={[1.2, 1.2, 1]}>
              <spriteMaterial map={glow} color="#ff2020" transparent opacity={0.5} depthWrite={false} blending={AdditiveBlending} />
            </sprite>
          </group>
        ))}

        {/* L'intérieur, noir, derrière la porte coulissante. */}
        <mesh position={[-0.35, 1.25, 1.013]}>
          <planeGeometry args={[1.5, 1.55]} />
          <meshBasicMaterial color="#020202" />
        </mesh>
        {/* Le plafonnier, seul dans le noir de la caisse. */}
        <mesh position={[-0.35, 1.62, 1.016]}>
          <planeGeometry args={[2.4, 2.4]} />
          <meshBasicMaterial ref={interior} map={glow} color="#c98f48" transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <group ref={door}>
          <mesh position={[-0.35, 1.25, 1.032]} material={mats.paint}>
            <boxGeometry args={[1.54, 1.59, 0.03]} />
          </mesh>
          <mesh position={[0.32, 1.15, 1.054]} material={mats.rim}>
            <boxGeometry args={[0.14, 0.035, 0.03]} />
          </mesh>
          <mesh position={[-0.35, 0.72, 1.05]} material={mats.trim}>
            <boxGeometry args={[1.54, 0.08, 0.01]} />
          </mesh>
        </group>
      </group>

      <group ref={wheels}>
        <Wheel x={1.75} z={0.9} mats={mats} />
        <Wheel x={1.75} z={-0.9} mats={mats} />
        <Wheel x={-1.6} z={0.9} mats={mats} />
        <Wheel x={-1.6} z={-0.9} mats={mats} />
      </group>
      {/* Passages de roues. */}
      {[1.75, -1.6].map((x) => (
        <mesh key={x} position={[x, 0.42, 1.0135]} material={mats.seam}>
          <circleGeometry args={[0.47, 26]} />
        </mesh>
      ))}

      {/* Les phares percent le brouillard : deux lumières vraies, deux faisceaux visibles. */}
      {targets.map((object, i) => (
        <primitive key={i} object={object} position={[FORWARD_BEAM, -0.4, (i ? 0.72 : -0.72) + (i ? 0.6 : -0.6)]} />
      ))}
      <spotLight ref={left} position={[2.65, 0.95, -0.72]} target={targets[0]} color="#fff0d0" intensity={0} distance={55} angle={0.42} penumbra={0.65} decay={1.6} />
      <spotLight ref={right} position={[2.65, 0.95, 0.72]} target={targets[1]} color="#fff0d0" intensity={0} distance={55} angle={0.42} penumbra={0.65} decay={1.6} />
      <group ref={beams}>
        {[-0.72, 0.72].map((z) => (
          <mesh key={z} position={[2.7 + FORWARD_BEAM / 2, 0.75, z]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[3.2, FORWARD_BEAM, 22, 1, true]} />
            <BeamMaterial color="#d9d1bd" opacity={0.09} />
          </mesh>
        ))}
        {/* Leur reflet sur le bitume noyé. */}
        <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[8.5, 0.016, 0]}>
          <planeGeometry args={[3.6, 12]} />
          <meshBasicMaterial map={streak} color="#ffeccb" transparent opacity={0.28} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </group>
    </group>
  )
}

/** Une voiture garée, éteinte, luisante de pluie. */
export function ParkedCar({ x, z }: { x: number; z: number }) {
  const mats = useMemo(() => createVanMaterials(), [])
  const shell = useMemo(() => extrudeProfile(carProfile(), 1.62), [])
  useEffect(
    () => () => {
      shell.dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
    [mats, shell],
  )
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={shell} material={mats.paint} />
      <mesh position={[-0.38, 1.14, 0.864]} material={mats.glass}>
        <planeGeometry args={[1.68, 0.4]} />
      </mesh>
      <Wheel x={1.35} z={0.8} mats={mats} radius={0.31} />
      <Wheel x={1.35} z={-0.8} mats={mats} radius={0.31} />
      <Wheel x={-1.35} z={0.8} mats={mats} radius={0.31} />
      <Wheel x={-1.35} z={-0.8} mats={mats} radius={0.31} />
    </group>
  )
}
