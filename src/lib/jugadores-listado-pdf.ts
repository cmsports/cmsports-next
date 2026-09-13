// PDF del listado de jugadores, con columnas elegidas por el usuario, sobre
// el molde v2 (lib/pdf/papel.ts). Usa el mismo registro de campos que el
// export a Excel (src/lib/domain/jugadorExport.ts) para que ninguno de los
// dos formatos invente su propio texto.

import { camposDesdeIds, type ContextoExportJugadores } from '@/lib/domain/jugadorExport'
import { TINTA, nuevoDocumento, pieDePagina, tabla, marcaDelClub, type Marca } from '@/lib/pdf/papel'

type Meta = { clubNombre: string; marca?: Marca }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportarJugadoresPdf(jugadores: any[], camposIds: string[], ctx: ContextoExportJugadores, meta: Meta) {
  const campos = camposDesdeIds(camposIds)
  if (campos.length === 0) return
  const marca = meta.marca ?? await marcaDelClub({ nombre: meta.clubNombre, logo_url: null })

  // Con muchas columnas, apaisado y letra más chica evita que la tabla se
  // vea apretada; autoTable de todos modos envuelve texto largo y crece la
  // fila, así que nada se corta.
  const apaisado = campos.length > 6
  const tamano = campos.length > 15 ? 6 : campos.length > 10 ? 7 : campos.length > 6 ? 7.5 : 8.5

  const { doc, autoTable, y } = await nuevoDocumento(marca, {
    titulo: 'Listado de jugadores',
    subtitulo: `${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'}`,
    nota: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  }, { apaisado })

  autoTable(doc, {
    ...tabla(marca, { tamano }),
    startY: y,
    head: [campos.map(c => c.etiqueta)],
    body: jugadores.map(j => campos.map(c => c.texto(j, ctx) || '—')),
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, 'Listado de jugadores')
  doc.save(`jugadores_${new Date().toISOString().slice(0, 10)}.pdf`)
}
