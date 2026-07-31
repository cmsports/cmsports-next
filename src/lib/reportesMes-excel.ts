// Excel del reporte mensual del horario: una hoja resumen, una día por día
// (por sede) y una por profesor/grupo. Usa `xlsx-js-style` (ya instalado en
// el proyecto, mismo patrón que torneo-excel.ts).

import { DIAS, diaLabel, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { diaDe, horas, type AsignacionProfesor, type DiaMes, type InscripcionMes, type ReporteMes } from '@/lib/domain/reportesMes'

const MORADO = '4F46E5'
const LILA = 'EDE9FE'
const LILA_TXT = '3730A3'
const NARANJA_BG = 'FFF7ED'
const NARANJA_TXT = 'C2410C'
const BORDE = 'E2E8F0'

const borde = { style: 'thin', color: { rgb: BORDE } } as const
const bordes = { top: borde, bottom: borde, left: borde, right: borde }

const S = {
  titulo: { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  seccion: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'left', vertical: 'center' } },
  header: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  label: { font: { bold: true, color: { rgb: LILA_TXT } } },
  celda: { border: bordes, alignment: { vertical: 'center' } },
  celdaCentro: { border: bordes, alignment: { horizontal: 'center', vertical: 'center' } },
  suspendida: { font: { italic: true, color: { rgb: NARANJA_TXT } }, fill: { fgColor: { rgb: NARANJA_BG } }, border: bordes },
  sede: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '312E81' } }, alignment: { horizontal: 'left', vertical: 'center' } },
  grupo: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center' } },
} as const

// Mismo orden que se ve en pantalla: Buin primero, Fátima después.
const ORDEN_SEDES = ['buin', 'paine']
function ordenSede(sede: string): number {
  const i = ORDEN_SEDES.indexOf(sede)
  return i === -1 ? 99 : i
}
function ordenDia(dia: string): number {
  const i = DIAS.findIndex(d => d.value === dia)
  return i === -1 ? 99 : i
}

type Args = {
  clubNombre: string
  tituloMes: string
  r: ReporteMes
  dias: DiaMes[]
  asignaciones: AsignacionProfesor[]
  nombreProf: (id: string) => string
  inscripciones: InscripcionMes[]
  nombreJug: (id: string) => string
}

