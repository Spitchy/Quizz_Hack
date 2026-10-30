import { useEffect, useRef } from 'react'
import { useFontReady } from '../scene/useFontReady'
import { drawNewspaper, NEWSPAPER, PAPER_HEIGHT, PAPER_WIDTH } from './newspaperPage'

// Le journal lu en gros plan : le même dessin que sur la table.

const PIXELS = 1.4

export function NewspaperOverlay() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const title = useFontReady('92px "Pirata One"')
  const body = useFontReady('25px "Special Elite"')
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (ctx) drawNewspaper(ctx, PIXELS)
  }, [title, body])
  return (
    <div className="paper" role="dialog" aria-label={NEWSPAPER.headline}>
      <canvas
        ref={canvas}
        className="paper__page"
        width={PAPER_WIDTH * PIXELS}
        height={PAPER_HEIGHT * PIXELS}
        role="img"
        aria-label={[NEWSPAPER.headline, NEWSPAPER.deck, ...NEWSPAPER.columns, NEWSPAPER.warning].join(' ')}
      />
      <p className="paper__hint">[E] REPOSER LE JOURNAL</p>
    </div>
  )
}
