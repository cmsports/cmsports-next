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
  const H_BARRA = 30

  doc.setFillColor(...color)
  doc.rect(0, 0, W, H_BARRA, 'F')
  // Acento: una franja más clara al pie de la barra, sutil.
  doc.setFillColor(...tinte(color, 0.65))
  doc.rect(0, H_BARRA - 2, W, 2, 'F')

  // El club arriba y chico, el reporte grande: al hojear un montón de PDF lo
  // que hay que distinguir es cuál reporte es, no de qué club (todos son del
  // mismo). Antes era al revés y todos se veían iguales de lejos.
  doc.setTextColor(...tinte(color, 0.2))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text((club || 'CmSports').toUpperCase(), MARGEN, 10)

  doc.setTextColor(...COLOR.blanco)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(titulo, MARGEN, 21, { maxWidth: W - 2 * MARGEN - 60 })

  if (subtitulo) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.setTextColor(...tinte(color, 0.15))
    doc.text(subtitulo, W - MARGEN, 21, { align: 'right' })
  }

  return H_BARRA + 12
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
  const GAP = 5
  const ancho = (CW - GAP * (tarjetas.length - 1)) / tarjetas.length
  const alto = 25
  const util = ancho - 9

  tarjetas.forEach((t, i) => {
    const x = MARGEN + i * (ancho + GAP)
    const color = t.color ?? COLOR.primario
    const fondo = tinte(color, 0.08)

    doc.setFillColor(...fondo)
    doc.roundedRect(x, y, ancho, alto, 2.5, 2.5, 'F')
    doc.setFillColor(...color)
    doc.roundedRect(x, y, 2.4, alto, 1.2, 1.2, 'F')

    // La cifra se achica sola si no cabe. Sin esto, un monto de ocho dígitos
    // en una fila de cuatro tarjetas se partía en dos líneas y pisaba la
    // etiqueta de abajo — el "amontonado" clásico de estos reportes.
    doc.setFont('helvetica', 'bold')
    let tam = 15
    doc.setFontSize(tam)
    while (tam > 8 && doc.getTextWidth(t.valor) > util) { tam -= 0.5; doc.setFontSize(tam) }
    doc.setTextColor(...color)
    doc.text(t.valor, x + 6, y + 13)

    doc.setTextColor(...COLOR.mutado)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.text(t.etiqueta, x + 6, y + 20, { maxWidth: util })
  })

  return y + alto + 11
}

/**
 * Título de sección dentro del cuerpo del documento (no el header de página).
 * `nota` va a la derecha, en gris: el "de cuántos" o el criterio de la tabla
 * que viene abajo, para no tener que explicarlo en el encabezado de columna.
 */
export function tituloSeccion(doc: any, y: number, texto: string, nota?: string, color: RGB = COLOR.primario): number {
  const W = doc.internal.pageSize.getWidth()
  // Marca de color a la izquierda: separa secciones sin gastar una línea en
  // blanco y hace que se distingan de un vistazo al hojear el PDF.
  doc.setFillColor(...color)
  doc.roundedRect(MARGEN, y - 3.6, 2, 4.6, 1, 1, 'F')

  doc.setTextColor(...COLOR.texto)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5)
  doc.text(texto, MARGEN + 5, y)

  if (nota) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.setTextColor(...COLOR.tenue)
    doc.text(nota, W - MARGEN, y, { align: 'right' })
  }

  doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.3)
  doc.line(MARGEN, y + 3, W - MARGEN, y + 3)
  return y + 10
}

/**
 * Aviso de "sin datos" — mejor que dejar una tabla vacía o una sección muda.
 * Va en una cajita, para que se vea que la sección corrió y no dio nada, en
 * vez de parecer que el reporte se cortó ahí.
 */
