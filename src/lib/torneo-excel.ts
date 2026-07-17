// Genera un .xlsx con una hoja por fase del torneo, con colores del tema.
// Usa `xlsx-js-style` (fork de `xlsx` con estilos de celda, misma API).

type Jugador = { id: string; nombre: string }
type StatFila = { jugador: Jugador; pts: number; pg: number; pp: number }

type Args = {
  torneo: any
  grupos: any[]
  partidos: any[]
  statsDeGrupo: (grupoId: string) => { ordenados: StatFila[] }
  faseLabel: Record<string, string>
  fasesOrden: readonly string[]
}

// — Paleta (colores del tema, en formato ARGB sin '#') —
const MORADO = '4F46E5'
const LILA = 'EDE9FE'
const LILA_TXT = '3730A3'
const VERDE = '16A34A'
const VERDE_BG = 'F0FDF4'
const ORO = 'FEF3C7'
const PLATA = 'F1F5F9'
const GRIS = '64748B'
const BORDE = 'E2E8F0'

const borde = { style: 'thin', color: { rgb: BORDE } } as const
const bordes = { top: borde, bottom: borde, left: borde, right: borde }

const S = {
  titulo: { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  seccion: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'left', vertical: 'center' } },
  header: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  label: { font: { bold: true, color: { rgb: LILA_TXT } } },
  oro: { fill: { fgColor: { rgb: ORO } }, font: { bold: true }, alignment: { horizontal: 'center' }, border: bordes },
  plata: { fill: { fgColor: { rgb: PLATA } }, font: { bold: true }, alignment: { horizontal: 'center' }, border: bordes },
  celda: { border: bordes, alignment: { vertical: 'center' } },
  celdaCentro: { border: bordes, alignment: { horizontal: 'center', vertical: 'center' } },
  ganador: { font: { bold: true, color: { rgb: VERDE } }, fill: { fgColor: { rgb: VERDE_BG } }, border: bordes },
  pendiente: { font: { italic: true, color: { rgb: GRIS } }, border: bordes },
} as const

