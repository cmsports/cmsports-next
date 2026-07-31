// PDF del reporte mensual del horario: resumen, detalle día por día (por
// sede) y grupos. Usa jspdf + jspdf-autotable (ya instalados en el proyecto,
// mismo patrón que src/app/reportes/page.tsx).

import { diaLabel, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { diaDe, horas, type AsignacionProfesor, type DiaMes, type ReporteMes } from '@/lib/domain/reportesMes'

const MORADO: [number, number, number] = [79, 70, 229]
const NARANJA: [number, number, number] = [194, 65, 12]

type Args = {
  clubNombre: string
  tituloMes: string
  r: ReporteMes
  dias: DiaMes[]
  asignaciones: AsignacionProfesor[]
  nombreProf: (id: string) => string
}

export async function descargarPdfReporteMes({ clubNombre, tituloMes, r, dias, asignaciones, nombreProf }: Args) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(...MORADO); doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text(clubNombre || 'CmSports', 14, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
  doc.text(`Reporte de horario — ${tituloMes}`, 14, 22)
  doc.setFontSize(9)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - 14, 22, { align: 'right' })

  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)

  let y = 38
  doc.setTextColor(40, 40, 40); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Resumen', 14, y); y += 6
  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Valor']],
    body: [
      ['Horas dictadas', horas(r.minutosTotales) + ' h'],
      ['Clases dictadas', String(r.clasesDictadas)],
      ['Clases sin dictar', String(r.clasesSuspendidas)],
      ['Grupos del mes', String(gruposDelMes.length)],
      ...r.profesores.map(p => [nombreProf(p.profesorId), horas(p.minutos) + ' h']),
    ],
    theme: 'striped', headStyles: { fillColor: MORADO }, margin: { left: 14, right: 14 },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Detalle por día', 14, y); y += 6
  const filasDia: any[] = []
  for (const d of dias) {
    for (const s of d.sedes) {
      for (const c of s.clases) {
        filasDia.push([d.fecha, diaLabel(diaDe(d.fecha)), sedeLabel(s.sede), rangoHorario(c.bloque.hora_inicio, c.bloque.hora_fin), c.bloque.nombre, c.profesorIds.map(nombreProf).filter(Boolean).join(' + ') || '—', String(c.inscritos), 'Dictada'])
      }
      for (const sus of s.suspendidas) {
        filasDia.push([d.fecha, diaLabel(diaDe(d.fecha)), sedeLabel(s.sede), rangoHorario(sus.bloque.hora_inicio, sus.bloque.hora_fin), sus.bloque.nombre, '—', '—', 'Sin clase — ' + sus.motivo])
      }
    }
  }
  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Día', 'Sede', 'Hora', 'Grupo', 'Profesor(es)', 'Inscr.', 'Estado']],
    body: filasDia,
    theme: 'grid', headStyles: { fillColor: MORADO }, styles: { fontSize: 8 }, margin: { left: 14, right: 14 },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && String(hookData.row.raw[7]).startsWith('Sin clase')) {
        hookData.cell.styles.textColor = NARANJA
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Grupos', 14, y); y += 6
  autoTable(doc, {
    startY: y,
    head: [['Grupo', 'Día', 'Horario', 'Sede', 'Profesor(es)', 'Dictadas', 'Sin clase', 'Inscritos']],
    body: gruposDelMes.map(g => {
      const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
      return [g.bloque.nombre, diaLabel(g.bloque.dia_semana), rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin), sedeLabel(g.bloque.sede), profes.map(nombreProf).filter(Boolean).join(' + ') || '—', String(g.dictadas.length), String(g.suspendidas.length), `${g.inscritos}/${g.bloque.cupo_maximo}`]
    }),
    theme: 'striped', headStyles: { fillColor: MORADO }, styles: { fontSize: 9 }, margin: { left: 14, right: 14 },
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9); doc.setTextColor(150)
    doc.text(`${clubNombre || 'CmSports'} — Reporte de horario — ${tituloMes} — Página ${i} de ${pageCount}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
  }

  doc.save(`reporte_horario_${tituloMes.replace(/ /g, '_')}.pdf`)
}
