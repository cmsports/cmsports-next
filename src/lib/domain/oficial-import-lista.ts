/**
 * Parseo de lista de inscripción oficial (CSV / TSV / pegado de Excel).
 * Columnas reconocidas: nombre, asociacion, codigo, ranking.
 */

export type FilaImportOficial = {
  nombre: string
  asociacion?: string
  codigoFederativo?: string
  ranking?: number
}

export type ParseListaOficialResult = {
  filas: FilaImportOficial[]
  errores: string[]
  omitidas: number
}

const HEADER_NOMBRE = /^(nombre|name|jugador|player)$/
const HEADER_ASOC = /^(asociacion|association|asoc|club)$/
const HEADER_CODIGO = /^(codigo|fctm|fctmid|playernumber|nro|nr)$/
const HEADER_COD_ALIAS = /^cod$/
const HEADER_RANKING = /^(ranking|rk|seed|siembra)$/

function splitLineas(texto: string): string[] {
  return texto.replace(/^\uFEFF/, '').split(/\r?\n/)
}

function splitCampos(linea: string): string[] {
  if (linea.includes('\t')) return linea.split('\t').map(c => c.trim())
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === ',' && !quoted) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function claveHeader(h: string): string {
  return h.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function indiceHeader(headers: string[], test: RegExp): number {
  return headers.findIndex(h => test.test(claveHeader(h)))
}

function rankingDe(raw: string): number | undefined {
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

/** Detecta si la primera fila es encabezado (nombre/name/…). */
function pareceHeader(campos: string[]): boolean {
  const joined = campos.map(c => claveHeader(c))
  return joined.some(c => HEADER_NOMBRE.test(c) || c === 'player' || c === 'name')
}

export function parsearListaOficial(texto: string): ParseListaOficialResult {
  const lineas = splitLineas(texto).filter(l => l.trim())
  const errores: string[] = []
  const filas: FilaImportOficial[] = []
  if (!lineas.length) return { filas, errores: ['La lista está vacía'], omitidas: 0 }

  let start = 0
  let idxNombre = 0
  let idxAsoc = 1
  let idxCodigo = -1
  let idxRanking = -1
  let idxCodAlias = -1

  const primera = splitCampos(lineas[0])
  if (pareceHeader(primera)) {
    idxNombre = indiceHeader(primera, HEADER_NOMBRE)
    idxAsoc = indiceHeader(primera, HEADER_ASOC)
    idxCodigo = indiceHeader(primera, HEADER_CODIGO)
    idxRanking = indiceHeader(primera, HEADER_RANKING)
    idxCodAlias = indiceHeader(primera, HEADER_COD_ALIAS)
    if (idxNombre < 0) idxNombre = 0
    if (idxAsoc < 0) idxAsoc = primera.length > 1 ? 1 : -1
    start = 1
  }

  const vistos = new Set<string>()
  let omitidas = 0

  for (let i = start; i < lineas.length; i++) {
    const cols = splitCampos(lineas[i])
    const nombre = (cols[idxNombre] || '').trim()
    if (!nombre) {
      omitidas++
      continue
    }
    const clave = nombre.toLowerCase()
    if (vistos.has(clave)) {
      errores.push(`Fila ${i + 1}: duplicado "${nombre}"`)
      omitidas++
      continue
    }
    vistos.add(clave)
    const asocRaw = idxAsoc >= 0 ? (cols[idxAsoc] || '').trim() : ''
    const codAlias = idxCodAlias >= 0 ? (cols[idxCodAlias] || '').trim() : ''
    const codigoRaw = idxCodigo >= 0 ? (cols[idxCodigo] || '').trim() : ''
    const asociacion = asocRaw || codAlias || undefined
    const codigoFederativo = codigoRaw || (asocRaw ? (codAlias || undefined) : undefined)
    const rankingRaw = idxRanking >= 0 ? (cols[idxRanking] || '') : ''
    filas.push({
      nombre,
      asociacion,
      codigoFederativo,
      ranking: rankingDe(rankingRaw),
    })
  }

  if (!filas.length) errores.push('No hay filas con nombre')
  return { filas, errores, omitidas }
}
