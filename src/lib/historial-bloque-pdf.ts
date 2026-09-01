// PDF del historial de asistencia de UN bloque — Panorama → Por bloque.
// Un reporte chico a propósito: jugador y fecha, nada más, porque la sede y
// el horario ya son el filtro con el que se pidió el reporte, no una columna
// que se repite en cada fila.

import { encabezado, piePagina, tituloSeccion, estiloTabla } from '@/lib/pdf/estilo'
import type { FilaHistorialDetallado } from '@/lib/domain/historialDetalladoAsistencia'

export async function exportarHistorialBloquePdf(args: {
  clubNombre: string
  bloqueNombre: string
  sede: string
  horario: string
  desde: string
  hasta: string
  filas: FilaHistorialDetallado[]
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const cab = {
    club: args.clubNombre,
    titulo: `Historial de asistencia · ${args.bloqueNombre}`,
    subtitulo: `${args.sede} · ${args.horario}`,
  }
  let y = encabezado(doc, cab)
  y = tituloSeccion(doc, y, `Del ${args.desde} al ${args.hasta}`, `${args.filas.length} presentes`)

  autoTable(doc, {
    startY: y,
    head: [['Jugador', 'Fecha']],
    body: args.filas.map(f => [f.jugadorNombre + (f.inferido ? ' (inferido)' : ''), f.fecha]),
    ...estiloTabla(),
    columnStyles: { 1: { cellWidth: 32 } },
  })

  piePagina(doc, `${args.clubNombre} · ${args.bloqueNombre}`)
  doc.save(`historial_${args.bloqueNombre.toLowerCase().replace(/\s+/g, '_')}.pdf`)
}
