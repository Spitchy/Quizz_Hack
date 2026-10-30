import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { createSoundStage, soundStageDebug, updateSoundStage } from '../audio/stage'
import type { Maze } from '../maze/generate'

// Le son du monde 3D, monté une fois pour toute la partie : il survit aux
// changements de monde (labyrinthe, réveil, pièce blanche) et n'est pas remonté.

interface SoundStageProps {
  /** Labyrinthe courant, `null` hors labyrinthe : pas de néons ni de murs. */
  maze: Maze | null
  danger: number
  dark: boolean
  surge: number
}

export function SoundStage({ maze, danger, dark, surge }: SoundStageProps) {
  const camera = useThree((s) => s.camera)
  useEffect(() => createSoundStage(camera), [camera])
  // Outil de test, absent du build de production : les voix du monde.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const debug = window as unknown as { __qhVoices?: typeof soundStageDebug }
    debug.__qhVoices = soundStageDebug
    return () => {
      delete debug.__qhVoices
    }
  }, [])
  useFrame(({ clock }) => {
    updateSoundStage(maze, camera, clock.elapsedTime, danger, dark, surge)
  })
  return null
}
