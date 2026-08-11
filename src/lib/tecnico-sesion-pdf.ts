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

type EventoPdf = {
  timestamp_ms: number
  golpe_codigo: string
  zona_mesa: number | null
  resultado: string
  notas: string | null
}

type ItemEvalPdf = {
  codigo: string
  nombre: string
  estado: string
  comentario: string
}

type Args = {
  clubNombre: string
  sesion: {
    titulo: string
    fecha: string
    tipo: string
    estado: string
    jugadorNombre: string
    rival: string | null
    competencia: string | null
    marcador: string | null
  }
  resumen: string
  items: ItemEvalPdf[]
  eventos: EventoPdf[]
  stats: {
    total: number
    ganados: number
    perdidos: number
    efectividad: number
  }
}

function formatoTiempo(ms: number) {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const TIPO_LABEL: Record<string, string> = {
  analisis_video: 'Video libre',
  entrenamiento: 'Entrenamiento',
  competencia: 'Competencia',
  evaluacion: 'Evaluación',
}

export async function exportarSesionTecnicaPdf(args: Args) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  let y = encabezado(doc, {
    club: args.clubNombre || 'CmSports',
    titulo: 'Informe técnico de sesión',
    subtitulo: args.sesion.fecha,
  })

  doc.setTextColor(...COLOR.texto)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(args.sesion.titulo, MARGEN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLOR.mutado)
  const meta = [
    args.sesion.jugadorNombre,
    TIPO_LABEL[args.sesion.tipo] || args.sesion.tipo,
    args.sesion.estado,
    args.sesion.rival ? `vs ${args.sesion.rival}` : null,
    args.sesion.marcador,
    args.sesion.competencia,
  ].filter(Boolean).join(' · ')
  doc.text(meta, MARGEN, y)
  y += 10

  y = filaTarjetas(doc, y, [
    { valor: String(args.stats.total), etiqueta: 'Eventos', color: COLOR.primario },
    { valor: String(args.stats.ganados), etiqueta: 'Ganados', color: COLOR.verde },
    { valor: String(args.stats.perdidos), etiqueta: 'Perdidos', color: COLOR.rojo },
    { valor: `${args.stats.efectividad}%`, etiqueta: 'Efectividad', color: COLOR.celeste },
  ])

  if (args.resumen.trim()) {
    y = tituloSeccion(doc, y, 'Resumen del profesor')
    doc.setTextColor(...COLOR.texto)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lineas = doc.splitTextToSize(args.resumen.trim(), doc.internal.pageSize.getWidth() - 2 * MARGEN)
    doc.text(lineas, MARGEN, y)
    y += lineas.length * 4.2 + 8
  }

  y = tituloSeccion(doc, y, 'Objetivos evaluados')
  if (!args.items.length) {
    y = sinDatos(doc, y, 'Sin evaluación registrada en esta sesión.')
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Código', 'Objetivo', 'Estado', 'Comentario']],
      body: args.items.map(item => [
        item.codigo,
        item.nombre,
        item.estado.replaceAll('_', ' '),
        item.comentario || '—',
      ]),
      ...estiloTabla(),
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50 },
        2: { cellWidth: 28 },
      },
    })
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  }

  if (y > 240) {
    doc.addPage()
    y = 20
  }

  y = tituloSeccion(doc, y, 'Eventos etiquetados')
  if (!args.eventos.length) {
    y = sinDatos(doc, y, 'Sin eventos registrados.')
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Tiempo', 'Golpe', 'Zona', 'Resultado', 'Notas']],
      body: args.eventos.map(evento => [
        formatoTiempo(evento.timestamp_ms),
        evento.golpe_codigo,
        evento.zona_mesa == null ? '—' : String(evento.zona_mesa),
        evento.resultado.replaceAll('_', ' '),
        evento.notas || '—',
      ]),
      ...estiloTabla(COLOR.celeste),
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 18 },
        2: { cellWidth: 16 },
        3: { cellWidth: 30 },
      },
    })
  }

  piePagina(doc, `CmSports · informe técnico · ${args.sesion.jugadorNombre}`)
  const nombre = `informe_tecnico_${args.sesion.jugadorNombre.replace(/\s+/g, '_')}_${args.sesion.fecha}.pdf`
  doc.save(nombre)
}
