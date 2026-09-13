// Informe del jugador, versión 2 — el papel que se le entrega al apoderado
// (o al propio jugador adulto).
//
// Responde tres preguntas, en este orden:
//   1. ¿Está viniendo?      → asistencia del período con calendario real
//                             (días de clase, asistió, faltó) y porcentaje
//   2. ¿Está al día?        → estado de pago y las últimas cuotas
//   3. ¿Cómo le está yendo? → puesto en el ranking y torneos, si los tiene
//
// Y al final los datos de la ficha, para verificar. No lleva derrotas ni
// contadores internos: eso es del sistema, no del apoderado.

import type { Marca } from '@/lib/pdf/papel'
import {
  MARGEN, TINTA, TEXTO, GRIS, GRIS_CLARO, LINEA, FONDO, BLANCO, VERDE, ROJO, AMBAR, AZUL,
  prepararFuentes, portada, pieDePagina, asegurar, seccion, cifras, tabla, mezclar, pesos, nota, anillo, colorDePorcentaje, retrato,
} from '@/lib/pdf/papel'
import { cargarLogoPdf, type LogoPdf } from '@/lib/pdf/estilo'

export interface DatosJugador {
  nombre: string
  categoria?: string | null
  estado?: string | null
  esExterno?: boolean
  edad?: number | null
  rut?: string | null
  telefono?: string | null
  email?: string | null
  fechaNacimiento?: string | null
  fotoUrl?: string | null
  plan?: { tipo?: string | null; mensualidad?: number | null; horario?: string | null; dias?: string[]; entrenamientosSemana?: number | null } | null
  contactoEmergencia?: { nombre?: string | null; telefono?: string | null } | null
  /** Ventana del calendario (ISO) y qué pasó cada día. */
  asistencia: {
    desde: string
    hasta: string
    asistio: Set<string>
    /** Días de la semana con clase (0 = domingo … 6 = sábado). Si no se sabe, vacío. */
    diasDeClase: number[]
    /** Días de clase que ya pasaron y no hubo registro (no cuentan como falta). */
    sinRegistro?: Set<string>
  }
  mensualidades: Array<{ mes: number; anio: number; monto: number; estado: string; fecha_pago?: string | null }>
  rankings?: Array<{ categoria: string; rank: number; total: number; pts: number; victorias: number; jugados: number }>
  torneos?: Array<{ nombre: string; fecha?: string | null; estado?: string | null }>
  ligas?: Array<{ liga: string; division: string }>
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_CORTO = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}
function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fuente(doc: any, peso: 'normal' | 'semibold' | 'bold', tam: number, color: number[]) {
  const lista = doc.getFontList?.() ?? {}
  doc.setFont(lista.Inter ? 'Inter' : 'helvetica', lista.Inter ? peso : (peso === 'normal' ? 'normal' : 'bold'))
  doc.setFontSize(tam)
  doc.setTextColor(color[0], color[1], color[2])
}

