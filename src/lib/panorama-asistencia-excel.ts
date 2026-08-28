// Los dos reportes del Panorama, en Excel — el gemelo de
// `panorama-asistencia-pdf.ts`. Salen del mismo cálculo del dominio, así que
// dicen exactamente lo mismo que el PDF y que la pantalla.
//
// POR QUÉ EXISTEN LOS DOS FORMATOS. El PDF es para imprimir y repartir: se ve
// igual en cualquier parte y no se puede editar. El Excel es para trabajar
// encima —filtrar, ordenar, pegar en otra planilla, mandarle una columna al
// tesorero—. El mismo reporte, dos usos distintos, y por eso el admin elige.
//
// EL FILTRO MANDA, igual que en el PDF: exportan el período que está elegido en
// pantalla, no "todo".

import {
  conteoDelRango, resumenPorDia, resumenPorGrupo, ordenarPorRiesgo, filasDeJugadores,
  type CalendarioDeJugador,
} from '@/lib/domain/panoramaAsistencia'
import { S, estiloPct, nombreDeHoja, pintor } from '@/lib/excel/estilo'

export type MetaPanorama = {
  clubNombre: string
  /** Cómo se llama el período elegido: "Esta semana", "Último mes", etc. */
  periodo: string
  desde: string
  hasta: string
  grupo?: string | null
}

const DIA_LARGO: Record<string, string> = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo',
}

const ETIQUETA_ESTADO: Record<string, string> = {
  presente: 'Vino', ausente: 'Faltó', pendiente: 'Sin registrar', extraordinaria: 'Clase extra',
}

function pctTexto(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
}

function generado(): string {
  return `Generado el ${new Date().toLocaleDateString('es-CL')}`
}

/** Encabezado común: título morado a lo ancho y una línea con el período. */
function cabecera(ws: any, cols: number, setFila: any) {
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: cols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: cols - 1 } },
  ]
  setFila(ws, 0, cols, S.titulo)
  setFila(ws, 1, cols, S.subtitulo)
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }]
}

function lineaPeriodo(meta: MetaPanorama): string {
  const g = meta.grupo ? ` · Grupo: ${meta.grupo}` : ''
  return `${meta.periodo} (${meta.desde} al ${meta.hasta})${g} · ${generado()}`
}

// ══════════════════════════════════════════════════════════════════════════
// MASIVO — el club en cuatro hojas
// ══════════════════════════════════════════════════════════════════════════

