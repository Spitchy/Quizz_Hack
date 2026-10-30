import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, MeshStandardMaterial, SRGBColorSpace, type MeshBasicMaterial } from 'three'
import { drawFilePage, FILE_HEIGHT, FILE_WIDTH, filePages } from '../app/victimFile'
import type { RadioSpot } from '../maze/radioSpot'
import { neonFlicker } from './flicker'
import { useFontReady } from './useFontReady'

// Au milieu du niveau, oubliés là : une table, une vieille radio qui joue encore,
// le dossier du médecin et une tasse. Tout est monté avec le labyrinthe et ne bouge plus ;
// la radio n'a pas de lumière propre : seul le cadran luit.

const PAPER_SCALE = 0.6
const COVER = filePages(null)[0]
const DIAL = new Color('#ffb24a')

function createMaterials() {
  return {
    table: new MeshStandardMaterial({ color: '#3b2a1a', roughness: 0.82 }),
    cabinet: new MeshStandardMaterial({ color: '#5b3518', roughness: 0.45 }),
    cloth: new MeshStandardMaterial({ color: '#1b150e', roughness: 1 }),
    knob: new MeshStandardMaterial({ color: '#17110b', roughness: 0.35 }),
    cup: new MeshStandardMaterial({ color: '#b9b09a', roughness: 0.4 }),
    paper: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
    sheets: new MeshStandardMaterial({ color: '#cbbf9f', roughness: 0.95 }),
  }
}

/** Redessine la couverture et la pose sur le dossier (hors rendu React). */
function printPage(ctx: CanvasRenderingContext2D, texture: CanvasTexture, paper: MeshStandardMaterial) {
  drawFilePage(ctx, COVER, PAPER_SCALE)
  texture.needsUpdate = true
  paper.map = texture
  paper.needsUpdate = true
}

interface RadioCornerProps {
  spot: RadioSpot
  /** Courant coupé : le cadran s'éteint avec les néons. */
  dark: boolean
  /** Le dossier a disparu de la table. */
  paperGone: boolean
  /** Noir total : même le cadran n'existe plus. */
  blackout: boolean
}

export function RadioCorner({ spot, dark, paperGone, blackout }: RadioCornerProps) {
  const mats = useMemo(() => createMaterials(), [])
  const { texture, ctx } = useMemo(() => {
    const el = document.createElement('canvas')
    el.width = FILE_WIDTH * PAPER_SCALE
    el.height = FILE_HEIGHT * PAPER_SCALE
    const page = new CanvasTexture(el)
    page.colorSpace = SRGBColorSpace
    return { texture: page, ctx: el.getContext('2d')! }
  }, [])
  const title = useFontReady('92px "Pirata One"')
  const body = useFontReady('25px "Special Elite"')
  useEffect(() => {
    printPage(ctx, texture, mats.paper)
  }, [ctx, texture, mats, title, body])
  useEffect(
    () => () => {
      texture.dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
    [texture, mats],
  )

  const dial = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (dial.current) dial.current.color.copy(DIAL).multiplyScalar(blackout ? 0 : dark ? 0.03 : 0.9 * neonFlicker(clock.elapsedTime * 0.4, 0.15, 21))
  })

  const legs: [number, number][] = [
    [-0.47, -0.25],
    [0.47, -0.25],
    [-0.47, 0.25],
    [0.47, 0.25],
  ]
  return (
    <group name="radio-corner" position={[spot.position.x, 0, spot.position.z]} rotation={[0, spot.yaw, 0]}>
      {/* Table. */}
      <mesh position={[0, 0.74, 0]} material={mats.table}>
        <boxGeometry args={[1.08, 0.04, 0.62]} />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.36, z]} material={mats.table}>
          <boxGeometry args={[0.05, 0.72, 0.05]} />
        </mesh>
      ))}

      {/* Radio à lampes : coffret arrondi, toile du haut-parleur, cadran, boutons. */}
      <group position={[-0.28, 0.76, -0.1]} rotation={[0, 0.16, 0]}>
        <mesh position={[0, 0.13, 0]} material={mats.cabinet}>
          <boxGeometry args={[0.3, 0.26, 0.15]} />
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.cabinet}>
          <cylinderGeometry args={[0.15, 0.15, 0.15, 24, 1, false, -Math.PI / 2, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.2, 0.076]} material={mats.cloth}>
          <circleGeometry args={[0.095, 20]} />
        </mesh>
        <mesh position={[0, 0.065, 0.076]}>
          <planeGeometry args={[0.15, 0.035]} />
          <meshBasicMaterial ref={dial} toneMapped={false} />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.065, 0.085]} rotation={[Math.PI / 2, 0, 0]} material={mats.knob}>
            <cylinderGeometry args={[0.016, 0.018, 0.022, 12]} />
          </mesh>
        ))}
      </group>

      {/* Le dossier, posé de travers, des feuilles qui dépassent, et une tasse froide. */}
      <group visible={!paperGone} position={[0.22, 0.762, 0.02]} rotation={[0, -0.14, 0]}>
        <mesh position={[0.006, 0.004, 0.004]} rotation={[0, 0.03, 0]} material={mats.sheets}>
          <boxGeometry args={[0.31, 0.012, (0.31 * FILE_HEIGHT) / FILE_WIDTH]} />
        </mesh>
        <mesh position={[0, 0.0115, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.paper}>
          <planeGeometry args={[0.32, (0.32 * FILE_HEIGHT) / FILE_WIDTH]} />
        </mesh>
      </group>
      <mesh position={[-0.05, 0.795, 0.17]} material={mats.cup}>
        <cylinderGeometry args={[0.035, 0.03, 0.07, 14]} />
      </mesh>
    </group>
  )
}
