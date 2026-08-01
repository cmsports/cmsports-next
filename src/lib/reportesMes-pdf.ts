// PDF del reporte mensual del horario: resumen, detalle día por día (por
// sede) y grupos. Usa jspdf + jspdf-autotable (ya instalados en el proyecto,
// mismo patrón que src/app/reportes/page.tsx).

import { diaLabel, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { diaDe, horas, type AsignacionProfesor, type DiaMes, type ReporteMes } from '@/lib/domain/reportesMes'
import { COLOR, encabezado, piePagina, filaTarjetas, tituloSeccion, sinDatos, estiloTabla } from '@/lib/pdf/estilo'

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
  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)

  let y = encabezado(doc, {
    club: clubNombre, titulo: 'Reporte de horario', subtitulo: `${tituloMes}  ·  Generado el ${new Date().toLocaleDateString('es-CL')}`,
  })

  // ── Resumen: lo primero que se lee, en tarjetas grandes ──────────────────
  y = filaTarjetas(doc, y, [
    { valor: `${horas(r.minutosTotales)} h`, etiqueta: 'Horas dictadas', color: COLOR.primario },
    { valor: String(r.clasesDictadas), etiqueta: 'Clases dictadas', color: COLOR.verde },
    { valor: String(r.clasesSuspendidas), etiqueta: 'Clases sin dictar', color: COLOR.ambar },
    { valor: String(gruposDelMes.length), etiqueta: 'Grupos activos', color: COLOR.primario },
  ])

  if (r.profesores.length > 0) {
    y = tituloSeccion(doc, y, 'Horas por profesor')
    autoTable(doc, {
      startY: y,
      head: [['Profesor', 'Horas dictadas']],
      body: r.profesores.map(p => [nombreProf(p.profesorId), `${horas(p.minutos)} h`]),
      ...estiloTabla(),
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Grupos: la vista útil para saber qué se dictó y qué no, agrupado ─────
  // (va ANTES que el detalle día por día — es el resumen operativo; el
  // detalle día por día es la bitácora exhaustiva, para quien la necesite).
  y = tituloSeccion(doc, y, 'Grupos del mes')
  if (gruposDelMes.length === 0) {
    y = sinDatos(doc, y, 'No hubo grupos con actividad este mes.')
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Grupo', 'Día', 'Horario', 'Sede', 'Profesor(es)', 'Dictadas', 'Sin clase', 'Inscritos']],
      body: gruposDelMes.map(g => {
        const profes = [...new Set(asignaciones.filter(a => a.bloque_id === g.bloque.id).map(a => a.profesor_id))]
        return [
          g.bloque.nombre, diaLabel(g.bloque.dia_semana), rangoHorario(g.bloque.hora_inicio, g.bloque.hora_fin),
          sedeLabel(g.bloque.sede), profes.map(nombreProf).filter(Boolean).join(' + ') || '—',
          String(g.dictadas.length), String(g.suspendidas.length), `${g.inscritos}/${g.bloque.cupo_maximo}`,
        ]
      }),
      ...estiloTabla(),
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Detalle día por día: la bitácora completa, en su propia página ───────
  doc.addPage()
  y = encabezado(doc, { club: clubNombre, titulo: 'Reporte de horario — Detalle diario', subtitulo: tituloMes })

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

  if (filasDia.length === 0) {
    sinDatos(doc, y)
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Día', 'Sede', 'Hora', 'Grupo', 'Profesor(es)', 'Inscr.', 'Estado']],
      body: filasDia,
      ...estiloTabla(),
      styles: { ...estiloTabla().styles, fontSize: 7.5 },
      didParseCell: (hookData: any) => {
        if (hookData.section === 'body' && String(hookData.row.raw[7]).startsWith('Sin clase')) {
          hookData.cell.styles.textColor = COLOR.ambar
        }
      },
    })
  }

  piePagina(doc, `${clubNombre || 'CmSports'} · Reporte de horario · ${tituloMes}`)
  doc.save(`reporte_horario_${tituloMes.replace(/ /g, '_')}.pdf`)
}