export async function exportarPanoramaExcel(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const { set, setFila } = pintor(utils)
  const wb = utils.book_new()
  const usados = new Set<string>()

  const { desde, hasta } = meta
  const total   = conteoDelRango(cals, desde, hasta)
  const dias    = resumenPorDia(cals, desde, hasta).filter(d => d.programados > 0)
  const grupos  = resumenPorGrupo(cals, desde, hasta)
  const ranking = ordenarPorRiesgo(filasDeJugadores(cals, desde, hasta))

  // Una tabla por hoja y no todo apilado: así se filtra y se ordena sin pelear
  // con las filas de título de la tabla de al lado, que es para lo que se pide
  // el Excel en vez del PDF.
  // `colPct` es la columna del porcentaje, la única que se pinta por valor.
  const hoja = (nombre: string, titulo: string, cols: { wch: number }[], filas: any[][], colPct: number) => {
    const cuerpo: any[][] = [[titulo], [lineaPeriodo(meta)], [], ...filas]
    const ws = utils.aoa_to_sheet(cuerpo)
    ws['!cols'] = cols
    cabecera(ws, cols.length, setFila)
    const filaHeader = 3
    setFila(ws, filaHeader, cols.length, S.header)
    // Congelar la cabecera y dejar el autofiltro puesto: sin eso, en un club de
    // cien jugadores se pierde de vista qué columna es cuál a la tercera
    // pantalla de scroll, y filtrar a mano es la mitad de para qué se pidió
    // Excel en vez de PDF.
    ws['!freeze'] = { xSplit: 0, ySplit: filaHeader + 1 }
    ws['!autofilter'] = { ref: `${utils.encode_cell({ r: filaHeader, c: 0 })}:${utils.encode_cell({ r: cuerpo.length - 1, c: cols.length - 1 })}` }
    for (let r = filaHeader + 1; r < cuerpo.length; r++) {
      setFila(ws, r, cols.length, S.celda)
      set(ws, r, colPct, estiloPct(cuerpo[r][colPct] as number | null))
    }
    utils.book_append_sheet(wb, ws, nombreDeHoja(nombre, usados))
  }

  // — Hoja 1: Resumen —
  const resumen: any[][] = [
    ['Panorama de asistencia'],
    [lineaPeriodo(meta)],
    [],
    ['Asistencia del período', pctTexto(total.porcentaje)],
    [],
    ['Vinieron', total.presentes],
    ['Faltaron', total.ausentes],
    ['Sin pasar lista', total.pendientes],
    ['Días con entrenamiento', dias.length],
    ['Grupos con actividad', grupos.length],
    ['Jugadores', ranking.length],
    [],
    ['Sin pasar lista no es lo mismo que faltar: es lista que no se pasó, y por eso queda fuera del porcentaje. Se corrige a mano en Asistencia histórica.'],
    ['Los colores: verde 75% o más, ámbar entre 50% y 74%, rojo menos de 50%.'],
  ]
  const wsRes = utils.aoa_to_sheet(resumen)
  wsRes['!cols'] = [{ wch: 30 }, { wch: 22 }]
  cabecera(wsRes, 2, setFila)
  set(wsRes, 3, 0, S.label); set(wsRes, 3, 1, S.cifra)
  wsRes['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 8 }, { hpt: 30 }]
  for (let r = 5; r <= 10; r++) { set(wsRes, r, 0, S.label); set(wsRes, r, 1, S.celdaCentro) }
  set(wsRes, 12, 0, S.tenue); set(wsRes, 13, 0, S.tenue)
  utils.book_append_sheet(wb, wsRes, nombreDeHoja('Resumen', usados))

  // — Hoja 2: Día a día —
  hoja(
    'Día a día', 'Día a día',
    [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 9 }],
    [
      ['Día', 'Fecha', 'Citados', 'Vinieron', 'Faltaron', 'Sin registrar', '%'],
      ...dias.map(d => [
        DIA_LARGO[d.dia] ?? d.dia, d.fecha, d.programados, d.presentes, d.ausentes, d.pendientes, d.porcentaje,
      ]),
    ],
    6,
  )

  // — Hoja 3: Por grupo —
  hoja(
    'Por grupo', 'Por grupo',
    [{ wch: 28 }, { wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 9 }],
    [
      ['Grupo', 'Jugadores', 'Asistencias', 'Faltas', '%'],
      ...grupos.map(g => [g.nombre, g.jugadores, g.presentes, g.ausentes, g.porcentaje]),
    ],
    4,
  )

  // — Hoja 4: Jugador por jugador, de peor a mejor —
  hoja(
    'Jugadores', 'Jugador por jugador — de peor a mejor',
    [{ wch: 6 }, { wch: 30 }, { wch: 13 }, { wch: 10 }, { wch: 9 }],
    [
      ['#', 'Jugador', 'Asistencias', 'Faltas', '%'],
      ...ranking.map((f, i) => [i + 1, f.jugador.nombre, f.presentes, f.ausentes, f.porcentaje]),
    ],
    4,
  )

  writeFile(wb, `panorama_asistencia_${desde}_a_${hasta}.xlsx`)
}

// ══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL — una hoja por jugador, para el apoderado
// ══════════════════════════════════════════════════════════════════════════

