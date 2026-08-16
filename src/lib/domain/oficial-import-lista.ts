/**
 * Parseo de lista de inscripción oficial (CSV / TSV / pegado de Excel).
 * Tolera encabezados desordenados, filas de título, ; de Excel ES, y
 * apellido+nombre en columnas separadas.
 */

export type FilaImportOficial = {
  nombre: string
  asociacion?: string
  codigoFederativo?: string
  ranking?: number
}

export type ColumnasDetectadas = {
  nombre?: string
  asociacion?: string
  codigo?: string
  ranking?: string
}

export type ParseListaOficialResult = {
  filas: FilaImportOficial[]
  errores: string[]
  omitidas: number
  columnas: ColumnasDetectadas
}

type RolCol = 'nombre' | 'apellido' | 'asoc' | 'codigo' | 'cod' | 'ranking'

function splitLineas(texto: string): string[] {
  return texto.replace(/^\uFEFF/, '').split(/\r?\n/)
}

function splitCampos(linea: string, sep: ',' | ';' | '\t'): string[] {
  if (sep === '\t') return linea.split('\t').map(c => c.trim())
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if (ch === sep && !quoted) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function detectarSeparador(lineas: string[]): ',' | ';' | '\t' {
  const muestra = lineas.slice(0, 8)
  const tabs = muestra.filter(l => l.includes('\t')).length
  if (tabs >= Math.ceil(muestra.length / 2)) return '\t'
  const semicol = muestra.reduce((n, l) => n + (l.match(/;/g)?.length ?? 0), 0)
  const commas = muestra.reduce((n, l) => n + (l.match(/,/g)?.length ?? 0), 0)
  return semicol > commas ? ';' : ','
}

export function claveHeader(h: string): string {
  return h.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function rolDeHeader(h: string): RolCol | null {
  const c = claveHeader(h)
  if (!c) return null
  if (/^(cod)$/.test(c)) return 'cod'
  if (
    /^(apellido|apellidos|lastname|surname|familyname)$/.test(c)
    || c.includes('apellido')
    || c.includes('lastname')
  ) return 'apellido'
  if (
    /^(nombre|nombres|name|names|jugador|player|fullname)$/.test(c)
    || c.includes('nombrejugador')
    || c.includes('nombredeljugador')
    || c.includes('playername')
    || c.includes('fullname')
    || c.includes('nombreyapellido')
    || c.includes('apellidonombre')
  ) return 'nombre'
  if (
    /^(asociacion|association|asoc|club|clubes|asociation)$/.test(c)
    || c.includes('asociacion')
    || c.includes('association')
  ) return 'asoc'
  if (
    /^(ranking|rk|seed|siembra|rank|posicion)$/.test(c)
    || c.includes('ranking')
    || c.includes('siembra')
  ) return 'ranking'
  if (
    /^(codigo|fctm|fctmid|playernumber|nro|nr|id|rut|cedula)$/.test(c)
    || c.includes('codigofeder')
    || c.includes('fctm')
    || c.includes('playernumber')
    || c.includes('identific')
  ) return 'codigo'
  return null
}

function preferenciaCodigo(c: string): number {
  if (c.includes('fctm')) return 0
  if (c === 'id' || c === 'rut' || c.includes('identific')) return 1
  if (c.includes('codigo') || c.includes('player')) return 2
  return 3
}

function indicesPorRol(headers: string[]): Record<RolCol, number> {
  const idx: Record<RolCol, number> = {
    nombre: -1, apellido: -1, asoc: -1, codigo: -1, cod: -1, ranking: -1,
  }
  const codigoCands: Array<{ i: number; c: string }> = []
  headers.forEach((h, i) => {
    const rol = rolDeHeader(h)
    if (!rol) return
    if (rol === 'codigo') {
      codigoCands.push({ i, c: claveHeader(h) })
      return
    }
    if (idx[rol] < 0) idx[rol] = i
  })
  if (codigoCands.length) {
    codigoCands.sort((a, b) => preferenciaCodigo(a.c) - preferenciaCodigo(b.c))
    idx.codigo = codigoCands[0].i
  }
  return idx
}

function pareceFilaHeader(campos: string[]): boolean {
  const roles = campos.map(rolDeHeader)
  return roles.some(r => r === 'nombre' || r === 'apellido')
}

function pareceFilaTitulo(campos: string[]): boolean {
  const filled = campos.filter(Boolean)
  if (!filled.length) return true
  if (pareceFilaHeader(campos)) return false
  const t = claveHeader(filled.join(' '))
  return /^(lista|inscrit|categ|evento|campeonat|planilla|met\d|fecha|sede)/.test(t)
    || /(listade|inscritos|planilla)/.test(t)
}

function rankingDe(raw: string): number | undefined {
  const n = Number(String(raw).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

function celda(cols: string[], idx: number): string {
  return idx >= 0 ? (cols[idx] || '').trim() : ''
}

function armarNombre(cols: string[], idxNombre: number, idxApellido: number): string {
  const nom = celda(cols, idxNombre)
  const ape = celda(cols, idxApellido)
  if (ape && nom) return `${ape} ${nom}`.replace(/\s+/g, ' ').trim()
  return (ape || nom).trim()
}

function inferirIndices(filas: string[][]): Record<RolCol, number> {
  const idx: Record<RolCol, number> = {
    nombre: 0, apellido: -1, asoc: -1, codigo: -1, cod: -1, ranking: -1,
  }
  if (!filas.length) return idx
  const nCols = Math.max(...filas.map(f => f.length), 0)
  if (nCols <= 1) return idx

  type Score = { i: number; avgLen: number; pctNum: number; pctCorto: number }
  const scores: Score[] = []
  for (let i = 0; i < nCols; i++) {
    const vals = filas.map(f => (f[i] || '').trim()).filter(Boolean)
    if (!vals.length) {
      scores.push({ i, avgLen: 0, pctNum: 0, pctCorto: 0 })
      continue
    }
    const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length
    const pctNum = vals.filter(v => /^[\d.\s-]+$/.test(v)).length / vals.length
    const pctCorto = vals.filter(v => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,6}$/.test(v)).length / vals.length
    scores.push({ i, avgLen, pctNum, pctCorto })
  }

  const texto = [...scores].filter(s => s.pctNum < 0.6).sort((a, b) => b.avgLen - a.avgLen)
  if (texto[0]) idx.nombre = texto[0].i
  const asoc = scores.find(s => s.i !== idx.nombre && s.pctCorto >= 0.5 && s.avgLen <= 8)
  if (asoc) idx.asoc = asoc.i
  else if (nCols >= 2 && idx.nombre === 0) idx.asoc = 1

  const numericas = scores.filter(s => s.i !== idx.nombre && s.i !== idx.asoc && s.pctNum >= 0.6)
  const ranking = numericas.find(s => s.avgLen <= 3)
  const codigo = numericas.find(s => s !== ranking)
  if (ranking) idx.ranking = ranking.i
  if (codigo) idx.codigo = codigo.i
  else if (numericas[0] && !ranking) idx.codigo = numericas[0].i

  return idx
}

function etiquetasColumnas(
  headers: string[] | null,
  idx: Record<RolCol, number>,
): ColumnasDetectadas {
  const label = (i: number, fallback: string) =>
    (headers && headers[i] ? headers[i] : fallback)
  const out: ColumnasDetectadas = {}
  if (idx.nombre >= 0 || idx.apellido >= 0) {
    const partes = [
      idx.apellido >= 0 ? label(idx.apellido, 'apellido') : '',
      idx.nombre >= 0 ? label(idx.nombre, 'nombre') : '',
    ].filter(Boolean)
    out.nombre = partes.join(' + ') || 'nombre'
  }
  if (idx.asoc >= 0 || idx.cod >= 0) {
    out.asociacion = idx.asoc >= 0 ? label(idx.asoc, 'asociación') : label(idx.cod, 'COD')
  }
  if (idx.codigo >= 0) out.codigo = label(idx.codigo, 'código')
  else if (idx.cod >= 0 && idx.asoc >= 0) out.codigo = label(idx.cod, 'COD')
  if (idx.ranking >= 0) out.ranking = label(idx.ranking, 'ranking')
  return out
}

export function parsearListaOficial(texto: string): ParseListaOficialResult {
  const vacio: ParseListaOficialResult = { filas: [], errores: ['La lista está vacía'], omitidas: 0, columnas: {} }
  const lineas = splitLineas(texto).filter(l => l.trim())
  const errores: string[] = []
  const filas: FilaImportOficial[] = []
  if (!lineas.length) return vacio

  const sep = detectarSeparador(lineas)
  const matriz = lineas.map(l => splitCampos(l, sep))

  let headerIdx = -1
  const tope = Math.min(12, matriz.length)
  for (let i = 0; i < tope; i++) {
    if (pareceFilaHeader(matriz[i])) {
      headerIdx = i
      break
    }
  }

  let idx: Record<RolCol, number>
  let start: number
  let headers: string[] | null = null

  if (headerIdx >= 0) {
    headers = matriz[headerIdx]
    idx = indicesPorRol(headers)
    if (idx.nombre < 0 && idx.apellido < 0) idx.nombre = 0
    if (idx.asoc < 0 && idx.cod < 0 && headers.length > 1 && idx.nombre !== 1) {
      idx.asoc = idx.nombre === 0 ? 1 : -1
    }
    start = headerIdx + 1
  } else {
    const cuerpo = matriz.filter(f => !pareceFilaTitulo(f))
    idx = inferirIndices(cuerpo)
    start = 0
  }

  const vistos = new Set<string>()
  let omitidas = 0

  for (let i = start; i < matriz.length; i++) {
    const cols = matriz[i]
    if (pareceFilaTitulo(cols)) {
      omitidas++
      continue
    }
    const nombre = armarNombre(cols, idx.nombre, idx.apellido)
    if (!nombre) {
      omitidas++
      continue
    }
    if (rolDeHeader(nombre) === 'nombre' || /^nombre$/i.test(nombre)) {
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
    const asocRaw = celda(cols, idx.asoc)
    const codAlias = celda(cols, idx.cod)
    const codigoRaw = celda(cols, idx.codigo)
    const asociacion = asocRaw || codAlias || undefined
    const codigoFederativo = codigoRaw || (asocRaw ? (codAlias || undefined) : undefined)
    filas.push({
      nombre,
      asociacion,
      codigoFederativo,
      ranking: rankingDe(celda(cols, idx.ranking)),
    })
  }

  if (!filas.length) errores.push('No hay filas con nombre')
  return { filas, errores, omitidas, columnas: etiquetasColumnas(headers, idx) }
}

/** Elige la hoja que más parece una lista de inscritos (xlsx de varias pestañas). */
export function elegirMejorHojaLista(hojas: Array<{ nombre: string; csv: string }>): { nombre: string; csv: string } | null {
  if (!hojas.length) return null
  let mejor: { nombre: string; csv: string; score: number } | null = null
  for (const h of hojas) {
    const parsed = parsearListaOficial(h.csv)
    const n = claveHeader(h.nombre)
    let score = parsed.filas.length
    if (/player|inscrit|lista|jugador/.test(n)) score += 20
    if (parsed.columnas.nombre) score += 4
    if (parsed.columnas.asociacion) score += 2
    if (parsed.columnas.codigo) score += 2
    if (!mejor || score > mejor.score) mejor = { ...h, score }
  }
  return mejor && mejor.score > 0 ? mejor : hojas[0]
}
