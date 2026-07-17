'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const catLabel: Record<string, string> = {
  mensualidad:'Mensualidad', inscripcion_torneo:'Inscripción torneo',
  arriendo_cancha:'Arriendo cancha', donacion:'Donación', otro_ingreso:'Otro ingreso',
  sueldo_profesor:'Sueldo profesor', sueldo_staff:'Sueldo staff',
  material_deportivo:'Material deportivo', servicios_basicos:'Servicios básicos',
  mantenimiento:'Mantenimiento', otro_gasto:'Otro gasto'
}

type TipoReporte = 'mensual' | 'trimestral' | 'semestral' | 'anual'
type CategoriaReporte = 'general' | 'jugador' | 'finanzas' | 'asistencia' | 'torneos'

const categoriasReporte: { key: CategoriaReporte; label: string; desc: string; icon: string }[] = [
  { key: 'general', label: 'General', desc: 'Resumen completo del club', icon: '📊' },
  { key: 'jugador', label: 'Jugador', desc: 'Info detallada de un jugador', icon: '🏓' },
  { key: 'finanzas', label: 'Finanzas', desc: 'Ingresos, gastos y mensualidades', icon: '💰' },
  { key: 'asistencia', label: 'Asistencia', desc: 'Asistencia general y tendencias', icon: '📋' },
  { key: 'torneos', label: 'Torneos y Ligas', desc: 'Competencias y sus finanzas', icon: '🏆' },
]

