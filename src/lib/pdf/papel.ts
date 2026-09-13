// "Papel": el molde de los reportes, versión 2.
//
// Los reportes de la v1 (`estilo.ts`) compartían header y tablas pero eran
// planillas: franja morada genérica, doce tarjetas del mismo porte con la
// mitad en "—", cabeceras de tabla rellenas de rojo pleno, ni un gráfico, y
// el club aparecía en letra de 8 puntos. Esto los reemplaza, reporte por
// reporte, con cuatro reglas:
//
//   1. IDENTIDAD. Logo del club, su nombre y SU color (el dominante del
//      logo) en cada página. Un reporte de Spinhouse tiene que verse de
//      Spinhouse, no de "el sistema".
//   2. JERARQUÍA. Pocas cifras grandes (las que importan), con su variación.
//      Lo vacío no se imprime: una tarjeta que dice "—" es relleno.
//   3. GRÁFICOS DE VERDAD. Barras, anillos y calendarios dibujados en vector,
//      no porcentajes en texto rojo.
//   4. TIPOGRAFÍA REAL. Inter incrustada (regular, semibold, bold), números
//      tabulares, tildes bien. Sin emojis: la fuente del PDF no los tiene y
//      salían como "#ó". Los íconos van dibujados.
//
// Todo lo que dibuja recibe `doc` (jsPDF) y devuelve el `y` donde seguir.

import type { RGB } from './estilo'
import { cargarLogoPdf, type LogoPdf } from './estilo'

export type { RGB, LogoPdf }

// ─── Paleta base (la parte que no depende del club) ─────────────────────────

export const TINTA: RGB = [17, 24, 39]        // casi negro, para títulos
export const TEXTO: RGB = [31, 41, 55]        // gris muy oscuro, cuerpo
export const GRIS: RGB = [107, 114, 128]      // secundario
export const GRIS_CLARO: RGB = [156, 163, 175]
export const LINEA: RGB = [229, 231, 235]
export const FONDO: RGB = [249, 250, 251]
export const BLANCO: RGB = [255, 255, 255]
export const VERDE: RGB = [22, 163, 74]
export const ROJO: RGB = [220, 38, 38]
export const AMBAR: RGB = [217, 119, 6]
export const AZUL: RGB = [37, 99, 235]
export const ACENTO_POR_DEFECTO: RGB = [79, 70, 229]

export const MARGEN = 16
const ALTO_PIE = 16

export function mezclar(color: RGB, conBlanco: number): RGB {
  return [0, 1, 2].map(i => Math.round(255 * (1 - conBlanco) + color[i] * conBlanco)) as unknown as RGB
}
function oscurecer(color: RGB, factor: number): RGB {
  return [0, 1, 2].map(i => Math.round(color[i] * (1 - factor))) as unknown as RGB
}

/** La identidad con la que se firma cada página. */
export interface Marca {
  club: string
  logo?: LogoPdf | null
  acento: RGB
}

/** Pesos y monedas, para que todos los reportes digan la plata igual. */
export const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
export const porcentaje = (n: number) => `${Math.round(n)}%`

// ─── Fuente ─────────────────────────────────────────────────────────────────

let fuentesBase64: { regular: string; semibold: string; bold: string } | null = null
let interDisponible = false

async function aBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo cargar la fuente ' + url)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let bin = ''
  const paso = 0x8000
  for (let i = 0; i < bytes.length; i += paso) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + paso)))
  return btoa(bin)
}

