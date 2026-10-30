import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readFsqToken } from './token'

// Garde-fous d'architecture : la logique de jeu reste pure (ni React ni Three.js)
// et rien dans le code de l'app ne touche au système (shell, fichiers, processus).

function sources(dir: URL): { name: string; code: string }[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
    .map((entry) => {
      const path = `${entry.parentPath}/${entry.name}`
      return { name: path, code: readFileSync(path, 'utf8') }
    })
}

function imports(code: string): string[] {
  return [...code.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2])
}

describe('frontières', () => {
  it('src/game n’importe ni React ni Three.js', () => {
    const gameSources = sources(new URL('.', import.meta.url))
    expect(gameSources.map((s) => s.name.split(/[\\/]/).pop())).toContain('controller.ts')
    for (const { name, code } of gameSources) {
      for (const spec of imports(code)) {
        expect(spec, name).not.toMatch(/^(react|react-dom|three|@react-three\/)/)
      }
    }
  })

  it('le code de l’app n’importe aucun module système', () => {
    // src/test/ contient des helpers de test (lecture du contrat) exécutés sous Node uniquement.
    const appSources = sources(new URL('..', import.meta.url)).filter((s) => !/[\\/]test[\\/]/.test(s.name))
    expect(appSources.length).toBeGreaterThan(0)
    for (const { name, code } of appSources) {
      for (const spec of imports(code)) {
        expect(spec, name).not.toMatch(/^node:|^(child_process|fs|os|net|ssh2?|process)$/)
      }
    }
  })
})

describe('readFsqToken', () => {
  it.each([
    ['?fsq_token=abc', 'abc'],
    ['?a=1&fsq_token=x%20y', 'x y'],
    ['?fsq_token=%20%20', null],
    ['?fsq_token=', null],
    ['', null],
    ['?other=1', null],
  ])('%s → %s', (search, expected) => {
    expect(readFsqToken(search)).toBe(expected)
  })
})
