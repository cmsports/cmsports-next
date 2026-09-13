'use client'

// Los PDF del torneo oficial (asociación): programa, grupos, llaves y la
// grilla mural. Molde v2 (lib/pdf/papel.ts). Reciben `club` y, si la
// pantalla la tiene, la `marca` con logo; sin marca salen con el nombre.

import type { Marca } from '@/lib/pdf/papel'

export type FilaPrograma = {
  hora: string
  mesa: number
  evento: string
  partido: string
  fase: string
  resultado?: string
  numeroIttf?: number | null
  arbitro?: string | null
}

async function marcaDe(club: string, marca?: Marca): Promise<Marca> {
  if (marca) return marca
  const { marcaDelClub } = await import('@/lib/pdf/papel')
  return marcaDelClub({ nombre: club, logo_url: null })
}

export async function exportarProgramaOficialPdf(params: {
  titulo: string
  subtitulo?: string
  club: string
  marca?: Marca
  filas: FilaPrograma[]
  nombreArchivo: string
}) {
  const { nuevoDocumento, pieDePagina, tabla, nota, TINTA, GRIS, GRIS_CLARO, VERDE } = await import('@/lib/pdf/papel')
  const marca = await marcaDe(params.club, params.marca)
  const { doc, autoTable, y } = await nuevoDocumento(marca, { titulo: params.titulo, subtitulo: params.subtitulo, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }, { apaisado: true })

  if (!params.filas.length) {
    nota(doc, y, 'No hay partidos programados.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 8.5, centradas: [0, 1, 2], anchos: { 0: 12, 1: 18, 2: 14, 5: 70, 6: 34, 7: 26 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0) d.cell.styles.textColor = GRIS_CLARO
          if (d.column.index === 1) d.cell.styles.fontStyle = 'bold'
          if (d.column.index === 6) d.cell.styles.textColor = params.filas[d.row.index]?.arbitro ? GRIS : GRIS_CLARO
          if (d.column.index === 7 && params.filas[d.row.index]?.resultado) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = VERDE }
        },
      }),
      startY: y,
      head: [['#', 'Hora', 'Mesa', 'Evento', 'Fase', 'Partido', 'Árbitro', 'Resultado']],
      body: params.filas.map(f => [
        f.numeroIttf != null ? String(f.numeroIttf) : '—', f.hora, String(f.mesa), f.evento, f.fase, f.partido, f.arbitro || '—', f.resultado || '—',
      ]),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, params.titulo)
  doc.save(params.nombreArchivo)
}

export async function exportarGruposOficialPdf(params: {
  titulo: string
  club: string
  marca?: Marca
  grupos: Array<{
    nombre: string
    filas: Array<{ pos: number; nombre: string; pts: number; pg: number; pp: number }>
  }>
  nombreArchivo: string
}) {
  const { nuevoDocumento, pieDePagina, asegurar, seccion, tabla, trasTabla, TINTA, GRIS_CLARO } = await import('@/lib/pdf/papel')
  const marca = await marcaDe(params.club, params.marca)
  const cab = { titulo: params.titulo, subtitulo: 'Clasificación ITTF (2/1/0)', nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  for (const g of params.grupos) {
    y = asegurar(doc, y, 20 + g.filas.length * 7, marca, cab)
    y = seccion(doc, y, marca, `Grupo ${g.nombre}`, `${g.filas.length} jugadores`)
    autoTable(doc, {
      ...tabla(marca, {
        centradas: [0, 2, 3, 4], anchos: { 0: 10, 2: 18, 3: 18, 4: 18 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = d.row.index < 2 ? marca.acento : GRIS_CLARO }
          if (d.column.index === 2) d.cell.styles.fontStyle = 'bold'
        },
      }),
      startY: y,
      head: [['#', 'Jugador', 'Pts', 'PG', 'PP']],
      body: g.filas.map(r => [String(r.pos), r.nombre, String(r.pts), String(r.pg), String(r.pp)]),
    })
    y = trasTabla(doc, 8)
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, params.titulo)
  doc.save(params.nombreArchivo)
}

export async function exportarLlavesOficialPdf(params: {
  titulo: string
  club: string
  marca?: Marca
  filas: Array<{ fase: string; partido: string; resultado: string }>
  nombreArchivo: string
}) {
  const { nuevoDocumento, pieDePagina, tabla, nota, TINTA, GRIS, VERDE } = await import('@/lib/pdf/papel')
  const marca = await marcaDe(params.club, params.marca)
  const { doc, autoTable, y } = await nuevoDocumento(marca, { titulo: params.titulo, subtitulo: 'Cuadro eliminatorio', nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` })

  if (!params.filas.length) {
    nota(doc, y, 'No hay llaves generadas.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        anchos: { 0: 34, 2: 36 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0) d.cell.styles.textColor = GRIS
          if (d.column.index === 2 && params.filas[d.row.index]?.resultado && params.filas[d.row.index].resultado !== '—') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = VERDE }
        },
      }),
      startY: y,
      head: [['Fase', 'Partido', 'Resultado']],
      body: params.filas.map(f => [f.fase, f.partido, f.resultado]),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, params.titulo)
  doc.save(params.nombreArchivo)
}

export type CeldaMuralPdf = {
  mesa: number
  hora: string
  etiqueta: string
  tipo: 'grupo' | 'partido' | 'especial'
  detalle?: string
}

/** Grilla mural (hora × mesa) para pegar en la pared. */
export async function exportarProgramaMuralPdf(params: {
  titulo: string
  subtitulo?: string
  club: string
  marca?: Marca
  mesasCount: number
  celdas: CeldaMuralPdf[]
  nombreArchivo: string
}) {
  const { nuevoDocumento, pieDePagina, tabla, nota, mezclar, TINTA } = await import('@/lib/pdf/papel')
  const marca = await marcaDe(params.club, params.marca)
  const { doc, autoTable, y } = await nuevoDocumento(marca, { titulo: params.titulo, subtitulo: params.subtitulo, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }, { apaisado: true })
  const mesas = Array.from({ length: Math.max(params.mesasCount, 1) }, (_, i) => i + 1)
  const horas = [...new Set(params.celdas.map(c => c.hora))].sort()
  const porCelda = new Map<string, CeldaMuralPdf>()
  for (const c of params.celdas) {
    if (c.tipo === 'especial') porCelda.set(`esp|${c.hora}`, c)
    else porCelda.set(`${c.mesa}|${c.hora}`, c)
  }

  if (!horas.length) {
    nota(doc, y, 'No hay partidos programados.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        conGrilla: true, tamano: 7, centradas: mesas.map((_, i) => i + 1), anchos: { 0: 16 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0) d.cell.styles.fontStyle = 'bold'
          const h = horas[d.row.index]
          if (porCelda.get(`esp|${h}`)) { d.cell.styles.fillColor = mezclar(marca.acento, 0.1); d.cell.styles.fontStyle = 'bold' }
        },
      }),
      startY: y,
      head: [['Hora', ...mesas.map(m => `Mesa ${m}`)]],
      body: horas.map(h => {
        const esp = porCelda.get(`esp|${h}`)
        if (esp) return [h, ...mesas.map((_, i) => (i === 0 ? esp.etiqueta : ''))]
        return [h, ...mesas.map(m => { const c = porCelda.get(`${m}|${h}`); return c ? (c.detalle ? `${c.etiqueta}\n${c.detalle}` : c.etiqueta) : '' })]
      }),
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, params.titulo)
  doc.save(params.nombreArchivo)
}
