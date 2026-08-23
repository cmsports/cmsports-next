// Excel de estadísticas completas de una liga de fútbol: tabla, goleadores
// y tarjetas, cada uno en su propia hoja.

import type { EquipoStats, GoleadorStats, TarjetasJugador } from '@/lib/domain/liga-futbol'

interface NombresPorId {
  equipo: (id: string) => string
  jugador: (id: string) => string
}

export async function exportarStatsLigaFutbolExcel(
  ligaNombre: string,
  tabla: EquipoStats[],
  goleadores: GoleadorStats[],
  tarjetas: TarjetasJugador[],
  nombres: NombresPorId,
) {
  const { utils, writeFile } = await import('xlsx')
  const wb = utils.book_new()

  const hojaTabla = tabla.map((row, i) => ({
    '#': i + 1, Equipo: nombres.equipo(row.equipoId),
    PJ: row.pj, PG: row.pg, PE: row.pe, PP: row.pp,
    GF: row.gf, GC: row.gc, DG: row.dg, PTS: row.pts,
  }))
  utils.book_append_sheet(wb, utils.json_to_sheet(hojaTabla), 'Tabla')

  const hojaGoleadores = goleadores.map((g, i) => ({
    '#': i + 1, Jugador: nombres.jugador(g.jugadorId), Equipo: nombres.equipo(g.equipoId),
    Goles: g.goles, 'De penal': g.penales,
  }))
  utils.book_append_sheet(wb, utils.json_to_sheet(hojaGoleadores), 'Goleadores')

  const hojaTarjetas = tarjetas.map(t => ({
    Jugador: nombres.jugador(t.jugadorId), Equipo: nombres.equipo(t.equipoId),
    Amarillas: t.amarillas, Rojas: t.rojas, 'Doble amarilla': t.dobleAmarilla,
  }))
  utils.book_append_sheet(wb, utils.json_to_sheet(hojaTarjetas), 'Tarjetas')

  const slug = ligaNombre.replace(/[^a-zA-Z0-9]+/g, '_')
  writeFile(wb, `stats_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
