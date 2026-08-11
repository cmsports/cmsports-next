'use client'

import type { jsPDF } from 'jspdf'

type RGB = [number, number, number]

export type FilaPrograma = {
  hora: string
  mesa: number
  evento: string
  partido: string
  fase: string
  resultado?: string
}

export async function exportarProgramaOficialPdf(params: {
  titulo: string
  subtitulo?: string
  club: string
  filas: FilaPrograma[]
  nombreArchivo: string
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { encabezado, piePagina, estiloTabla, sinDatos, COLOR } = await import('@/lib/pdf/estilo')

  const doc = new jsPDF({ orientation: 'landscape' })
  let y = encabezado(doc, { club: params.club, titulo: params.titulo, subtitulo: params.subtitulo })

  if (!params.filas.length) {
    sinDatos(doc, y, 'No hay partidos programados')
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Hora', 'Mesa', 'Evento', 'Fase', 'Partido', 'Resultado']],
      body: params.filas.map(f => [f.hora, String(f.mesa), f.evento, f.fase, f.partido, f.resultado || '—']),
      ...estiloTabla(),
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 70 },
      },
    })
  }

  piePagina(doc, params.club)
  doc.save(params.nombreArchivo)
}

export async function exportarGruposOficialPdf(params: {
  titulo: string
  club: string
  grupos: Array<{
    nombre: string
    filas: Array<{ pos: number; nombre: string; pts: number; pg: number; pp: number }>
  }>
  nombreArchivo: string
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { encabezado, piePagina, estiloTabla, COLOR } = await import('@/lib/pdf/estilo')

  const doc = new jsPDF()
  let y = encabezado(doc, { club: params.club, titulo: params.titulo, subtitulo: 'Clasificación ITTF (2/1/0)' })

  for (const g of params.grupos) {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFontSize(11)
    doc.setTextColor(...(COLOR.primarioOs as RGB))
    doc.text(`Grupo ${g.nombre}`, 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['#', 'Jugador', 'Pts', 'PG', 'PP']],
      body: g.filas.map(r => [String(r.pos), r.nombre, String(r.pts), String(r.pg), String(r.pp)]),
      ...estiloTabla(),
      margin: { left: 14, right: 14 },
    })
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
    y += 10
  }

  piePagina(doc, params.club)
  doc.save(params.nombreArchivo)
}
