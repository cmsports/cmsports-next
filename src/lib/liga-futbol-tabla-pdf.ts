// PDF de la tabla de posiciones de una liga de fútbol — mismo sistema de
// estilo que el resto de los reportes (ver lib/pdf/estilo.ts).

import { encabezado, piePagina, estiloTabla, tituloSeccion, COLOR } from '@/lib/pdf/estilo'
import type { EquipoStats } from '@/lib/domain/liga-futbol'

export async function exportarTablaLigaFutbolPdf(
  ligaNombre: string,
  clubNombre: string,
  tabla: EquipoStats[],
  equipoPorId: (id: string) => { nombre: string } | undefined,
) {
  if (tabla.length === 0) return

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  let y = encabezado(doc, {
    club: clubNombre,
    titulo: `Tabla de posiciones · ${ligaNombre}`,
    subtitulo: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })

  y = tituloSeccion(doc, y, `${tabla.length} equipos`)

  const estilo = estiloTabla()
  autoTable(doc, {
    startY: y,
    head: [['#', 'Equipo', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS']],
    body: tabla.map((row, i) => [
      i + 1,
      equipoPorId(row.equipoId)?.nombre || '—',
      row.pj, row.pg, row.pe, row.pp, row.gf, row.gc,
      row.dg > 0 ? `+${row.dg}` : row.dg,
      row.pts,
    ]),
    ...estilo,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' },
      6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' },
      9: { halign: 'right', fontStyle: 'bold', textColor: COLOR.primarioOs },
    },
  })

  piePagina(doc, `${clubNombre || 'CmSports'} · ${ligaNombre}`)

  const slug = ligaNombre.replace(/[^a-zA-Z0-9]+/g, '_')
  doc.save(`tabla_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