/**
 * Incrusta Inter en el documento. Se baja una vez por sesión desde
 * /fonts (el navegador la cachea) y se reusa en cada PDF. Si no se pudo
 * cargar, el documento sigue con Helvetica: peor, pero sale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function prepararFuentes(doc: any): Promise<boolean> {
  try {
    if (!fuentesBase64) {
      const [regular, semibold, bold] = await Promise.all([
        aBase64('/fonts/Inter-Regular.ttf'), aBase64('/fonts/Inter-SemiBold.ttf'), aBase64('/fonts/Inter-Bold.ttf'),
      ])
      fuentesBase64 = { regular, semibold, bold }
    }
    doc.addFileToVFS('Inter-Regular.ttf', fuentesBase64.regular)
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal')
    doc.addFileToVFS('Inter-SemiBold.ttf', fuentesBase64.semibold)
    doc.addFont('Inter-SemiBold.ttf', 'Inter', 'semibold')
    doc.addFileToVFS('Inter-Bold.ttf', fuentesBase64.bold)
    doc.addFont('Inter-Bold.ttf', 'Inter', 'bold')
    doc.setFont('Inter', 'normal')
    interDisponible = true
    return true
  } catch {
    interDisponible = false
    doc.setFont('helvetica', 'normal')
    return false
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fuente(doc: any, peso: 'normal' | 'semibold' | 'bold', tam: number, color: RGB = TEXTO) {
  if (interDisponible) doc.setFont('Inter', peso)
  else doc.setFont('helvetica', peso === 'normal' ? 'normal' : 'bold')
  doc.setFontSize(tam)
  doc.setTextColor(...color)
}

// ─── Identidad del club ─────────────────────────────────────────────────────

/**
 * El color dominante del logo: el promedio de sus píxeles saturados. Un logo
 * negro sobre blanco no tiene color dominante y cae al acento por defecto.
 */
function colorDominante(logo: LogoPdf): RGB | null {
  if (typeof document === 'undefined') return null
  try {
    const img = new Image()
    img.src = logo.data
    const canvas = document.createElement('canvas')
    const lado = 48
    canvas.width = lado; canvas.height = lado
    const ctx = canvas.getContext('2d')
    if (!ctx || !img.complete) return null
    ctx.drawImage(img, 0, 0, lado, lado)
    const px = ctx.getImageData(0, 0, lado, lado).data
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < px.length; i += 4) {
      const [R, G, B] = [px[i], px[i + 1], px[i + 2]]
      const max = Math.max(R, G, B), min = Math.min(R, G, B)
      const sat = max === 0 ? 0 : (max - min) / max
      const luz = (max + min) / 2
      if (sat > 0.35 && luz > 40 && luz < 215) { r += R; g += G; b += B; n++ }
    }
    if (n < 20) return null
    const color: RGB = [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
    // Si quedó demasiado claro para llevar texto blanco encima, se oscurece.
    const brillo = (color[0] * 299 + color[1] * 587 + color[2] * 114) / 1000
    return brillo > 170 ? oscurecer(color, 0.35) : color
  } catch {
    return null
  }
}

/** Arma la marca del club: nombre, logo y color. Nunca falla: sin logo, índigo. */
export async function marcaDelClub(club: { nombre: string; logo_url?: string | null }): Promise<Marca> {
  const logo = await cargarLogoPdf(club.logo_url)
  let acento: RGB | null = null
  if (logo) {
    // La imagen del logo ya está decodificada en base64; el canvas la lee al
    // vuelo, pero `Image` decodifica async: se espera un tick.
    await new Promise<void>(resolve => { const i = new Image(); i.onload = () => resolve(); i.onerror = () => resolve(); i.src = logo.data })
    acento = colorDominante(logo)
  }
  return { club: club.nombre, logo, acento: acento ?? ACENTO_POR_DEFECTO }
}

// ─── Portada y pie ──────────────────────────────────────────────────────────

export interface Portada {
  titulo: string
  /** Debajo del título: "Septiembre 2026", "Adultos · Activo", etc. */
  subtitulo?: string
  /** Arriba a la derecha, chico: "Generado el 12-09-2026". */
  nota?: string
}

