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

export default function ReportesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [tipo, setTipo] = useState<TipoReporte>('mensual')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [semestre, setSemestre] = useState(new Date().getMonth() < 6 ? 1 : 2)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol !== 'admin') { router.push('/dashboard'); return }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil])

  function getRango(): { inicio: string, fin: string, titulo: string } {
    if (tipo === 'mensual') {
      const ultimoDia = new Date(anio, mes, 0).getDate()
      return {
        inicio: `${anio}-${String(mes).padStart(2,'0')}-01`,
        fin: `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`,
        titulo: `${mesesN[mes-1]} ${anio}`
      }
    }
    if (tipo === 'trimestral') {
      const mesInicio = (trimestre - 1) * 3 + 1
      const mesFin = trimestre * 3
      const ultimoDia = new Date(anio, mesFin, 0).getDate()
      return {
        inicio: `${anio}-${String(mesInicio).padStart(2,'0')}-01`,
        fin: `${anio}-${String(mesFin).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`,
        titulo: `Q${trimestre} ${anio} (${mesesN[mesInicio-1]} - ${mesesN[mesFin-1]})`
      }
    }
    if (tipo === 'semestral') {
      const mesInicio = semestre === 1 ? 1 : 7
      const mesFin = semestre === 1 ? 6 : 12
      const ultimoDia = new Date(anio, mesFin, 0).getDate()
      return {
        inicio: `${anio}-${String(mesInicio).padStart(2,'0')}-01`,
        fin: `${anio}-${String(mesFin).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`,
        titulo: `${semestre === 1 ? '1er' : '2do'} Semestre ${anio}`
      }
    }
    return {
      inicio: `${anio}-01-01`,
      fin: `${anio}-12-31`,
      titulo: `Año ${anio}`
    }
  }

  async function cargarDatos() {
    const { inicio, fin } = getRango()
    const [
      { data: jugadores },
      { data: movimientos },
      { data: asistencias },
      { data: torneos },
      { data: mensualidades }
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', clubId),
      supabase.from('movimientos').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
      supabase.from('asistencia').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin),
      supabase.from('torneos').select('*').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
      supabase.from('mensualidades').select('*').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin)
    ])

    const activos = (jugadores || []).filter(j => j.estado === 'activo')
    const ingresos = (movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
    const gastos = (movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

    const desgloseIngresos: Record<string, number> = {}
    const desgloseGastos: Record<string, number> = {}
    ;(movimientos || []).forEach(m => {
      if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
      else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
    })

    const asistPorDia: Record<string, number> = {}
    ;(asistencias || []).forEach(a => { asistPorDia[a.fecha] = (asistPorDia[a.fecha] || 0) + 1 })
    const diasConAsist = Object.keys(asistPorDia).length
    const promedioAsist = diasConAsist > 0 ? Math.round((asistencias || []).length / diasConAsist) : 0

    const morosos = activos.filter(j => {
      const mens = (mensualidades || []).find(m => m.jugador_id === j.id)
      return mens?.estado === 'pendiente' || mens?.estado === 'atrasado'
    })

    return {
      jugadores: jugadores || [],
      activos,
      movimientos: movimientos || [],
      ingresos,
      gastos,
      desgloseIngresos,
      desgloseGastos,
      asistencias: asistencias || [],
      promedioAsist,
      torneos: torneos || [],
      morosos,
      mensualidades: mensualidades || []
    }
  }

  async function generarPreview() {
    if (!clubId) return
    setGenerando(true)
    const datos = await cargarDatos()
    setPreview(datos)
    setGenerando(false)
  }

  async function exportarPDF() {
    if (!preview) return
    setGenerando(true)
    const { titulo } = getRango()
    const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

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
    doc.text(`Informe ${tipo.charAt(0).toUpperCase() + tipo.slice(1)} — ${titulo}`, 14, 24)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - 14, 24, { align: 'right' })

    let y = 42

    doc.setTextColor(40, 40, 40)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumen Financiero', 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Monto']],
      body: [
        ['Ingresos totales', fmt(preview.ingresos)],
        ['Gastos totales', fmt(preview.gastos)],
        ['Balance neto', fmt(preview.ingresos - preview.gastos)],
        ['COA (Costo por alumno)', preview.activos.length > 0 ? fmt(Math.round(preview.gastos / preview.activos.length)) : '$0'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 }
    })
    y = (doc as any).lastAutoTable.finalY + 10

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Ingresos por Categoría', 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Monto']],
      body: Object.entries(preview.desgloseIngresos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]),
      theme: 'striped',
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: 14, right: 14 }
    })
    y = (doc as any).lastAutoTable.finalY + 10

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Gastos por Categoría', 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Monto']],
      body: Object.entries(preview.desgloseGastos).map(([cat, total]) => [catLabel[cat] || cat, fmt(total as number)]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38] },
      margin: { left: 14, right: 14 }
    })
    y = (doc as any).lastAutoTable.finalY + 10

    doc.addPage()
    y = 20

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Jugadores Activos', 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [['Nombre', 'Categoría', 'ELO', 'Sesiones', 'Estado']],
      body: preview.activos.sort((a: any, b: any) => b.elo - a.elo).map((j: any) => [
        j.nombre, j.categoria, j.elo, `${j.sesiones_usadas}/${j.sesiones_limite}`, j.estado
      ]),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 }
    })
    y = (doc as any).lastAutoTable.finalY + 10

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Asistencia', 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Valor']],
      body: [
        ['Total asistencias en el período', String(preview.asistencias.length)],
        ['Promedio por día', String(preview.promedioAsist)],
        ['Jugadores activos', String(preview.activos.length)],
        ['Jugadores morosos', String(preview.morosos.length)],
        ['Tasa de morosidad', preview.activos.length > 0 ? `${Math.round((preview.morosos.length / preview.activos.length) * 100)}%` : '0%'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 }
    })
    y = (doc as any).lastAutoTable.finalY + 10

    if (preview.torneos.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Torneos del Período', 14, y)
      y += 8

      autoTable(doc, {
        startY: y,
        head: [['Nombre', 'Fecha', 'Estado', 'Fase']],
        body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado, t.fase]),
        theme: 'striped',
        headStyles: { fillColor: [249, 115, 22] },
        margin: { left: 14, right: 14 }
      })
    }

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(150)
      doc.text(`CmSports — ${titulo} — Página ${i} de ${pageCount}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    }

    doc.save(`reporte_${tipo}_${titulo.replace(/ /g,'_')}.pdf`)
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

      {/* Configuración */}
      <div style={{ ...card, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:16 }}>Configurar reporte</div>

        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['mensual','trimestral','semestral','anual'] as TipoReporte[]).map(t => (
            <button key={t} onClick={() => setTipo(t)}
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
                value={mes} onChange={e => setMes(parseInt(e.target.value))}>
                {mesesN.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {tipo === 'trimestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Trimestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                value={trimestre} onChange={e => setTrimestre(parseInt(e.target.value))}>
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
                value={semestre} onChange={e => setSemestre(parseInt(e.target.value))}>
                <option value={1}>1er Semestre (Ene - Jun)</option>
                <option value={2}>2do Semestre (Jul - Dic)</option>
              </select>
            </div>
          )}
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              value={anio} onChange={e => setAnio(parseInt(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop:16, display:'flex', gap:10 }}>
          <button onClick={generarPreview} disabled={generando}
            style={{ flex:1, padding:12, background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            {generando ? 'Cargando...' : '👁 Vista previa'}
          </button>
          <button onClick={exportarPDF} disabled={generando || !preview}
            style={{ flex:1, padding:12, background: preview ? '#f43f5e' : '#e2e8f0', color: preview ? 'white' : hint, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor: preview ? 'pointer' : 'not-allowed' }}>
            {generando ? 'Generando...' : '📄 Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — {titulo}</div>

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

          <div style={{ ...card, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Top 5 ELO</div>
            {preview.activos.sort((a: any, b: any) => b.elo - a.elo).slice(0,5).map((j: any, i: number) => (
              <div key={j.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                <span style={{ fontSize:16 }}>{i < 3 ? ['🥇','🥈','🥉'][i] : i+1}</span>
                <span style={{ flex:1, fontSize:13, color: text }}>{j.nombre}</span>
                <span style={{ fontSize:15, fontWeight:700, color:'#4f46e5', fontFamily:'monospace' }}>{j.elo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