export default function ReportesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [categoria, setCategoria] = useState<CategoriaReporte>('general')
  const [tipo, setTipo] = useState<TipoReporte>('mensual')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [semestre, setSemestre] = useState(new Date().getMonth() < 6 ? 1 : 2)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [jugadorId, setJugadorId] = useState<string>('')
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol !== 'admin') { router.push('/dashboard'); return }
    let vigente = true
    supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', perfil.club_id).order('nombre').then(({ data }) => {
      if (!vigente) return
      setJugadores(data || [])
      setLoading(false)
    })
    return () => { vigente = false }
  }, [authLoading, perfil, router])

  function getRango(): { inicio: string, fin: string, titulo: string } {
    if (tipo === 'mensual') {
      const ultimoDia = new Date(anio, mes, 0).getDate()
      return { inicio: `${anio}-${String(mes).padStart(2,'0')}-01`, fin: `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo: `${mesesN[mes-1]} ${anio}` }
    }
    if (tipo === 'trimestral') {
      const mesInicio = (trimestre - 1) * 3 + 1, mesFin = trimestre * 3
      const ultimoDia = new Date(anio, mesFin, 0).getDate()
      return { inicio: `${anio}-${String(mesInicio).padStart(2,'0')}-01`, fin: `${anio}-${String(mesFin).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo: `Q${trimestre} ${anio} (${mesesN[mesInicio-1]} - ${mesesN[mesFin-1]})` }
    }
    if (tipo === 'semestral') {
      const mesInicio = semestre === 1 ? 1 : 7, mesFin = semestre === 1 ? 6 : 12
      const ultimoDia = new Date(anio, mesFin, 0).getDate()
      return { inicio: `${anio}-${String(mesInicio).padStart(2,'0')}-01`, fin: `${anio}-${String(mesFin).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo: `${semestre === 1 ? '1er' : '2do'} Semestre ${anio}` }
    }
    return { inicio: `${anio}-01-01`, fin: `${anio}-12-31`, titulo: `Año ${anio}` }
  }

  async function cargarDatosGeneral() {
    const { inicio, fin } = getRango()
    const [{ data: jug }, { data: mov }, { data: asist }, { data: torn }, { data: mens }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', clubId),
      supabase.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
      supabase.from('asistencia').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('torneos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
      supabase.from('mensualidades').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin)
    ])
    const activos = (jug || []).filter(j => j.estado === 'activo')
    const ingresos = (mov || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = (mov || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    const desgloseIngresos: Record<string, number> = {}, desgloseGastos: Record<string, number> = {}
    ;(mov || []).forEach(m => {
      if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
      else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
    })
    const asistPorDia: Record<string, number> = {}
    ;(asist || []).forEach(a => { asistPorDia[a.fecha] = (asistPorDia[a.fecha] || 0) + 1 })
    const diasConAsist = Object.keys(asistPorDia).length
    const promedioAsist = diasConAsist > 0 ? Math.round((asist || []).length / diasConAsist) : 0
    const mensMap = new Map((mens || []).map(m => [m.jugador_id, m]))
    const morosos = activos.filter(j => { const m = mensMap.get(j.id); return m?.estado === 'pendiente' || m?.estado === 'atrasado' })
    return { jugadores: jug || [], activos, movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos, asistencias: asist || [], promedioAsist, torneos: torn || [], morosos, mensualidades: mens || [] }
  }

  async function cargarDatosJugador() {
    if (!jugadorId) return null
    const { inicio, fin } = getRango()
    const [{ data: jugador }, { data: mens }, { data: asist }, { data: torneoJug }, { data: ligaJug }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('id', jugadorId).single(),
      supabase.from('mensualidades').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
      supabase.from('asistencia').select('*').eq('jugador_id', jugadorId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
      supabase.from('torneo_jugadores').select('*, torneos(*)').eq('jugador_id', jugadorId),
      supabase.from('liga_division_jugadores').select('*, liga_divisiones(*, ligas(*))').eq('jugador_id', jugadorId),
    ])
    const mensPeriodo = (mens || []).filter(m => m.fecha >= inicio && m.fecha <= fin)
    const pagadas = mensPeriodo.filter(m => m.estado === 'pagado')
    const pendientes = mensPeriodo.filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const totalPagado = pagadas.reduce((s, m) => s + (m.monto || 0), 0)
    const totalPendiente = pendientes.reduce((s, m) => s + (m.monto || 0), 0)
    return { jugador, mensualidades: mens || [], mensPeriodo, pagadas, pendientes, totalPagado, totalPendiente, asistencias: asist || [], torneos: torneoJug || [], ligas: ligaJug || [] }
  }

  async function cargarDatosFinanzas() {
    const { inicio, fin } = getRango()
    const [{ data: mov }, { data: mens }, { data: jug }] = await Promise.all([
      supabase.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
      supabase.from('mensualidades').select('*, jugadores(nombre,categoria)').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('jugadores').select('id,nombre,estado').eq('club_id', clubId).eq('estado', 'activo')
    ])
    const ingresos = (mov || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = (mov || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
    const desgloseIngresos: Record<string, number> = {}, desgloseGastos: Record<string, number> = {}
    ;(mov || []).forEach(m => {
      if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
      else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
    })
    const pagadas = (mens || []).filter(m => m.estado === 'pagado')
    const pendientes = (mens || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const totalMensPagado = pagadas.reduce((s, m) => s + (m.monto || 0), 0)
    const totalMensPendiente = pendientes.reduce((s, m) => s + (m.monto || 0), 0)
    const porMes: Record<string, { ingresos: number; gastos: number }> = {}
    ;(mov || []).forEach(m => {
      const mesKey = m.fecha.slice(0, 7)
      if (!porMes[mesKey]) porMes[mesKey] = { ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') porMes[mesKey].ingresos += m.monto
      else porMes[mesKey].gastos += m.monto
    })
    return { movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos, mensualidades: mens || [], pagadas, pendientes, totalMensPagado, totalMensPendiente, porMes, activos: jug || [] }
  }

  async function cargarDatosAsistencia() {
    const { inicio, fin } = getRango()
    const [{ data: asist }, { data: jug }] = await Promise.all([
      supabase.from('asistencia').select('*, jugadores(nombre,categoria)').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
      supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).eq('estado', 'activo')
    ])
    const porDia: Record<string, number> = {}
    const porJugador: Record<string, { nombre: string; count: number }> = {}
    const porDiaSemana: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }
    const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
    ;(asist || []).forEach(a => {
      porDia[a.fecha] = (porDia[a.fecha] || 0) + 1
      const jn = (a as any).jugadores?.nombre || a.jugador_id
      if (!porJugador[a.jugador_id]) porJugador[a.jugador_id] = { nombre: jn, count: 0 }
      porJugador[a.jugador_id].count++
      const dow = new Date(a.fecha + 'T12:00:00').getDay()
      porDiaSemana[dow]++
    })
    const diaMasAsistido = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0] || null
    const diaSemanaMax = Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]
    const topJugadores = Object.values(porJugador).sort((a, b) => b.count - a.count).slice(0, 10)
    const sinAsistencia = (jug || []).filter(j => !porJugador[j.id])
    const totalAsist = (asist || []).length
    const diasUnicos = Object.keys(porDia).length
    const promedioDiario = diasUnicos > 0 ? Math.round(totalAsist / diasUnicos) : 0
    return { asistencias: asist || [], porDia, porJugador, diaMasAsistido, diaSemanaMax: diaSemanaMax ? { dia: diasSemana[parseInt(diaSemanaMax[0])], count: diaSemanaMax[1] } : null, topJugadores, sinAsistencia, totalAsist, diasUnicos, promedioDiario, diasSemana, porDiaSemana, activos: jug || [] }
  }

  async function cargarDatosTorneos() {
    const { inicio, fin } = getRango()
    const [{ data: torn }, { data: ligas }, { data: mov }, { data: tornJug }] = await Promise.all([
      supabase.from('torneos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin).order('fecha_inicio'),
      supabase.from('ligas').select('*, liga_divisiones(*, liga_division_jugadores(jugador_id)), liga_partidos(count), liga_fechas(count)').eq('club_id', clubId),
      supabase.from('movimientos').select('*').eq('club_id', clubId).eq('categoria', 'inscripcion_torneo').gte('fecha', inicio).lte('fecha', fin),
      supabase.from('torneo_jugadores').select('*, torneos(nombre)'),
    ])
    const ingresosInscripcion = (mov || []).reduce((s, m) => s + m.monto, 0)
    const torneosPorEstado: Record<string, number> = {}
    ;(torn || []).forEach(t => { torneosPorEstado[t.estado] = (torneosPorEstado[t.estado] || 0) + 1 })
    return { torneos: torn || [], ligas: ligas || [], ingresosInscripcion, torneosPorEstado, movimientos: mov || [], torneoJugadores: tornJug || [] }
  }

  async function generarPreview() {
    if (!clubId) return
    if (categoria === 'jugador' && !jugadorId) return
    setGenerando(true)
    let datos: any = null
    if (categoria === 'general') datos = await cargarDatosGeneral()
    else if (categoria === 'jugador') datos = await cargarDatosJugador()
    else if (categoria === 'finanzas') datos = await cargarDatosFinanzas()
    else if (categoria === 'asistencia') datos = await cargarDatosAsistencia()
    else if (categoria === 'torneos') datos = await cargarDatosTorneos()
    setPreview(datos)
    setGenerando(false)
  }

  async function exportarPDF() {
    if (!preview) return
    setGenerando(true)
    const { titulo } = getRango()
    const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
    const catInfo = categoriasReporte.find(c => c.key === categoria)!

    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('CmSports', 14, 14)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Reporte ${catInfo.label} — ${titulo}`, 14, 24)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - 14, 24, { align: 'right' })

    let y = 42

    if (categoria === 'general') {
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold')
      doc.text('Resumen Financiero', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Monto']], body: [['Ingresos totales', fmt(preview.ingresos)], ['Gastos totales', fmt(preview.gastos)], ['Balance neto', fmt(preview.ingresos - preview.gastos)], ['COA (Costo por alumno)', preview.activos.length > 0 ? fmt(Math.round(preview.gastos / preview.activos.length)) : '$0']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ingresos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseIngresos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Gastos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseGastos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.addPage(); y = 20
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Jugadores Activos', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Nombre', 'Categoría', 'Sesiones', 'Estado']], body: preview.activos.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre)).map((j: any) => [j.nombre, j.categoria, `${j.sesiones_usadas}/${j.sesiones_limite}`, j.estado]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Asistencia', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.asistencias.length)], ['Promedio por día', String(preview.promedioAsist)], ['Jugadores activos', String(preview.activos.length)], ['Morosos', String(preview.morosos.length)], ['Tasa morosidad', preview.activos.length > 0 ? `${Math.round((preview.morosos.length / preview.activos.length) * 100)}%` : '0%']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Torneos del Período', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Nombre', 'Fecha', 'Estado', 'Fase']], body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado, t.fase]), theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoria === 'jugador' && preview.jugador) {
      const j = preview.jugador
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(`Ficha — ${j.nombre}`, 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Campo', 'Valor']], body: [['Nombre', j.nombre], ['RUT', j.rut || '—'], ['Email', j.email || '—'], ['Teléfono', j.telefono || '—'], ['Categoría', j.categoria || '—'], ['Estado', j.estado || '—'], ['Plan', j.tipo_plan || '—'], ['Sesiones', `${j.sesiones_usadas || 0}/${j.sesiones_limite || 0}`], ['Mensualidad', j.mensualidad ? fmt(j.mensualidad) : '—']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Mensualidades (período)', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total pagado', fmt(preview.totalPagado)], ['Total pendiente', fmt(preview.totalPendiente)], ['Meses pagados', String(preview.pagadas.length)], ['Meses pendientes/atrasados', String(preview.pendientes.length)]], theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      if (preview.mensualidades.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Historial de Mensualidades', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Fecha', 'Monto', 'Estado']], body: preview.mensualidades.map((m: any) => [m.fecha, m.monto ? fmt(m.monto) : '—', m.estado]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Asistencia (período)', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.asistencias.length)]], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Participación en Torneos', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Torneo', 'Posición', 'Puntos']], body: preview.torneos.map((t: any) => [(t as any).torneos?.nombre || '—', t.posicion ?? '—', t.puntos ?? '—']), theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      }
      if (preview.ligas.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Participación en Ligas', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Liga', 'División']], body: preview.ligas.map((l: any) => [(l as any).liga_divisiones?.ligas?.nombre || '—', (l as any).liga_divisiones?.nombre || '—']), theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoria === 'finanzas') {
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Resumen Financiero', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Monto']], body: [['Ingresos totales', fmt(preview.ingresos)], ['Gastos totales', fmt(preview.gastos)], ['Balance neto', fmt(preview.ingresos - preview.gastos)], ['COA', preview.activos.length > 0 ? fmt(Math.round(preview.gastos / preview.activos.length)) : '$0']], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ingresos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseIngresos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Gastos por Categoría', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Categoría', 'Monto']], body: Object.entries(preview.desgloseGastos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Mensualidades', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total recaudado', fmt(preview.totalMensPagado)], ['Total pendiente', fmt(preview.totalMensPendiente)], ['Pagadas', String(preview.pagadas.length)], ['Pendientes/Atrasadas', String(preview.pendientes.length)]], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      if (Object.keys(preview.porMes).length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Desglose por Mes', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Mes', 'Ingresos', 'Gastos', 'Balance']], body: Object.entries(preview.porMes).sort().map(([mes, v]: any) => { const mi = parseInt(mes.slice(5, 7)) - 1; return [mesesN[mi] + ' ' + mes.slice(0, 4), fmt(v.ingresos), fmt(v.gastos), fmt(v.ingresos - v.gastos)] }), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      if (preview.pendientes.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Detalle Mensualidades Pendientes', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Jugador', 'Fecha', 'Monto', 'Estado']], body: preview.pendientes.map((m: any) => [(m as any).jugadores?.nombre || '—', m.fecha, m.monto ? fmt(m.monto) : '—', m.estado]), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoria === 'asistencia') {
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Resumen de Asistencia', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total asistencias', String(preview.totalAsist)], ['Días con registro', String(preview.diasUnicos)], ['Promedio diario', String(preview.promedioDiario)], ['Jugadores activos', String(preview.activos.length)], ...(preview.diaMasAsistido ? [['Día más asistido', `${preview.diaMasAsistido[0]} (${preview.diaMasAsistido[1]} asist.)`]] : []), ...(preview.diaSemanaMax ? [['Día de semana favorito', `${preview.diaSemanaMax.dia} (${preview.diaSemanaMax.count} asist.)`]] : [])], theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Asistencia por Día de Semana', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Día', 'Asistencias']], body: preview.diasSemana.map((d: string, i: number) => [d, String(preview.porDiaSemana[i])]), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      y = (doc as any).lastAutoTable.finalY + 10
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Top 10 Jugadores por Asistencia', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Jugador', 'Asistencias']], body: preview.topJugadores.map((j: any) => [j.nombre, String(j.count)]), theme: 'striped', headStyles: { fillColor: [22, 163, 74] }, margin: { left: 14, right: 14 } })
      if (preview.sinAsistencia.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Jugadores sin Asistencia', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Jugador', 'Categoría']], body: preview.sinAsistencia.map((j: any) => [j.nombre, j.categoria || '—']), theme: 'striped', headStyles: { fillColor: [220, 38, 38] }, margin: { left: 14, right: 14 } })
      }
    }

    if (categoria === 'torneos') {
      doc.setTextColor(40, 40, 40)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Resumen de Torneos', 14, y); y += 8
      autoTable(doc, { startY: y, head: [['Concepto', 'Valor']], body: [['Total torneos', String(preview.torneos.length)], ['Ingresos por inscripción', fmt(preview.ingresosInscripcion)], ...Object.entries(preview.torneosPorEstado).map(([est, cnt]) => [`Estado: ${est}`, String(cnt)])], theme: 'striped', headStyles: { fillColor: [249, 115, 22] }, margin: { left: 14, right: 14 } })
      if (preview.torneos.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Detalle de Torneos', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Nombre', 'Fecha', 'Estado', 'Fase']], body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado, t.fase || '—']), theme: 'striped', headStyles: { fillColor: [14, 165, 233] }, margin: { left: 14, right: 14 } })
      }
      if (preview.ligas.length > 0) {
        y = (doc as any).lastAutoTable.finalY + 10
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Ligas', 14, y); y += 8
        autoTable(doc, { startY: y, head: [['Liga', 'Estado', 'Divisiones', 'Fechas', 'Partidos']], body: preview.ligas.map((l: any) => [l.nombre, l.estado, (l.liga_divisiones || []).length, (l.liga_fechas || [{ count: 0 }])[0]?.count || 0, (l.liga_partidos || [{ count: 0 }])[0]?.count || 0]), theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, margin: { left: 14, right: 14 } })
      }
    }

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9); doc.setTextColor(150)
      doc.text(`CmSports — Reporte ${catInfo.label} — ${titulo} — Página ${i} de ${pageCount}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    }

    const jugadorNombre = categoria === 'jugador' && preview.jugador ? `_${preview.jugador.nombre.replace(/ /g, '_')}` : ''
    doc.save(`reporte_${categoria}${jugadorNombre}_${titulo.replace(/ /g, '_')}.pdf`)
    setGenerando(false)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
  const { titulo } = getRango()

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:20 }}>Reportes</h1>

      {/* Selector de tipo de reporte */}
      <div style={{ ...card, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Tipo de reporte</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:10 }}>
          {categoriasReporte.map(c => (
            <button key={c.key} onClick={() => { setCategoria(c.key); setPreview(null) }}
              style={{ padding:'14px 12px', borderRadius:10, border: categoria === c.key ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: categoria === c.key ? '#ede9fe' : '#f8fafc', cursor:'pointer', textAlign:'left', transition:'all .15s' }}>
              <div style={{ fontSize:18, marginBottom:4 }}>{c.icon}</div>
              <div style={{ fontSize:13, fontWeight:600, color: categoria === c.key ? '#4f46e5' : text }}>{c.label}</div>
              <div style={{ fontSize:11, color: muted, marginTop:2 }}>{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Configuración de período */}
      <div style={{ ...card, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:16 }}>Configurar período</div>

        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['mensual','trimestral','semestral','anual'] as TipoReporte[]).map(t => (
            <button key={t} onClick={() => { setTipo(t); setPreview(null) }}
              style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', background: tipo===t ? '#4f46e5' : '#f4f7fa', color: tipo===t ? 'white' : muted, fontSize:13, cursor:'pointer', fontWeight: tipo===t ? 600 : 400, textTransform:'capitalize' }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {tipo === 'mensual' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mes</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                value={mes} onChange={e => { setMes(parseInt(e.target.value)); setPreview(null) }}>
                {mesesN.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {tipo === 'trimestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Trimestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                value={trimestre} onChange={e => { setTrimestre(parseInt(e.target.value)); setPreview(null) }}>
                <option value={1}>Q1 — Ene, Feb, Mar</option>
                <option value={2}>Q2 — Abr, May, Jun</option>
                <option value={3}>Q3 — Jul, Ago, Sep</option>
                <option value={4}>Q4 — Oct, Nov, Dic</option>
              </select>
            </div>
          )}
          {tipo === 'semestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Semestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                value={semestre} onChange={e => { setSemestre(parseInt(e.target.value)); setPreview(null) }}>
                <option value={1}>1er Semestre (Ene - Jun)</option>
                <option value={2}>2do Semestre (Jul - Dic)</option>
              </select>
            </div>
          )}
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              value={anio} onChange={e => { setAnio(parseInt(e.target.value)); setPreview(null) }}>
              {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Selector de jugador para reporte individual */}
        {categoria === 'jugador' && (
          <div style={{ marginTop:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Jugador</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              value={jugadorId} onChange={e => { setJugadorId(e.target.value); setPreview(null) }}>
              <option value="">— Seleccionar jugador —</option>
              {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre} ({j.categoria || 'Sin cat.'}) {j.estado !== 'activo' ? `[${j.estado}]` : ''}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginTop:16, display:'flex', gap:10 }}>
          <button onClick={generarPreview} disabled={generando || (categoria === 'jugador' && !jugadorId)}
            style={{ flex:1, padding:12, background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, fontSize:13, fontWeight:600, cursor: (categoria === 'jugador' && !jugadorId) ? 'not-allowed' : 'pointer', opacity: (categoria === 'jugador' && !jugadorId) ? 0.5 : 1 }}>
            {generando ? 'Cargando...' : 'Vista previa'}
          </button>
          <button onClick={exportarPDF} disabled={generando || !preview}
            style={{ flex:1, padding:12, background: preview ? '#f43f5e' : '#e2e8f0', color: preview ? 'white' : hint, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor: preview ? 'pointer' : 'not-allowed' }}>
            {generando ? 'Generando...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Preview por categoría */}
      {preview && categoria === 'general' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — General — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Ingresos', value:fmt(preview.ingresos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
              { label:'Gastos', value:fmt(preview.gastos), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
              { label:'Balance', value:fmt(preview.ingresos - preview.gastos), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Jugadores activos', value:preview.activos.length, color: text },
              { label:'Total asistencias', value:preview.asistencias.length, color:'#16a34a' },
              { label:'Torneos', value:preview.torneos.length, color:'#d97706' },
              { label:'Morosos', value:preview.morosos.length, color:'#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:11, color: muted, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseIngresos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#16a34a', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseIngresos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseGastos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#dc2626', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseGastos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin gastos</p>}
            </div>
          </div>
        </div>
      )}

      {preview && categoria === 'jugador' && preview.jugador && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — {preview.jugador.nombre} — {titulo}</div>
          <div style={{ ...card, padding:20, marginBottom:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:13 }}>
              {[
                ['Categoría', preview.jugador.categoria || '—'],
                ['Estado', preview.jugador.estado || '—'],
                ['Plan', preview.jugador.tipo_plan || '—'],
                ['Sesiones', `${preview.jugador.sesiones_usadas || 0}/${preview.jugador.sesiones_limite || 0}`],
                ['Mensualidad', preview.jugador.mensualidad ? fmt(preview.jugador.mensualidad) : '—'],
                ['RUT', preview.jugador.rut || '—'],
                ['Email', preview.jugador.email || '—'],
              ].map(([l, v]) => (
                <div key={l as string} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ color: muted }}>{l}</span>
                  <span style={{ color: text, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Pagado (período)', value:fmt(preview.totalPagado), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
              { label:'Pendiente', value:fmt(preview.totalPendiente), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
              { label:'Asistencias', value:String(preview.asistencias.length), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {preview.mensualidades.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Historial de mensualidades</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}>
                    <th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th>
                    <th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Monto</th>
                    <th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th>
                  </tr></thead>
                  <tbody>{preview.mensualidades.map((m: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text }}>{m.fecha}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: text }}>{m.monto ? fmt(m.monto) : '—'}</td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: m.estado === 'pagado' ? '#dcfce7' : m.estado === 'atrasado' ? '#fef2f2' : '#fef9c3', color: m.estado === 'pagado' ? '#16a34a' : m.estado === 'atrasado' ? '#dc2626' : '#d97706' }}>{m.estado}</span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.torneos.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Torneos</div>
              {preview.torneos.map((t: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(t as any).torneos?.nombre || '—'}</span>
                  <span style={{ color: muted }}>Pos: {t.posicion ?? '—'} · Pts: {t.puntos ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
          {preview.ligas.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ligas</div>
              {preview.ligas.map((l: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(l as any).liga_divisiones?.ligas?.nombre || '—'}</span>
                  <span style={{ color: muted }}>{(l as any).liga_divisiones?.nombre || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && categoria === 'finanzas' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Finanzas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Ingresos', value:fmt(preview.ingresos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
              { label:'Gastos', value:fmt(preview.gastos), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
              { label:'Balance', value:fmt(preview.ingresos - preview.gastos), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#16a34a', fontFamily:'monospace' }}>{fmt(preview.totalMensPagado)}</div>
              <div style={{ fontSize:12, color:'#16a34a', marginTop:4 }}>Mensualidades cobradas</div>
            </div>
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#dc2626', fontFamily:'monospace' }}>{fmt(preview.totalMensPendiente)}</div>
              <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>Mensualidades pendientes</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseIngresos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#16a34a', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseIngresos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseGastos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#dc2626', fontFamily:'monospace' }}>{fmt(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseGastos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin gastos</p>}
            </div>
          </div>
          {Object.keys(preview.porMes).length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Desglose por mes</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}>
                    <th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Mes</th>
                    <th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Ingresos</th>
                    <th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Gastos</th>
                    <th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Balance</th>
                  </tr></thead>
                  <tbody>{Object.entries(preview.porMes).sort().map(([mesKey, v]: any) => {
                    const mi = parseInt(mesKey.slice(5, 7)) - 1
                    return (
                      <tr key={mesKey} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'8px 6px', color: text }}>{mesesN[mi]} {mesKey.slice(0, 4)}</td>
                        <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#16a34a' }}>{fmt(v.ingresos)}</td>
                        <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#dc2626' }}>{fmt(v.gastos)}</td>
                        <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: v.ingresos - v.gastos >= 0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>{fmt(v.ingresos - v.gastos)}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.pendientes.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#dc2626', marginBottom:12 }}>Mensualidades pendientes ({preview.pendientes.length})</div>
              {preview.pendientes.map((m: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{(m as any).jugadores?.nombre || '—'}</span>
                  <span><span style={{ color: muted, marginRight:8 }}>{m.fecha}</span><span style={{ fontFamily:'monospace', color:'#dc2626' }}>{m.monto ? fmt(m.monto) : '—'}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && categoria === 'asistencia' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Asistencia — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Total asistencias', value:String(preview.totalAsist), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' },
              { label:'Días con registro', value:String(preview.diasUnicos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
              { label:'Promedio diario', value:String(preview.promedioDiario), color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {(preview.diaMasAsistido || preview.diaSemanaMax) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
              {preview.diaMasAsistido && (
                <div style={{ ...card, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:11, color: muted, marginBottom:4 }}>Día más asistido</div>
                  <div style={{ fontSize:16, fontWeight:700, color: text }}>{preview.diaMasAsistido[0]}</div>
                  <div style={{ fontSize:13, color:'#16a34a', fontWeight:600 }}>{preview.diaMasAsistido[1]} asistencias</div>
                </div>
              )}
              {preview.diaSemanaMax && (
                <div style={{ ...card, padding:16, textAlign:'center' }}>
                  <div style={{ fontSize:11, color: muted, marginBottom:4 }}>Día de semana favorito</div>
                  <div style={{ fontSize:16, fontWeight:700, color: text }}>{preview.diaSemanaMax.dia}</div>
                  <div style={{ fontSize:13, color:'#16a34a', fontWeight:600 }}>{preview.diaSemanaMax.count} asistencias</div>
                </div>
              )}
            </div>
          )}
          <div style={{ ...card, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Por día de semana</div>
            {preview.diasSemana.map((d: string, i: number) => {
              const max = Math.max(...Object.values(preview.porDiaSemana) as number[]) || 1
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                  <span style={{ width:80, fontSize:12, color: muted }}>{d}</span>
                  <div style={{ flex:1, background:'#f1f5f9', borderRadius:4, height:20, overflow:'hidden' }}>
                    <div style={{ width:`${(preview.porDiaSemana[i] / max) * 100}%`, height:'100%', background:'#4f46e5', borderRadius:4, transition:'width .3s' }} />
                  </div>
                  <span style={{ fontSize:12, fontFamily:'monospace', color: text, width:30, textAlign:'right' }}>{preview.porDiaSemana[i]}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Top 10 asistentes</div>
              {preview.topJugadores.map((j: any, i: number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: text }}>{i + 1}. {j.nombre}</span>
                  <span style={{ fontFamily:'monospace', color:'#16a34a', fontWeight:600 }}>{j.count}</span>
                </div>
              ))}
              {preview.topJugadores.length === 0 && <p style={{ fontSize:12, color: hint }}>Sin datos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#dc2626', marginBottom:12 }}>Sin asistencia ({preview.sinAsistencia.length})</div>
              {preview.sinAsistencia.map((j: any, i: number) => (
                <div key={i} style={{ padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12, color: muted }}>{j.nombre} — {j.categoria || '—'}</div>
              ))}
              {preview.sinAsistencia.length === 0 && <p style={{ fontSize:12, color:'#16a34a' }}>Todos asistieron</p>}
            </div>
          </div>
        </div>
      )}

      {preview && categoria === 'torneos' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Torneos y Ligas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[
              { label:'Torneos', value:String(preview.torneos.length), color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
              { label:'Ligas', value:String(preview.ligas.length), color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' },
              { label:'Ingresos inscripción', value:fmt(preview.ingresosInscripcion), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' },
            ].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {preview.torneos.length > 0 && (
            <div style={{ ...card, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Torneos del período</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}>
                    <th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Nombre</th>
                    <th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th>
                    <th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th>
                    <th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Fase</th>
                  </tr></thead>
                  <tbody>{preview.torneos.map((t: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text, fontWeight:500 }}>{t.nombre}</td>
                      <td style={{ padding:'8px 6px', color: muted }}>{t.fecha_inicio || '—'}</td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: t.estado === 'finalizado' ? '#dcfce7' : t.estado === 'en_curso' ? '#dbeafe' : '#fef9c3', color: t.estado === 'finalizado' ? '#16a34a' : t.estado === 'en_curso' ? '#2563eb' : '#d97706' }}>{t.estado}</span>
                      </td>
                      <td style={{ padding:'8px 6px', textAlign:'center', color: muted }}>{t.fase || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          {preview.ligas.length > 0 && (
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ligas</div>
              {preview.ligas.map((l: any, i: number) => (
                <div key={i} style={{ padding:12, borderBottom:'1px solid #f1f5f9' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontWeight:600, color: text, fontSize:13 }}>{l.nombre}</span>
                    <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: l.estado === 'finalizada' ? '#dcfce7' : l.estado === 'en_curso' ? '#dbeafe' : '#fef9c3', color: l.estado === 'finalizada' ? '#16a34a' : l.estado === 'en_curso' ? '#2563eb' : '#d97706' }}>{l.estado}</span>
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color: muted }}>
                    <span>{(l.liga_divisiones || []).length} divisiones</span>
                    <span>{(l.liga_divisiones || []).reduce((s: number, d: any) => s + (d.liga_division_jugadores || []).length, 0)} jugadores</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
