// El reporte de asistencia por bloque, en PDF — el gemelo del Excel del mismo
// nombre. Sale del mismo cálculo (`domain/asistenciaPorBloque`): dos
// generadores que recalculan "parecido" es cómo un día el Excel dice 72% y el
// PDF 68% y no hay forma de saber cuál miente.
//
// LA DIFERENCIA CON EL EXCEL ES PARA QUÉ SIRVE CADA UNO. El Excel se filtra y
// se ordena: es para trabajar encima. El PDF es para llevar a la reunión, así
// que arranca con la foto del período —una barra por bloque, de peor a mejor—
// y recién después baja al detalle mes a mes. Molde v2 (lib/pdf/papel.ts).

import { type DatosHistorial } from '@/lib/domain/historialAsistencia'
import {
  agruparPorBloque, horarioDeBloque, mesLabel, pctDe, razon, sedeCorta,
  type JugadorDeBloque, type ResumenBloque,
} from '@/lib/domain/asistenciaPorBloque'
import {
  TINTA, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR, BLANCO,
  nuevoDocumento, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, tabla, trasTabla, barraEnCelda, nota, marcaDelClub,
  type Marca, type RGB, type Tono,
} from '@/lib/pdf/papel'

type Args = {
  clubNombre: string
  marca?: Marca
  desde: string
  hasta: string
  meses: number
  datos: DatosHistorial
  jugadores: JugadorDeBloque[]
}

/** Los mismos cortes que la planilla y que la pantalla: 75% y 50%. */
function colorPct(v: number | null): RGB {
  if (v === null) return GRIS_CLARO
  if (v >= 75) return VERDE
  if (v >= 50) return AMBAR
  return ROJO
}

function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

