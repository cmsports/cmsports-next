// PDF de resultados de una votación (migración 303), sobre el molde v2
// (lib/pdf/papel.ts). Lo exporta el profe cuando quiera, con la votación
// abierta o cerrada: el encabezado dice cuál de las dos era al generarlo.
//
// El voto es secreto, así que el PDF trae totales por opción y la lista de
// quiénes aún no votan, nunca quién votó por quién (ni el RPC lo devuelve).
// Sin emoji: las fuentes del PDF no los tienen y salen como cuadraditos.

import { cifras, nuevoDocumento, pieDePagina, marcaDelClub, seccion, tabla, trasTabla, parrafo, nota, TINTA, type Marca } from '@/lib/pdf/papel'
import { porcentajeDeVotos, type ResultadoVotacion } from '@/lib/domain/votaciones'
import { fechaChile } from '@/lib/domain/fechaChile'

type Meta = { clubNombre: string; marca?: Marca }

/** Puestos "de competencia": con empate comparten número y el siguiente salta (1, 1, 3). */
export function puestosDeVotacion(votos: readonly number[]): number[] {
  return votos.map(v => 1 + votos.filter(otro => otro > v).length)
}

function fechaLegible(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })
}

export async function exportarVotacionPdf(r: ResultadoVotacion, meta: Meta) {
  const marca = meta.marca ?? await marcaDelClub({ nombre: meta.clubNombre, logo_url: null })

  const estado = r.estado === 'cerrada'
    ? `Cerrada el ${fechaLegible(r.cerrada_en)}`
    : 'Votación abierta: resultados parciales'
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, {
    titulo: r.titulo,
    subtitulo: estado,
    nota: `Generado el ${new Date().toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}`,
  })

  let y = y0
  if (r.descripcion) y = parrafo(doc, y, r.descripcion)

  const participacion = porcentajeDeVotos(r.votos_total, r.habilitados)
  y = cifras(doc, y + 2, marca, [
    { etiqueta: 'Votaron', valor: String(r.votos_total) },
    { etiqueta: 'Podían votar', valor: String(r.habilitados) },
    { etiqueta: 'Participación', valor: `${participacion}%` },
  ])

  y = seccion(doc, y + 4, marca, 'Resultados',
    r.tipo === 'jugadores' ? 'Votación entre compañeros' : 'Opciones definidas por el profesor')

  const puestos = puestosDeVotacion(r.opciones.map(o => o.votos))
  autoTable(doc, {
    ...tabla(marca, { numericas: [0, 2, 3], anchos: { 0: 14, 2: 22, 3: 22 } }),
    startY: y,
    head: [['#', 'Opción', 'Votos', '% de votos']],
    body: r.opciones.map((o, i) => [
      String(puestos[i]),
      o.texto,
      String(o.votos),
      `${porcentajeDeVotos(o.votos, r.votos_total)}%`,
    ]),
  })
  y = trasTabla(doc)

  if (r.faltan.length > 0) {
    y = seccion(doc, y, marca, `Aún no votan (${r.faltan.length})`)
    y = parrafo(doc, y, r.faltan.join(', '), { tam: 8.5 })
  }
  if (r.votos_total === 0) y = nota(doc, y, 'Todavía no hay votos registrados.')

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, 'Resultados de votación')
  doc.save(`votacion_${fechaChile()}.pdf`)
}
