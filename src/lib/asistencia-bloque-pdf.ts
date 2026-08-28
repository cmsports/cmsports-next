// El reporte de asistencia por bloque, en PDF — el gemelo del Excel del mismo
// nombre. Sale del mismo cálculo (`domain/asistenciaPorBloque`): dos
// generadores que recalculan "parecido" es cómo un día el Excel dice 72% y el
// PDF 68% y no hay forma de saber cuál miente.
//
// LA DIFERENCIA CON EL EXCEL ES PARA QUÉ SIRVE CADA UNO. El Excel se filtra y
// se ordena: es para trabajar encima. El PDF es para llevar a la reunión, así
// que arranca con la foto del período —una barra por bloque, de peor a mejor—
// y recién después baja al detalle mes a mes.

import { type DatosHistorial } from '@/lib/domain/historialAsistencia'
import {
  agruparPorBloque, horarioDeBloque, mesLabel, pctDe, razon, sedeCorta,
  type JugadorDeBloque, type ResumenBloque,
} from '@/lib/domain/asistenciaPorBloque'
import {
  encabezado, piePagina, estiloTabla, tituloSeccion, sinDatos, panelIndicadores,
  barrasCategoria, asegurarEspacio, trasTabla, COLOR, type RGB,
} from '@/lib/pdf/estilo'

type Args = {
  clubNombre: string
  desde: string
  hasta: string
  meses: number
  datos: DatosHistorial
  jugadores: JugadorDeBloque[]
}

/** Los mismos cortes que la planilla y que la pantalla: 75% y 50%. */
function colorPct(v: number | null): RGB {
  if (v === null) return COLOR.tenue
  if (v >= 75) return COLOR.verde
  if (v >= 50) return COLOR.ambar
  return COLOR.rojo
}

function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

