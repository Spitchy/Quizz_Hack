/** Nom du paramètre d'URL par lequel le Hub transmet le jeton au jeu. */
export const FSQ_TOKEN_PARAM = 'fsq_token'

/** Lit le `fsq_token` dans une query string (`location.search`), ou `null`. */
export function readFsqToken(search: string): string | null {
  const token = new URLSearchParams(search).get(FSQ_TOKEN_PARAM)?.trim()
  return token ? token : null
}