export async function exportarPanoramaIndividualExcel(cals: CalendarioDeJugador[], meta: MetaPanorama) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const { set, setFila } = pintor(utils)
  const wb = utils.book_new()
  const usados = new Set<string>()

  const { desde, hasta } = meta
  // Por nombre y no por porcentaje: es un lote de hojas para repartir y se
  // busca por apellido.
  const filas = filasDeJugadores(cals, desde, hasta)
    .sort((a, b) => a.jugador.nombre.localeCompare(b.jugador.nombre, 'es'))
  if (filas.length === 0) return

  const porId = new Map(cals.map(c => [c.jugador.id, c]))

  // — Índice: el listado completo, para encontrar la pestaña de alguien —
  const indice: any[][] = [
    ['Asistencia individual'],
    [lineaPeriodo(meta)],
    [],
    ['Jugador', 'Vino', 'Faltó', '%'],
    ...filas.map(f => [f.jugador.nombre, f.presentes, f.ausentes, f.porcentaje]),
  ]
  const wsIndice = utils.aoa_to_sheet(indice)
  wsIndice['!cols'] = [{ wch: 32 }, { wch: 9 }, { wch: 9 }, { wch: 9 }]
  cabecera(wsIndice, 4, setFila)
  setFila(wsIndice, 3, 4, S.header)
  wsIndice['!freeze'] = { xSplit: 0, ySplit: 4 }
  for (let r = 4; r < indice.length; r++) {
    setFila(wsIndice, r, 4, S.celda)
    set(wsIndice, r, 3, estiloPct(indice[r][3] as number | null))
  }
  utils.book_append_sheet(wb, wsIndice, nombreDeHoja('Índice', usados))

  // ponytail: una pestaña por jugador, sin tope. Un club de 300 da un libro de
  // 300 hojas y Excel lo abre igual; si algún día molesta, el corte natural es
  // ofrecer "solo los de un grupo" antes que paginar el archivo.
  for (const f of filas) {
    const suyos = (porId.get(f.jugador.id)?.dias ?? [])
      .filter(d => d.fecha >= desde && d.fecha <= hasta)
      // Solo los días que le tocaba entrenar: un día sin grupo asignado no es
      // una falta suya y en la hoja del apoderado solo confunde.
      .filter(d => d.bloques.length > 0)

    const cuerpo: any[][] = [
      [f.jugador.nombre],
      [lineaPeriodo(meta)],
      [],
      ['Su asistencia', pctTexto(f.porcentaje)],
      ['Vino', f.presentes],
      ['Faltó', f.ausentes],
      [],
      suyos.length === 0
        ? ['No tenía entrenamientos programados en este período.']
        : ['Día', 'Fecha', 'Grupo', 'Estado'],
      ...suyos.map(d => [
        DIA_LARGO[d.dia] ?? d.dia,
        d.fecha,
        d.bloques.join(', ') || '—',
        // La clase extra se anota al lado y no como estado: no consume sesión
        // ni entra en el porcentaje, pero se le cobra aparte y hay que verla.
        (ETIQUETA_ESTADO[d.estado] ?? d.estado) + (d.extra ? ' + clase extra' : ''),
      ]),
    ]
    const ws = utils.aoa_to_sheet(cuerpo)
    ws['!cols'] = [{ wch: 12 }, { wch: 13 }, { wch: 30 }, { wch: 22 }]
    cabecera(ws, 4, setFila)
    set(ws, 3, 0, S.label); set(ws, 3, 1, S.cifra)
    set(ws, 4, 0, S.label); set(ws, 5, 0, S.label)
    ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 8 }, { hpt: 30 }]
    const filaHeader = 7
    if (suyos.length === 0) {
      set(ws, filaHeader, 0, S.tenue)
    } else {
      setFila(ws, filaHeader, 4, S.header)
      ws['!freeze'] = { xSplit: 0, ySplit: filaHeader + 1 }
      for (let r = filaHeader + 1; r < cuerpo.length; r++) {
        setFila(ws, r, 4, S.celda)
        const estado = suyos[r - filaHeader - 1].estado
        set(ws, r, 3, estado === 'presente' ? S.buena : estado === 'ausente' ? S.mala : S.celdaCentro)
      }
    }
    utils.book_append_sheet(wb, ws, nombreDeHoja(f.jugador.nombre, usados))
  }

  writeFile(wb, `asistencia_individual_${desde}_a_${hasta}.xlsx`)
}
