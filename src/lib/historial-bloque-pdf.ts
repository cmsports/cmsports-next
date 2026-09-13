// PDF del historial de asistencia de UN bloque — Panorama → Por bloque.
// Un reporte chico a propósito: jugador y fecha, nada más, porque la sede y
// el horario ya son el filtro con el que se pidió el reporte, no una columna
// que se repite en cada fila. Arriba, un resumen: cuántos distintos vinieron
// y quiénes más.

import { TINTA, GRIS, nuevoDocumento, pieDePagina, seccion, cifras, barras, tabla, marcaDelClub, type Marca } from '@/lib/pdf/papel'
import type { FilaHistorialDetallado } from '@/lib/domain/historialDetalladoAsistencia'

export async function exportarHistorialBloquePdf(args: {
  clubNombre: string
  marca?: Marca
  bloqueNombre: string
  sede: string
  horario: string
  desde: string
  hasta: string
  filas: FilaHistorialDetallado[]
}) {
  const marca = args.marca ?? await marcaDelClub({ nombre: args.clubNombre, logo_url: null })
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, {
    titulo: `Historial · ${args.bloqueNombre}`,
    subtitulo: `${args.sede} · ${args.horario} · del ${args.desde} al ${args.hasta}`,
    nota: `Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })
  let y = y0

  const porJugador = new Map<string, number>()
  const dias = new Set<string>()
  for (const f of args.filas) {
    porJugador.set(f.jugadorNombre, (porJugador.get(f.jugadorNombre) ?? 0) + 1)
    dias.add(f.fecha)
  }
  const top = [...porJugador.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))

  y = cifras(doc, y, marca, [
    { etiqueta: 'Asistencias', valor: String(args.filas.length) },
    { etiqueta: 'Días con clase', valor: String(dias.size) },
    { etiqueta: 'Jugadores distintos', valor: String(porJugador.size) },
    { etiqueta: 'Promedio por clase', valor: dias.size ? String(Math.round(args.filas.length / dias.size)) : '—' },
  ])

  if (top.length > 1) {
    y = seccion(doc, y, marca, 'Asistencias por jugador', `${top.length} jugadores`)
    y = barras(doc, y, marca, top.slice(0, 12).map(([nombre, n]) => ({ etiqueta: nombre, valor: n, texto: `${n} · ${Math.round((n / dias.size) * 100)}%` })), { anchoEtiqueta: 60 })
  }

  y = seccion(doc, y, marca, 'Registro', `${args.filas.length} presentes`)
  const filas = [...args.filas].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.jugadorNombre.localeCompare(b.jugadorNombre, 'es'))
  autoTable(doc, {
    ...tabla(marca, { anchos: { 1: 32 }, alParsear: d => { if (d.section === 'body' && d.column.index === 1) d.cell.styles.textColor = GRIS } }),
    startY: y,
    head: [['Jugador', 'Fecha']],
    body: filas.map(f => [f.jugadorNombre + (f.inferido ? ' (inferido)' : ''), f.fecha]),
  })

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `${args.bloqueNombre} · ${args.sede}`)
  doc.save(`historial_${args.bloqueNombre.toLowerCase().replace(/\s+/g, '_')}.pdf`)
}