/**
 * Cabecera de página: logo en círculo, nombre del club en el color del club,
 * el título grande en tinta, una línea de acento debajo. Sin franja pintada:
 * el color va en detalles, no en un bloque que se come el primer tercio.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function portada(doc: any, marca: Marca, p: Portada): number {
  const W = doc.internal.pageSize.getWidth()
  let x = MARGEN
  const yTop = 14
  if (marca.logo) {
    const R = 9
    doc.setFillColor(...BLANCO)
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.3)
    doc.circle(x + R, yTop + R, R, 'FD')
    const lado = R * 2 - 4
    const esc = Math.min(lado / marca.logo.ancho, lado / marca.logo.alto)
    const aw = marca.logo.ancho * esc, ah = marca.logo.alto * esc
    doc.addImage(marca.logo.data, 'JPEG', x + R - aw / 2, yTop + R - ah / 2, aw, ah)
    x += R * 2 + 5
  }
  fuente(doc, 'bold', 8.5, marca.acento)
  doc.text(marca.club.toUpperCase(), x, yTop + 4.5, { charSpace: 0.4 })
  fuente(doc, 'bold', 20, TINTA)
  doc.text(p.titulo, x, yTop + 13.5)
  if (p.subtitulo) {
    fuente(doc, 'normal', 10, GRIS)
    doc.text(p.subtitulo, x, yTop + 19.5)
  }
  if (p.nota) {
    fuente(doc, 'normal', 8, GRIS_CLARO)
    doc.text(p.nota, W - MARGEN, yTop + 4.5, { align: 'right' })
  }
  const yLinea = yTop + 24
  doc.setDrawColor(...marca.acento)
  doc.setLineWidth(0.9)
  doc.line(MARGEN, yLinea, MARGEN + 28, yLinea)
  doc.setDrawColor(...LINEA)
  doc.setLineWidth(0.3)
  doc.line(MARGEN + 28, yLinea, W - MARGEN, yLinea)
  return yLinea + 10
}

/** Pie en todas las páginas: club y reporte a la izquierda, página a la derecha. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pieDePagina(doc: any, marca: Marca, texto: string) {
  const total = doc.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.3)
    doc.line(MARGEN, H - ALTO_PIE + 4, W - MARGEN, H - ALTO_PIE + 4)
    fuente(doc, 'normal', 7.5, GRIS_CLARO)
    doc.text(`${marca.club}  ·  ${texto}`, MARGEN, H - ALTO_PIE + 9)
    doc.text(`${i} / ${total}`, W - MARGEN, H - ALTO_PIE + 9, { align: 'right' })
  }
}

/** Si lo que viene no cabe, página nueva (con la misma portada, más chica). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asegurar(doc: any, y: number, alto: number, marca: Marca, p: Portada): number {
  const H = doc.internal.pageSize.getHeight()
  if (y + alto <= H - ALTO_PIE - 4) return y
  doc.addPage()
  return portada(doc, marca, p)
}

// ─── Bloques ────────────────────────────────────────────────────────────────

/** Título de sección: texto en tinta con un punto del color del club. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seccion(doc: any, y: number, marca: Marca, titulo: string, nota?: string): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...marca.acento)
  doc.circle(MARGEN + 1.6, y - 1.4, 1.6, 'F')
  fuente(doc, 'bold', 12.5, TINTA)
  doc.text(titulo, MARGEN + 6, y)
  if (nota) {
    fuente(doc, 'normal', 8.5, GRIS)
    doc.text(nota, W - MARGEN, y, { align: 'right' })
  }
  return y + 7
}

export interface Cifra {
  etiqueta: string
  valor: string
  /** Renglón chico bajo el valor: "vs Agosto", "53 cuotas". */
  detalle?: string
  /** Variación en %: dibuja una flecha verde o roja. */
  variacion?: number | null
  /** Si la variación positiva es mala (gastos, deuda), se invierte el color. */
  subirEsMalo?: boolean
  color?: RGB
}