export function sinDatos(doc: any, y: number, texto = 'Sin datos para este período.'): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...COLOR.fondoSuave)
  doc.roundedRect(MARGEN, y - 4, W - 2 * MARGEN, 12, 2, 2, 'F')
  doc.setTextColor(...COLOR.tenue)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5)
  doc.text(texto, MARGEN + 5, y + 3.5)
  return y + 16
}

/** Opciones por defecto para autoTable — se combinan con lo específico de cada tabla. */
export function estiloTabla(color: RGB = COLOR.primario) {
  return {
    theme: 'striped' as const,
    margin: { left: MARGEN, right: MARGEN, bottom: PIE },
    headStyles: {
      fillColor: color, textColor: COLOR.blanco,
      fontStyle: 'bold' as const, fontSize: 8.5, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
    },
    bodyStyles: { fontSize: 8.5, textColor: COLOR.texto, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    // Fila de total al pie: mismo color de la cabecera pero tintado, para que
    // se lea como cierre de la tabla y no como una fila más de datos.
    footStyles: {
      fillColor: tinte(color, 0.14), textColor: COLOR.texto,
      fontStyle: 'bold' as const, fontSize: 8.5, cellPadding: 3,
    },
    alternateRowStyles: { fillColor: COLOR.fondoSuave },
    styles: { lineColor: COLOR.borde, lineWidth: 0.1, overflow: 'linebreak' as const },
  }
}

/** Convierte un hex de división/categoría a RGB, para usar fuera de este módulo. */
export { hexARgb }

// ────────────────────────────────────────────────────────────────────────
// Bloques de maquetación
//
// Lo que faltaba y hacía que los reportes se vieran amontonados: nadie medía
// cuánto espacio quedaba en la página. Cada sección hacía `y = finalY + 10` y
// escribía el título ahí aunque estuviera a 5 mm del borde — el título quedaba
// huérfano al pie y la tabla arrancaba sola en la hoja siguiente. Y todo lo
// que no era una lista se metía igual dentro de una tabla "Concepto | Valor"
// de dos columnas, que autoTable estira a la hoja completa: un nombre a la
// izquierda, un número al otro extremo y 15 cm de blanco al medio.
// ────────────────────────────────────────────────────────────────────────

/** Alto reservado abajo para el pie de página. Nada se dibuja debajo de esto. */
export const PIE = 22

type Reencabezado = { club: string; titulo: string; subtitulo?: string; color?: RGB }

/**
 * Garantiza `alto` milímetros libres antes de seguir dibujando. Si no caben,
 * abre página nueva y repite el encabezado (con "cont." en el título) para
 * que ninguna hoja quede sin identificar.
 */
export function asegurarEspacio(doc: any, y: number, alto: number, cab: Reencabezado): number {
  const H = doc.internal.pageSize.getHeight()
  if (y + alto <= H - PIE) return y
  doc.addPage()
  return encabezado(doc, { ...cab, titulo: `${cab.titulo} (cont.)` })
}

/** El `y` donde sigue el contenido después de la última tabla de autoTable. */
export function trasTabla(doc: any, separacion = 12): number {
  return (doc.lastAutoTable?.finalY ?? 0) + separacion
}

export type Par = [etiqueta: string, valor: string]

/**
 * Ficha de datos en columnas — el reemplazo de la tabla "Concepto | Valor".
 * Etiqueta chica y mutada arriba, valor grande abajo, en una grilla de `cols`
 * columnas. Ocupa un tercio del alto y se lee de un vistazo.
 */
export function panelDatos(doc: any, y: number, pares: Par[], cols = 3): number {
  const W = doc.internal.pageSize.getWidth()
  const ancho = (W - 2 * MARGEN) / cols
  const altoFila = 13
  const filas = Math.ceil(pares.length / cols)

  doc.setFillColor(...COLOR.fondoSuave)
  doc.roundedRect(MARGEN, y, W - 2 * MARGEN, filas * altoFila + 4, 2, 2, 'F')

  pares.forEach(([etiqueta, valor], i) => {
    const col = i % cols
    const fila = Math.floor(i / cols)
    const x = MARGEN + col * ancho + 5
    const yy = y + 4 + fila * altoFila

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.setTextColor(...COLOR.mutado)
    doc.text(etiqueta.toUpperCase(), x, yy + 3.5, { maxWidth: ancho - 8 })

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
    doc.setTextColor(...COLOR.texto)
    doc.text(valor || '—', x, yy + 9.5, { maxWidth: ancho - 8 })
  })

  // Separadores verticales entre columnas, tenues.
  doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.2)
  for (let c = 1; c < cols; c++) {
    const x = MARGEN + c * ancho
    doc.line(x, y + 3, x, y + filas * altoFila + 1)
  }

  return y + filas * altoFila + 4 + 10
}

