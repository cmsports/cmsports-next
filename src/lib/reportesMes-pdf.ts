// PDF del reporte mensual del horario, sobre el molde v2 (lib/pdf/papel.ts):
// cifras del mes, horas por profesor (en barras), grupos con lo dictado y lo
// suspendido, y la bitácora día por día en su propia página.

import { diaLabel, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { diaDe, horas, type AsignacionProfesor, type DiaMes, type ReporteMes } from '@/lib/domain/reportesMes'
import {
  TINTA, GRIS, VERDE, AMBAR, AZUL,
  nuevoDocumento, portada, pieDePagina, asegurar, seccion, cifras, hallazgos, barras, tabla, trasTabla, nota, marcaDelClub, type Marca, type Tono,
} from '@/lib/pdf/papel'

type Args = {
  clubNombre: string
  marca?: Marca
  tituloMes: string
  r: ReporteMes
  dias: DiaMes[]
  asignaciones: AsignacionProfesor[]
  nombreProf: (id: string) => string
}

export async function descargarPdfReporteMes({ clubNombre, marca: marcaDada, tituloMes, r, dias, asignaciones, nombreProf }: Args) {
  const marca = marcaDada ?? await marcaDelClub({ nombre: clubNombre, logo_url: null })
  const gruposDelMes = r.grupos.filter(g => g.dictadas.length + g.suspendidas.length > 0)
  const cab = { titulo: 'Reporte de horario', subtitulo: tituloMes, nota: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  const { doc, autoTable, y: y0 } = await nuevoDocumento(marca, cab)
  let y = y0

  // ── Cifras del mes ───────────────────────────────────────────────────────
  const total = r.clasesDictadas + r.clasesSuspendidas
  y = cifras(doc, y, marca, [
    { etiqueta: 'Horas dictadas', valor: `${horas(r.minutosTotales)} h`, detalle: `${r.profesores.length} profesor${r.profesores.length === 1 ? '' : 'es'}` },
    { etiqueta: 'Clases dictadas', valor: String(r.clasesDictadas), detalle: total ? `${Math.round((r.clasesDictadas / total) * 100)}% de las programadas` : undefined, color: VERDE },
    { etiqueta: 'Sin dictar', valor: String(r.clasesSuspendidas), detalle: r.clasesSuspendidas ? 'suspendidas o feriados' : 'ninguna', color: r.clasesSuspendidas ? AMBAR : VERDE },
    { etiqueta: 'Grupos activos', valor: String(gruposDelMes.length), color: AZUL },
  ])

  // ── Hallazgos ────────────────────────────────────────────────────────────
  const lista: Array<{ texto: string; tono: Tono }> = []
  if (total) lista.push({ texto: `Se dictaron ${r.clasesDictadas} de ${total} clases programadas (${Math.round((r.clasesDictadas / total) * 100)}%).`, tono: r.clasesSuspendidas / total > 0.15 ? 'ojo' : 'bien' })
  const masSuspendido = [...gruposDelMes].sort((a, b) => b.suspendidas.length - a.suspendidas.length)[0]
  if (masSuspendido && masSuspendido.suspendidas.length >= 2) lista.push({ texto: `El grupo con más clases sin dictar fue ${masSuspendido.bloque.nombre} (${masSuspendido.suspendidas.length}).`, tono: 'ojo' })
  const masHoras = [...r.profesores].sort((a, b) => b.minutos - a.minutos)[0]
  if (masHoras && r.profesores.length > 1) lista.push({ texto: `${nombreProf(masHoras.profesorId)} concentró ${Math.round((masHoras.minutos / Math.max(1, r.minutosTotales)) * 100)}% de las horas dictadas.`, tono: 'info' })
  const llenos = gruposDelMes.filter(g => g.bloque.cupo_maximo && g.inscritos >= g.bloque.cupo_maximo)
  if (llenos.length) lista.push({ texto: `${llenos.length} grupo${llenos.length === 1 ? ' está' : 's están'} en su cupo máximo: ${llenos.slice(0, 3).map(g => g.bloque.nombre).join(', ')}${llenos.length > 3 ? '…' : ''}.`, tono: 'info' })
  if (lista.length) {
    y = seccion(doc, y, marca, 'Hallazgos del mes')
    y = hallazgos(doc, y, lista)
  }

  // ── Horas por profesor ───────────────────────────────────────────────────
  if (r.profesores.length > 0) {
    y = asegurar(doc, y, 20 + r.profesores.length * 7.2, marca, cab)
    y = seccion(doc, y, marca, 'Horas por profesor')
    y = barras(doc, y, marca, [...r.profesores].sort((a, b) => b.minutos - a.minutos).map(p => ({ etiqueta: nombreProf(p.profesorId) || '—', valor: p.minutos, texto: `${horas(p.minutos)} h` })), { anchoEtiqueta: 60 })
  }

  // ── Grupos: la vista útil para saber qué se dictó y qué no ───────────────
  y = asegurar(doc, y, 40, marca, cab)
  y = seccion(doc, y, marca, 'Grupos del mes', `${gruposDelMes.length} con actividad`)
  if (gruposDelMes.length === 0) {
    y = nota(doc, y, 'No hubo grupos con actividad este mes.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 8, numericas: [5, 6], centradas: [7], anchos: { 1: 20, 2: 24, 3: 22, 5: 16, 6: 16, 7: 18 },
        alParsear: d => {
          if (d.section !== 'body') return
          const g = gruposDelMes[d.row.index]
          if (d.column.index === 6 && g?.suspendidas.length) { d.cell.styles.textColor = AMBAR; d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 5) d.cell.styles.fontStyle = 'bold'
        },
      }),
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
      foot: [['Total', '', '', '', '', String(r.clasesDictadas), String(r.clasesSuspendidas), '']],
    })
    y = trasTabla(doc)
  }

  // ── Detalle día por día: la bitácora completa, en su propia página ───────
  doc.addPage()
  y = portada(doc, marca, { ...cab, titulo: 'Detalle diario' })

  const filasDia: string[][] = []
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

  y = seccion(doc, y, marca, 'Clase por clase', `${filasDia.length} registros`)
  if (filasDia.length === 0) {
    nota(doc, y, 'Sin clases registradas en el mes.')
  } else {
    autoTable(doc, {
      ...tabla(marca, {
        tamano: 7.5, numericas: [6], anchos: { 0: 20, 1: 18, 2: 22, 3: 22, 6: 14 },
        alParsear: d => {
          if (d.section !== 'body') return
          if (d.column.index === 0 || d.column.index === 1) d.cell.styles.textColor = GRIS
          if (d.column.index === 7) {
            const sinClase = String(d.cell.raw).startsWith('Sin clase')
            d.cell.styles.textColor = sinClase ? AMBAR : VERDE
            d.cell.styles.fontStyle = 'bold'
          }
        },
      }),
      startY: y,
      head: [['Fecha', 'Día', 'Sede', 'Hora', 'Grupo', 'Profesor(es)', 'Inscr.', 'Estado']],
      body: filasDia,
    })
  }

  doc.setTextColor(...TINTA)
  pieDePagina(doc, marca, `Reporte de horario · ${tituloMes}`)
  doc.save(`reporte_horario_${tituloMes.replace(/ /g, '_')}.pdf`)
}
