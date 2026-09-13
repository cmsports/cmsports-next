// Los papeles de una fecha de la liga por jornadas, sobre el molde v2
// (lib/pdf/papel.ts): la programación que se pega en el mural, las planillas
// por mesa que llena el árbitro, y los resultados que se mandan al grupo.
// Reproduce el formato de la hoja que Spinhouse ya usaba: una página por
// día, cada división con su rango de mesas, y la tabla Hora · Mesa · Partido
// · Árbitro. El pie trae las reglas del club.

import type { Marca } from '@/lib/pdf/papel'
import {
  TINTA, TEXTO, GRIS, GRIS_CLARO, VERDE, ROJO, AMBAR, MARGEN,
  nuevoDocumento, portada, pieDePagina, seccion, tabla, trasTabla, franja, cifras, barras, nota, mezclar,
} from '@/lib/pdf/papel'

export interface JornadaParaPdf {
  numero: number
  dias: Array<{
    fecha: string | null
    divisiones: Array<{
      nombre: string
      mesas: number[]
      partidos: Array<{
        hora: string; mesa: number; jugadorA: string; jugadorB: string; arbitro: string | null
        estado?: string; setsA?: number | null; setsB?: number | null; parciales?: Array<[number, number]> | null
      }>
    }>
  }>
}

export interface MetaJornadaPdf {
  marca: Marca
  ligaNombre: string
  /** Lo que va al pie: reglas, contacto, dirección. */
  pie?: string
}

type Partido = JornadaParaPdf['dias'][number]['divisiones'][number]['partidos'][number]

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Sábado 12 de septiembre", desde una fecha ISO, sin pasar por zonas horarias. */
export function etiquetaDia(fechaISO: string | null): string {
  if (!fechaISO) return 'Fecha por definir'
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const nombre = DIAS[dia]
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d} de ${MESES[m - 1]}`
}

function rangoMesas(mesas: number[]): string {
  if (!mesas.length) return ''
  const ordenadas = [...mesas].sort((a, b) => a - b)
  const seguidas = ordenadas.every((m, i) => i === 0 || m === ordenadas[i - 1] + 1)
  if (ordenadas.length === 1) return `mesa ${ordenadas[0]}`
  return seguidas ? `mesas ${ordenadas[0]} a ${ordenadas[ordenadas.length - 1]}` : `mesas ${ordenadas.join(', ')}`
}

const jugado = (p: Partido) => p.estado === 'finalizado' || p.estado === 'walkover'

/** Programación oficial: una página por día, cada división con su tabla. */
export async function descargarJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { marca } = meta
  const primerDia = jornada.dias[0]
  const cabDe = (dia: JornadaParaPdf['dias'][number]) => {
    const horaInicio = dia.divisiones.flatMap(d => d.partidos.map(p => p.hora)).sort()[0]
    return { titulo: `Programación · Fecha ${jornada.numero}`, subtitulo: `${meta.ligaNombre} · ${etiquetaDia(dia.fecha)}${horaInicio ? ` · desde las ${horaInicio} hrs` : ''}` }
  }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cabDe(primerDia))
  const W = doc.internal.pageSize.getWidth()

  jornada.dias.forEach((dia, i) => {
    let y = i === 0 ? y0 : (doc.addPage(), portada(doc, marca, cabDe(dia)))
    for (const div of dia.divisiones) {
      y = seccion(doc, y, marca, div.nombre, `${rangoMesas(div.mesas)} · ${div.partidos.length} partidos`)
      autoTable(doc, {
        ...tabla(marca, {
          centradas: [0, 1], anchos: { 0: 16, 1: 14, 2: (W - 2 * MARGEN) - 16 - 14 - 52, 3: 52 },
          alParsear: data => {
            if (data.section === 'body' && data.column.index === 0) data.cell.styles.fontStyle = 'bold'
            if (data.section === 'body' && data.column.index === 3) data.cell.styles.textColor = GRIS
          },
        }),
        startY: y,
        head: [['Hora', 'Mesa', 'Partido', 'Árbitro']],
        body: div.partidos.map(p => [p.hora, String(p.mesa), `${p.jugadorA}  vs  ${p.jugadorB}`, p.arbitro ?? '—']),
      })
      y = trasTabla(doc, 8)
    }
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, meta.pie ?? meta.ligaNombre)
  doc.save(`Fecha ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}

