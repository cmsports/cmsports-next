/**
 * Export Excel estilo Koidan para torneo oficial:
 * hojas Prog + GRP + Sorteo (por evento).
 */

import {
  etiquetaCierreOficial,
  formatearSets,
  type SetMarcador,
  type TipoCierreOficial,
} from '@/lib/domain/oficial-ittf'

export type ExcelOficialInscrito = {
  id: string
  nombre: string
  asociacion: string | null
  cabezaNumero: number | null
  ordenInscripcion: number
}

export type ExcelOficialGrupo = {
  id: string
  nombre: string
  orden: number
  inscritoIds: string[]
}

export type ExcelOficialPartido = {
  id: string
  fase: string
  orden: number
  grupoId: string | null
  inscritoA: string | null
  inscritoB: string | null
  ganadorId: string | null
  sets: SetMarcador[]
  esWalkover: boolean
  tipoCierre?: TipoCierreOficial | null
  mesa: number | null
  programadoEn: string | null
  numeroIttf?: number | null
  arbitroNombre?: string | null
}

export type ExcelOficialStats = {
  inscritoId: string
  pts: number
  pg: number
  pp: number
  juegosGanados: number
  juegosPerdidos: number
}

export type ExcelOficialArgs = {
  eventoNombre: string
  campeonatoNombre: string
  inscritos: ExcelOficialInscrito[]
  grupos: ExcelOficialGrupo[]
  partidos: ExcelOficialPartido[]
  statsPorGrupo: (grupoId: string) => ExcelOficialStats[]
  nombreArchivo?: string
}

