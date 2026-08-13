/** Links públicos cortos. El UUID sigue andando; el slug es lo que se copia. */
export const CLUB_ID_BUIN = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'

const SLUG_A_ID: Record<string, string> = {
  buin: CLUB_ID_BUIN,
}

const ID_A_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_A_ID).map(([slug, id]) => [id, slug]),
)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function clubIdDesdeParametro(valor: string): string | null {
  const crudo = valor.trim()
  const slug = SLUG_A_ID[crudo.toLowerCase()]
  if (slug) return slug
  if (UUID_RE.test(crudo)) return crudo
  return null
}

export function pathMiAcceso(clubId: string): string {
  return `/mi-acceso/${ID_A_SLUG[clubId] ?? clubId}`
}

/** Si el path trae el UUID de un club con slug, devuelve la forma corta. */
export function pathCanonicoMiAcceso(pathname: string): string | null {
  const m = pathname.match(/^\/mi-acceso\/([^/]+)$/)
  if (!m) return null
  const id = clubIdDesdeParametro(m[1])
  if (!id) return null
  return pathMiAcceso(id)
}
