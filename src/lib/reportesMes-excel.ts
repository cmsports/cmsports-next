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
const VERDE_BG = 'F0FDF4'; const VERDE_TXT = '166534'
const AMBAR_BG = 'FFFBEB'; const AMBAR_TXT = 'B45309'
const ROJO_BG = 'FEF2F2'; const ROJO_TXT = 'B91C1C'

// Borde fino para las líneas internas de la tabla; uno más grueso y morado
// para el contorno de cada tarjeta de grupo, así se distingue de la de al lado.
const BORDE_INT = { style: 'thin', color: { rgb: BORDE } } as const
const BORDE_EXT = { style: 'medium', color: { rgb: MORADO } } as const

const S = {
  titulo: { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  subtitulo: { font: { sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } },
  grupo: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } },
  celda: { alignment: { vertical: 'center' } },
  vacio: { font: { italic: true, color: { rgb: HINT } } },
  pctBuena: { font: { bold: true, color: { rgb: VERDE_TXT } }, fill: { fgColor: { rgb: VERDE_BG } }, alignment: { horizontal: 'center' } },
  pctMedia: { font: { bold: true, color: { rgb: AMBAR_TXT } }, fill: { fgColor: { rgb: AMBAR_BG } }, alignment: { horizontal: 'center' } },
  pctMala: { font: { bold: true, color: { rgb: ROJO_TXT } }, fill: { fgColor: { rgb: ROJO_BG } }, alignment: { horizontal: 'center' } },
  pctSinDatos: { font: { color: { rgb: HINT } }, alignment: { horizontal: 'center' } },
} as const

function estiloPct(pct: number | null) {
  if (pct === null) return S.pctSinDatos
  return pct >= 75 ? S.pctBuena : pct >= 50 ? S.pctMedia : S.pctMala
}

/** Contorno de tarjeta: grueso en el borde exterior del bloque, fino adentro. */
function bordeCaja(top: boolean, bottom: boolean, left: boolean, right: boolean) {
  return {
    top: top ? BORDE_EXT : BORDE_INT,
    bottom: bottom ? BORDE_EXT : BORDE_INT,
    left: left ? BORDE_EXT : BORDE_INT,
    right: right ? BORDE_EXT : BORDE_INT,
  }
}

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
  /** % de asistencia de cada jugador en ese grupo, ese mismo mes. bloque_id -> jugador_id -> %. */
  pctAsistencia: Map<string, Map<string, number | null>>
}

export async function descargarExcelReporteMes({ clubNombre, tituloMes, r, asignaciones, nombreProf, inscripciones, nombreJug, pctAsistencia }: Args) {
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

    const grid: any[][] = [[clubNombre || 'CmSports', `Reporte de grupos — ${sedeCorta(sede)}`]]
    const estilos: { row: number; fn: (ws: any) => void }[] = [{ row: 0, fn: ws => setRango(ws, 0, 0, anchoTotal, S.titulo) }]
    const escribir = (row: number, col: number, valor: any) => {
      while (grid.length <= row) grid.push([])
      grid[row][col] = valor
    }

    // — Cabecera: qué es este reporte, de qué mes, y qué significan los colores. —
    escribir(1, 0, `Quién está inscrito en cada grupo de ${sedeCorta(sede)} y su % de asistencia — ${tituloMes}.`)
    estilos.push({ row: 1, fn: ws => setRango(ws, 1, 0, anchoTotal, S.subtitulo) })

    const leyenda: [string, keyof typeof S][] = [
      ['% asistencia: 75% o más', 'pctBuena'],
      ['50% – 74%', 'pctMedia'],
      ['Menos de 50%', 'pctMala'],
      ['— sin clases registradas aún', 'pctSinDatos'],
    ]
    leyenda.forEach(([texto, estiloKey], i) => {
      escribir(2, i, texto)
      estilos.push({ row: 2, fn: ws => set(ws, 2, i, S[estiloKey]) })
    })

    const cursores = Array(NUM_COLUMNAS).fill(4) // 0 título, 1 subtítulo, 2 leyenda, 3 blanco
    for (const g of gruposSede) {
      const colIdx = cursores.indexOf(Math.min(...cursores))
      const c0 = colInicioDe(colIdx)
      const filaInicio = cursores[colIdx]
      let row = filaInicio

      // Cada celda del bloque se guarda con su estilo de contenido; el borde
      // de caja se calcula al final, cuando ya se sabe dónde termina el bloque.
      const celdas: { row: number; col: number; base: any }[] = []

      const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
        .map(nombreProf).filter(Boolean).join(' + ') || '—'

      escribir(row, c0, `${g.bloque.nombre} — ${diaLabel(g.bloque.dia_semana)} ${rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin)}`)
      escribir(row, c0 + 1, profes)
      escribir(row, c0 + 2, `Inscritos: ${g.inscritos} de ${g.bloque.cupo_maximo} cupos`)
      celdas.push({ row, col: c0, base: S.grupo }, { row, col: c0 + 1, base: S.grupo }, { row, col: c0 + 2, base: S.grupo })
      row++

      const pctDelGrupo = pctAsistencia.get(g.bloque.id)
      const suyos = inscripciones
        .filter(i => i.bloque_id === g.bloque.id && !i.vigente_hasta)
        .map(i => ({ nombre: nombreJug(i.jugador_id), pct: pctDelGrupo?.get(i.jugador_id) ?? null }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

      if (suyos.length === 0) {
        escribir(row, c0, 'Sin nadie inscrito.')
        celdas.push({ row, col: c0, base: S.vacio }, { row, col: c0 + 1, base: {} }, { row, col: c0 + 2, base: {} })
        row++
      } else {
        for (const { nombre, pct } of suyos) {
          escribir(row, c0, nombre)
          escribir(row, c0 + 1, pct === null ? '—' : `${pct}%`)
          celdas.push({ row, col: c0, base: S.celda }, { row, col: c0 + 1, base: estiloPct(pct) }, { row, col: c0 + 2, base: {} })
          row++
        }
      }

      const filaFin = row - 1
      for (const { row: rr, col: cc, base } of celdas) {
        const estiloFinal = {
          ...base,
          border: bordeCaja(rr === filaInicio, rr === filaFin, cc === c0, cc === c0 + ANCHO_BLOQUE - 1),
        }
        estilos.push({ row: rr, fn: ws => set(ws, rr, cc, estiloFinal) })
      }

      cursores[colIdx] = row + 1 // deja una fila en blanco antes del próximo grupo de esa columna
    }

    const ws = utils.aoa_to_sheet(grid)
    ws['!cols'] = Array.from({ length: anchoTotal }, (_, c) => {
      const posEnBloque = c % (ANCHO_BLOQUE + HOLGURA)
      return { wch: [30, 24, 22, 3][posEnBloque] ?? 3 }
    })
    ws['!rows'] = [{ hpt: 26 }, { hpt: 30 }]
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: anchoTotal - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: anchoTotal - 1 } },
    ]
    for (const e of estilos) e.fn(ws)
    utils.book_append_sheet(wb, ws, sedeCorta(sede).slice(0, 31))
  }

  const nombreArchivo = `reporte_horario_${tituloMes.replace(/ /g, '_')}.xlsx`
  writeFile(wb, nombreArchivo)
}
