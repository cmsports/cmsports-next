// Sistema de estilo compartido para los Excel de asistencia (xlsx-js-style),
// el equivalente de `lib/pdf/estilo.ts`. Misma paleta que la app: morado de
// marca en los títulos, lila en las cabeceras, y verde/ámbar/rojo con los
// mismos cortes que usa la pantalla —75% y 50%—, para que un bloque que allá
// se ve rojo no salga verde en la planilla.

export const MORADO = '4F46E5'
export const MORADO_OS = '312E81'
export const LILA = 'EDE9FE'
export const LILA_SUAVE = 'F5F3FF'
export const LILA_TXT = '3730A3'
export const BORDE = 'E2E8F0'
export const HINT = '94A3B8'
export const VERDE_BG = 'F0FDF4'; export const VERDE_TXT = '166534'
export const AMBAR_BG = 'FFFBEB'; export const AMBAR_TXT = 'B45309'
export const ROJO_BG = 'FEF2F2'; export const ROJO_TXT = 'B91C1C'

const borde = { style: 'thin', color: { rgb: BORDE } } as const
export const bordes = { top: borde, bottom: borde, left: borde, right: borde }

export const S = {
  titulo:    { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  subtitulo: { font: { sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } },
  sede:      { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO_OS } }, alignment: { horizontal: 'left', vertical: 'center' } },
  bloque:    { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center' } },
  header:    { font: { bold: true, sz: 10, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA_SUAVE } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  label:     { font: { bold: true, color: { rgb: LILA_TXT } } },
  texto:     { alignment: { vertical: 'center', wrapText: true }, font: { sz: 11 } },
  celda:     { border: bordes, alignment: { vertical: 'center' } },
  celdaCentro: { border: bordes, alignment: { horizontal: 'center', vertical: 'center' } },
  // La cifra que manda en la hoja: grande y morada, no una celda más.
  cifra:     { font: { bold: true, sz: 20, color: { rgb: LILA_TXT } }, alignment: { horizontal: 'left', vertical: 'center' } },
  tenue:     { font: { italic: true, sz: 10, color: { rgb: HINT } }, alignment: { vertical: 'center', wrapText: true } },
  total:     { font: { bold: true, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, border: bordes, alignment: { vertical: 'center' } },
  totalCentro: { font: { bold: true, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, border: bordes, alignment: { horizontal: 'center', vertical: 'center' } },
  buena:     { fill: { fgColor: { rgb: VERDE_BG } }, font: { bold: true, color: { rgb: VERDE_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  media:     { fill: { fgColor: { rgb: AMBAR_BG } }, font: { bold: true, color: { rgb: AMBAR_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  mala:      { fill: { fgColor: { rgb: ROJO_BG } }, font: { bold: true, color: { rgb: ROJO_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
} as const

/** Verde 75% o más, ámbar 50–74, rojo abajo. `null` es "sin datos", no 0%. */
export function estiloPct(pct: number | null) {
  if (pct === null) return S.celdaCentro
  return pct >= 75 ? S.buena : pct >= 50 ? S.media : S.mala
}

/**
 * Los tres ayudantes que toda hoja repetía: pintar una celda (creándola si la
 * fila venía corta), pintar una fila entera y limpiar el nombre de hoja —Excel
 * no admite `/ \ ? * [ ]` ni más de 31 caracteres, y un nombre repetido tira
 * el libro entero abajo—.
 */
export function pintor(utils: { encode_cell: (a: { r: number; c: number }) => string }) {
  const set = (ws: any, r: number, c: number, style: any) => {
    const ref = utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
  const setFila = (ws: any, r: number, cols: number, style: any) => {
    for (let c = 0; c < cols; c++) set(ws, r, c, style)
  }
  return { set, setFila }
}

export function nombreDeHoja(propuesto: string, usados: Set<string>): string {
  const limpio = (propuesto.replace(/[/\\?*[\]:]/g, '-').trim() || 'Hoja').slice(0, 31)
  let nombre = limpio
  for (let n = 2; usados.has(nombre); n++) {
    const sufijo = ` (${n})`
    nombre = limpio.slice(0, 31 - sufijo.length) + sufijo
  }
  usados.add(nombre)
  return nombre
}