/**
 * Las cifras grandes: hasta cuatro por fila, valor en 22 pt, etiqueta chica
 * arriba y detalle abajo. Sin recuadros de colores: una línea de acento a
 * la izquierda y aire. Las que vienen vacías ("—") no se dibujan.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cifras(doc: any, y: number, marca: Marca, lista: Cifra[]): number {
  const visibles = lista.filter(c => c.valor && c.valor !== '—').slice(0, 4)
  if (!visibles.length) return y
  const W = doc.internal.pageSize.getWidth()
  const ancho = (W - 2 * MARGEN - (visibles.length - 1) * 6) / visibles.length
  const alto = 24
  visibles.forEach((c, i) => {
    const x = MARGEN + i * (ancho + 6)
    doc.setFillColor(...(c.color ?? marca.acento))
    doc.rect(x, y, 1.2, alto, 'F')
    fuente(doc, 'semibold', 7.5, GRIS)
    doc.text(c.etiqueta.toUpperCase(), x + 5, y + 4.5, { charSpace: 0.3 })
    fuente(doc, 'bold', 19, TINTA)
    doc.text(c.valor, x + 5, y + 14)
    let dx = x + 5
    if (c.variacion != null && Number.isFinite(c.variacion)) {
      const sube = c.variacion >= 0
      const bueno = c.subirEsMalo ? !sube : sube
      const col = c.variacion === 0 ? GRIS : bueno ? VERDE : ROJO
      // Flecha: un triángulo chico.
      doc.setFillColor(...col)
      const ty = y + 19.5
      if (sube) doc.triangle(dx, ty + 1.2, dx + 2.6, ty + 1.2, dx + 1.3, ty - 1.2, 'F')
      else doc.triangle(dx, ty - 1.2, dx + 2.6, ty - 1.2, dx + 1.3, ty + 1.2, 'F')
      fuente(doc, 'semibold', 8, col)
      const txt = `${Math.abs(Math.round(c.variacion))}%`
      doc.text(txt, dx + 4, y + 20.5)
      dx += 4 + doc.getTextWidth(txt) + 2
    }
    if (c.detalle) {
      fuente(doc, 'normal', 7, GRIS)
      const disponible = x + ancho - dx - 2
      let texto = c.detalle
      while (doc.getTextWidth(texto) > disponible && texto.length > 4) texto = texto.slice(0, -2).trimEnd() + '…'
      doc.text(texto, dx, y + 20.5)
    }
  })
  return y + alto + 11
}

export type Tono = 'bien' | 'ojo' | 'mal' | 'info' | 'neutro'
const COLOR_TONO: Record<Tono, RGB> = { bien: VERDE, ojo: AMBAR, mal: ROJO, info: AZUL, neutro: GRIS }

/** Lista de hallazgos: un punto de color por tono y el texto a su lado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hallazgos(doc: any, y: number, lista: Array<{ texto: string; tono: Tono }>, ancho?: number): number {
  const W = doc.internal.pageSize.getWidth()
  const maxW = (ancho ?? W - 2 * MARGEN) - 9
  for (const h of lista) {
    fuente(doc, 'normal', 9.5, TEXTO)
    const lineas: string[] = doc.splitTextToSize(h.texto, maxW)
    doc.setFillColor(...COLOR_TONO[h.tono])
    doc.circle(MARGEN + 2, y - 1.3, 1.5, 'F')
    doc.text(lineas, MARGEN + 8, y)
    y += lineas.length * 4.6 + 2.2
  }
  return y + 3
}

export interface FilaBarra { etiqueta: string; valor: number; texto?: string; color?: RGB }

/**
 * Barras horizontales con etiqueta a la izquierda y valor a la derecha,
 * proporcionales al mayor. Para "ingresos por categoría" y parecidos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function barras(doc: any, y: number, marca: Marca, filas: FilaBarra[], opts: { x?: number; ancho?: number; titulo?: string } = {}): number {
  const W = doc.internal.pageSize.getWidth()
  const x = opts.x ?? MARGEN
  const ancho = opts.ancho ?? W - 2 * MARGEN
  if (opts.titulo) {
    fuente(doc, 'semibold', 8, GRIS)
    doc.text(opts.titulo.toUpperCase(), x, y, { charSpace: 0.3 })
    y += 5
  }
  const max = Math.max(1, ...filas.map(f => f.valor))
  const anchoEtiqueta = Math.min(52, ancho * 0.38)
  const anchoValor = 26
  const anchoBarra = ancho - anchoEtiqueta - anchoValor - 4
  for (const f of filas) {
    fuente(doc, 'normal', 8.5, TEXTO)
    doc.text(doc.splitTextToSize(f.etiqueta, anchoEtiqueta - 2)[0], x, y + 3)
    doc.setFillColor(...FONDO); doc.setDrawColor(...FONDO)
    doc.roundedRect(x + anchoEtiqueta, y, anchoBarra, 4.2, 1, 1, 'F')
    const w = Math.max(1.2, (f.valor / max) * anchoBarra)
    doc.setFillColor(...(f.color ?? marca.acento)); doc.setDrawColor(...(f.color ?? marca.acento))
    doc.roundedRect(x + anchoEtiqueta, y, w, 4.2, 1, 1, 'F')
    fuente(doc, 'semibold', 8.5, TINTA)
    doc.text(f.texto ?? String(f.valor), x + ancho, y + 3.3, { align: 'right' })
    y += 7.2
  }
  return y + 3
}

export interface ColumnaVertical { etiqueta: string; valores: number[] }

/**
 * Barras verticales agrupadas (por ejemplo, ingresos y gastos por mes), con
 * leyenda. Las series van en `colores` en el mismo orden que `valores`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function columnas(doc: any, y: number, cols: ColumnaVertical[], series: Array<{ nombre: string; color: RGB }>, opts: { alto?: number; formato?: (n: number) => string } = {}): number {
  const W = doc.internal.pageSize.getWidth()
  const alto = opts.alto ?? 40
  const x0 = MARGEN, ancho = W - 2 * MARGEN
  const max = Math.max(1, ...cols.flatMap(c => c.valores))
  // Leyenda
  let lx = x0
  for (const s of series) {
    doc.setFillColor(...s.color)
    doc.roundedRect(lx, y - 3, 3, 3, 0.6, 0.6, 'F')
    fuente(doc, 'normal', 8, GRIS)
    doc.text(s.nombre, lx + 4.5, y - 0.4)
    lx += 4.5 + doc.getTextWidth(s.nombre) + 6
  }
  y += 4
  const base = y + alto
  doc.setDrawColor(...LINEA); doc.setLineWidth(0.3)
  doc.line(x0, base, x0 + ancho, base)
  // Grupos de ancho acotado y centrados: tres meses no tienen por qué
  // repartirse en toda la hoja con barras de palito.
  const grupoW = Math.min(64, ancho / Math.max(1, cols.length))
  const inicio = x0 + (ancho - grupoW * cols.length) / 2
  const barW = Math.min(16, (grupoW - 8) / Math.max(1, series.length))
  cols.forEach((c, i) => {
    const gx = inicio + i * grupoW + (grupoW - barW * series.length) / 2
    c.valores.forEach((v, k) => {
      const h = (v / max) * (alto - 8)
      doc.setFillColor(...series[k].color); doc.setDrawColor(...series[k].color)
      if (h > 0.4) doc.roundedRect(gx + k * barW, base - h, barW - 1, h, 0.8, 0.8, 'F')
      if (v > 0 && cols.length <= 8) {
        fuente(doc, 'normal', 6.5, GRIS)
        doc.text((opts.formato ?? (n => String(n)))(v), gx + k * barW + (barW - 1) / 2, base - h - 1.2, { align: 'center' })
      }
    })
    fuente(doc, 'normal', 7.5, GRIS)
    doc.text(c.etiqueta, inicio + i * grupoW + grupoW / 2, base + 4.5, { align: 'center' })
  })
  return base + 10
}

/** Anillo de porcentaje con el número al centro. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function anillo(doc: any, cx: number, cy: number, r: number, pct: number, color: RGB, etiqueta?: string) {
  const grosor = Math.max(2, r * 0.28)
  doc.setLineWidth(grosor)
  doc.setDrawColor(...FONDO)
  doc.circle(cx, cy, r - grosor / 2, 'S')
  const p = Math.max(0, Math.min(100, pct))
  if (p > 0) {
    doc.setDrawColor(...color)
    doc.setLineCap(1)
    // Arco por segmentos: jsPDF no tiene arcos, se aproxima con líneas.
    const pasos = Math.max(8, Math.round(p * 0.9))
    const ini = -Math.PI / 2
    const fin = ini + (p / 100) * Math.PI * 2
    const rr = r - grosor / 2
    let px = cx + rr * Math.cos(ini), py = cy + rr * Math.sin(ini)
    for (let i = 1; i <= pasos; i++) {
      const a = ini + (fin - ini) * (i / pasos)
      const nx = cx + rr * Math.cos(a), ny = cy + rr * Math.sin(a)
      doc.line(px, py, nx, ny)
      px = nx; py = ny
    }
  }
  doc.setLineCap(0)
  fuente(doc, 'bold', r * 0.9, TINTA)
  doc.text(`${Math.round(p)}%`, cx, cy + r * 0.32, { align: 'center' })
  if (etiqueta) {
    fuente(doc, 'normal', 7.5, GRIS)
    doc.text(etiqueta, cx, cy + r + 5, { align: 'center' })
  }
  doc.setLineWidth(0.3)
}

/** Estilo de tabla limpio: cabecera en tinta sobre fondo claro, línea de acento, zebra suave. */
export function tabla(marca: Marca, opts: { numericas?: number[]; anchos?: Record<number, number> } = {}) {
  const columnStyles: Record<number, Record<string, unknown>> = {}
  for (const i of opts.numericas ?? []) columnStyles[i] = { halign: 'right' }
  for (const [i, w] of Object.entries(opts.anchos ?? {})) columnStyles[Number(i)] = { ...(columnStyles[Number(i)] ?? {}), cellWidth: w }
  return {
    theme: 'plain' as const,
    margin: { left: MARGEN, right: MARGEN, bottom: ALTO_PIE + 4 },
    styles: { font: interDisponible ? 'Inter' : 'helvetica', fontSize: 8.5, textColor: TEXTO, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, lineWidth: 0, lineColor: BLANCO, overflow: 'linebreak' as const },
    tableLineWidth: 0,
    // La cabecera se alinea igual que su columna (autotable no lo hace solo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section === 'head' && (opts.numericas ?? []).includes(data.column.index)) data.cell.styles.halign = 'right'
    },
    headStyles: { fontStyle: (interDisponible ? 'semibold' : 'bold') as 'bold', fontSize: 7.5, textColor: GRIS, fillColor: BLANCO, cellPadding: { top: 2, bottom: 2.4, left: 2.5, right: 2.5 } },
    bodyStyles: { fillColor: BLANCO },
    alternateRowStyles: { fillColor: FONDO },
    footStyles: { fontStyle: 'bold' as const, textColor: TINTA, fillColor: mezclar(marca.acento, 0.10) },
    columnStyles,
    // Línea de acento bajo la cabecera, celda por celda (así sale también
    // cuando la tabla sigue en otra página).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didDrawCell: (data: any) => {
      if (data.section !== 'head') return
      const c = data.cell
      data.doc.setDrawColor(...marca.acento)
      data.doc.setLineWidth(0.5)
      data.doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height)
    },
  }
}