export type FilaBarra = { etiqueta: string; valor: number; texto?: string; color?: RGB }

/**
 * Barras horizontales con porcentaje — para desgloses por categoría. Antes
 * era una tabla de dos columnas donde no se veía cuál pesaba más; acá el
 * ancho de la barra lo dice sin leer un número.
 */
export function barrasCategoria(doc: any, y: number, filas: FilaBarra[], color: RGB = COLOR.primario, cab?: Reencabezado): number {
  if (filas.length === 0) return sinDatos(doc, y)
  const W = doc.internal.pageSize.getWidth()
  const ANCHO_ETIQUETA = 45
  const ANCHO_TEXTO = 34
  // El porcentaje vive entre la canaleta y el monto; con 3 mm quedaba pegado
  // al final de la barra y parecía parte de ella.
  const HUECO_PCT = 9
  const X_BARRA = MARGEN + ANCHO_ETIQUETA + 3
  const ANCHO_BARRA = W - MARGEN - ANCHO_TEXTO - X_BARRA - HUECO_PCT
  const ALTO = 9
  doc.setLineWidth(0)
  const max = Math.max(...filas.map(f => f.valor), 1)
  const total = filas.reduce((s, f) => s + f.valor, 0) || 1

  for (const f of filas) {
    if (cab) y = asegurarEspacio(doc, y, ALTO + 2, cab)
    const c = f.color ?? color

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.setTextColor(...COLOR.texto)
    doc.text(f.etiqueta, MARGEN, y + 5.6, { maxWidth: ANCHO_ETIQUETA - 2 })

    // Canaleta completa + barra proporcional encima: se ve el "de cuánto".
    doc.setFillColor(...COLOR.fondoSuave)
    doc.roundedRect(X_BARRA, y + 1.5, ANCHO_BARRA, 5.5, 1.2, 1.2, 'F')
    const ancho = Math.max((f.valor / max) * ANCHO_BARRA, f.valor > 0 ? 1.5 : 0)
    if (ancho > 0) {
      doc.setFillColor(...c)
      doc.roundedRect(X_BARRA, y + 1.5, ancho, 5.5, 1.2, 1.2, 'F')
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
    doc.setTextColor(...COLOR.texto)
    doc.text(f.texto ?? String(f.valor), W - MARGEN, y + 5.6, { align: 'right' })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
    doc.setTextColor(...COLOR.tenue)
    doc.text(`${Math.round((f.valor / total) * 100)}%`, X_BARRA + ANCHO_BARRA + 3, y + 5.6)

    y += ALTO
  }
  return y + 6
}

/**
 * Barras verticales — para series cortas y ordenadas (días de la semana,
 * meses). Una tabla de siete filas no muestra la forma de la semana; esto sí.
 */
export function barrasColumnas(doc: any, y: number, filas: { etiqueta: string; valor: number }[], color: RGB = COLOR.primario): number {
  if (filas.length === 0) return sinDatos(doc, y)
  const W = doc.internal.pageSize.getWidth()
  const CW = W - 2 * MARGEN
  const ALTO = 36
  const GAP = 4
  // Barras angostas y centradas en su carril: a ancho completo parecían
  // bloques pegados y no un gráfico. El fondo tintado se fue por lo mismo
  // —caja dentro de caja—; queda la línea base, que es lo que ordena la vista.
  const carril = (CW - GAP * (filas.length - 1)) / filas.length
  const ancho = Math.min(carril, 16)
  const max = Math.max(...filas.map(f => f.valor), 1)
  const base = y + ALTO

  doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.4)
  doc.line(MARGEN, base + 0.6, MARGEN + CW, base + 0.6)

  filas.forEach((f, i) => {
    const centro = MARGEN + i * (carril + GAP) + carril / 2
    const x = centro - ancho / 2
    const alto = Math.max((f.valor / max) * (ALTO - 8), f.valor > 0 ? 1.2 : 0)

    if (alto > 0) {
      doc.setFillColor(...(f.valor === max ? color : tinte(color, 0.5)))
      doc.roundedRect(x, base - alto, ancho, alto, 1.2, 1.2, 'F')
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    doc.setTextColor(...(f.valor === max ? color : COLOR.mutado))
    doc.text(String(f.valor), centro, base - alto - 1.8, { align: 'center' })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.setTextColor(...COLOR.mutado)
    doc.text(f.etiqueta, centro, base + 5.2, { align: 'center', maxWidth: carril })
  })

  return base + 12
}

/**
 * Franja de una sola cifra grande — para el número que manda en la página
 * (el balance del período, el saldo del jugador). Verde o rojo según signo.
 */
export function franjaTotal(doc: any, y: number, etiqueta: string, valor: string, color: RGB): number {
  const W = doc.internal.pageSize.getWidth()
  const ALTO = 16
  doc.setFillColor(...tinte(color, 0.1))
  doc.roundedRect(MARGEN, y, W - 2 * MARGEN, ALTO, 2, 2, 'F')
  doc.setFillColor(...color)
  doc.roundedRect(MARGEN, y, 2.2, ALTO, 1, 1, 'F')

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(...COLOR.mutado)
  doc.text(etiqueta, MARGEN + 7, y + 10)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.setTextColor(...color)
  doc.text(valor, W - MARGEN - 5, y + 10.5, { align: 'right' })

  return y + ALTO + 8
}

/** Color de un estado (pagado / pendiente / atrasado) para celdas de tabla. */
export function colorEstado(estado: string): RGB {
  const e = (estado || '').toLowerCase()
  if (e.includes('pagad') || e.includes('finaliz') || e.includes('activ')) return COLOR.verde
  if (e.includes('atras') || e.includes('moros') || e.includes('vencid')) return COLOR.rojo
  if (e.includes('curso') || e.includes('progres')) return COLOR.celeste
  return COLOR.ambar
}

export type Indicador = {
  etiqueta: string
  valor: string
  detalle?: string
  color?: RGB
}

/**
 * Grilla de indicadores con contexto — el cuerpo del resumen de un reporte.
 *
 * Cada bloque trae tres cosas: qué se está midiendo (chico, arriba), la cifra
 * (grande) y de dónde sale o contra qué se compara (chico, abajo). Ese tercer
 * renglón es la diferencia entre un número suelto y un número que se entiende:
 * "$420.000" no dice nada, "$420.000 · 62% de los ingresos" sí.
 *
 * Va en tres columnas y cada fila decide su propio salto de página.
 */
export function altoIndicadores(cantidad: number, cols = 3): number {
  return Math.ceil(cantidad / cols) * 21 + 5
}

export function panelIndicadores(
  doc: any,
  y: number,
  items: Indicador[],
  cab: { club: string; titulo: string; subtitulo?: string; color?: RGB },
  cols = 3,
): number {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const GAP = 5
  const ancho = (W - 2 * MARGEN - GAP * (cols - 1)) / cols
  // 18 mm y no 22: con seis filas de tarjetas entre los dos bloques, esos
  // milímetros son los que deciden si el resumen entra en una hoja o se parte.
  const alto = 18

  // La grilla se parte entera o no se parte: cortarla por filas dejaba tres
  // tarjetas al pie de una hoja y las otras seis solas en la siguiente, con
  // media página en blanco. Si el bloque cabe completo en una hoja nueva,
  // salta antes de dibujar la primera fila.
  const altoTotal = altoIndicadores(items.length, cols)
  if (y + altoTotal > H - PIE && altoTotal <= H - PIE - 42) {
    doc.addPage()
    y = encabezado(doc, { ...cab, titulo: `${cab.titulo} (cont.)` })
  }

  for (let i = 0; i < items.length; i += cols) {
    y = asegurarEspacio(doc, y, alto + 3, cab)
    for (let k = 0; k < cols; k++) {
      const it = items[i + k]
      if (!it) continue
      const x = MARGEN + k * (ancho + GAP)
      const color = it.color ?? COLOR.primario

      doc.setFillColor(...COLOR.fondoSuave)
      doc.roundedRect(x, y, ancho, alto, 2, 2, 'F')
      doc.setFillColor(...color)
      doc.roundedRect(x, y, 2, alto, 1, 1, 'F')

      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8)
      doc.setTextColor(...COLOR.mutado)
      doc.text(it.etiqueta.toUpperCase(), x + 6, y + 4.6, { maxWidth: ancho - 10 })

      doc.setFont('helvetica', 'bold')
      let tam = 12.5
      doc.setFontSize(tam)
      while (tam > 7.5 && doc.getTextWidth(it.valor) > ancho - 10) { tam -= 0.5; doc.setFontSize(tam) }
      doc.setTextColor(...color)
      doc.text(it.valor, x + 6, y + 11.6)

      if (it.detalle) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8)
        doc.setTextColor(...COLOR.tenue)
        doc.text(it.detalle, x + 6, y + 15.9, { maxWidth: ancho - 10 })
      }
    }
    y += alto + 3
  }
  return y + 5
}