export async function descargarExcelReporteMes({ clubNombre, tituloMes, r, dias, asignaciones, nombreProf, inscripciones, nombreJug }: Args) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()

  const set = (ws: any, row: number, col: number, style: any) => {
    const ref = utils.encode_cell({ r: row, c: col })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
  const setFila = (ws: any, row: number, cols: number, style: any) => {
    for (let c = 0; c < cols; c++) set(ws, row, c, style)
  }

  // — Resumen —
  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)
  const resumen: any[][] = [
    [clubNombre || 'CmSports', 'Reporte de horario — ' + tituloMes],
    [],
    ['Horas dictadas', horas(r.minutosTotales) + ' h'],
    ['Clases dictadas', r.clasesDictadas],
    ['Clases sin dictar (suspendidas)', r.clasesSuspendidas],
    ['Grupos del mes', gruposDelMes.length],
    ['Profesores con horas', r.profesores.length],
    [],
    ['Horas por profesor'],
    ...r.profesores.map(p => [nombreProf(p.profesorId), horas(p.minutos) + ' h']),
  ]
  const wsResumen = utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 30 }, { wch: 26 }]
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } }]
  wsResumen['!rows'] = [{ hpt: 26 }]
  setFila(wsResumen, 0, 2, S.titulo)
  setFila(wsResumen, 8, 2, S.seccion)
  for (let row = 2; row < 7; row++) set(wsResumen, row, 0, S.label)
  utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // — Por día y sede —
  const filas: any[][] = [['Fecha', 'Día', 'Sede', 'Hora', 'Grupo', 'Profesor(es)', 'Inscritos', 'Estado']]
  const estilosFila: { row: number; style: any }[] = []
  for (const d of dias) {
    for (const s of d.sedes) {
      for (const c of s.clases) {
        filas.push([
          d.fecha, diaLabel(diaDe(d.fecha)), sedeLabel(s.sede), rangoHorario(c.bloque.hora_inicio, c.bloque.hora_fin),
          c.bloque.nombre, c.profesorIds.map(nombreProf).filter(Boolean).join(' + ') || '—', c.inscritos, 'Dictada',
        ])
      }
      for (const sus of s.suspendidas) {
        filas.push([
          d.fecha, diaLabel(diaDe(d.fecha)), sedeLabel(s.sede), rangoHorario(sus.bloque.hora_inicio, sus.bloque.hora_fin),
          sus.bloque.nombre, '—', '—', 'Sin clase — ' + sus.motivo,
        ])
        estilosFila.push({ row: filas.length - 1, style: S.suspendida })
      }
    }
  }
  const wsDia = utils.aoa_to_sheet(filas)
  wsDia['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 13 }, { wch: 22 }, { wch: 26 }, { wch: 10 }, { wch: 30 }]
  wsDia['!freeze'] = { xSplit: 0, ySplit: 1 }
  setFila(wsDia, 0, 8, S.header)
  for (let row = 1; row < filas.length; row++) setFila(wsDia, row, 8, S.celda)
  for (const e of estilosFila) setFila(wsDia, e.row, 8, e.style)
  utils.book_append_sheet(wb, wsDia, 'Por día')

  // — Grupos —
  const gRows: any[][] = [['Grupo', 'Día', 'Horario', 'Sede', 'Profesor(es)', 'Dictadas', 'Sin clase', 'Inscritos', 'Cupo']]
  for (const g of gruposDelMes) {
    const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
    gRows.push([
      g.bloque.nombre, diaLabel(g.bloque.dia_semana), rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin), sedeLabel(g.bloque.sede),
      profes.map(nombreProf).filter(Boolean).join(' + ') || '—', g.dictadas.length, g.suspendidas.length, g.inscritos, g.bloque.cupo_maximo,
    ])
  }
  const wsGrupos = utils.aoa_to_sheet(gRows)
  wsGrupos['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 13 }, { wch: 28 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }]
  setFila(wsGrupos, 0, 9, S.header)
  for (let row = 1; row < gRows.length; row++) setFila(wsGrupos, row, 9, S.celdaCentro)
  utils.book_append_sheet(wb, wsGrupos, 'Grupos')

  // — Inscritos por grupo — el roster que separa la hoja "Grupos" (que solo
  // trae el número): un bloque por grupo, con su gente ordenada por nombre.
  // Agrupado por sede y día, igual que se ve en pantalla.
  const gruposOrdenados = [...gruposDelMes].sort((a, b) =>
    ordenSede(a.bloque.sede) - ordenSede(b.bloque.sede)
    || ordenDia(a.bloque.dia_semana) - ordenDia(b.bloque.dia_semana)
    || a.bloque.hora_inicio.localeCompare(b.bloque.hora_inicio))

  const filasInsc: any[][] = []
  const estilosInsc: { row: number; fn: (ws: any) => void }[] = []
  let sedeActual: string | null = null

  for (const g of gruposOrdenados) {
    if (g.bloque.sede !== sedeActual) {
      sedeActual = g.bloque.sede
      const filaSede = filasInsc.length
      filasInsc.push([sedeLabel(sedeActual)])
      estilosInsc.push({ row: filaSede, fn: ws => setFila(ws, filaSede, 6, S.sede) })
    }

    const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
    const filaGrupo = filasInsc.length
    filasInsc.push([
      `${g.bloque.nombre} — ${diaLabel(g.bloque.dia_semana)} ${rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin)}`,
      profes.map(nombreProf).filter(Boolean).join(' + ') || '—', '', '', '', `${g.inscritos} de ${g.bloque.cupo_maximo}`,
    ])
    estilosInsc.push({ row: filaGrupo, fn: ws => setFila(ws, filaGrupo, 6, S.grupo) })

    const suyos = inscripciones
      .filter(i => i.bloque_id === g.bloque.id && !i.vigente_hasta)
      .map(i => nombreJug(i.jugador_id))
      .sort((a, b) => a.localeCompare(b, 'es'))

    if (suyos.length === 0) {
      const filaVacia = filasInsc.length
      filasInsc.push(['Sin nadie inscrito.'])
      estilosInsc.push({ row: filaVacia, fn: ws => set(ws, filaVacia, 0, { font: { italic: true, color: { rgb: '94A3B8' } } }) })
    } else {
      for (const nombre of suyos) {
        const filaJug = filasInsc.length
        filasInsc.push([nombre])
        estilosInsc.push({ row: filaJug, fn: ws => setFila(ws, filaJug, 1, S.celda) })
      }
    }
    filasInsc.push([]) // separador entre grupos
  }

  const wsInsc = utils.aoa_to_sheet(filasInsc)
  wsInsc['!cols'] = [{ wch: 32 }, { wch: 26 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 14 }]
  for (const e of estilosInsc) e.fn(wsInsc)
  utils.book_append_sheet(wb, wsInsc, 'Inscritos por grupo')

  const nombreArchivo = `reporte_horario_${tituloMes.replace(/ /g, '_')}.xlsx`
  writeFile(wb, nombreArchivo)
}