/**
 * Una mini barra de progreso dentro de una celda (para "% de asistencia" y
 * similares). Se llama desde `didDrawCell` de autotable: la celda tiene que
 * llevar el número (0–100) como texto y se dibuja encima.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function barraEnCelda(doc: any, cell: any, pct: number, color: RGB) {
  const x = cell.x + 2.5, y = cell.y + cell.height / 2 - 1.4
  const w = cell.width - 5 - 12
  doc.setFillColor(...FONDO)
  doc.roundedRect(x, y, w, 2.8, 0.8, 0.8, 'F')
  doc.setFillColor(...color)
  doc.roundedRect(x, y, Math.max(0.8, (Math.max(0, Math.min(100, pct)) / 100) * w), 2.8, 0.8, 0.8, 'F')
  fuente(doc, 'semibold', 7.5, TINTA)
  doc.text(`${Math.round(pct)}%`, cell.x + cell.width - 2.5, cell.y + cell.height / 2 + 1.1, { align: 'right' })
}

export const colorDePorcentaje = (pct: number): RGB => (pct >= 75 ? VERDE : pct >= 50 ? AMBAR : ROJO)

/** Un renglón de texto corriente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parrafo(doc: any, y: number, texto: string, opts: { tam?: number; color?: RGB; peso?: 'normal' | 'semibold' | 'bold' } = {}): number {
  const W = doc.internal.pageSize.getWidth()
  fuente(doc, opts.peso ?? 'normal', opts.tam ?? 9, opts.color ?? TEXTO)
  const lineas: string[] = doc.splitTextToSize(texto, W - 2 * MARGEN)
  doc.text(lineas, MARGEN, y)
  return y + lineas.length * ((opts.tam ?? 9) * 0.5) + 3
}

/** Nota al pie de una sección, chica y gris. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function nota(doc: any, y: number, texto: string): number {
  return parrafo(doc, y, texto, { tam: 7.5, color: GRIS_CLARO })
}
