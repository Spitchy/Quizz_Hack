import { useEffect, useMemo, useRef, useState } from 'react'
import { playSound } from '../audio/engine'
import { useFontReady } from '../scene/useFontReady'
import { drawFilePage, FILE_HEIGHT, FILE_WIDTH, filePages, turnPage } from './victimFile'

// Le dossier du médecin, lu en gros plan : une fiche par page, qu'on tourne aux
// flèches du clavier ou à la souris. La souris est libre tant qu'il est ouvert.

const PIXELS = 1.4

export function VictimFileOverlay({ pseudo }: { pseudo: string | null | undefined }) {
  const pages = useMemo(() => filePages(pseudo), [pseudo])
  const [page, setPage] = useState(0)
  const [flip, setFlip] = useState<'left' | 'right'>('right')
  const canvas = useRef<HTMLCanvasElement>(null)
  const title = useFontReady('92px "Pirata One"')
  const body = useFontReady('25px "Special Elite"')

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx) drawFilePage(ctx, pages[page], PIXELS)
  }, [pages, page, title, body])

  const turn = (direction: -1 | 1) => {
    const next = turnPage(page, pages.length, direction)
    if (next === page) return
    playSound('paper', { gain: 0.45, rate: direction > 0 ? 1.15 : 1 })
    setFlip(direction > 0 ? 'right' : 'left')
    setPage(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return
      e.preventDefault()
      if (!e.repeat) turn(e.code === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="file cursor-on" role="dialog" aria-label="Dossier des sujets du médecin">
      <button type="button" className="file__turn" disabled={page === 0} onClick={() => turn(-1)} aria-label="Page précédente">
        ‹
      </button>
      <canvas
        key={page}
        ref={canvas}
        className={`file__page file__page--${flip}`}
        width={FILE_WIDTH * PIXELS}
        height={FILE_HEIGHT * PIXELS}
      />
      <button type="button" className="file__turn" disabled={page === pages.length - 1} onClick={() => turn(1)} aria-label="Page suivante">
        ›
      </button>
      <p className="file__hint">
        [←] [→] TOURNER LA PAGE · {page + 1}/{pages.length} · [E] REFERMER LE DOSSIER
      </p>
    </div>
  )
}