function horaChile(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const FASE_LABEL: Record<string, string> = {
  grupos: 'Grupos',
  avance: 'Avance',
  '32vos': '1/32',
  '16vos': '1/16',
  '8vos': '1/8',
  cuartos: '1/4',
  semis: 'SF',
  tercer_lugar: '3°',
  final: 'Final',
}

export async function descargarExcelOficialKoidan(args: ExcelOficialArgs) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()
  const nombrePorId = new Map(args.inscritos.map(i => [i.id, i.nombre]))
  const asocPorId = new Map(args.inscritos.map(i => [i.id, i.asociacion || '']))

  // — Prog —
  const progRows: (string | number)[][] = [
    [args.campeonatoNombre],
    [args.eventoNombre],
    [],
    ['#', 'Hora', 'Mesa', 'Fase', 'Jugador A', 'Asoc. A', 'Jugador B', 'Asoc. B', 'Árbitro', 'Resultado', 'Cierre'],
  ]
  const programados = [...args.partidos]
    .filter(p => p.programadoEn)
    .sort((a, b) => {
      const na = a.numeroIttf ?? 9999
      const nb = b.numeroIttf ?? 9999
      if (na !== nb) return na - nb
      const t = String(a.programadoEn).localeCompare(String(b.programadoEn))
      if (t !== 0) return t
      return (a.mesa ?? 0) - (b.mesa ?? 0)
    })
  for (const p of programados) {
    const cierre = etiquetaCierreOficial(p.tipoCierre, p.esWalkover)
    const res = p.ganadorId
      ? `${formatearSets(p.sets)}${cierre ? ` ${cierre}` : ''}`
      : 'Pendiente'
    progRows.push([
      p.numeroIttf ?? '',
      horaChile(p.programadoEn),
      p.mesa ?? '',
      p.fase === 'grupos'
        ? (args.grupos.find(g => g.id === p.grupoId)?.nombre || 'Grupo')
        : (FASE_LABEL[p.fase] || p.fase),
      p.inscritoA ? (nombrePorId.get(p.inscritoA) || '') : 'TBD',
      p.inscritoA ? (asocPorId.get(p.inscritoA) || '') : '',
      p.inscritoB ? (nombrePorId.get(p.inscritoB) || '') : (p.inscritoB === null && p.inscritoA ? 'BYE' : 'TBD'),
      p.inscritoB ? (asocPorId.get(p.inscritoB) || '') : '',
      p.arbitroNombre || '',
      res,
      cierre,
    ])
  }
  const wsProg = utils.aoa_to_sheet(progRows)
  wsProg['!cols'] = [
    { wch: 5 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 10 },
    { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 8 },
  ]
  utils.book_append_sheet(wb, wsProg, 'Prog')

  // — GRP —
  const grpRows: (string | number)[][] = [
    [`Resultados fase de grupos — ${args.eventoNombre}`],
    [],
  ]
  for (const g of [...args.grupos].sort((a, b) => a.orden - b.orden)) {
    grpRows.push([`Grupo ${g.nombre}`])
    grpRows.push(['Pos', 'Jugador', 'Asociación', 'G', 'P', 'Pts', 'Juegos', 'Puntos ratio'])
    const stats = args.statsPorGrupo(g.id)
    stats.forEach((s, i) => {
      grpRows.push([
        i + 1,
        nombrePorId.get(s.inscritoId) || s.inscritoId,
        asocPorId.get(s.inscritoId) || '',
        s.pg,
        s.pp,
        s.pts,
        `${s.juegosGanados}-${s.juegosPerdidos}`,
        '',
      ])
    })
    grpRows.push(['Partidos (orden ITTF)'])
    grpRows.push(['#', 'A', 'B', 'Sets', 'Ganador', 'Cierre'])
    const partidosG = args.partidos
      .filter(p => p.grupoId === g.id)
      .sort((a, b) => a.orden - b.orden)
    partidosG.forEach((p, i) => {
      const cierre = etiquetaCierreOficial(p.tipoCierre, p.esWalkover)
      grpRows.push([
        i + 1,
        p.inscritoA ? (nombrePorId.get(p.inscritoA) || '') : '—',
        p.inscritoB ? (nombrePorId.get(p.inscritoB) || '') : '—',
        formatearSets(p.sets),
        p.ganadorId ? (nombrePorId.get(p.ganadorId) || '') : 'Pendiente',
        cierre,
      ])
    })
    grpRows.push([])
  }
  const wsGrp = utils.aoa_to_sheet(grpRows)
  wsGrp['!cols'] = [
    { wch: 6 }, { wch: 24 }, { wch: 14 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 10 }, { wch: 10 },
  ]
  utils.book_append_sheet(wb, wsGrp, 'GRP')

  // — Sorteo (siembra / inscritos + cabezas + resumen cuadro) —
  const sorteoRows: (string | number)[][] = [
    [`Sorteo / inscripción — ${args.eventoNombre}`],
    [],
    ['#', 'Jugador', 'Asociación', 'Cabeza', 'Grupo'],
  ]
  const grupoDeInscrito = new Map<string, string>()
  for (const g of args.grupos) {
    g.inscritoIds.forEach((id, idx) => grupoDeInscrito.set(id, `${g.nombre} (pos ${idx + 1})`))
  }
  const inscritosOrden = [...args.inscritos].sort((a, b) => {
    const ca = a.cabezaNumero ?? 999
    const cb = b.cabezaNumero ?? 999
    if (ca !== cb) return ca - cb
    return a.ordenInscripcion - b.ordenInscripcion
  })
  inscritosOrden.forEach((ins, i) => {
    sorteoRows.push([
      i + 1,
      ins.nombre,
      ins.asociacion || '',
      ins.cabezaNumero ?? '',
      grupoDeInscrito.get(ins.id) || '—',
    ])
  })
  const playoff = args.partidos.filter(p => p.fase !== 'grupos').sort((a, b) => {
    if (a.fase !== b.fase) return String(a.fase).localeCompare(String(b.fase))
    return a.orden - b.orden
  })
  if (playoff.length) {
    sorteoRows.push([])
    sorteoRows.push(['Cuadro / llaves (núm. ITTF)'])
    sorteoRows.push(['#', 'Fase', 'Orden', 'A', 'B'])
    for (const p of playoff) {
      sorteoRows.push([
        p.numeroIttf ?? '',
        FASE_LABEL[p.fase] || p.fase,
        p.orden + 1,
        p.inscritoA ? (nombrePorId.get(p.inscritoA) || 'TBD') : 'TBD',
        p.inscritoB ? (nombrePorId.get(p.inscritoB) || 'TBD') : (p.inscritoA ? 'BYE' : 'TBD'),
      ])
    }
  }
  const wsSorteo = utils.aoa_to_sheet(sorteoRows)
  wsSorteo['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 16 }, { wch: 8 }, { wch: 16 }]
  utils.book_append_sheet(wb, wsSorteo, 'Sorteo')

  const safe = (args.nombreArchivo || `${args.eventoNombre}_oficial.xlsx`)
    .replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/gi, '_')
  writeFile(wb, safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`)
}