export async function exportarAsistenciaPorBloquePdf({ clubNombre, desde, hasta, meses, datos, jugadores }: Args) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const agrupado = agruparPorBloque(datos, jugadores, desde, hasta)
  const rango = meses === 1 ? 'último mes' : `últimos ${meses} meses`

  const doc = new jsPDF()
  const cab = {
    club: clubNombre,
    titulo: 'Asistencia por bloque',
    subtitulo: `${desde} al ${hasta} · ${rango} · Generado el ${new Date().toLocaleDateString('es-CL')}`,
  }
  let y = encabezado(doc, cab)

  const total = agrupado.totalClub
  const conGente = agrupado.periodo.filter(r => r.jugadores.length > 0)
  const flojos = conGente.filter(r => (pctDe(r.total) ?? 100) < 50)

  y = panelIndicadores(doc, y, [
    { etiqueta: 'Asistencia del club', valor: pct(pctDe(total)), detalle: razon(total), color: colorPct(pctDe(total)) },
    { etiqueta: 'Bloques con actividad', valor: String(conGente.length), detalle: `en ${agrupado.meses.length} mes${agrupado.meses.length === 1 ? '' : 'es'}` },
    { etiqueta: 'Bloques bajo 50%', valor: String(flojos.length), detalle: flojos.length ? 'para revisar' : 'ninguno', color: flojos.length ? COLOR.rojo : COLOR.verde },
    { etiqueta: 'Asistencias', valor: String(total.presentes), color: COLOR.verde },
    { etiqueta: 'Faltas', valor: String(total.ausentes), color: COLOR.rojo },
    // Sin pasar lista va aparte de las faltas: sumarlas haría que el profe que
    // no pasó lista aparezca como un bloque que no viene.
    { etiqueta: 'Sin pasar lista', valor: String(total.pendientes), detalle: 'días vencidos sin marcar', color: COLOR.tenue },
  ], cab)

  // ── La foto del período: un bloque por barra, de peor a mejor ────────────
  y = asegurarEspacio(doc, y, 40, cab)
  y = tituloSeccion(doc, y, 'Cómo viene cada bloque', `${desde} al ${hasta}`)
  if (conGente.length === 0) {
    y = sinDatos(doc, y, 'Ningún bloque tuvo entrenamientos en este período.')
  } else {
    const peorPrimero = [...conGente].sort((a, b) => (pctDe(a.total) ?? 101) - (pctDe(b.total) ?? 101))
    y = barrasCategoria(doc, y, peorPrimero.map(r => ({
      etiqueta: `${r.bloque.nombre} · ${sedeCorta(r.bloque.sede)}`,
      // La barra mide el porcentaje, no el volumen: acá la pregunta es "¿a
      // este bloque le conviene seguir existiendo?", y un bloque de 4 con 90%
      // funciona mejor que uno de 20 con 40%.
      valor: pctDe(r.total) ?? 0,
      texto: `${pct(pctDe(r.total))} · ${razon(r.total)}`,
      color: colorPct(pctDe(r.total)),
    })), COLOR.primario, cab)
  }

  // ── Tabla del período ───────────────────────────────────────────────────
  if (conGente.length > 0) {
    y = asegurarEspacio(doc, y, 40, cab)
    y = tituloSeccion(doc, y, 'Resumen del período', 'Un bloque por fila')
    autoTable(doc, {
      startY: y,
      head: [['Bloque', 'Sede', 'Horario', 'Jugadores', 'Asistencia', '%']],
      body: agrupado.periodo.map(r => [
        r.bloque.nombre, sedeCorta(r.bloque.sede), horarioDeBloque(r.bloque),
        String(r.jugadores.length), razon(r.total), pct(pctDe(r.total)),
      ]),
      foot: [['Club', '', '', String(jugadores.length), razon(total), pct(pctDe(total))]],
      ...estiloTabla(),
      columnStyles: {
        3: { halign: 'center' }, 4: { halign: 'center' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 5) {
          data.cell.styles.textColor = colorPct(pctDe(agrupado.periodo[data.row.index].total))
        }
      },
    })
    y = trasTabla(doc)
  }

  // ── Mes a mes, el detalle jugador por jugador ───────────────────────────
  for (const mesKey of agrupado.meses) {
    const delMes = agrupado.porMes.get(mesKey) ?? []
    if (delMes.length === 0) continue

    // Cada mes arranca en hoja propia: es como se lee y como se reparte.
    doc.addPage()
    y = encabezado(doc, { ...cab, titulo: `Asistencia por bloque · ${mesLabel(mesKey)}` })

    for (const sede of agrupado.sedes) {
      const deLaSede = delMes.filter(r => (r.bloque.sede ?? '') === sede)
      if (deLaSede.length === 0) continue

      y = asegurarEspacio(doc, y, 30, cab)
      y = tituloSeccion(doc, y, sedeCorta(sede), mesLabel(mesKey), COLOR.primarioOs)

      for (const r of deLaSede) y = tablaDelBloque(doc, autoTable, y, r, cab)
    }
  }

  piePagina(doc, `${clubNombre || 'CmSports'} · Asistencia por bloque · ${rango}`)
  doc.save(`asistencia_por_bloque_${desde}_a_${hasta}.pdf`)
}

/** El cuadro de un bloque: su total arriba y su gente abajo, de peor a mejor. */
function tablaDelBloque(doc: any, autoTable: any, y: number, r: ResumenBloque, cab: any): number {
  const p = pctDe(r.total)
  y = asegurarEspacio(doc, y, 34, cab)
  y = tituloSeccion(
    doc, y,
    `${r.bloque.nombre} — ${horarioDeBloque(r.bloque)}`,
    `${r.jugadores.length} jug. · ${razon(r.total)} · ${pct(p)}`,
    colorPct(p),
  )

  if (r.jugadores.length === 0) return sinDatos(doc, y, 'Nadie inscrito este mes.')

  autoTable(doc, {
    startY: y,
    head: [['Jugador', 'Asistió', 'Faltó', 'Sin registrar', 'Asistencia', '%']],
    body: r.jugadores.map(({ jugador, conteo: c }) => [
      jugador.nombre, String(c.presentes), String(c.ausentes),
      c.pendientes > 0 ? String(c.pendientes) : '—', razon(c), pct(pctDe(c)),
    ]),
    ...estiloTabla(colorPct(p)),
    columnStyles: {
      1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'center' }, 5: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 5) {
        data.cell.styles.textColor = colorPct(pctDe(r.jugadores[data.row.index].conteo))
      }
    },
  })
  return trasTabla(doc, 10)
}