export async function descargarExcelTorneo({ torneo, grupos, partidos, statsDeGrupo, faseLabel, fasesOrden }: Args) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()

  // Aplica un estilo a una celda por fila/columna (crea la celda si no existe)
  const set = (ws: any, r: number, c: number, style: any) => {
    const ref = utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
  const setFila = (ws: any, r: number, cols: number, style: any) => {
    for (let c = 0; c < cols; c++) set(ws, r, c, style)
  }

  // — Hoja Resumen —
  const gruposReales = grupos.filter((g) => g.nombre !== 'MESA')
  const resumen: any[][] = [
    [torneo?.nombre || 'Torneo'],
    [],
    ['Fase actual', faseLabel[torneo?.fase] || torneo?.fase || '—'],
    ['Estado', torneo?.estado || '—'],
    ['Código en vivo', torneo?.codigo || '—'],
    ['Grupos', gruposReales.length],
    ['Partidos jugados', partidos.filter((p) => p.ganador).length + ' / ' + partidos.length],
  ]
  if (torneo?.fase === 'finalizado') {
    const pFinal = partidos.find((p) => p.fase === 'final' && p.ganador)
    const campeon = pFinal?.jg
    const sub = pFinal ? (pFinal.ganador === pFinal.jugador_a ? pFinal.jb : pFinal.ja) : null
    resumen.push([], ['🏆 Campeón', campeon?.nombre || '—'], ['🥈 Subcampeón', sub?.nombre || '—'])
  }
  const wsResumen = utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 20 }, { wch: 34 }]
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  wsResumen['!rows'] = [{ hpt: 28 }]
  setFila(wsResumen, 0, 2, S.titulo)
  for (let r = 2; r < resumen.length; r++) if (resumen[r][0]) set(wsResumen, r, 0, S.label)
  utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // — Hoja Fase de grupos —
  if (gruposReales.length) {
    const rows: any[][] = []
    const merges: any[] = []
    const ops: { r: number; c: number; s: any }[] = []
    const opFila: { r: number; cols: number; s: any }[] = []
    for (const grupo of gruposReales) {
      const { ordenados } = statsDeGrupo(grupo.id)
      const partidosGrupo = partidos.filter((p) => p.grupo_id === grupo.id)

      merges.push({ s: { r: rows.length, c: 0 }, e: { r: rows.length, c: 4 } })
      opFila.push({ r: rows.length, cols: 5, s: S.seccion })
      rows.push([`Grupo ${grupo.nombre}`])

      opFila.push({ r: rows.length, cols: 5, s: S.header })
      rows.push(['Pos', 'Jugador', 'G', 'P', 'Puntos'])

      ordenados.forEach((j, i) => {
        const r = rows.length
        rows.push([i === 0 ? '🥇 1°' : i === 1 ? '🥈 2°' : `${i + 1}°`, j.jugador?.nombre || '—', j.pg, j.pp, j.pts])
        opFila.push({ r, cols: 5, s: S.celdaCentro })
        ops.push({ r, c: 1, s: S.celda })
        if (i === 0) ops.push({ r, c: 0, s: S.oro })
        else if (i === 1) ops.push({ r, c: 0, s: S.plata })
      })
      rows.push([])

      opFila.push({ r: rows.length, cols: 1, s: S.label })
      rows.push(['Partidos'])
      partidosGrupo.forEach((p) => {
        const r = rows.length
        const a = p.ja?.nombre || '—'
        const b = p.jb?.nombre || '—'
        const res = p.ganador ? `Ganó ${p.jg?.nombre || (p.ganador === p.jugador_a ? a : b)}` : 'Pendiente'
        rows.push([a, 'vs', b, res])
        opFila.push({ r, cols: 4, s: S.celda })
        ops.push({ r, c: 1, s: S.celdaCentro })
        ops.push({ r, c: 3, s: p.ganador ? S.ganador : S.pendiente })
      })
      rows.push([], [])
    }
    const wsG = utils.aoa_to_sheet(rows)
    wsG['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 22 }, { wch: 24 }, { wch: 10 }]
    wsG['!merges'] = merges
    opFila.forEach((o) => setFila(wsG, o.r, o.cols, o.s))
    ops.forEach((o) => set(wsG, o.r, o.c, o.s))
    utils.book_append_sheet(wb, wsG, 'Fase de grupos')
  }

  // — Una hoja por cada fase de playoffs presente —
  for (const fase of fasesOrden) {
    const ps = partidos.filter((p) => p.fase === fase).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    if (!ps.length) continue
    const rows: any[][] = [
      [faseLabel[fase] || fase],
      [],
      ['Llave', 'Jugador A', 'vs', 'Jugador B', 'Ganador'],
    ]
    ps.forEach((p, i) => {
      const a = p.ja?.nombre || 'TBD'
      const isBye = p.jugador_b === null
      const b = isBye ? 'BYE' : p.jb?.nombre || 'TBD'
      const ganador = p.ganador ? p.jg?.nombre || (p.ganador === p.jugador_a ? a : b) : (isBye ? a : 'Pendiente')
      rows.push([`Llave ${(p.orden ?? i) + 1}`, a, 'vs', b, ganador])
    })
    const ws = utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 9 }, { wch: 24 }, { wch: 5 }, { wch: 24 }, { wch: 24 }]
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]
    ws['!rows'] = [{ hpt: 26 }]
    setFila(ws, 0, 5, S.titulo)
    setFila(ws, 2, 5, S.header)
    ps.forEach((p, i) => {
      const r = i + 3
      setFila(ws, r, 5, S.celdaCentro)
      set(ws, r, 0, S.label)
      set(ws, r, 4, p.ganador || p.jugador_b === null ? S.ganador : S.pendiente)
    })
    const nombreHoja = (faseLabel[fase] || fase).replace(/[\\/?*[\]:]/g, '').slice(0, 31)
    utils.book_append_sheet(wb, ws, nombreHoja)
  }

  const nombreArchivo = `${(torneo?.nombre || 'torneo').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim() || 'torneo'}.xlsx`
  writeFile(wb, nombreArchivo)
}
