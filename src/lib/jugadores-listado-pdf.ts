// PDF del listado de jugadores, con columnas elegidas por el usuario. Usa
// jspdf + jspdf-autotable, mismo patrón que reportesMes-pdf.ts, y el mismo
// registro de campos que el export a Excel (src/lib/domain/jugadorExport.ts)
// para que ninguno de los dos formatos invente su propio texto.

import { camposDesdeIds, type ContextoExportJugadores } from '@/lib/domain/jugadorExport'
import { encabezado, piePagina, estiloTabla } from '@/lib/pdf/estilo'

type Meta = { clubNombre: string }

export async function exportarJugadoresPdf(jugadores: any[], camposIds: string[], ctx: ContextoExportJugadores, meta: Meta) {
  const campos = camposDesdeIds(camposIds)
  if (campos.length === 0) return

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  // Con muchas columnas, landscape + fuente más chica evita que la tabla se
  // vea apretada; autoTable de todos modos envuelve texto largo y crece la
  // fila, así que nada se corta.
  const orientation = campos.length > 6 ? 'landscape' : 'portrait'
  const fontSize = campos.length > 15 ? 6 : campos.length > 10 ? 7 : campos.length > 6 ? 7.5 : 8.5

  const doc = new jsPDF({ orientation })
  const y = encabezado(doc, {
    club: meta.clubNombre,
    titulo: 'Listado de jugadores',
    subtitulo: `${jugadores.length} jugadores  ·  Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })

  const estilo = estiloTabla()
  autoTable(doc, {
    startY: y,
    head: [campos.map(c => c.etiqueta)],
    body: jugadores.map(j => campos.map(c => c.texto(j, ctx) || '—')),
    ...estilo,
    styles: { ...estilo.styles, fontSize },
  })

  piePagina(doc, `${meta.clubNombre || 'CmSports'} · Listado de jugadores`)
  doc.save(`jugadores_${new Date().toISOString().slice(0, 10)}.pdf`)
}