/**
 * Las planillas de mesa: una hoja por día y división, con sus mesas una
 * debajo de otra —cada mesa, sus partidos en orden— y casillas para que el
 * árbitro anote los sets, el ganador y firme. Compacta: la Honor entera
 * (3 mesas, 15 partidos) cabe en una carilla.
 */
export async function descargarPlanillasJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { marca } = meta
  const cabDe = (dia: JornadaParaPdf['dias'][number], div: string) => ({ titulo: `Planilla de resultados · Fecha ${jornada.numero}`, subtitulo: `${meta.ligaNombre} · ${etiquetaDia(dia.fecha)} · ${div}` })
  const primero = jornada.dias.flatMap(d => d.divisiones.map(div => ({ dia: d, div }))).find(x => x.div.partidos.length)
  if (!primero) return
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cabDe(primero.dia, primero.div.nombre))
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const ancho = W - 2 * MARGEN
  let primera = true

  // Geometría: Hora | Partido (A / B en dos renglones) | S1..S5 | Sets | Ganador · firma
  const C_HORA = 16, C_SET = 9, C_SETS = 12, C_FIRMA = 36
  const C_PARTIDO = ancho - C_HORA - 5 * C_SET - C_SETS - C_FIRMA

  for (const dia of jornada.dias) {
    for (const div of dia.divisiones) {
      if (!div.partidos.length) continue
      let y = primera ? y0 : (doc.addPage(), portada(doc, marca, cabDe(dia, div.nombre)))
      primera = false
      y = nota(doc, y - 4, 'El árbitro anota los puntos de cada set, el total de sets y firma junto al ganador. Espera máxima 15 min → W.O. 3-0.')

      const porMesa = new Map<number, Partido[]>()
      for (const p of div.partidos) porMesa.set(p.mesa, [...(porMesa.get(p.mesa) ?? []), p])

      for (const [mesa, partidos] of [...porMesa.entries()].sort((a, b) => a[0] - b[0])) {
        const altoBloque = 7 + 6 + partidos.length * 11
        if (y + altoBloque > H - 22) {
          doc.addPage()
          y = portada(doc, marca, cabDe(dia, div.nombre))
        }
        y = franja(doc, y, marca, `MESA ${mesa}`, `${partidos.length} partidos · ${partidos[0]?.hora ?? ''} a ${partidos[partidos.length - 1]?.hora ?? ''}`)
        autoTable(doc, {
          ...tabla(marca, {
            conGrilla: true, tamano: 8, centradas: [0, 2, 3, 4, 5, 6, 7],
            anchos: { 0: C_HORA, 1: C_PARTIDO, 2: C_SET, 3: C_SET, 4: C_SET, 5: C_SET, 6: C_SET, 7: C_SETS, 8: C_FIRMA },
            alParsear: data => {
              if (data.section === 'body') { data.cell.styles.minCellHeight = 10.5; data.cell.styles.valign = 'middle' }
              if (data.section === 'body' && data.column.index === 0) data.cell.styles.fontStyle = 'bold'
            },
          }),
          startY: y,
          head: [['Hora', 'Partido  ·  árbitro', 'S1', 'S2', 'S3', 'S4', 'S5', 'Sets', 'Ganador / firma']],
          body: [...partidos].sort((a, b) => a.hora.localeCompare(b.hora)).map(p => [
            p.hora,
            `${p.jugadorA}\nvs ${p.jugadorB}${p.arbitro ? `   ·   árb. ${p.arbitro}` : ''}`,
            '', '', '', '', '', '', '',
          ]),
        })
        y = trasTabla(doc, 5)
      }
    }
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, meta.pie ?? meta.ligaNombre)
  doc.save(`Planillas Fecha ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}

/**
 * Los resultados de la fecha: por día y división, cada partido con su
 * marcador (o W.O., o pendiente), y un resumen del avance arriba. Es lo que
 * se manda al grupo cuando termina el fin de semana.
 */
export async function descargarResultadosJornadaPdf(jornada: JornadaParaPdf, meta: MetaJornadaPdf) {
  const { marca } = meta
  const parciales = (p: Partido) => (p.parciales?.length ? p.parciales.map(([a, b]) => `${a}-${b}`).join(', ') : '')
  const marcador = (p: Partido) => {
    if (p.estado === 'walkover') return 'W.O.'
    if (p.estado === 'finalizado' && p.setsA != null && p.setsB != null) return `${p.setsA} - ${p.setsB}`
    return 'pendiente'
  }
  const ganador = (p: Partido) => {
    if (p.estado === 'walkover') return p.setsA != null && p.setsB != null ? (p.setsA > p.setsB ? p.jugadorA : p.jugadorB) : ''
    if (p.estado === 'finalizado' && p.setsA != null && p.setsB != null) return p.setsA > p.setsB ? p.jugadorA : p.jugadorB
    return ''
  }
  const cabDe = (dia: JornadaParaPdf['dias'][number]) => {
    const total = dia.divisiones.reduce((t, d) => t + d.partidos.length, 0)
    const jugados = dia.divisiones.reduce((t, d) => t + d.partidos.filter(jugado).length, 0)
    return { titulo: `Resultados · Fecha ${jornada.numero}`, subtitulo: `${meta.ligaNombre} · ${etiquetaDia(dia.fecha)} · ${jugados} de ${total} partidos jugados` }
  }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cabDe(jornada.dias[0]))
  const W = doc.internal.pageSize.getWidth()

  jornada.dias.forEach((dia, i) => {
    let y = i === 0 ? y0 : (doc.addPage(), portada(doc, marca, cabDe(dia)))
    const todos = dia.divisiones.flatMap(d => d.partidos)
    const jugados = todos.filter(jugado)
    const wo = todos.filter(p => p.estado === 'walkover')
    if (todos.length) {
      y = cifras(doc, y, marca, [
        { etiqueta: 'Partidos jugados', valor: `${jugados.length} de ${todos.length}`, detalle: todos.length > jugados.length ? `${todos.length - jugados.length} pendientes` : 'fecha completa', color: jugados.length === todos.length ? VERDE : AMBAR },
        { etiqueta: 'Walkovers', valor: wo.length ? String(wo.length) : '—', detalle: 'no presentados', color: ROJO },
        { etiqueta: 'Divisiones', valor: String(dia.divisiones.length), detalle: dia.divisiones.map(d => d.nombre).join(', ') },
      ])
      if (dia.divisiones.length > 1) {
        y = barras(doc, y, marca, dia.divisiones.map(d => {
          const j = d.partidos.filter(jugado).length
          return { etiqueta: d.nombre, valor: d.partidos.length ? j / d.partidos.length : 0, texto: `${j} de ${d.partidos.length}`, color: j === d.partidos.length ? VERDE : marca.acento }
        }), { titulo: 'Avance por división' })
      }
    }
    for (const div of dia.divisiones) {
      y = seccion(doc, y, marca, div.nombre, `${div.partidos.filter(jugado).length} de ${div.partidos.length} jugados`)
      autoTable(doc, {
        ...tabla(marca, {
          centradas: [0, 1, 3], anchos: { 0: 14, 1: 12, 2: (W - 2 * MARGEN) - 14 - 12 - 22 - 34 - 36, 3: 22, 4: 34, 5: 36 },
          alParsear: data => {
            if (data.section !== 'body') return
            const p = div.partidos[data.row.index]
            if (!p) return
            if (data.column.index === 3) {
              data.cell.styles.fontStyle = 'bold'
              data.cell.styles.textColor = p.estado === 'walkover' ? ROJO : jugado(p) ? TINTA : GRIS_CLARO
            }
            if (data.column.index === 4) { data.cell.styles.fontSize = 7.5; data.cell.styles.textColor = GRIS }
            if (data.column.index === 5 && ganador(p)) { data.cell.styles.textColor = VERDE; data.cell.styles.fontStyle = 'bold' }
            if (!jugado(p)) data.cell.styles.textColor = data.column.index === 3 ? GRIS_CLARO : mezclar(TEXTO, 0.6)
          },
        }),
        startY: y,
        head: [['Hora', 'Mesa', 'Partido', 'Sets', 'Parciales', 'Ganador']],
        body: div.partidos.map(p => [p.hora, String(p.mesa), `${p.jugadorA}  vs  ${p.jugadorB}`, marcador(p), parciales(p), ganador(p)]),
      })
      y = trasTabla(doc, 8)
    }
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, meta.ligaNombre)
  doc.save(`Resultados Fecha ${jornada.numero} — ${meta.ligaNombre}.pdf`)
}