/**
 * Hallazgos — las frases que uno diría en voz alta al mirar los números.
 *
 * No son adornos: cada línea la arma el reporte solo cuando el dato la
 * justifica ("6 de los 9 que deben siguen entrenando"). Un punto de color
 * a la izquierda marca si es bueno, para mirar, o malo.
 */
export function listaHallazgos(doc: any, y: number, lineas: { texto: string; color?: RGB }[], cab: { club: string; titulo: string; subtitulo?: string; color?: RGB }, max = 5): number {
  const W = doc.internal.pageSize.getWidth()
  const ancho = W - 2 * MARGEN - 12

  // Tope de cinco. Los hallazgos vienen en orden de importancia y ninguno es
  // un dato exclusivo —todos salen de los indicadores de abajo—, así que
  // cortar acá no esconde nada y mantiene el resumen en una sola hoja.
  for (const l of lineas.slice(0, max)) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    const partes = doc.splitTextToSize(l.texto, ancho)
    y = asegurarEspacio(doc, y, partes.length * 4.2 + 3, cab)
    doc.setFillColor(...(l.color ?? COLOR.primario))
    doc.circle(MARGEN + 2, y - 1.2, 1.2, 'F')
    doc.setTextColor(...COLOR.texto)
    doc.text(partes, MARGEN + 7, y)
    y += partes.length * 4.2 + 2
  }
  return y + 4
}

/** Flecha y color de una variación contra el período anterior. */
export function variacion(actual: number, previo: number): { texto: string; color: RGB; sube: boolean } {
  if (previo === 0) {
    return actual === 0
      ? { texto: 'sin comparación', color: COLOR.mutado, sube: false }
      : { texto: 'sin período anterior', color: COLOR.mutado, sube: true }
  }
  const pct = Math.round(((actual - previo) / Math.abs(previo)) * 100)
  const sube = pct >= 0
  return { texto: `${sube ? '+' : ''}${pct}% vs período anterior`, color: sube ? COLOR.verde : COLOR.rojo, sube }
}