/**
 * Calendario de asistencia: semanas en columnas, lunes a domingo en filas
 * (como un calendario de bolsillo). Verde: asistió. Rojo suave: tenía clase y
 * no vino. Gris: sin clase. Con el nombre del mes arriba de cada bloque, para
 * que un apoderado pueda decir "el 14 faltó".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calendario(doc: any, y: number, a: DatosJugador['asistencia'], marca: Marca): { y: number; clases: number; asistidas: number; faltas: number } {
  const W = doc.internal.pageSize.getWidth()
  // Arranca en el lunes de la semana de `desde`.
  const dow = (diaSemana(a.desde) + 6) % 7 // 0 = lunes
  const inicio = sumarDias(a.desde, -dow)
  const dias: string[] = []
  for (let d = inicio; d <= a.hasta; d = sumarDias(d, 1)) dias.push(d)
  const semanas = Math.ceil(dias.length / 7)
  const disponible = W - 2 * MARGEN - 10
  const celda = Math.min(6.2, Math.floor((disponible / semanas) * 10) / 10)
  const gap = 1
  const x0 = MARGEN + 10
  const y0 = y + 6

  // Etiquetas de día a la izquierda.
  fuente(doc, 'normal', 6.5, GRIS_CLARO)
  for (let f = 0; f < 7; f++) doc.text(DIAS_CORTO[f], MARGEN + 4, y0 + f * (celda + gap) + celda * 0.72, { align: 'center' })

  let clases = 0, asistidas = 0, faltas = 0
  let mesAnterior = ''
  const hoyLimite = a.hasta
  dias.forEach((iso, i) => {
    const col = Math.floor(i / 7), fila = i % 7
    const x = x0 + col * (celda + gap), yy = y0 + fila * (celda + gap)
    const enRango = iso >= a.desde && iso <= hoyLimite
    const mes = iso.slice(0, 7)
    if (fila === 0 && mes !== mesAnterior && (iso.slice(8, 10) <= '07' || i === 0)) {
      fuente(doc, 'semibold', 6.5, GRIS)
      doc.text(MESES_CORTO[Number(iso.slice(5, 7)) - 1], x, y0 - 1.5)
      mesAnterior = mes
    }
    if (!enRango) { doc.setFillColor(...BLANCO); return }
    const esClase = a.diasDeClase.length ? a.diasDeClase.includes(diaSemana(iso)) : true
    const vino = a.asistio.has(iso)
    let color = FONDO
    if (vino) { color = VERDE; asistidas++; if (esClase) clases++ }
    else if (esClase && !a.sinRegistro?.has(iso)) { color = mezclar(ROJO, 0.25); clases++; faltas++ }
    else if (esClase) { color = mezclar(AMBAR, 0.25); clases++ }
    doc.setFillColor(...color); doc.setDrawColor(...color)
    doc.roundedRect(x, yy, celda, celda, 1, 1, 'F')
  })
  const yFin = y0 + 7 * (celda + gap) + 4
  // Leyenda
  const leyenda: Array<[string, number[]]> = [['Asistió', VERDE], ['Faltó', mezclar(ROJO, 0.25)], ['Sin clase', FONDO]]
  if (a.sinRegistro?.size) leyenda.splice(2, 0, ['Sin registro', mezclar(AMBAR, 0.25)])
  let lx = x0
  for (const [texto, color] of leyenda) {
    doc.setFillColor(color[0], color[1], color[2]); doc.setDrawColor(color[0], color[1], color[2])
    doc.roundedRect(lx, yFin, 3, 3, 0.7, 0.7, 'F')
    fuente(doc, 'normal', 7.5, GRIS)
    doc.text(texto, lx + 4.5, yFin + 2.5)
    lx += 4.5 + doc.getTextWidth(texto) + 7
  }
  return { y: yFin + 9, clases, asistidas, faltas }
}

export interface ArgsJugador {
  marca: Marca
  jugador: DatosJugador
  generado: string
  /** Etiqueta del período del calendario: "últimos 90 días", "Septiembre 2026". */
  periodo: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function construirReporteJugador(args: ArgsJugador): Promise<any> {
  const { marca, jugador: j } = args
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF()
  await prepararFuentes(doc)
  const W = doc.internal.pageSize.getWidth()

  const etiquetas = [j.categoria, j.estado === 'activo' ? 'Activo' : j.estado ? j.estado.charAt(0).toUpperCase() + j.estado.slice(1) : null, j.esExterno ? 'Externo' : null, j.edad ? `${j.edad} años` : null].filter(Boolean).join('  ·  ')
  const cab = { titulo: j.nombre, subtitulo: etiquetas, nota: `Informe del jugador · ${args.generado}` }
  let y = portada(doc, marca, cab)

  // La foto, a la derecha del encabezado, en círculo.
  const foto: LogoPdf | null = await cargarLogoPdf(j.fotoUrl)
  if (foto) retrato(doc, W - MARGEN - 12, 26, 12, j.nombre, foto, marca.acento)

  // ── 1. Asistencia ────────────────────────────────────────────────────────
  y = seccion(doc, y, marca, 'Asistencia', args.periodo)
  const cal = calendario(doc, y, j.asistencia, marca)
  const pct = cal.clases ? Math.round((cal.asistidas / cal.clases) * 100) : (cal.asistidas ? 100 : 0)
  y = cal.y
  // Anillo + lectura en palabras.
  const r = 11
  anillo(doc, MARGEN + r + 2, y + r, r, pct, colorDePorcentaje(pct))
  fuente(doc, 'bold', 12, TINTA)
  const lectura = cal.clases
    ? `Asistió a ${cal.asistidas} de ${cal.clases} clases`
    : `${cal.asistidas} asistencia${cal.asistidas === 1 ? '' : 's'} en el período`
  doc.text(lectura, MARGEN + r * 2 + 10, y + r - 1)
  fuente(doc, 'normal', 9, GRIS)
  const detalle = cal.faltas ? `${cal.faltas} ${cal.faltas === 1 ? 'clase sin asistir' : 'clases sin asistir'}` : cal.clases ? 'sin inasistencias' : ''
  const juicio = pct >= 85 ? 'Asistencia muy buena.' : pct >= 70 ? 'Asistencia regular.' : cal.clases ? 'Asistencia baja: conviene conversarlo.' : ''
  doc.text([detalle, juicio].filter(Boolean).join('  ·  '), MARGEN + r * 2 + 10, y + r + 5)
  y += r * 2 + 12

  // ── 2. Pagos ─────────────────────────────────────────────────────────────
  const pendientes = j.mensualidades.filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
  const deuda = pendientes.reduce((s, m) => s + (m.monto || 0), 0)
  y = asegurar(doc, y, 50, marca, cab)
  y = seccion(doc, y, marca, 'Pagos', j.plan?.mensualidad ? `mensualidad ${pesos(j.plan.mensualidad)}` : undefined)
  y = cifras(doc, y, marca, [
    deuda > 0
      ? { etiqueta: 'Estado', valor: 'Pendiente', detalle: `${pesos(deuda)} en ${pendientes.length} cuota${pendientes.length === 1 ? '' : 's'}`, color: ROJO }
      : { etiqueta: 'Estado', valor: 'Al día', detalle: j.mensualidades.length ? 'sin cuotas pendientes' : 'sin cuotas emitidas', color: VERDE },
    j.plan?.tipo ? { etiqueta: 'Plan', valor: j.plan.tipo.charAt(0).toUpperCase() + j.plan.tipo.slice(1), detalle: j.plan.entrenamientosSemana ? `${j.plan.entrenamientosSemana} entrenamientos por semana` : undefined, color: AZUL } : { etiqueta: '', valor: '—' },
    j.plan?.horario ? { etiqueta: 'Horario', valor: j.plan.horario, detalle: j.plan.dias?.length ? j.plan.dias.join(' · ') : undefined, color: marca.acento } : { etiqueta: '', valor: '—' },
  ])
  if (j.mensualidades.length) {
    const ultimas = [...j.mensualidades].sort((a, b) => (b.anio * 100 + b.mes) - (a.anio * 100 + a.mes)).slice(0, 6)
    const colorEstado = (e: string) => e === 'pagado' ? VERDE : e === 'atrasado' ? ROJO : e === 'exento' ? GRIS : AMBAR
    const textoEstado = (e: string) => e === 'pagado' ? 'Pagado' : e === 'atrasado' ? 'Atrasado' : e === 'exento' ? 'Exento' : 'Pendiente'
    autoTable(doc, {
      ...tabla(marca, { numericas: [1], anchos: { 0: 50, 1: 30, 2: 34 } }),
      startY: y,
      head: [['Mes', 'Monto', 'Estado', 'Fecha de pago']],
      body: ultimas.map(m => [`${MESES[m.mes - 1].charAt(0).toUpperCase() + MESES[m.mes - 1].slice(1)} ${m.anio}`, pesos(m.monto || 0), textoEstado(m.estado), fechaCorta(m.fecha_pago)]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.section === 'head' && data.column.index === 1) data.cell.styles.halign = 'right'
        if (data.section === 'body' && data.column.index === 2) {
          data.cell.styles.textColor = colorEstado(ultimas[data.row.index].estado)
          data.cell.styles.fontStyle = 'bold'
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didDrawCell: (data: any) => {
        if (data.section !== 'head') return
        const c = data.cell
        data.doc.setDrawColor(...marca.acento); data.doc.setLineWidth(0.5)
        data.doc.line(c.x, c.y + c.height, c.x + c.width, c.y + c.height)
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8
  }

  // ── 3. Competencia ───────────────────────────────────────────────────────
  const rankings = j.rankings ?? []
  const torneos = j.torneos ?? []
  const ligas = j.ligas ?? []
  if (rankings.length || torneos.length || ligas.length) {
    y = asegurar(doc, y, 40, marca, cab)
    y = seccion(doc, y, marca, 'Competencia')
    if (rankings.length) {
      y = cifras(doc, y, marca, rankings.slice(0, 3).map(rk => ({
        etiqueta: `Ranking ${rk.categoria}`,
        valor: `#${rk.rank} de ${rk.total}`,
        detalle: `${rk.pts} puntos · ${rk.victorias} de ${rk.jugados} partidos ganados`,
        color: rk.rank === 1 ? AMBAR : marca.acento,
      })))
    }
    if (torneos.length || ligas.length) {
      const filas = [
        ...torneos.map(t => ['Torneo', t.nombre, fechaCorta(t.fecha), t.estado ? t.estado.charAt(0).toUpperCase() + t.estado.slice(1) : '—']),
        ...ligas.map(l => ['Liga', `${l.liga} · ${l.division}`, '—', 'En curso']),
      ]
      autoTable(doc, {
        ...tabla(marca, { anchos: { 0: 22, 2: 28, 3: 28 } }),
        startY: y,
        head: [['', 'Competencia', 'Fecha', 'Estado']],
        body: filas,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 8
    }
  }

  // ── 4. Ficha ─────────────────────────────────────────────────────────────
  const pares: Array<[string, string]> = []
  if (j.rut) pares.push(['RUT', j.rut])
  if (j.fechaNacimiento) pares.push(['Nacimiento', fechaLarga(j.fechaNacimiento)])
  if (j.telefono) pares.push(['Teléfono', j.telefono])
  if (j.email) pares.push(['Correo', j.email])
  if (j.contactoEmergencia?.nombre) pares.push(['Contacto de emergencia', `${j.contactoEmergencia.nombre}${j.contactoEmergencia.telefono ? ` · ${j.contactoEmergencia.telefono}` : ''}`])
  if (pares.length) {
    y = asegurar(doc, y, 12 + pares.length * 6, marca, cab)
    y = seccion(doc, y, marca, 'Datos de la ficha')
    const mitad = (W - 2 * MARGEN) / 2
    pares.forEach((par, i) => {
      const x = MARGEN + (i % 2) * mitad
      const yy = y + Math.floor(i / 2) * 9
      fuente(doc, 'semibold', 7, GRIS)
      doc.text(par[0].toUpperCase(), x, yy, { charSpace: 0.3 })
      fuente(doc, 'normal', 9.5, TEXTO)
      doc.text(par[1], x, yy + 4.5)
    })
    y += Math.ceil(pares.length / 2) * 9 + 4
  }

  y = nota(doc, y, 'Informe generado por CmSports. La asistencia se cuenta sobre los días de clase del jugador; los días sin clase no se consideran.')
  doc.setDrawColor(...LINEA)
  pieDePagina(doc, marca, `Informe del jugador · ${j.nombre}`)
  return doc
}

export async function descargarReporteJugador(args: ArgsJugador) {
  const doc = await construirReporteJugador(args)
  doc.save(`Informe — ${args.jugador.nombre} — ${args.generado}.pdf`)
}