export async function exportarAsistenciaPorBloquePdf({ clubNombre, marca: marcaDada, desde, hasta, meses, datos, jugadores }: Args) {
  const marca = marcaDada ?? await marcaDelClub({ nombre: clubNombre, logo_url: null })
  const agrupado = agruparPorBloque(datos, jugadores, desde, hasta)
  const rango = meses === 1 ? 'último mes' : `últimos ${meses} meses`
  const cab = { titulo: 'Asistencia por bloque', subtitulo: `${desde} al ${hasta} · ${rango}`, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  const total = agrupado.totalClub
  const conGente = agrupado.periodo.filter(r => r.jugadores.length > 0)
  const flojos = conGente.filter(r => (pctDe(r.total) ?? 100) < 50)
  const pctClub = pctDe(total)

  y = cifras(doc, y, marca, [
    { etiqueta: 'Asistencia del club', valor: pct(pctClub), detalle: razon(total), color: colorPct(pctClub) },
    { etiqueta: 'Bloques con actividad', valor: String(conGente.length), detalle: `en ${agrupado.meses.length} mes${agrupado.meses.length === 1 ? '' : 'es'}` },
    { etiqueta: 'Bloques bajo 50%', valor: String(flojos.length), detalle: flojos.length ? 'para revisar' : 'ninguno', color: flojos.length ? ROJO : VERDE },
    // Sin pasar lista va aparte de las faltas: sumarlas haría que el profe que
    // no pasó lista aparezca como un bloque que no viene.
    { etiqueta: 'Sin pasar lista', valor: total.pendientes ? String(total.pendientes) : '—', detalle: 'días vencidos sin marcar', color: GRIS },
  ])

  // ── Hallazgos ────────────────────────────────────────────────────────────
  const lista: Array<{ texto: string; tono: Tono }> = []
  if (pctClub !== null) lista.push({ texto: `El club asistió al ${pctClub}% de sus clases en el período (${total.presentes} asistencias, ${total.ausentes} faltas).`, tono: pctClub >= 75 ? 'bien' : pctClub >= 50 ? 'ojo' : 'mal' })
  const ordenados = [...conGente].sort((a, b) => (pctDe(a.total) ?? 101) - (pctDe(b.total) ?? 101))
  if (ordenados.length >= 2) {
    const peor = ordenados[0], mejor = ordenados[ordenados.length - 1]
    lista.push({ texto: `El bloque con mejor asistencia fue ${mejor.bloque.nombre} (${pct(pctDe(mejor.total))}) y el más bajo ${peor.bloque.nombre} (${pct(pctDe(peor.total))}).`, tono: 'info' })
  }
  if (flojos.length) lista.push({ texto: `${flojos.length} bloque${flojos.length === 1 ? ' está' : 's están'} bajo el 50%: ${flojos.map(r => r.bloque.nombre).join(', ')}.`, tono: 'mal' })
  if (total.pendientes > 0) lista.push({ texto: `Hay ${total.pendientes} días vencidos sin pasar lista: esos días no cuentan ni como asistencia ni como falta.`, tono: 'ojo' })
  if (lista.length) {
    y = seccion(doc, y, marca, 'Hallazgos del período')
    y = hallazgos(doc, y, lista)
  }

  // ── La foto del período: un bloque por barra, de peor a mejor ────────────
  y = asegurar(doc, y, 40, marca, cab)
  y = seccion(doc, y, marca, 'Cómo viene cada bloque', 'de menor a mayor asistencia')
  if (conGente.length === 0) {
    y = nota(doc, y, 'Ningún bloque tuvo entrenamientos en este período.')
  } else {
    y = barras(doc, y, marca, ordenados.map(r => ({
      etiqueta: `${r.bloque.nombre} · ${sedeCorta(r.bloque.sede)}`,
      // La barra mide el porcentaje, no el volumen: acá la pregunta es "¿a
      // este bloque le conviene seguir existiendo?", y un bloque de 4 con 90%
      // funciona mejor que uno de 20 con 40%.
      valor: pctDe(r.total) ?? 0,
      texto: `${pct(pctDe(r.total))} · ${razon(r.total)}`,
      color: colorPct(pctDe(r.total)),
    })), { anchoEtiqueta: 66 })
  }

  // ── Tabla del período ───────────────────────────────────────────────────
  if (conGente.length > 0) {
    y = asegurar(doc, y, 40, marca, cab)
    y = seccion(doc, y, marca, 'Resumen del período', 'un bloque por fila')
    autoTable(doc, {
      ...tabla(marca, {
        numericas: [3], centradas: [4], anchos: { 1: 26, 2: 26, 3: 20, 4: 28, 5: 34 },
        alParsear: d => { if (d.column.index === 5 && d.section !== 'head') d.cell.styles.textColor = BLANCO },
        alDibujar: d => {
          if (d.column.index !== 5 || d.section === 'head') return
          const v = d.section === 'foot' ? pctClub : pctDe(agrupado.periodo[d.row.index]?.total)
          if (v !== null && v !== undefined) barraEnCelda(doc, d.cell, v, colorPct(v))
        },
      }),
      startY: y,
      head: [['Bloque', 'Sede', 'Horario', 'Jugadores', 'Asistencia', '%']],
      body: agrupado.periodo.map(r => [
        r.bloque.nombre, sedeCorta(r.bloque.sede), horarioDeBloque(r.bloque),
        String(r.jugadores.length), razon(r.total), String(pctDe(r.total) ?? ''),
      ]),
      foot: [['Club', '', '', String(jugadores.length), razon(total), String(pctClub ?? '')]],
    })
    y = trasTabla(doc)
  }

  // ── Mes a mes, el detalle jugador por jugador ───────────────────────────
  for (const mesKey of agrupado.meses) {
    const delMes = agrupado.porMes.get(mesKey) ?? []
    if (delMes.length === 0) continue

    // Cada mes arranca en hoja propia: es como se lee y como se reparte.
    doc.addPage()
    y = portada(doc, marca, { ...cab, titulo: mesLabel(mesKey), subtitulo: 'Asistencia por bloque, jugador por jugador' })

    for (const sede of agrupado.sedes) {
      const deLaSede = delMes.filter(r => (r.bloque.sede ?? '') === sede)
      if (deLaSede.length === 0) continue
      y = asegurar(doc, y, 30, marca, cab)
      y = seccion(doc, y, marca, sedeCorta(sede), mesLabel(mesKey))
      for (const r of deLaSede) y = tablaDelBloque(doc, autoTable, y, r, marca, cab)
    }
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Asistencia por bloque · ${rango}`)
  doc.save(`asistencia_por_bloque_${desde}_a_${hasta}.pdf`)
}

/** El cuadro de un bloque: su total arriba y su gente abajo, de peor a mejor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tablaDelBloque(doc: any, autoTable: any, y: number, r: ResumenBloque, marca: Marca, cab: { titulo: string; subtitulo?: string; nota?: string }): number {
  const p = pctDe(r.total)
  y = asegurar(doc, y, 34, marca, cab)
  const W = doc.internal.pageSize.getWidth()
  // Título del bloque con su porcentaje en color.
  doc.setFillColor(...colorPct(p))
  doc.roundedRect(16, y - 3.2, 1.4, 4.4, 0.5, 0.5, 'F')
  const lista = doc.getFontList?.() ?? {}
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', lista.Inter ? 'semibold' : 'bold'); doc.setFontSize(10); doc.setTextColor(...TINTA)
  doc.text(`${r.bloque.nombre} · ${horarioDeBloque(r.bloque)}`, 21, y)
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...colorPct(p))
  doc.text(pct(p), W - 16, y, { align: 'right' })
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS)
  doc.text(`${r.jugadores.length} jug. · ${razon(r.total)}`, W - 16 - doc.getTextWidth(pct(p)) - 8, y, { align: 'right' })
  y += 5

  if (r.jugadores.length === 0) return nota(doc, y, 'Nadie inscrito este mes.')

  autoTable(doc, {
    ...tabla(marca, {
      tamano: 8, centradas: [1, 2, 3, 4], anchos: { 1: 18, 2: 18, 3: 24, 4: 26, 5: 34 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alParsear: (d: any) => {
        if (d.section !== 'body') return
        const c = r.jugadores[d.row.index]?.conteo
        if (d.column.index === 2 && c?.ausentes) d.cell.styles.textColor = ROJO
        if (d.column.index === 3) d.cell.styles.textColor = GRIS_CLARO
        if (d.column.index === 5) d.cell.styles.textColor = BLANCO
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      alDibujar: (d: any) => {
        if (d.section !== 'body' || d.column.index !== 5) return
        const v = pctDe(r.jugadores[d.row.index]?.conteo)
        if (v !== null && v !== undefined) barraEnCelda(doc, d.cell, v, colorPct(v))
      },
    }),
    startY: y,
    head: [['Jugador', 'Asistió', 'Faltó', 'Sin registrar', 'Asistencia', '%']],
    body: r.jugadores.map(({ jugador, conteo: c }) => [
      jugador.nombre, String(c.presentes), String(c.ausentes),
      c.pendientes > 0 ? String(c.pendientes) : '—', razon(c), String(pctDe(c) ?? ''),
    ]),
  })
  return trasTabla(doc, 8)
}
