interface ImportMetaEnv {
  /** Racine de l'API de jeu (défaut : http://localhost:3000). */
  readonly VITE_API_BASE_URL?: string
  /** `true` pour jouer contre le mock en mémoire, sans le back. */
  readonly VITE_API_MOCK?: string
  /** `corridor` : couloir droit de test au lieu du labyrinthe. */
  readonly VITE_MAZE_LAYOUT?: string
  /** `true` (dev + mock seulement) : la bonne réponse est cochée sur les panneaux. */
  readonly VITE_SHOW_ANSWERS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
