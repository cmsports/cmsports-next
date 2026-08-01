// Sistema de estilo compartido para todos los PDF del sistema (jsPDF +
// jspdf-autotable). Antes cada reporte inventaba su propio header, su propia
// paleta y su propia tabla a mano — quedaban todos distintos y algunos
// (dibujados celda por celda sin autoTable) se veían directamente feos.
// Este módulo es la única fuente de esos elementos: encabezado, pie de
// página, tarjetas de resumen y el estilo por defecto de las tablas.

export type RGB = [number, number, number]

// Paleta — la misma que usa el resto de la app (dashboard, jugadores, etc).
export const COLOR = {
  primario:   [79, 70, 229]   as RGB, // indigo — el morado de marca
  primarioOs: [55, 48, 163]   as RGB, // indigo oscuro, para texto sobre fondo claro
  texto:      [15, 23, 42]    as RGB, // slate-900
  mutado:     [100, 116, 139] as RGB, // slate-500
  tenue:      [148, 163, 184] as RGB, // slate-400
  borde:      [226, 232, 240] as RGB, // slate-200
  fondoSuave: [248, 250, 252] as RGB, // slate-50
  verde:      [22, 163, 74]   as RGB,
  verdeSuave: [240, 253, 244] as RGB,
  rojo:       [220, 38, 38]   as RGB,
  rojoSuave:  [254, 242, 242] as RGB,
  ambar:      [217, 119, 6]   as RGB,
  ambarSuave: [255, 251, 235] as RGB,
  naranja:    [249, 115, 22]  as RGB,
  morado:     [168, 85, 247]  as RGB,
  celeste:    [14, 165, 233]  as RGB,
  blanco:     [255, 255, 255] as RGB,
} as const

function hexARgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** Mezcla un color con blanco — para fondos tintados suaves (tarjetas, stripes). */
export function tinte(color: RGB, opacidad: number): RGB {
  return [
    Math.round(255 * (1 - opacidad) + color[0] * opacidad),
    Math.round(255 * (1 - opacidad) + color[1] * opacidad),
    Math.round(255 * (1 - opacidad) + color[2] * opacidad),
  ]
}

// Colores por división/categoría — mismo criterio que TableroFecha, para que
// un nombre siempre caiga en el mismo color dentro de un mismo documento.
const COLORES_CATEGORIA = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16']
export function colorPorNombre(nombre: string): RGB {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return hexARgb(COLORES_CATEGORIA[Math.abs(h) % COLORES_CATEGORIA.length])
}

export const MARGEN = 14

type EncabezadoArgs = {
  club: string
  titulo: string
  subtitulo?: string
  color?: RGB
}

/**
 * Header de una página: barra de color con el nombre del club + título del
 * reporte, más un renglón de subtítulo (fecha, período, lo que corresponda).
 * Devuelve el `y` desde donde puede empezar el contenido.
 */
export function encabezado(doc: any, { club, titulo, subtitulo, color = COLOR.primario }: EncabezadoArgs): number {
  const W = doc.internal.pageSize.getWidth()
  const H_BARRA = 26

  doc.setFillColor(...color)
  doc.rect(0, 0, W, H_BARRA, 'F')
  // Acento: una franja más clara al pie de la barra, sutil.
  doc.setFillColor(...tinte(color, 0.65))
  doc.rect(0, H_BARRA - 2, W, 2, 'F')

  doc.setTextColor(...COLOR.blanco)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(club || 'CmSports', MARGEN, 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5)
  doc.text(titulo, MARGEN, 20)

  if (subtitulo) {
    doc.setFontSize(8.5)
    doc.setTextColor(...tinte(color, 0.15))
    doc.text(subtitulo, W - MARGEN, 20, { align: 'right' })
  }

  return H_BARRA + 10
}

/**
 * Pie de página en TODAS las páginas ya generadas — se llama una sola vez,
 * al final, después de haber armado todo el contenido (necesita saber cuántas
 * páginas hay en total).
 */
export function piePagina(doc: any, texto: string) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.2)
    doc.line(MARGEN, H - 14, W - MARGEN, H - 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.setTextColor(...COLOR.tenue)
    doc.text(texto, MARGEN, H - 9)
    doc.text(`Página ${i} de ${total}`, W - MARGEN, H - 9, { align: 'right' })
  }
}

export type Tarjeta = { valor: string; etiqueta: string; color?: RGB }

/**
 * Fila de tarjetas de resumen (KPIs grandes) — lo que le faltaba a los
 * reportes viejos: antes de la tabla con el detalle, un vistazo rápido a los
 * números que importan, igual que las tarjetas del Dashboard.
 * Devuelve el `y` donde sigue el contenido.
 */
export function filaTarjetas(doc: any, y: number, tarjetas: Tarjeta[]): number {
  const W = doc.internal.pageSize.getWidth()
  const CW = W - 2 * MARGEN
  const GAP = 4
  const ancho = (CW - GAP * (tarjetas.length - 1)) / tarjetas.length
  const alto = 22

  tarjetas.forEach((t, i) => {
    const x = MARGEN + i * (ancho + GAP)
    const color = t.color ?? COLOR.primario
    const fondo = tinte(color, 0.08)

    doc.setFillColor(...fondo)
    doc.roundedRect(x, y, ancho, alto, 2, 2, 'F')
    doc.setFillColor(...color)
    doc.roundedRect(x, y, 2.2, alto, 1, 1, 'F')

    doc.setTextColor(...color)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
    doc.text(t.valor, x + 6, y + 12, { maxWidth: ancho - 9 })

    doc.setTextColor(...COLOR.mutado)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(t.etiqueta, x + 6, y + 18, { maxWidth: ancho - 9 })
  })

  return y + alto + 10
}

/** Título de sección dentro del cuerpo del documento (no el header de página). */
export function tituloSeccion(doc: any, y: number, texto: string): number {
  doc.setTextColor(...COLOR.texto)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(texto, MARGEN, y)
  doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.3)
  doc.line(MARGEN, y + 2.5, doc.internal.pageSize.getWidth() - MARGEN, y + 2.5)
  return y + 9
}

/** Aviso de "sin datos" — mejor que dejar una tabla vacía o una sección muda. */
export function sinDatos(doc: any, y: number, texto = 'Sin datos para este período.'): number {
  doc.setTextColor(...COLOR.tenue)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9)
  doc.text(texto, MARGEN, y)
  return y + 8
}

/** Opciones por defecto para autoTable — se combinan con lo específico de cada tabla. */
export function estiloTabla(color: RGB = COLOR.primario) {
  return {
    theme: 'striped' as const,
    margin: { left: MARGEN, right: MARGEN },
    headStyles: {
      fillColor: color, textColor: COLOR.blanco,
      fontStyle: 'bold' as const, fontSize: 8.5, cellPadding: 3,
    },
    bodyStyles: { fontSize: 8.5, textColor: COLOR.texto, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: COLOR.fondoSuave },
    styles: { lineColor: COLOR.borde, lineWidth: 0.1 },
  }
}

/** Convierte un hex de división/categoría a RGB, para usar fuera de este módulo. */
export { hexARgb }
