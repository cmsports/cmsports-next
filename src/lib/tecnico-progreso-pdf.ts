import {
  COLOR,
  MARGEN,
  encabezado,
  estiloTabla,
  filaTarjetas,
  piePagina,
  sinDatos,
  tituloSeccion,
} from '@/lib/pdf/estilo'

type SesionPdf = {
  fecha: string
  titulo: string
  tipo: string
  estado: string
  rival_nombre: string | null
  marcador: string | null
}

type EvaluacionPdf = {
  fecha: string
  estado: string
  resumen: string | null
  items: { codigo: string; nombre: string; estado: string }[]
}

type Args = {
  clubNombre: string
  jugadorNombre: string
  categoria: string | null
  stats: {
    sesiones: number
    eventos: number
    efectividad: number
    evaluaciones: number
    objetivosLogrados: number
    objetivosTotal: number
  }
  sesiones: SesionPdf[]
  evaluaciones: EvaluacionPdf[]
}

const TIPO_LABEL: Record<string, string> = {
  analisis_video: 'Video libre',
  entrenamiento: 'Entrenamiento',
  competencia: 'Partido',
  evaluacion: 'Evaluación',
}

export async function exportarProgresoTecnicoPdf(args: Args) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = encabezado(doc, {
    club: args.clubNombre || 'CmSports',
    titulo: 'Progreso técnico del jugador',
    subtitulo: args.jugadorNombre,
  })

  doc.setTextColor(...COLOR.mutado)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(args.categoria || 'Sin categoría', MARGEN, y)
  y += 8

  y = filaTarjetas(doc, y, [
    { valor: String(args.stats.sesiones), etiqueta: 'Sesiones', color: COLOR.primario },
    { valor: String(args.stats.eventos), etiqueta: 'Eventos', color: COLOR.celeste },
    { valor: `${args.stats.efectividad}%`, etiqueta: 'Efectividad', color: COLOR.verde },
    { valor: `${args.stats.objetivosLogrados}/${args.stats.objetivosTotal}`, etiqueta: 'Objetivos', color: COLOR.ambar },
  ])

  y = tituloSeccion(doc, y, 'Sesiones')
  if (!args.sesiones.length) {
    y = sinDatos(doc, y)
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Título', 'Tipo', 'Estado', 'Detalle']],
      body: args.sesiones.map(s => [
        s.fecha,
        s.titulo,
        TIPO_LABEL[s.tipo] || s.tipo,
        s.estado,
        [s.rival_nombre ? `vs ${s.rival_nombre}` : null, s.marcador].filter(Boolean).join(' · ') || '—',
      ]),
      ...estiloTabla(),
    })
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  }

  if (y > 230) {
    doc.addPage()
    y = 20
  }

  y = tituloSeccion(doc, y, 'Evaluaciones')
  if (!args.evaluaciones.length) {
    sinDatos(doc, y)
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Estado', 'Resumen', 'Objetivos']],
      body: args.evaluaciones.map(eva => [
        eva.fecha,
        eva.estado,
        eva.resumen || '—',
        eva.items.map(i => `${i.codigo}:${i.estado.replaceAll('_', ' ')}`).join(', ') || '—',
      ]),
      ...estiloTabla(COLOR.verde),
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 24 },
        2: { cellWidth: 60 },
      },
    })
  }

  piePagina(doc, `CmSports · progreso técnico · ${args.jugadorNombre}`)
  doc.save(`progreso_tecnico_${args.jugadorNombre.replace(/\s+/g, '_')}.pdf`)
}
