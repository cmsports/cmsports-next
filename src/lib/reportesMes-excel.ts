// Excel del reporte mensual del horario: una hoja por sede (Buin, Fátima),
// cada una con sus grupos y quién está inscrito en cada uno. Usa
// `xlsx-js-style` (ya instalado en el proyecto, mismo patrón que torneo-excel.ts).

import { DIAS, diaLabel, rangoHorario } from '@/lib/domain/horario'
import { type AsignacionProfesor, type InscripcionMes, type ReporteMes } from '@/lib/domain/reportesMes'

const LILA = 'EDE9FE'
const LILA_TXT = '3730A3'
const MORADO = '4F46E5'
const BORDE = 'E2E8F0'
const HINT = '94A3B8'

const borde = { style: 'thin', color: { rgb: BORDE } } as const
const bordes = { top: borde, bottom: borde, left: borde, right: borde }

const S = {
  titulo: { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  grupo: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center' } },
  celda: { border: bordes, alignment: { vertical: 'center' } },
  vacio: { font: { italic: true, color: { rgb: HINT } } },
} as const

// Nombre corto de sede para el título de la hoja: no admite paréntesis largos
// ni pasar 31 caracteres.
const SEDE_CORTA: Record<string, string> = { buin: 'Buin', paine: 'Fátima' }
function sedeCorta(sede: string): string { return SEDE_CORTA[sede] ?? sede }

function ordenDia(dia: string): number {
  const i = DIAS.findIndex(d => d.value === dia)
  return i === -1 ? 99 : i
}

type Args = {
  clubNombre: string
  tituloMes: string
  r: ReporteMes
  asignaciones: AsignacionProfesor[]
  nombreProf: (id: string) => string
  inscripciones: InscripcionMes[]
  nombreJug: (id: string) => string
}

export async function descargarExcelReporteMes({ clubNombre, tituloMes, r, asignaciones, nombreProf, inscripciones, nombreJug }: Args) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()

  const set = (ws: any, row: number, col: number, style: any) => {
    const ref = utils.encode_cell({ r: row, c: col })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
  const setRango = (ws: any, row: number, colInicio: number, cols: number, style: any) => {
    for (let c = 0; c < cols; c++) set(ws, row, colInicio + c, style)
  }

  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)
  const sedesDelMes = [...new Set(gruposDelMes.map(g => g.bloque.sede))].sort()

  // Los grupos van en columnas lado a lado en vez de uno debajo del otro:
  // con 15 grupos por sede, una sola columna daba 160+ filas de scroll.
  // Cada grupo nuevo se ubica en la columna que va más corta, para que las
  // tres queden parejas — no en orden fijo, así ninguna se estira de más.
  const NUM_COLUMNAS = 3
  const ANCHO_BLOQUE = 3 // nombre+horario, profesor(es), cupos
  const HOLGURA = 1 // columna en blanco entre bloques
  const colInicioDe = (col: number) => col * (ANCHO_BLOQUE + HOLGURA)
  const anchoTotal = NUM_COLUMNAS * (ANCHO_BLOQUE + HOLGURA) - HOLGURA

  for (const sede of sedesDelMes) {
    const gruposSede = gruposDelMes
      .filter(g => g.bloque.sede === sede)
      .sort((a, b) => ordenDia(a.bloque.dia_semana) - ordenDia(b.bloque.dia_semana) || a.bloque.hora_inicio.localeCompare(b.bloque.hora_inicio))

    const grid: any[][] = [[clubNombre || 'CmSports', `${sedeCorta(sede)} — ${tituloMes}`]]
    const estilos: { row: number; fn: (ws: any) => void }[] = [{ row: 0, fn: ws => setRango(ws, 0, 0, anchoTotal, S.titulo) }]
    const escribir = (row: number, col: number, valor: any) => {
      while (grid.length <= row) grid.push([])
      grid[row][col] = valor
    }

    const cursores = Array(NUM_COLUMNAS).fill(2) // fila 0 = título, fila 1 = blanco
    for (const g of gruposSede) {
      const colIdx = cursores.indexOf(Math.min(...cursores))
      const c0 = colInicioDe(colIdx)
      let row = cursores[colIdx]

      const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
        .map(nombreProf).filter(Boolean).join(' + ') || '—'

      escribir(row, c0, `${g.bloque.nombre} — ${diaLabel(g.bloque.dia_semana)} ${rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin)}`)
      escribir(row, c0 + 1, profes)
      escribir(row, c0 + 2, `Inscritos: ${g.inscritos} de ${g.bloque.cupo_maximo} cupos`)
      estilos.push({ row, fn: ws => setRango(ws, row, c0, ANCHO_BLOQUE, S.grupo) })
      row++

      const suyos = inscripciones
        .filter(i => i.bloque_id === g.bloque.id && !i.vigente_hasta)
        .map(i => nombreJug(i.jugador_id))
        .sort((a, b) => a.localeCompare(b, 'es'))

      if (suyos.length === 0) {
        escribir(row, c0, 'Sin nadie inscrito.')
        estilos.push({ row, fn: ws => set(ws, row, c0, S.vacio) })
        row++
      } else {
        for (const nombre of suyos) {
          escribir(row, c0, nombre)
          estilos.push({ row, fn: ws => set(ws, row, c0, S.celda) })
          row++
        }
      }
      cursores[colIdx] = row + 1 // deja una fila en blanco antes del próximo grupo de esa columna
    }

    const ws = utils.aoa_to_sheet(grid)
    ws['!cols'] = Array.from({ length: anchoTotal }, (_, c) => {
      const posEnBloque = c % (ANCHO_BLOQUE + HOLGURA)
      return { wch: [30, 24, 22, 3][posEnBloque] ?? 3 }
    })
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: anchoTotal - 1 } }]
    for (const e of estilos) e.fn(ws)
    utils.book_append_sheet(wb, ws, sedeCorta(sede).slice(0, 31))
  }

  const nombreArchivo = `reporte_horario_${tituloMes.replace(/ /g, '_')}.xlsx`
  writeFile(wb, nombreArchivo)
}
