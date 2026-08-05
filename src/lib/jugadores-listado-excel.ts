// Excel del listado de jugadores, con columnas elegidas por el usuario.
// Usa el registro de src/lib/domain/jugadorExport.ts para no duplicar el
// formato de cada campo (ver ModalExportarJugadores).

import { camposDesdeIds, type ContextoExportJugadores } from '@/lib/domain/jugadorExport'

export async function exportarJugadoresExcel(jugadores: any[], camposIds: string[], ctx: ContextoExportJugadores) {
  const campos = camposDesdeIds(camposIds)
  if (campos.length === 0) return

  const { utils, writeFile } = await import('xlsx')
  const datos = jugadores.map(j =>
    Object.fromEntries(campos.map(c => [c.etiqueta, (c.valorExcel ?? c.texto)(j, ctx)]))
  )
  const ws = utils.json_to_sheet(datos)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Jugadores')
  writeFile(wb, `jugadores_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
