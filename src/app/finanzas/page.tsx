'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import PanelMensualidadesHistoricas from '@/components/PanelMensualidadesHistoricas'
import PanelClasesExtra from '@/components/PanelClasesExtra'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useModulos } from '@/lib/hooks/useModulos'
import { registrarMovimiento, editarMovimiento, eliminarMovimiento } from '@/app/actions/finanzas'
import { MensualidadesPanel } from '@/components/MensualidadesPanel'
import LigaFutbolFinanzasTab from '@/components/liga-futbol/FinanzasTab'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { linkWhatsApp } from '@/lib/whatsapp'
import { cachedFetch } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { useTextoMonto } from '@/components/Monto'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

// Los nombres de las categorías se escriben acá y no en config.ts porque acá
// llevan tildes. Al agregar una categoría hay que tocar los dos lados: si falta
// en este mapa, el movimiento se muestra con su nombre interno crudo.
const catLabel: Record<string, string> = {
  mensualidad:'Mensualidad', matricula:'Matrícula', inscripcion_torneo:'Inscripción torneo',
  inscripcion_liga:'Inscripción liga', premio_torneo:'Premio torneo',
  arriendo_cancha:'Arriendo cancha', donacion:'Donación',
  clase_extraordinaria:'Clase extra', otro_ingreso:'Otro ingreso',
  sueldo_profesor:'Sueldo profesor', sueldo_staff:'Sueldo staff',
  material_deportivo:'Material deportivo', servicios_basicos:'Servicios básicos',
  mantenimiento:'Mantenimiento', otro_gasto:'Otro gasto',
  // La escribe `corregir_mensualidad` al corregir una cuota de un mes cerrado:
  // entra como ingreso si el ajuste es a favor y como gasto si es en contra.
  // Faltaba acá y la fila se mostraba con la clave cruda.
  ajuste_mensualidad:'Ajuste de mensualidad',
}

// La clase extra no está en esta lista a propósito: se cobra desde su propia
// sección, que además marca la clase como pagada. Cargarla a mano crearía el
// ingreso y dejaría la clase figurando como impaga para siempre.
const categoriasIngreso = ['mensualidad','matricula','inscripcion_torneo','inscripcion_liga','arriendo_cancha','donacion','otro_ingreso']
const categoriasGasto = ['sueldo_profesor','sueldo_staff','arriendo_cancha','material_deportivo','servicios_basicos','mantenimiento','otro_gasto']

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Para los PDF y las exportaciones: ahí la cifra va siempre real. El ojito
// tapa lo que se ve en pantalla, no lo que el usuario decide descargar —un
// reporte con los montos en puntitos no le sirve a nadie.
const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

export default function FinanzasPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}><div style={{ color:'#94a3b8' }}>Cargando...</div></div>}>
      <FinanzasContent />
    </Suspense>
  )
}

function FinanzasContent() {
  // Tapa el `fmt` de arriba a propósito: acá todo lo que se dibuja va a
  // pantalla, así que pasa por el interruptor del ojito.
  const fmt = useTextoMonto()
  const { perfil, loading: authLoading } = usePerfil()
  const { tiene } = useModulos()
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [modalOpen, setModalOpen] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const searchParams = useSearchParams()
  const [tabActivo, setTabActivo] = useState<'movimientos'|'mensualidades'|'historicas'|'reportes'|'liga'>(
    // Se aceptan todas las pestañas, no solo mensualidades: `/reportes` redirige
    // acá con ?tab=reportes y antes caía en Movimientos sin decir nada.
    (['movimientos', 'mensualidades', 'historicas', 'reportes', 'liga'] as const)
      .find(t => t === searchParams.get('tab')) ?? 'movimientos',
  )
  // Monta Mensualidades solo cuando se abre por primera vez (evita sus consultas al entrar en "Movimientos"); una vez montado queda vivo
  const [mensualidadesVista, setMensualidadesVista] = useState(searchParams.get('tab') === 'mensualidades')
  const [jugadoresFinanzas, setJugadoresFinanzas] = useState<any[]>([])
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState<any>(null)
  const [historialJugador, setHistorialJugador] = useState<any[]>([])
  const [busquedaJugador, setBusquedaJugador] = useState('')
  const [form, setForm] = useState({
    tipo: 'ingreso', categoria: 'mensualidad', descripcion: '',
    monto: '', fecha: fechaChile(),
    profesorId: '', nombreStaff: '', mesCorr: String(new Date().getMonth()+1), anioCorr: String(new Date().getFullYear())
  })
  const [guardando, setGuardando] = useState(false)
  const [errorMovimiento, setErrorMovimiento] = useState('')
  const [editando, setEditando] = useState<any>(null)
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set())
  const [confirmarBorrado, setConfirmarBorrado] = useState<any>(null)
  const [borrando, setBorrando] = useState(false)
  const movimientoOperacionId = useRef<string | null>(null)
  const historialCache = useRef<Map<string, any[]>>(new Map())
  const router = useRouter()
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) {
      Promise.all([cargarMovimientos(perfil.club_id), cargarJugadores(perfil.club_id), cargarProfesores(perfil.club_id)]).then(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [authLoading, perfil])

  useEffect(() => {
    if (!clubId) return
    cargarMovimientos()
  }, [mes, anio])

  // Finanzas no escuchaba nada: era la única pantalla del sistema que se
  // quedaba con la foto del momento en que se abrió. Dos personas cobrando a la
  // vez —o la misma con el celular y el computador— veían totales distintos, y
  // la única forma de enterarse era recargar. Los movimientos entran también
  // por otros módulos (clases extra, ligas, torneos), así que el saldo cambia
  // sin que nadie haya tocado esta pantalla.
  useEnVivo(['movimientos', 'mensualidades'], clubId, () => {
    void cargarMovimientos()
  }, { conClub: ['movimientos', 'mensualidades'] })

  async function cargarMovimientos(cid?: string) {
    const id = cid || clubId
    const mesStr = String(mes).padStart(2, '0')
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const inicio = `${anio}-${mesStr}-01`
    const fin = `${anio}-${mesStr}-${String(ultimoDia).padStart(2,'0')}`
    // Solo movimientos: la lista de jugadores no cambia por mes, se carga aparte una sola vez
    const { data } = await supabase.from('movimientos').select('id,tipo,categoria,descripcion,monto,fecha,registrado_por_nombre,creado_en,mensualidad_id,torneo_id,profesor_id,mes_correspondiente,anio_correspondiente').eq('club_id', id).gte('fecha', inicio).lte('fecha', fin).order('creado_en', { ascending: false })
    setMovimientos(data || [])
    await cargarBloqueados(data || [])
  }

  // Un movimiento que es el reflejo de otra cosa no se edita desde acá. El
  // vínculo con mensualidad y torneo viaja en la propia fila; el de liga y
  // clases extra vive en la otra tabla, así que hay que ir a buscarlo. Si la
  // consulta falla se asume desbloqueado: la RPC igual lo rechaza, solo se
  // pierde el candado de la tabla.
  async function cargarBloqueados(movs: any[]) {
    const ids = movs.map(m => m.id)
    if (ids.length === 0) { setBloqueados(new Set()); return }
    const [{ data: abonos }, { data: extras }] = await Promise.all([
      supabase.from('liga_abonos').select('movimiento_id').in('movimiento_id', ids),
      supabase.from('clases_extraordinarias').select('movimiento_id').in('movimiento_id', ids),
    ])
    const set = new Set<string>()
    ;(abonos || []).forEach((a: any) => a.movimiento_id && set.add(a.movimiento_id))
    ;(extras || []).forEach((c: any) => c.movimiento_id && set.add(c.movimiento_id))
    setBloqueados(set)
  }

  function motivoBloqueo(m: any): string | null {
    if (m.mensualidad_id || m.categoria === 'mensualidad') return 'Pago de mensualidad — se corrige revirtiendo el pago en la pestaña Mensualidades'
    if (m.torneo_id) return 'Viene de un torneo — se corrige desde la ficha del torneo'
    if (bloqueados.has(m.id)) return 'Viene de liga o clases extra — se corrige revirtiendo el cobro en su propia pantalla'
    return null
  }

  async function cargarJugadores(cid?: string) {
    const id = cid || clubId
    const jugs = await cachedFetch(
      `fin:jugadores:${id}`,
      async () => {
        const { data } = await supabase.from('jugadores').select('id,nombre,telefono').eq('club_id', id).or('es_externo.is.null,es_externo.eq.false').order('nombre')
        return data || []
      },
      120_000,
      ['jugadores'],
    )
    setJugadoresFinanzas(jugs)
  }

  async function cargarProfesores(cid?: string) {
    const id = cid || clubId
    const data = await cachedFetch(
      `fin:profesores:${id}`,
      async () => {
        const { data } = await supabase.from('profesores').select('id,nombre').eq('club_id', id)
        return data || []
      },
      120_000,
      ['profesores'],
    )
    setProfesores(data)
  }

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const esEdicion = editando !== null
  // Editando no se ofrece 'mensualidad': esos movimientos son el espejo de un
  // pago y ni siquiera llegan al modal, pero tampoco tiene sentido convertir
  // otro movimiento en uno.
  const categoriasActuales = form.tipo === 'ingreso'
    ? (esEdicion ? categoriasIngreso.filter(c => c !== 'mensualidad') : categoriasIngreso)
    : categoriasGasto
  const esSueldo = form.categoria === 'sueldo_profesor' || form.categoria === 'sueldo_staff'
  const esStaff = form.categoria === 'sueldo_staff'

  const formVacio = () => ({
    tipo:'ingreso', categoria:'mensualidad', descripcion:'', monto:'',
    fecha: fechaChile(), profesorId:'', nombreStaff:'',
    mesCorr:String(new Date().getMonth()+1), anioCorr:String(new Date().getFullYear()),
  })

  function abrirNuevo() {
    setEditando(null)
    setErrorMovimiento('')
    setForm(formVacio())
    movimientoOperacionId.current = null
    setModalOpen(true)
  }

  function abrirEdicion(m: any) {
    setEditando(m)
    setErrorMovimiento('')
    setForm({
      tipo: m.tipo,
      categoria: m.categoria || (m.tipo === 'ingreso' ? 'otro_ingreso' : 'otro_gasto'),
      descripcion: m.descripcion || '',
      monto: String(m.monto ?? ''),
      fecha: m.fecha || fechaChile(),
      profesorId: m.profesor_id || '',
      nombreStaff: '',
      mesCorr: String(m.mes_correspondiente ?? new Date().getMonth()+1),
      anioCorr: String(m.anio_correspondiente ?? new Date().getFullYear()),
    })
    movimientoOperacionId.current = null
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setErrorMovimiento('')
    movimientoOperacionId.current = null
  }

  async function guardarMovimiento() {
    if (!form.monto || !form.fecha) return
    // Al crear un sueldo de staff el nombre es lo único que distingue un pago
    // de otro: sin él quedan varias filas idénticas de "Sueldo staff".
    if (!esEdicion && esStaff && !form.nombreStaff.trim()) {
      setErrorMovimiento('Escribí el nombre de la persona a la que se le paga.')
      return
    }
    setGuardando(true)
    movimientoOperacionId.current ??= crypto.randomUUID()

    let descripcion = form.descripcion.trim()

    if (!esEdicion && esSueldo) {
      const periodo = `${mesesN[parseInt(form.mesCorr)-1]} ${form.anioCorr}`
      const quien = esStaff
        ? form.nombreStaff.trim()
        : (profesores.find(p => p.id === form.profesorId)?.nombre || 'Sin asignar')
      const base = `${catLabel[form.categoria]} — ${quien} · ${periodo}`
      descripcion = descripcion ? `${base} · ${descripcion}` : base
    }
    if (!descripcion) descripcion = catLabel[form.categoria] || form.categoria

    const comunes = {
      categoria: form.categoria,
      descripcion,
      monto: parseInt(form.monto),
      fecha: form.fecha,
      // El staff no está en la tabla de profesores; su nombre vive en la descripción.
      ...(form.categoria === 'sueldo_profesor' && form.profesorId ? { profesorId: form.profesorId } : {}),
      ...(esSueldo ? { mesCorrespondiente: parseInt(form.mesCorr), anioCorrespondiente: parseInt(form.anioCorr) } : {}),
    }

    const resultado = esEdicion
      ? await editarMovimiento({ movimientoId: editando.id, ...comunes, idempotencyKey: movimientoOperacionId.current })
      : await registrarMovimiento({ tipo: form.tipo, ...comunes, idempotencyKey: movimientoOperacionId.current })

    setGuardando(false)
    if (resultado.error) {
      setErrorMovimiento(resultado.error)
      // La clave ya quedó consumida por la operación que falló; reintentar con
      // la misma daría "ya fue usada" en vez del error real.
      movimientoOperacionId.current = null
      return
    }
    movimientoOperacionId.current = null
    setErrorMovimiento('')
    setModalOpen(false)
    setEditando(null)
    setForm(formVacio())
    cargarMovimientos()
  }

  async function borrarMovimiento() {
    if (!confirmarBorrado) return
    setBorrando(true)
    const resultado = await eliminarMovimiento({ movimientoId: confirmarBorrado.id, idempotencyKey: crypto.randomUUID() })
    setBorrando(false)
    if (resultado.error) { setErrorMovimiento(resultado.error); return }
    setConfirmarBorrado(null)
    cargarMovimientos()
  }

  async function exportarExcel() {
    const XLSX = await import('xlsx-js-style')
    const { utils, writeFile } = XLSX

    const headers = ['Fecha','Tipo','Categoría','Descripción','Monto (CLP)','Registrado por']
    const rows = movimientosFiltrados.map(m => [
      m.fecha,
      m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      catLabel[m.categoria] || m.categoria,
      m.descripcion || '',
      m.monto,
      m.registrado_por_nombre || 'Admin',
    ])

    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3730A3' } }, alignment: { horizontal: 'center' } }
    const ingresoStyle = { fill: { fgColor: { rgb: 'F0FDF4' } } }
    const gastoStyle   = { fill: { fgColor: { rgb: 'FEF2F2' } } }
    const montoStyle   = { numFmt: '#,##0', alignment: { horizontal: 'right' } }
    const montoIngreso = { ...ingresoStyle, numFmt: '#,##0', alignment: { horizontal: 'right' } }
    const montoGasto   = { ...gastoStyle,   numFmt: '#,##0', alignment: { horizontal: 'right' } }

    const wsData: any[][] = [
      headers.map(h => ({ v: h, s: headerStyle })),
      ...rows.map((r, i) => {
        const esIngreso = movimientosFiltrados[i].tipo === 'ingreso'
        const bg = esIngreso ? ingresoStyle : gastoStyle
        return r.map((v, ci) => ({ v, s: ci === 4 ? (esIngreso ? montoIngreso : montoGasto) : bg }))
      }),
    ]

    const resumen = [
      [],
      [{ v: 'RESUMEN', s: { font: { bold: true } } }],
      [{ v: 'Total ingresos', s: { font: { bold: true } } }, { v: ingresos, s: { ...montoIngreso, fill: { fgColor: { rgb: 'DCFCE7' } } } }],
      [{ v: 'Total gastos',   s: { font: { bold: true } } }, { v: gastos,   s: { ...montoGasto,   fill: { fgColor: { rgb: 'FEE2E2' } } } }],
      [{ v: 'Saldo neto',     s: { font: { bold: true } } }, { v: ingresos - gastos, s: { ...montoStyle, font: { bold: true } } }],
    ]

    const ws = utils.aoa_to_sheet([...wsData, ...resumen])
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 36 }, { wch: 14 }, { wch: 20 }]
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, `${mesesN[mes-1]} ${anio}`)
    writeFile(wb, `finanzas_${mesesN[mes-1]}_${anio}.xlsx`)
  }

  const ingresos = movimientos.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos = movimientos.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

  const desgloseIngresos: Record<string, number> = {}
  const desgloseGastos: Record<string, number> = {}
  movimientos.forEach(m => {
    if (m.tipo === 'ingreso') desgloseIngresos[m.categoria] = (desgloseIngresos[m.categoria] || 0) + m.monto
    else desgloseGastos[m.categoria] = (desgloseGastos[m.categoria] || 0) + m.monto
  })

  const movimientosFiltrados = movimientos.filter(m =>
    (!filtroTipo || m.tipo === filtroTipo) &&
    (!busqueda || m.descripcion?.toLowerCase().includes(busqueda.toLowerCase()) || m.categoria?.toLowerCase().includes(busqueda.toLowerCase()))
  )

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div className="header-responsive" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
          <button onClick={() => cambiarMes(-1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:16, fontWeight:600, color: text, minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>▶</button>
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
          <button onClick={exportarExcel} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📊 Exportar Excel</button>
          <button onClick={abrirNuevo} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>➕ Movimiento</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-scroll" style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:20 }}>
        {[
          { key:'movimientos', label:'📋 Movimientos' },
          ...(tiene('liga_futbol') ? [{ key:'liga', label:'⚽ Liga' }] : []),
          { key:'mensualidades', label:'💳 Mensualidades' },
          { key:'historicas', label:'🗓️ Históricas' },
          { key:'reportes', label:'📈 Reportes' },
        ].map(t => (
          <div key={t.key} onClick={() => { setTabActivo(t.key as any); if (t.key === 'mensualidades') setMensualidadesVista(true) }}
            style={{ flex:'1 0 auto', padding:'9px 12px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background:tabActivo===t.key?'#ffffff':'transparent', color:tabActivo===t.key?'#3730a3': muted, transition:'all 0.15s', boxShadow: tabActivo===t.key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ display: tabActivo === 'movimientos' ? 'block' : 'none' }}>
      {/* Stats */}
      <div className="grid-responsive-1" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
        {[
          { label:'💰 Ingresos', value:fmt(ingresos), color:'#16a34a', bg:'#f0fdf4' },
          { label:'💸 Gastos', value:fmt(gastos), color:'#dc2626', bg:'#fef2f2' },
          { label:'📊 Balance neto', value:fmt(ingresos-gastos), color:'#3730a3', bg:'#ede9fe' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding:20, background: s.bg, border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:'monospace', marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:12, color: muted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Desglose */}
      <div className="grid-responsive-1" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <div style={{ ...card, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>💰 Ingresos por categoría</div>
          {Object.entries(desgloseIngresos).length === 0
            ? <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>
            : Object.entries(desgloseIngresos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#16a34a', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
        <div style={{ ...card, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>💸 Gastos por categoría</div>
          {Object.entries(desgloseGastos).length === 0
            ? <p style={{ fontSize:12, color: hint }}>Sin gastos</p>
            : Object.entries(desgloseGastos).map(([cat, total]) => (
              <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #f1f5f9', fontSize:13 }}>
                <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                <span style={{ color:'#dc2626', fontWeight:600, fontFamily:'monospace' }}>{fmt(total)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Buscador movimientos */}
      <div style={{ marginBottom:12 }}>
        <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
          placeholder="Buscar por descripción o categoría..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Historial pagos por jugador */}
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text }}>Historial de pagos por jugador</div>
        </div>
        <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none', marginBottom: busquedaJugador.length > 1 ? 8 : 0 }}
          placeholder="Buscar jugador para ver su historial..."
          value={busquedaJugador} onChange={e => setBusquedaJugador(e.target.value)} />
        {busquedaJugador.length > 1 && !jugadorSeleccionado && (
          <div style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
            {jugadoresFinanzas.filter(j => j.nombre.toLowerCase().includes(busquedaJugador.toLowerCase())).slice(0,5).map(j => (
              <div key={j.id} onClick={async () => {
                setJugadorSeleccionado(j)
                setBusquedaJugador(j.nombre)
                if (historialCache.current.has(j.id)) {
                  setHistorialJugador(historialCache.current.get(j.id)!)
                  return
                }
                const { data: mens } = await supabase.from('mensualidades').select('id,mes,anio,monto,estado,fecha_pago,metodo,notas').eq('jugador_id', j.id).order('anio').order('mes')
                historialCache.current.set(j.id, mens || [])
                setHistorialJugador(mens || [])
              }} style={{ padding:'10px 14px', borderBottom:'1px solid #e2e8f0', cursor:'pointer', fontSize:13, color: text }}>
                {j.nombre}
              </div>
            ))}
          </div>
        )}
        {jugadorSeleccionado && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:600, color: text }}>{jugadorSeleccionado.nombre}</div>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ color:'#16a34a', fontSize:12 }}>✅ {historialJugador.filter(m=>m.estado==='pagado').length} pagados</span>
                <span style={{ color:'#d97706', fontSize:12 }}>⏳ {historialJugador.filter(m=>m.estado==='pendiente').length} pendientes</span>
                <span style={{ color:'#dc2626', fontSize:12 }}>🔴 {historialJugador.filter(m=>m.estado==='atrasado').length} atrasados</span>
                <button onClick={() => { setJugadorSeleccionado(null); setBusquedaJugador('') }}
                  style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 8px', color: muted, fontSize:11, cursor:'pointer' }}>✕ Cerrar</button>
              </div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                    {['Mes','Año','Estado','Fecha pago','Monto'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historialJugador.map((m,i) => {
                    // 'exento' es un mes que el club decidio no cobrar. Sin este caso
                    // caia en el generico y se leia "Pendiente", o sea deuda que no existe.
                    const col = m.estado==='pagado'?'#16a34a':m.estado==='atrasado'?'#dc2626':m.estado==='exento'?'#7c3aed':'#d97706'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'8px 12px', fontSize:13, color: text }}>{mesesN[m.mes-1]}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color: muted }}>{m.anio}</td>
                        <td style={{ padding:'8px 12px' }}>
                          <span style={{ background:col+'22', color:col, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                            {m.estado==='pagado'?'Pagado':m.estado==='atrasado'?'Atrasado':m.estado==='exento'?'No vino':'Pendiente'}
                          </span>
                        </td>
                        <td style={{ padding:'8px 12px', fontSize:12, color: muted }}>{m.fecha_pago||'—'}</td>
                        <td style={{ padding:'8px 12px', fontSize:13, color:'#3730a3', fontFamily:'monospace' }}>{m.monto?'$'+m.monto.toLocaleString('es-CL'):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {linkWhatsApp(jugadorSeleccionado.telefono) && (
              <div style={{ marginTop:12 }}>
                <WhatsAppBtn href={linkWhatsApp(jugadorSeleccionado.telefono)!} variant="compact" style={{ padding:'7px 14px', fontSize:12 }}>
                  Contactar por WhatsApp
                </WhatsAppBtn>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabla */}
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:600, color: text }}>Todos los movimientos</div>
          <select
            style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:6, padding:'5px 10px', color: text, fontSize:12, outline:'none' }}
            value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">🔍 Todos</option>
            <option value="ingreso">💰 Ingresos</option>
            <option value="gasto">💸 Gastos</option>
          </select>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Fecha','Categoría','Descripción','Registrado por','Monto',''].map((h, i) => (
                  <th key={i} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map(m => {
                const bloqueo = motivoBloqueo(m)
                return (
                <tr key={m.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{m.fecha || '—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ background: m.tipo === 'ingreso' ? '#f0fdf4' : '#fef2f2', color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:'nowrap' }}>
                      {m.tipo === 'ingreso' ? '💰' : '💸'} {catLabel[m.categoria] || m.categoria || '—'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:13, color: text }}>{m.descripcion}</td>
                  <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{m.registrado_por_nombre || 'Admin'}</td>
                  <td style={{ padding:'12px 16px', fontWeight:700, fontFamily:'monospace', whiteSpace:'nowrap', color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                    {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                  </td>
                  <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                    {bloqueo ? (
                      <span title={bloqueo} style={{ fontSize:13, color: hint, cursor:'help' }}>🔒</span>
                    ) : (
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => abrirEdicion(m)} title="Editar movimiento"
                          style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 8px', fontSize:12, cursor:'pointer', color: muted }}>✏️</button>
                        <button onClick={() => { setErrorMovimiento(''); setConfirmarBorrado(m) }} title="Eliminar movimiento"
                          style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'4px 8px', fontSize:12, cursor:'pointer', color:'#dc2626' }}>🗑️</button>
                      </div>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {movimientosFiltrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Sin movimientos este mes</div>
        )}
      </div>
      </div>

      {/* TAB MENSUALIDADES */}
      <div style={{ display: tabActivo === 'mensualidades' ? 'block' : 'none' }}>
        {mensualidadesVista && <MensualidadesPanel mes={mes} anio={anio} onPagoRegistrado={() => cargarMovimientos()} />}
        {/* Las clases extra van acá abajo y no en su propia pestaña: se cobran
            en la misma conversación que la mensualidad. */}
        {/* El id es el destino del aviso "+ $X clase extra" que sale en la
            columna Monto de la tabla de arriba. Sin eso el panel existe pero
            está debajo de cien y pico de filas, así que nadie llega: el admin
            veía que el jugador debía una clase extra y no tenía forma de saber
            dónde se cobraba. */}
        {mensualidadesVista && (
          <div id="clases-extra" style={{ marginTop: 16, scrollMarginTop: 16 }}>
            <PanelClasesExtra clubId={clubId} />
          </div>
        )}
      </div>

      {/* TAB REPORTES */}
      {/* Meses pasados: se corrigen acá, con ajuste y auditoría. Se monta solo
          al abrir la pestaña porque carga el año completo de cada jugador. */}
      {tabActivo === 'historicas' && clubId && (
        <PanelMensualidadesHistoricas clubId={clubId} />
      )}

      <div style={{ display: tabActivo === 'reportes' ? 'block' : 'none' }}>
        <ReportesTab clubId={clubId} />
      </div>

      {/* TAB LIGA — pagos de inscripción por equipo, solo para clubes de fútbol */}
      {tabActivo === 'liga' && tiene('liga_futbol') && (
        <LigaFutbolFinanzasTab clubId={clubId} />
      )}

      {/* Modal nuevo movimiento */}
      {modalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:20 }}>{esEdicion ? '✏️ Editar movimiento' : '💳 Nuevo movimiento'}</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Tipo</label>
                <select disabled={esEdicion}
                  style={{ width:'100%', background: esEdicion ? '#e2e8f0' : '#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: esEdicion ? muted : text, fontSize:14, outline:'none', cursor: esEdicion ? 'not-allowed' : 'pointer' }}
                  value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, categoria: e.target.value === 'ingreso' ? 'mensualidad' : 'sueldo_profesor' }))}>
                  <option value="ingreso">💰 Ingreso</option>
                  <option value="gasto">💸 Gasto</option>
                </select>
                {esEdicion && <div style={{ fontSize:11, color: hint, marginTop:4 }}>El tipo no se cambia. Si está mal, borrá y cargá de nuevo.</div>}
              </div>
              <div>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Fecha</label>
                <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Categoría</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {categoriasActuales.map(c => <option key={c} value={c}>{catLabel[c]}</option>)}
              </select>
            </div>

            {esSueldo && (
              <>
                {/* El staff no está en la tabla de profesores —son gente de aseo,
                    arbitraje, apoyo puntual—, así que el nombre se escribe libre
                    y queda guardado dentro de la descripción. */}
                {esStaff ? (
                  !esEdicion && (
                    <div style={{ marginBottom:14 }}>
                      <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre de la persona</label>
                      <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                        placeholder="Ej: María González" value={form.nombreStaff}
                        onChange={e => setForm(f => ({ ...f, nombreStaff: e.target.value }))} />
                    </div>
                  )
                ) : (
                  <div style={{ marginBottom:14 }}>
                    <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Profesor</label>
                    <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                      value={form.profesorId} onChange={e => setForm(f => ({ ...f, profesorId: e.target.value }))}>
                      <option value="">— Seleccionar —</option>
                      {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mes correspondiente</label>
                    <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                      value={form.mesCorr} onChange={e => setForm(f => ({ ...f, mesCorr: e.target.value }))}>
                      {mesesN.map((m, i) => <option key={i} value={String(i+1)}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
                    <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                      type="number" value={form.anioCorr} onChange={e => setForm(f => ({ ...f, anioCorr: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>
                {!esEdicion && esSueldo ? 'Detalle (opcional)' : 'Descripción'}
              </label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                placeholder={!esEdicion && esSueldo ? 'Se agrega al final de la descripción automática' : 'Descripción del movimiento'}
                value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="number" placeholder="25000" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
            </div>

            {errorMovimiento && (
              <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8, fontSize:12, fontWeight:500, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca' }}>
                {errorMovimiento}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={cerrarModal} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={guardarMovimiento} disabled={guardando} style={{ flex:1, padding:11, background:'#f43f5e', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de borrado */}
      {confirmarBorrado && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:110 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:17, fontWeight:600, color: text, marginBottom:12 }}>🗑️ Eliminar movimiento</div>
            <div style={{ fontSize:13, color: muted, marginBottom:8 }}>Se va a borrar del libro del mes:</div>
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
              <div style={{ fontSize:13, color: text, marginBottom:4 }}>{confirmarBorrado.descripcion}</div>
              <div style={{ fontSize:13, fontWeight:700, fontFamily:'monospace', color: confirmarBorrado.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                {confirmarBorrado.tipo === 'ingreso' ? '+' : '-'}{fmt(confirmarBorrado.monto)} · {confirmarBorrado.fecha}
              </div>
            </div>
            <div style={{ fontSize:12, color: hint, marginBottom:16 }}>Queda registrado en la auditoría, pero deja de contar en los totales.</div>

            {errorMovimiento && (
              <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8, fontSize:12, fontWeight:500, background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca' }}>
                {errorMovimiento}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setConfirmarBorrado(null); setErrorMovimiento('') }} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button onClick={borrarMovimiento} disabled={borrando} style={{ flex:1, padding:11, background:'#dc2626', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                {borrando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

type CategoriaReporte = 'general' | 'jugador' | 'finanzas' | 'asistencia' | 'torneos'

// `desc` dice para quién es el reporte y `trae` qué sale en el PDF. Los dos
// renglones existen porque "General" y "Finanzas" se parecían tanto que nadie
// sabía cuál pedir: ahora General es el reporte de dirección (cómo va el club)
// y Finanzas el contable (estado de resultados y cuentas por cobrar).
const categoriasReporte: { key: CategoriaReporte; label: string; desc: string; trae: string; emoji: string }[] = [
  { key: 'general',    emoji: '📊', label: 'General',         desc: 'Cómo va el club',        trae: 'Hallazgos, plata y gente, a quién cobrarle, plantel con asistencia' },
  { key: 'finanzas',   emoji: '💰', label: 'Finanzas',        desc: 'Contable',               trae: 'Estado de resultados vs período anterior, deuda por antigüedad, libro de movimientos' },
  { key: 'asistencia', emoji: '📋', label: 'Asistencia',      desc: 'Operación de las clases', trae: 'La semana, top asistentes, todos los activos con su porcentaje' },
  { key: 'jugador',    emoji: '🏓', label: 'Jugador',         desc: 'Estado de cuenta',       trae: 'Ficha, deuda, historial de cuotas y las fechas exactas que asistió' },
  { key: 'torneos',    emoji: '🏆', label: 'Torneos y ligas', desc: 'Competencia',            trae: 'Torneos por estado, ligas con inscritos y lo recaudado en inscripciones' },
]

// El análisis del reporte General vive acá y no dentro del PDF porque lo usan
// los dos lados: la vista previa en pantalla y el papel. Cuando estaba
// duplicado, la pantalla decía una cosa y el PDF otra —y el que manda es el
// PDF, que es el que se imprime y se manda al directorio.
//
// `tono` es semántico, no un color: la pantalla lo pinta con hex y el PDF con
// RGB, y cada uno usa su paleta sin que este archivo sepa de ninguna.
type Tono = 'bien' | 'ojo' | 'mal' | 'info' | 'neutro'
export type Dato = { etiqueta: string; valor: string; detalle?: string; tono: Tono }
export type Hallazgo = { texto: string; tono: Tono }

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function analizarGeneral(p: any, fmt: (n: number) => string) {
  const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—')
  const mayor = (d: Record<string, number>) => Object.entries(d || {}).sort((a, b) => b[1] - a[1])[0]
  const nombreCat = (c: string) => catLabel[c] || c

  const balance = p.ingresos - p.gastos
  const balancePrev = (p.ingresosPrev ?? 0) - (p.gastosPrev ?? 0)
  const activos = p.activos.length
  const inactivos = p.jugadores.length - activos

  const impagas = (p.mensualidades || []).filter((m: any) => m.estado === 'pendiente' || m.estado === 'atrasado')
  const deudaPeriodo = impagas.reduce((s: number, m: any) => s + (m.monto || 0), 0)
  const cobrado = (p.mensualidades || []).filter((m: any) => m.estado === 'pagado').reduce((s: number, m: any) => s + (m.monto || 0), 0)
  const emitido = cobrado + deudaPeriodo
  const cobranza = emitido > 0 ? Math.round((cobrado / emitido) * 100) : 0

  const asistPorJug = new Map<string, number>()
  for (const a of (p.asistencias || [])) asistPorJug.set(a.jugador_id, (asistPorJug.get(a.jugador_id) ?? 0) + 1)
  const sinVenir = p.activos.filter((j: any) => !asistPorJug.has(j.id))
  const morososQueVienen = p.morosos.filter((j: any) => (asistPorJug.get(j.id) ?? 0) > 0).length
  const ocupacion = activos > 0 ? Math.round((p.promedioAsist / activos) * 100) : 0

  const conClase = (Object.entries(p.porDiaSemana || {}) as [string, number][]).filter(([, v]) => v > 0)
  const diaFuerte = [...conClase].sort((a, b) => b[1] - a[1])[0]
  const diaFlojo = [...conClase].sort((a, b) => a[1] - b[1])[0]

  const topIngreso = mayor(p.desgloseIngresos)
  const topGasto = mayor(p.desgloseGastos)
  const varia = (actual: number, previo: number) => {
    if (!previo) return { texto: 'sin período anterior con qué comparar', sube: true }
    const v = Math.round(((actual - previo) / Math.abs(previo)) * 100)
    return { texto: `${v >= 0 ? '+' : ''}${v}% vs ${p.tituloPrev}`, sube: v >= 0, pct: v }
  }
  const vBalance = varia(balance, balancePrev)
  const vIngresos = varia(p.ingresos, p.ingresosPrev ?? 0)
  const vGastos = varia(p.gastos, p.gastosPrev ?? 0)
  const vAsist = varia(p.asistencias.length, p.asistPrev ?? 0)

  // Solo entra el hallazgo que el dato justifica. Si no hay nada que decir, se
  // dice eso mismo: un reporte que no afirma nada es peor que uno corto.
  const hallazgos: Hallazgo[] = []
  if (balance < 0) hallazgos.push({ texto: `El período cerró en rojo: faltaron ${fmt(Math.abs(balance))} para cubrir los gastos.`, tono: 'mal' })
  else if ((p.ingresosPrev ?? 0) > 0 && !vBalance.sube) hallazgos.push({ texto: `El resultado bajó ${vBalance.texto}, aunque el período cerró a favor.`, tono: 'ojo' })
  if (topIngreso && p.ingresos > 0 && topIngreso[1] / p.ingresos > 0.5)
    hallazgos.push({ texto: `${nombreCat(topIngreso[0])} aporta el ${pct(topIngreso[1], p.ingresos)} de los ingresos: el club depende casi por completo de una sola entrada.`, tono: 'ojo' })
  if (topGasto && p.gastos > 0)
    hallazgos.push({ texto: `${nombreCat(topGasto[0])} se lleva el ${pct(topGasto[1], p.gastos)} de los gastos (${fmt(topGasto[1])}).`, tono: 'neutro' })
  if (deudaPeriodo > 0)
    hallazgos.push({ texto: `Quedaron ${fmt(deudaPeriodo)} sin cobrar en ${impagas.length} cuotas: se cobró el ${cobranza}% de lo emitido.`, tono: cobranza >= 90 ? 'ojo' : 'mal' })
  if (morososQueVienen > 0)
    hallazgos.push({ texto: `${morososQueVienen} de los ${p.morosos.length} que deben siguen entrenando: se les puede cobrar en la cancha.`, tono: 'ojo' })
  if (sinVenir.length > 0)
    hallazgos.push({ texto: `${sinVenir.length} jugadores activos (${pct(sinVenir.length, activos)} del plantel) no aparecieron ni una vez.`, tono: 'mal' })
  if ((p.asistPrev ?? 0) > 0 && !vAsist.sube)
    hallazgos.push({ texto: `La asistencia bajó ${vAsist.texto}.`, tono: 'mal' })
  if (diaFuerte && diaFlojo && diaFuerte[0] !== diaFlojo[0] && diaFlojo[1] * 2 < diaFuerte[1])
    hallazgos.push({ texto: `${DIAS_SEMANA[+diaFuerte[0]]} concentra ${diaFuerte[1]} asistencias y ${DIAS_SEMANA[+diaFlojo[0]]} apenas ${diaFlojo[1]}: hay horario desaprovechado.`, tono: 'info' })
  if (hallazgos.length === 0)
    hallazgos.push({ texto: 'Sin deuda pendiente, sin ausentes totales y con el período cerrado a favor.', tono: 'bien' })

  const plata: Dato[] = [
    { etiqueta: 'Ingresos', valor: fmt(p.ingresos), detalle: vIngresos.texto, tono: 'bien' },
    { etiqueta: 'Gastos', valor: fmt(p.gastos), detalle: vGastos.texto, tono: 'mal' },
    { etiqueta: 'Resultado', valor: fmt(balance), detalle: `antes: ${fmt(balancePrev)}`, tono: balance >= 0 ? 'bien' : 'mal' },
    { etiqueta: 'Principal ingreso', valor: topIngreso ? nombreCat(topIngreso[0]) : '—', detalle: topIngreso ? `${fmt(topIngreso[1])} · ${pct(topIngreso[1], p.ingresos)} del total` : 'sin ingresos', tono: 'bien' },
    { etiqueta: 'Principal gasto', valor: topGasto ? nombreCat(topGasto[0]) : '—', detalle: topGasto ? `${fmt(topGasto[1])} · ${pct(topGasto[1], p.gastos)} del total` : 'sin gastos', tono: 'mal' },
    { etiqueta: 'Cobranza del período', valor: `${cobranza}%`, detalle: `${fmt(cobrado)} de ${fmt(emitido)} emitido`, tono: cobranza >= 90 ? 'bien' : cobranza >= 70 ? 'ojo' : 'mal' },
    { etiqueta: 'Por cobrar', valor: fmt(deudaPeriodo), detalle: `${impagas.length} cuotas · ${p.morosos.length} jugadores`, tono: deudaPeriodo > 0 ? 'mal' : 'bien' },
    { etiqueta: 'Deja cada alumno', valor: activos > 0 ? fmt(Math.round(p.ingresos / activos)) : '—', detalle: activos > 0 ? `y cuesta ${fmt(Math.round(p.gastos / activos))}` : 'sin activos', tono: 'info' },
    { etiqueta: 'Margen por alumno', valor: activos > 0 ? fmt(Math.round(balance / activos)) : '—', detalle: `sobre ${activos} activos`, tono: balance >= 0 ? 'bien' : 'mal' },
  ]

  const gente: Dato[] = [
    { etiqueta: 'Plantel activo', valor: String(activos), detalle: `${p.jugadores.length} fichas en total`, tono: 'info' },
    { etiqueta: 'Fuera del plantel', valor: String(inactivos), detalle: 'inactivos, retirados o suspendidos', tono: inactivos > 0 ? 'ojo' : 'bien' },
    { etiqueta: 'Días con clase', valor: String(p.diasConAsist), detalle: 'días con asistencia registrada', tono: 'info' },
    { etiqueta: 'Asistencias', valor: String(p.asistencias.length), detalle: vAsist.texto, tono: vAsist.sube ? 'bien' : 'mal' },
    { etiqueta: 'Promedio por clase', valor: `${p.promedioAsist} jugadores`, detalle: `ocupación ${ocupacion}% del plantel`, tono: ocupacion >= 50 ? 'bien' : ocupacion >= 30 ? 'ojo' : 'mal' },
    { etiqueta: 'No vinieron nunca', valor: String(sinVenir.length), detalle: activos > 0 ? `${pct(sinVenir.length, activos)} de los activos` : '—', tono: sinVenir.length > 0 ? 'mal' : 'bien' },
    { etiqueta: 'Día más fuerte', valor: diaFuerte ? DIAS_SEMANA[+diaFuerte[0]] : '—', detalle: diaFuerte ? `${diaFuerte[1]} asistencias` : 'sin registros', tono: 'info' },
    { etiqueta: 'Día más flojo', valor: diaFlojo ? DIAS_SEMANA[+diaFlojo[0]] : '—', detalle: diaFlojo ? `${diaFlojo[1]} asistencias` : 'sin registros', tono: 'ojo' },
    { etiqueta: 'Competencia', valor: `${p.torneos.length} torneos`, detalle: p.torneos.length > 0 ? p.torneos.map((t: any) => t.nombre).slice(0, 2).join(' · ') : 'ninguno en el período', tono: 'info' },
  ]

  return { balance, balancePrev, activos, deudaPeriodo, impagas, cobranza, asistPorJug, sinVenir, morososQueVienen, ocupacion, hallazgos, plata, gente, pct }
}


function ReportesTab({ clubId }: { clubId: string | null }) {
  // Dos formateadores a propósito: `fmt` (el de arriba) para el PDF, que lleva
  // la cifra real, y `fmtVista` para lo que se muestra en pantalla, que
  // obedece al ojito.
  const fmtVista = useTextoMonto()
  const [categoriaRep, setCategoriaRep] = useState<CategoriaReporte>('general')
  const [tipo, setTipo] = useState<'mensual'|'trimestral'|'semestral'|'anual'>('mensual')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth()+1)/3))
  const [semestre, setSemestre] = useState(new Date().getMonth() < 6 ? 1 : 2)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [generando, setGenerando] = useState(false)
  // Si algo revienta al armar el reporte, hay que decirlo. Antes la excepción
  // se comía sola y los dos botones quedaban en "Cargando…" para siempre.
  const [errorRep, setErrorRep] = useState('')
  const [jugadores, setJugadores] = useState<any[]>([])
  const [jugadorId, setJugadorId] = useState('')
  // El PDF llevaba "CmSports" impreso en la barra de todas las páginas. El
  // reporte que se manda al directorio tiene que decir el nombre del club.
  const [clubNombre, setClubNombre] = useState('')

  useEffect(() => {
    if (!clubId) return
    supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).order('nombre').then(({ data }) => setJugadores(data || []))
    supabase.from('clubes').select('nombre').eq('id', clubId).single().then(({ data }) => setClubNombre(data?.nombre || ''))
  }, [clubId])

  useEffect(() => { setPreview(null) }, [categoriaRep, tipo, mes, trimestre, semestre, anio, jugadorId])

  function getRango() {
    if (tipo === 'mensual') {
      const ultimoDia = new Date(anio, mes, 0).getDate()
      return { inicio:`${anio}-${String(mes).padStart(2,'0')}-01`, fin:`${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`, titulo:`${mesesN[mes-1]} ${anio}` }
    }
    if (tipo === 'trimestral') {
      const mi=(trimestre-1)*3+1, mf=trimestre*3
      return { inicio:`${anio}-${String(mi).padStart(2,'0')}-01`, fin:`${anio}-${String(mf).padStart(2,'0')}-${new Date(anio,mf,0).getDate()}`, titulo:`Q${trimestre} ${anio}` }
    }
    if (tipo === 'semestral') {
      const mi=semestre===1?1:7, mf=semestre===1?6:12
      return { inicio:`${anio}-${String(mi).padStart(2,'0')}-01`, fin:`${anio}-${String(mf).padStart(2,'0')}-${new Date(anio,mf,0).getDate()}`, titulo:`${semestre===1?'1er':'2do'} Semestre ${anio}` }
    }
    return { inicio:`${anio}-01-01`, fin:`${anio}-12-31`, titulo:`Año ${anio}` }
  }

  // El período inmediatamente anterior, del mismo largo. Sin esto, un reporte
  // dice "entraron $1.900.000" y no responde lo único que importa saber:
  // si eso es mejor o peor que el mes pasado.
  function getRangoAnterior() {
    const { inicio, fin } = getRango()
    const ini = new Date(inicio + 'T12:00:00')
    const f = new Date(fin + 'T12:00:00')
    const largo = (f.getFullYear() - ini.getFullYear()) * 12 + (f.getMonth() - ini.getMonth()) + 1
    const desde = new Date(ini.getFullYear(), ini.getMonth() - largo, 1)
    const hasta = new Date(ini.getFullYear(), ini.getMonth(), 0)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const titulo = largo === 1
      ? `${mesesN[desde.getMonth()]} ${desde.getFullYear()}`
      : `${mesesN[desde.getMonth()]} ${desde.getFullYear()} – ${mesesN[hasta.getMonth()]} ${hasta.getFullYear()}`
    return { inicio: iso(desde), fin: iso(hasta), titulo, largo }
  }

  async function generarPreview() {
    if (!clubId) return
    if (categoriaRep === 'jugador' && !jugadorId) return
    setGenerando(true)
    setErrorRep('')
    try {
    const { inicio, fin } = getRango()
    const iniAnio = parseInt(inicio.slice(0, 4))
    const iniMes  = parseInt(inicio.slice(5, 7))
    const finAnio = parseInt(fin.slice(0, 4))
    const finMes  = parseInt(fin.slice(5, 7))
    let datos: any = null

    if (categoriaRep === 'general') {
      const prev = getRangoAnterior()
      const [{ data: jug }, { data: mov }, { data: asist }, { data: torn }, { data: mens }, { data: movPrev }, { count: asistPrev }] = await Promise.all([
        supabase.from('jugadores').select('id,nombre,estado,categoria').eq('club_id', clubId).or('es_externo.is.null,es_externo.eq.false'),
        supabase.from('movimientos').select('id,tipo,monto,categoria,fecha,descripcion').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        supabase.from('asistencia').select('jugador_id,fecha').eq('club_id', clubId).eq('estado', 'presente').gte('fecha', inicio).lte('fecha', fin),
        supabase.from('torneos').select('id,nombre,estado,fecha_inicio').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin),
        supabase.from('mensualidades').select('id,jugador_id,mes,anio,monto,estado').eq('club_id', clubId).eq('anio', iniAnio).gte('mes', iniMes).lte('mes', finMes),
        supabase.from('movimientos').select('tipo,monto').eq('club_id', clubId).gte('fecha', prev.inicio).lte('fecha', prev.fin),
        supabase.from('asistencia').select('*', { count: 'exact', head: true }).eq('club_id', clubId).eq('estado', 'presente').gte('fecha', prev.inicio).lte('fecha', prev.fin),
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
      const porDiaSemanaG: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 }
      ;(asist || []).forEach(a => { porDiaSemanaG[new Date(a.fecha + 'T12:00:00').getDay()]++ })
      datos = {
        jugadores: jug || [], activos, movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos,
        asistencias: asist || [], promedioAsist, torneos: torn || [], morosos, mensualidades: mens || [],
        diasConAsist, porDiaSemana: porDiaSemanaG,
        ingresosPrev: (movPrev || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
        gastosPrev: (movPrev || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
        asistPrev: asistPrev ?? 0,
        tituloPrev: prev.titulo,
      }
    }

    if (categoriaRep === 'jugador') {
      const [{ data: jugador }, { data: mens }, { data: asist }, { data: torneoJug }, { data: ligaJug }] = await Promise.all([
        // `estado` va en el select porque el reporte lo imprime: sin él la
        // ficha del PDF mostraba "undefined" en el estado del jugador.
        supabase.from('jugadores').select('id,nombre,rut,email,telefono,categoria,estado,foto_url,tipo_plan,mensualidad,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie').eq('id', jugadorId).single(),
        supabase.from('mensualidades').select('id,mes,anio,monto,estado,fecha_pago').eq('jugador_id', jugadorId).order('anio', { ascending: false }).order('mes', { ascending: false }),
        supabase.from('asistencia').select('id,jugador_id,fecha').eq('jugador_id', jugadorId).eq('estado', 'presente').gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        supabase.from('torneo_jugadores').select('id,torneo_id,torneos(id,nombre,fecha_inicio,estado)').eq('jugador_id', jugadorId),
        supabase.from('liga_division_jugadores').select('id,jugador_id,liga_divisiones(id,nombre,ligas(id,nombre))').eq('jugador_id', jugadorId),
      ])
      const mensPeriodo = (mens || []).filter(m => (m.anio * 100 + m.mes) >= (iniAnio * 100 + iniMes) && (m.anio * 100 + m.mes) <= (finAnio * 100 + finMes))
      const pagadas = mensPeriodo.filter(m => m.estado === 'pagado')
      const pendientes = mensPeriodo.filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
      datos = { jugador, mensualidades: mens || [], mensPeriodo, pagadas, pendientes, totalPagado: pagadas.reduce((s, m) => s + (m.monto || 0), 0), totalPendiente: pendientes.reduce((s, m) => s + (m.monto || 0), 0), asistencias: asist || [], torneos: torneoJug || [], ligas: ligaJug || [] }
    }

    if (categoriaRep === 'finanzas') {
      const prev = getRangoAnterior()
      const [{ data: mov }, { data: mens }, { data: jug }, { data: movPrev }, { data: porCobrar }] = await Promise.all([
        supabase.from('movimientos').select('id,tipo,monto,categoria,fecha,descripcion').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        supabase.from('mensualidades').select('id,mes,anio,monto,estado,jugadores(nombre,categoria)').eq('club_id', clubId).eq('anio', iniAnio).gte('mes', iniMes).lte('mes', finMes),
        supabase.from('jugadores').select('id,nombre,estado').eq('club_id', clubId).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false'),
        supabase.from('movimientos').select('tipo,monto,categoria').eq('club_id', clubId).gte('fecha', prev.inicio).lte('fecha', prev.fin),
        // Toda la deuda viva del club, no solo la del período: la pregunta
        // "cuánto hay en la calle" no se contesta mirando un mes.
        supabase.from('mensualidades').select('id,mes,anio,monto,estado,jugadores(nombre,categoria)').eq('club_id', clubId).in('estado', ['pendiente', 'atrasado']),
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
      const porMes: Record<string, { ingresos: number; gastos: number }> = {}
      ;(mov || []).forEach(m => {
        const mk = m.fecha.slice(0, 7)
        if (!porMes[mk]) porMes[mk] = { ingresos: 0, gastos: 0 }
        if (m.tipo === 'ingreso') porMes[mk].ingresos += m.monto
        else porMes[mk].gastos += m.monto
      })
      // El desglose del período anterior por categoría: es lo que convierte el
      // estado de resultados en algo que se puede leer ("el arriendo subió 40%")
      // en vez de una foto suelta.
      const prevIngresos: Record<string, number> = {}, prevGastos: Record<string, number> = {}
      ;(movPrev || []).forEach(m => {
        const d = m.tipo === 'ingreso' ? prevIngresos : prevGastos
        d[m.categoria] = (d[m.categoria] || 0) + m.monto
      })
      datos = {
        movimientos: mov || [], ingresos, gastos, desgloseIngresos, desgloseGastos,
        mensualidades: mens || [], pagadas, pendientes,
        totalMensPagado: pagadas.reduce((s, m) => s + (m.monto || 0), 0),
        totalMensPendiente: pendientes.reduce((s, m) => s + (m.monto || 0), 0),
        porMes, activos: jug || [],
        porCobrar: porCobrar || [],
        totalPorCobrar: (porCobrar || []).reduce((s, m) => s + (m.monto || 0), 0),
        ingresosPrev: (movPrev || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0),
        gastosPrev: (movPrev || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
        prevIngresos, prevGastos,
        tituloPrev: prev.titulo,
        finAnio, finMes,
      }
    }

    if (categoriaRep === 'asistencia') {
      const [{ data: asist }, { data: jug }] = await Promise.all([
        supabase.from('asistencia').select('jugador_id,fecha,jugadores(nombre,categoria)').eq('club_id', clubId).eq('estado', 'presente').gte('fecha', inicio).lte('fecha', fin).order('fecha'),
        supabase.from('jugadores').select('id,nombre,categoria,estado').eq('club_id', clubId).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false')
      ])
      const porDia: Record<string, number> = {}, porJugador: Record<string, { nombre: string; count: number }> = {}, porDiaSemana: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 }
      const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      ;(asist || []).forEach(a => {
        porDia[a.fecha] = (porDia[a.fecha] || 0) + 1
        const jn = (a as any).jugadores?.nombre || a.jugador_id
        if (!porJugador[a.jugador_id]) porJugador[a.jugador_id] = { nombre: jn, count: 0 }
        porJugador[a.jugador_id].count++
        porDiaSemana[new Date(a.fecha + 'T12:00:00').getDay()]++
      })
      const diaMasAsistido = Object.entries(porDia).sort((a, b) => b[1] - a[1])[0] || null
      const diaSemanaMax = Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]
      datos = { asistencias: asist || [], porDia, porJugador, diaMasAsistido, diaSemanaMax: diaSemanaMax ? { dia: diasSemana[parseInt(diaSemanaMax[0])], count: diaSemanaMax[1] } : null, topJugadores: Object.values(porJugador).sort((a, b) => b.count - a.count).slice(0, 10), sinAsistencia: (jug || []).filter(j => !porJugador[j.id]), totalAsist: (asist || []).length, diasUnicos: Object.keys(porDia).length, promedioDiario: Object.keys(porDia).length > 0 ? Math.round((asist || []).length / Object.keys(porDia).length) : 0, diasSemana, porDiaSemana, activos: jug || [] }
    }

    if (categoriaRep === 'torneos') {
      const [{ data: torn }, { data: ligas }, { data: mov }] = await Promise.all([
        supabase.from('torneos').select('id,nombre,estado,fecha_inicio,tipo').eq('club_id', clubId).gte('fecha_inicio', inicio).lte('fecha_inicio', fin).order('fecha_inicio'),
        supabase.from('ligas').select('id,nombre,estado,liga_divisiones(id,nombre,liga_division_jugadores(jugador_id)),liga_partidos(count),liga_fechas(count)').eq('club_id', clubId),
        supabase.from('movimientos').select('id,tipo,monto,categoria,fecha').eq('club_id', clubId).eq('categoria', 'inscripcion_torneo').gte('fecha', inicio).lte('fecha', fin),
      ])
      const torneosPorEstado: Record<string, number> = {}
      ;(torn || []).forEach(t => { torneosPorEstado[t.estado] = (torneosPorEstado[t.estado] || 0) + 1 })
      datos = { torneos: torn || [], ligas: ligas || [], ingresosInscripcion: (mov || []).reduce((s, m) => s + m.monto, 0), torneosPorEstado, movimientos: mov || [] }
    }

      setPreview(datos)
    } catch (e: any) {
      console.error('[reportes] falló armar la vista previa', e)
      setPreview(null)
      setErrorRep(`No se pudo armar el reporte: ${e?.message || e}`)
    } finally {
      setGenerando(false)
    }

  }

  async function exportarPDF() {
    if (!preview) return
    setGenerando(true)
    setErrorRep('')
    try {
    const { titulo } = getRango()
    const catInfo = categoriasReporte.find(c => c.key === categoriaRep)!
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const {
      COLOR, MARGEN, encabezado, piePagina, filaTarjetas, tituloSeccion, sinDatos, estiloTabla,
      asegurarEspacio, trasTabla, panelDatos, barrasCategoria, barrasColumnas, franjaTotal,
      colorEstado, panelIndicadores, altoIndicadores, listaHallazgos, variacion, tinte,
    } = await import('@/lib/pdf/estilo')
    const doc = new jsPDF()
    const club = clubNombre || 'CmSports'
    const hoy = new Date().toLocaleDateString('es-CL')
    const cab = { club, titulo: `Reporte ${catInfo.label}`, subtitulo: `${titulo}  ·  generado el ${hoy}` }

    const nombreMes = (mk: string) => `${mesesN[parseInt(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`
    const mesDe = (m: any) => (m?.mes ? `${mesesN[m.mes - 1]} ${m.anio}` : '—')
    const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)}%` : '—')
    const mayor = (d: Record<string, number>) => Object.entries(d).sort((a, b) => b[1] - a[1])[0]
    // Las columnas de estado se pintan con el color del estado en vez de dejar
    // la palabra en negro: en una lista de 100 cuotas, buscar "atrasado"
    // leyendo texto gris no lo hace nadie.
    const pintaEstado = (col: number) => ({
      didParseCell: (d: any) => {
        if (d.section === 'body' && d.column.index === col) {
          d.cell.styles.textColor = colorEstado(String(d.cell.raw ?? ''))
          d.cell.styles.fontStyle = 'bold'
        }
      },
    })

    let y = encabezado(doc, cab)

    // ── GENERAL ───────────────────────────────────────────────────────────
    // El reporte de directorio: no repite el desglose contable (ese es el de
    // Finanzas), responde las preguntas que se hacen antes de abrir el sistema.
    if (categoriaRep === 'general') {
      const resumen = analizarGeneral(preview, fmt)
      const tonoPdf: Record<string, any> = { bien: COLOR.verde, ojo: COLOR.ambar, mal: COLOR.rojo, info: COLOR.celeste, neutro: COLOR.mutado }
      const aPdf = (d: any) => ({ etiqueta: d.etiqueta, valor: d.valor, detalle: d.detalle, color: tonoPdf[d.tono] })

      y = franjaTotal(doc, y, resumen.balance >= 0 ? 'Resultado del período — a favor' : 'Resultado del período — en contra',
        fmt(resumen.balance), resumen.balance >= 0 ? COLOR.verde : COLOR.rojo)

      y = tituloSeccion(doc, y, 'Lo que hay que mirar', `comparado con ${preview.tituloPrev}`)
      y = listaHallazgos(doc, y, resumen.hallazgos.map((h: any) => ({ texto: h.texto, color: tonoPdf[h.tono] })), cab)

      y = asegurarEspacio(doc, y, altoIndicadores(resumen.plata.length) + 12, cab)
      y = tituloSeccion(doc, y, 'La plata')
      y = panelIndicadores(doc, y, resumen.plata.map(aPdf), cab)

      y = asegurarEspacio(doc, y, altoIndicadores(resumen.gente.length) + 12, cab)
      y = tituloSeccion(doc, y, 'La gente')
      y = panelIndicadores(doc, y, resumen.gente.map(aPdf), cab)

      // El respaldo de las respuestas 9 y 10, con nombre y apellido: es lo que
      // se imprime para salir a cobrar. Antes solo salía el número de morosos.
      if (preview.morosos.length > 0) {
        const impagasPorJug = new Map<string, { meses: string[]; monto: number }>()
        for (const m of resumen.impagas) {
          const acc = impagasPorJug.get(m.jugador_id) ?? { meses: [], monto: 0 }
          acc.meses.push(mesDe(m))
          acc.monto += m.monto || 0
          impagasPorJug.set(m.jugador_id, acc)
        }
        const filas = preview.morosos
          .map((j: any) => ({ j, d: impagasPorJug.get(j.id) ?? { meses: [], monto: 0 }, clases: resumen.asistPorJug.get(j.id) ?? 0 }))
          .sort((a: any, b: any) => b.d.monto - a.d.monto)

        doc.addPage()
        y = encabezado(doc, { ...cab, titulo: 'A quién cobrarle' })
        y = franjaTotal(doc, y, `${filas.length} jugadores con cuotas impagas`, fmt(resumen.deudaPeriodo), COLOR.rojo)
        y = tituloSeccion(doc, y, 'Deuda del período', 'ordenado por monto', COLOR.rojo)
        autoTable(doc, {
          startY: y,
          head: [['Jugador', 'Categoría', 'Meses impagos', 'Clases', 'Debe']],
          body: filas.map((f: any) => [f.j.nombre, f.j.categoria || '—', f.d.meses.join(', ') || '—', String(f.clases), fmt(f.d.monto)]),
          foot: [['Total', '', '', '', fmt(resumen.deudaPeriodo)]],
          ...estiloTabla(COLOR.rojo),
          columnStyles: { 1: { cellWidth: 28 }, 2: { cellWidth: 46 }, 3: { cellWidth: 18, halign: 'right' }, 4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' } },
        })
        y = trasTabla(doc)
      }

      // El plantel completo con su asistencia: la respuesta 16 y 17 en detalle.
      doc.addPage()
      y = encabezado(doc, { ...cab, titulo: 'Plantel y asistencia' })
      const filasJug = [...preview.activos].sort((a: any, b: any) =>
        (resumen.asistPorJug.get(b.id) ?? 0) - (resumen.asistPorJug.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre))
      y = tituloSeccion(doc, y, 'Jugadores activos', `${filasJug.length} · ordenados por asistencia`)
      autoTable(doc, {
        startY: y,
        head: [['#', 'Nombre', 'Categoría', 'Clases', '% de los días']],
        body: filasJug.map((j: any, i: number) => {
          const n = resumen.asistPorJug.get(j.id) ?? 0
          return [String(i + 1), j.nombre, j.categoria || '—', String(n), resumen.pct(n, preview.diasConAsist)]
        }),
        foot: [['', 'Total', '', String(preview.asistencias.length), '']],
        ...estiloTabla(),
        columnStyles: { 0: { cellWidth: 10, halign: 'right', textColor: COLOR.tenue }, 2: { cellWidth: 34 }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } },
        didParseCell: (d: any) => {
          if (d.section !== 'body' || d.column.index !== 4) return
          const n = resumen.asistPorJug.get(filasJug[d.row.index]?.id) ?? 0
          const p = preview.diasConAsist > 0 ? (n / preview.diasConAsist) * 100 : 0
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.textColor = n === 0 ? COLOR.rojo : p >= 60 ? COLOR.verde : p >= 30 ? COLOR.ambar : COLOR.rojo
        },
      })
      y = trasTabla(doc)

      if (preview.torneos.length > 0) {
        y = asegurarEspacio(doc, y, 45, cab)
        y = tituloSeccion(doc, y, 'Torneos del período', String(preview.torneos.length), COLOR.naranja)
        autoTable(doc, {
          startY: y,
          head: [['Nombre', 'Fecha', 'Estado']],
          body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.estado]),
          ...estiloTabla(COLOR.naranja),
          ...pintaEstado(2),
          columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 32, halign: 'center' } },
        })
      }
    }

    // ── JUGADOR ───────────────────────────────────────────────────────────
    // Estado de cuenta individual: lo que se le manda al apoderado.
    if (categoriaRep === 'jugador' && preview.jugador) {
      const j = preview.jugador
      const saldo = preview.totalPendiente

      doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
      doc.setTextColor(...COLOR.texto)
      doc.text(j.nombre, MARGEN, y + 2)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      doc.setTextColor(...COLOR.mutado)
      doc.text(`${j.categoria || 'Sin categoría'}  ·  ${j.tipo_plan || 'sin plan'}`, MARGEN, y + 8)
      y += 16

      y = panelDatos(doc, y, [
        ['RUT', j.rut || '—'],
        ['Estado', j.estado || '—'],
        ['Plan', j.tipo_plan || '—'],
        ['Mensualidad', j.mensualidad ? fmt(j.mensualidad) : '—'],
        ['Email', j.email || '—'],
        ['Teléfono', j.telefono || '—'],
      ], 3)

      y = filaTarjetas(doc, y, [
        { valor: fmt(preview.totalPagado), etiqueta: 'Pagado en el período', color: COLOR.verde },
        { valor: fmt(saldo), etiqueta: 'Pendiente', color: saldo > 0 ? COLOR.rojo : COLOR.verde },
        { valor: String(preview.asistencias.length), etiqueta: 'Clases asistidas', color: COLOR.primario },
        { valor: `${preview.pagadas.length}/${preview.mensPeriodo.length}`, etiqueta: 'Cuotas al día', color: preview.pendientes.length === 0 ? COLOR.verde : COLOR.ambar },
      ])

      if (saldo > 0) {
        y = franjaTotal(doc, y, `Deuda vigente — ${preview.pendientes.length} cuotas`, fmt(saldo), COLOR.rojo)
      }

      y = asegurarEspacio(doc, y, 55, cab)
      y = tituloSeccion(doc, y, 'Historial de mensualidades', `${preview.mensualidades.length} registros`)
      if (preview.mensualidades.length === 0) {
        y = sinDatos(doc, y, 'Este jugador no tiene mensualidades registradas.')
      } else {
        autoTable(doc, {
          startY: y,
          head: [['Mes', 'Monto', 'Estado', 'Fecha de pago']],
          // Esta columna decía "undefined" en cada fila: la consulta trae mes y
          // año, no una fecha, y el PDF pedía `m.fecha`, que no existe.
          body: preview.mensualidades.map((m: any) => [mesDe(m), m.monto ? fmt(m.monto) : '—', m.estado, m.fecha_pago || '—']),
          ...estiloTabla(),
          ...pintaEstado(2),
          columnStyles: { 1: { cellWidth: 34, halign: 'right' }, 2: { cellWidth: 30, halign: 'center' }, 3: { cellWidth: 34, halign: 'center' } },
        })
        y = trasTabla(doc)
      }

      if (preview.asistencias.length > 0) {
        y = asegurarEspacio(doc, y, 60, cab)
        y = tituloSeccion(doc, y, 'Asistencia del período', `${preview.asistencias.length} clases`, COLOR.verde)
        const porMesAsist: Record<string, number> = {}
        for (const a of preview.asistencias) porMesAsist[a.fecha.slice(0, 7)] = (porMesAsist[a.fecha.slice(0, 7)] || 0) + 1
        y = barrasColumnas(doc, y, Object.entries(porMesAsist).sort().map(([mk, v]) => ({ etiqueta: nombreMes(mk).slice(0, 3), valor: v })), COLOR.verde)

        // Los días exactos: si el apoderado reclama por una clase, la lista es
        // la respuesta y evita entrar al sistema a buscarla.
        const lineas = doc.splitTextToSize(preview.asistencias.map((a: any) => a.fecha).join('   '), doc.internal.pageSize.getWidth() - 2 * MARGEN - 10)
        y = asegurarEspacio(doc, y, lineas.length * 4.2 + 16, cab)
        doc.setFillColor(...COLOR.fondoSuave)
        doc.roundedRect(MARGEN, y - 4, doc.internal.pageSize.getWidth() - 2 * MARGEN, lineas.length * 4.2 + 9, 2, 2, 'F')
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
        doc.setTextColor(...COLOR.mutado)
        doc.text(lineas, MARGEN + 5, y + 1)
        y += lineas.length * 4.2 + 15
      }

      if (preview.torneos.length > 0) {
        y = asegurarEspacio(doc, y, 45, cab)
        y = tituloSeccion(doc, y, 'Torneos', String(preview.torneos.length), COLOR.naranja)
        autoTable(doc, {
          startY: y,
          head: [['Torneo', 'Fecha', 'Estado']],
          body: preview.torneos.map((t: any) => [t.torneos?.nombre || '—', t.torneos?.fecha_inicio || '—', t.torneos?.estado || '—']),
          ...estiloTabla(COLOR.naranja),
          ...pintaEstado(2),
          columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 32, halign: 'center' } },
        })
        y = trasTabla(doc)
      }

      if (preview.ligas.length > 0) {
        y = asegurarEspacio(doc, y, 45, cab)
        y = tituloSeccion(doc, y, 'Ligas', String(preview.ligas.length), COLOR.morado)
        autoTable(doc, {
          startY: y,
          head: [['Liga', 'División']],
          body: preview.ligas.map((l: any) => [l.liga_divisiones?.ligas?.nombre || '—', l.liga_divisiones?.nombre || '—']),
          ...estiloTabla(COLOR.morado),
          columnStyles: { 1: { cellWidth: 60 } },
        })
      }
    }

    // ── FINANZAS ──────────────────────────────────────────────────────────
    // Estado de resultados y cuentas por cobrar. No repite el tablero del
    // reporte General: acá la pregunta es contable, no de dirección.
    if (categoriaRep === 'finanzas') {
      const balance = preview.ingresos - preview.gastos
      const balancePrev = preview.ingresosPrev - preview.gastosPrev
      const margen = preview.ingresos > 0 ? Math.round((balance / preview.ingresos) * 100) : 0
      const meses = Object.entries(preview.porMes).sort() as [string, any][]

      const linea = (cats: Record<string, number>, prev: Record<string, number>, base: number) =>
        Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => {
          const antes = prev[c] || 0
          const delta = antes === 0 ? (v > 0 ? 'nuevo' : '—') : `${v - antes >= 0 ? '+' : ''}${Math.round(((v - antes) / antes) * 100)}%`
          return [`   ${catLabel[c] || c}`, fmt(v), pct(v, base), fmt(antes), delta]
        })

      const filasIngreso = linea(preview.desgloseIngresos, preview.prevIngresos, preview.ingresos)
      const filasGasto = linea(preview.desgloseGastos, preview.prevGastos, preview.gastos)

      y = franjaTotal(doc, y, `Resultado del período  ·  margen ${margen}%`, fmt(balance), balance >= 0 ? COLOR.verde : COLOR.rojo)

      y = tituloSeccion(doc, y, 'Estado de resultados', `vs ${preview.tituloPrev}`)
      const cuerpo: any[] = [
        ['INGRESOS', '', '', '', ''],
        ...filasIngreso,
        ['Total ingresos', fmt(preview.ingresos), '100%', fmt(preview.ingresosPrev), variacion(preview.ingresos, preview.ingresosPrev).texto.split(' ')[0]],
        ['GASTOS', '', '', '', ''],
        ...filasGasto,
        ['Total gastos', fmt(preview.gastos), '100%', fmt(preview.gastosPrev), variacion(preview.gastos, preview.gastosPrev).texto.split(' ')[0]],
      ]
      // Los renglones de sección y subtotal se marcan por texto, no por índice:
      // el número de categorías cambia en cada período.
      const esTitulo = (t: string) => t === 'INGRESOS' || t === 'GASTOS'
      const esSubtotal = (t: string) => t.startsWith('Total ')
      autoTable(doc, {
        startY: y,
        head: [['Cuenta', 'Monto', '% del total', preview.tituloPrev, 'Var.']],
        body: cuerpo,
        foot: [['RESULTADO DEL PERÍODO', fmt(balance), `margen ${margen}%`, fmt(balancePrev), variacion(balance, balancePrev).texto.split(' ')[0]]],
        ...estiloTabla(),
        columnStyles: {
          1: { cellWidth: 30, halign: 'right' }, 2: { cellWidth: 24, halign: 'right' },
          3: { cellWidth: 30, halign: 'right', textColor: COLOR.mutado }, 4: { cellWidth: 20, halign: 'right' },
        },
        didParseCell: (d: any) => {
          if (d.section !== 'body') return
          const etiqueta = String(cuerpo[d.row.index][0]).trim()
          const esIngreso = d.row.index <= filasIngreso.length + 1
          if (esTitulo(etiqueta)) {
            d.cell.styles.fillColor = tinte(esIngreso ? COLOR.verde : COLOR.rojo, 0.12)
            d.cell.styles.fontStyle = 'bold'
            d.cell.styles.textColor = esIngreso ? COLOR.verde : COLOR.rojo
          } else if (esSubtotal(etiqueta)) {
            d.cell.styles.fontStyle = 'bold'
            d.cell.styles.fillColor = COLOR.blanco
          }
          if (d.column.index === 4 && !esTitulo(etiqueta)) {
            const t = String(d.cell.raw)
            d.cell.styles.textColor = t.startsWith('+') ? (esIngreso ? COLOR.verde : COLOR.rojo)
              : t.startsWith('-') ? (esIngreso ? COLOR.rojo : COLOR.verde) : COLOR.tenue
          }
        },
      })
      y = trasTabla(doc)

      if (meses.length > 1) {
        y = asegurarEspacio(doc, y, 75, cab)
        y = tituloSeccion(doc, y, 'Resultado mes a mes', `${meses.length} meses`)
        y = barrasColumnas(doc, y, meses.map(([mk, v]) => ({ etiqueta: nombreMes(mk).slice(0, 3), valor: v.ingresos - v.gastos })), COLOR.primario)
        y = asegurarEspacio(doc, y, 45, cab)
        autoTable(doc, {
          startY: y,
          head: [['Mes', 'Ingresos', 'Gastos', 'Resultado', 'Margen']],
          body: meses.map(([mk, v]) => [nombreMes(mk), fmt(v.ingresos), fmt(v.gastos), fmt(v.ingresos - v.gastos), pct(v.ingresos - v.gastos, v.ingresos)]),
          foot: [['Total', fmt(preview.ingresos), fmt(preview.gastos), fmt(balance), `${margen}%`]],
          ...estiloTabla(),
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' }, 4: { cellWidth: 22, halign: 'right' } },
          didParseCell: (d: any) => {
            if (d.column.index !== 3 || d.section === 'head') return
            const neto = d.section === 'foot' ? balance : (meses[d.row.index]?.[1].ingresos ?? 0) - (meses[d.row.index]?.[1].gastos ?? 0)
            d.cell.styles.textColor = neto < 0 ? COLOR.rojo : COLOR.verde
          },
        })
        y = trasTabla(doc)
      }

      // Cuentas por cobrar con antigüedad. Toda la deuda viva del club, no solo
      // la del período: una cuota de hace cuatro meses no deja de existir
      // porque el reporte sea de agosto.
      const refe = preview.finAnio * 12 + preview.finMes
      const tramos = [
        { nombre: 'Del período en curso', min: 0, max: 0, color: COLOR.ambar },
        { nombre: '1 mes de atraso', min: 1, max: 1, color: COLOR.naranja },
        { nombre: '2 meses de atraso', min: 2, max: 2, color: COLOR.rojo },
        { nombre: '3 meses o más', min: 3, max: 999, color: COLOR.rojo },
      ]
      const edad = (m: any) => refe - (m.anio * 12 + m.mes)
      const porTramo = tramos.map(t => {
        const filas = preview.porCobrar.filter((m: any) => { const e = edad(m); return e >= t.min && e <= t.max })
        return { ...t, filas, monto: filas.reduce((s: number, m: any) => s + (m.monto || 0), 0) }
      }).filter(t => t.filas.length > 0)

      doc.addPage()
      y = encabezado(doc, { ...cab, titulo: 'Cuentas por cobrar' })
      y = franjaTotal(doc, y, `${preview.porCobrar.length} cuotas impagas en total`, fmt(preview.totalPorCobrar), preview.totalPorCobrar > 0 ? COLOR.rojo : COLOR.verde)

      if (preview.porCobrar.length === 0) {
        y = sinDatos(doc, y, 'No hay mensualidades pendientes. Todo cobrado.')
      } else {
        y = tituloSeccion(doc, y, 'Antigüedad de la deuda', 'toda la deuda viva del club', COLOR.rojo)
        y = barrasCategoria(doc, y, porTramo.map(t => ({
          etiqueta: t.nombre, valor: t.monto, texto: `${fmt(t.monto)} · ${t.filas.length}`, color: t.color,
        })), COLOR.rojo, cab)

        y = asegurarEspacio(doc, y, 50, cab)
        y = tituloSeccion(doc, y, 'Detalle por jugador', `${preview.porCobrar.length} cuotas`, COLOR.rojo)
        autoTable(doc, {
          startY: y,
          head: [['Jugador', 'Categoría', 'Mes', 'Atraso', 'Monto', 'Estado']],
          body: [...preview.porCobrar]
            .sort((a: any, b: any) => edad(b) - edad(a) || (a.jugadores?.nombre || '').localeCompare(b.jugadores?.nombre || ''))
            .map((m: any) => {
              const e = edad(m)
              return [m.jugadores?.nombre || '—', m.jugadores?.categoria || '—', mesDe(m),
                e <= 0 ? 'al día' : e === 1 ? '1 mes' : `${e} meses`, m.monto ? fmt(m.monto) : '—', m.estado]
            }),
          foot: [['Total', '', '', '', fmt(preview.totalPorCobrar), '']],
          ...estiloTabla(COLOR.rojo),
          ...pintaEstado(5),
          columnStyles: { 1: { cellWidth: 26 }, 2: { cellWidth: 26 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }, 5: { cellWidth: 22, halign: 'center' } },
        })
      }

      // El libro del período, movimiento por movimiento: es lo que se revisa
      // cuando un total no cuadra, y era justo lo que el reporte no traía.
      if (preview.movimientos.length > 0) {
        doc.addPage()
        y = encabezado(doc, { ...cab, titulo: 'Libro de movimientos' })
        y = tituloSeccion(doc, y, 'Todos los movimientos del período', `${preview.movimientos.length} registros`)
        autoTable(doc, {
          startY: y,
          head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
          body: preview.movimientos.map((m: any) => [
            m.fecha, m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
            catLabel[m.categoria] || m.categoria, m.descripcion || '—',
            (m.tipo === 'ingreso' ? '+' : '-') + fmt(m.monto),
          ]),
          foot: [['', '', '', 'Resultado del período', fmt(balance)]],
          ...estiloTabla(),
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 20, halign: 'center' }, 2: { cellWidth: 34 }, 4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
          didParseCell: (d: any) => {
            if (d.section === 'body' && (d.column.index === 1 || d.column.index === 4)) {
              d.cell.styles.textColor = preview.movimientos[d.row.index]?.tipo === 'ingreso' ? COLOR.verde : COLOR.rojo
            }
            if (d.section === 'foot' && d.column.index === 4) d.cell.styles.textColor = balance < 0 ? COLOR.rojo : COLOR.verde
          },
        })
      }
    }

    // ── ASISTENCIA ────────────────────────────────────────────────────────
    if (categoriaRep === 'asistencia') {
      const activos = preview.activos.length
      const cobertura = activos > 0 ? Math.round((preview.promedioDiario / activos) * 100) : 0
      const conClase = Object.entries(preview.porDiaSemana).filter(([, v]) => (v as number) > 0) as [string, number][]
      const flojo = [...conClase].sort((a, b) => a[1] - b[1])[0]

      y = filaTarjetas(doc, y, [
        { valor: String(preview.totalAsist), etiqueta: 'Asistencias', color: COLOR.primario },
        { valor: String(preview.diasUnicos), etiqueta: 'Días con clase', color: COLOR.celeste },
        { valor: String(preview.promedioDiario), etiqueta: 'Promedio por clase', color: COLOR.verde },
        { valor: String(preview.sinAsistencia.length), etiqueta: 'Activos que no vinieron', color: preview.sinAsistencia.length > 0 ? COLOR.rojo : COLOR.verde },
      ])

      y = tituloSeccion(doc, y, 'La semana', 'asistencias por día', COLOR.primario)
      y = barrasColumnas(doc, y, preview.diasSemana.map((d: string, i: number) => ({ etiqueta: d.slice(0, 3), valor: preview.porDiaSemana[i] })), COLOR.primario)

      y = asegurarEspacio(doc, y, 45, cab)
      y = panelDatos(doc, y, [
        ['Día más lleno', preview.diaMasAsistido ? `${preview.diaMasAsistido[0]} (${preview.diaMasAsistido[1]})` : '—'],
        ['Día de semana fuerte', preview.diaSemanaMax ? `${preview.diaSemanaMax.dia} (${preview.diaSemanaMax.count})` : '—'],
        ['Día de semana flojo', flojo ? `${preview.diasSemana[parseInt(flojo[0])]} (${flojo[1]})` : '—'],
        ['Plantel activo', String(activos)],
        ['Ocupación media', `${cobertura}%`],
        ['Nunca vinieron', `${preview.sinAsistencia.length} (${pct(preview.sinAsistencia.length, activos)})`],
      ], 3)

      y = asegurarEspacio(doc, y, 60, cab)
      y = tituloSeccion(doc, y, 'Los que más entrenaron', 'top 10', COLOR.verde)
      y = barrasCategoria(doc, y, preview.topJugadores.map((j: any) => ({ etiqueta: j.nombre, valor: j.count, texto: `${j.count} clases` })), COLOR.verde, cab)

      // El plantel completo, no el top 10: el reporte sirve para ver quién se
      // está descolgando, y para eso hay que ver a todos.
      doc.addPage()
      y = encabezado(doc, { ...cab, titulo: 'Asistencia jugador por jugador' })
      const conteo = new Map<string, number>()
      for (const j of preview.activos) conteo.set(j.id, preview.porJugador[j.id]?.count ?? 0)
      const filasAsist = [...preview.activos].sort((a: any, b: any) =>
        (conteo.get(b.id) ?? 0) - (conteo.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre))
      y = tituloSeccion(doc, y, 'Todos los activos', `${filasAsist.length} jugadores · ${preview.diasUnicos} días con clase`)
      autoTable(doc, {
        startY: y,
        head: [['#', 'Jugador', 'Categoría', 'Clases', '% de los días']],
        body: filasAsist.map((j: any, i: number) => {
          const n = conteo.get(j.id) ?? 0
          return [String(i + 1), j.nombre, j.categoria || '—', String(n), pct(n, preview.diasUnicos)]
        }),
        foot: [['', 'Total', '', String(preview.totalAsist), '']],
        ...estiloTabla(),
        columnStyles: { 0: { cellWidth: 10, halign: 'right', textColor: COLOR.tenue }, 2: { cellWidth: 34 }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' } },
        didParseCell: (d: any) => {
          if (d.section !== 'body' || d.column.index !== 4) return
          const n = conteo.get(filasAsist[d.row.index]?.id) ?? 0
          const p = preview.diasUnicos > 0 ? (n / preview.diasUnicos) * 100 : 0
          d.cell.styles.fontStyle = 'bold'
          d.cell.styles.textColor = n === 0 ? COLOR.rojo : p >= 60 ? COLOR.verde : p >= 30 ? COLOR.ambar : COLOR.rojo
        },
      })
      y = trasTabla(doc)

      if (preview.sinAsistencia.length > 0) {
        y = asegurarEspacio(doc, y, 50, cab)
        y = tituloSeccion(doc, y, 'No asistieron ni una vez', String(preview.sinAsistencia.length), COLOR.rojo)
        autoTable(doc, {
          startY: y,
          head: [['Jugador', 'Categoría']],
          body: preview.sinAsistencia.map((j: any) => [j.nombre, j.categoria || '—']),
          ...estiloTabla(COLOR.rojo),
          columnStyles: { 1: { cellWidth: 60 } },
        })
      }
    }

    // ── TORNEOS Y LIGAS ───────────────────────────────────────────────────
    if (categoriaRep === 'torneos') {
      const jugadoresEnLigas = preview.ligas.reduce((s: number, l: any) =>
        s + (l.liga_divisiones || []).reduce((t: number, d: any) => t + (d.liga_division_jugadores || []).length, 0), 0)

      y = filaTarjetas(doc, y, [
        { valor: String(preview.torneos.length), etiqueta: 'Torneos del período', color: COLOR.naranja },
        { valor: String(preview.ligas.length), etiqueta: 'Ligas', color: COLOR.morado },
        { valor: String(jugadoresEnLigas), etiqueta: 'Inscritos en ligas', color: COLOR.celeste },
        { valor: fmt(preview.ingresosInscripcion), etiqueta: 'Ingresos por inscripción', color: COLOR.verde },
      ])

      if (Object.keys(preview.torneosPorEstado).length > 0) {
        y = tituloSeccion(doc, y, 'Torneos por estado', String(preview.torneos.length), COLOR.naranja)
        y = barrasCategoria(doc, y, Object.entries(preview.torneosPorEstado)
          .map(([e, c]) => ({ etiqueta: e, valor: c as number, texto: String(c), color: colorEstado(e) })), COLOR.naranja, cab)
      }

      if (preview.torneos.length > 0) {
        y = asegurarEspacio(doc, y, 50, cab)
        y = tituloSeccion(doc, y, 'Detalle de torneos')
        autoTable(doc, {
          startY: y,
          head: [['Nombre', 'Fecha', 'Tipo', 'Estado']],
          // "Fase" salía siempre en raya: es columna de torneo_partidos, no de
          // torneos. En su lugar va el tipo, que sí viene en la consulta.
          body: preview.torneos.map((t: any) => [t.nombre, t.fecha_inicio || '—', t.tipo || '—', t.estado]),
          ...estiloTabla(COLOR.naranja),
          ...pintaEstado(3),
          columnStyles: { 1: { cellWidth: 28 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30, halign: 'center' } },
        })
        y = trasTabla(doc)
      }

      if (preview.ligas.length > 0) {
        y = asegurarEspacio(doc, y, 50, cab)
        y = tituloSeccion(doc, y, 'Ligas', String(preview.ligas.length), COLOR.morado)
        autoTable(doc, {
          startY: y,
          head: [['Liga', 'Estado', 'Divisiones', 'Jugadores', 'Fechas', 'Partidos']],
          body: preview.ligas.map((l: any) => [
            l.nombre, l.estado,
            String((l.liga_divisiones || []).length),
            String((l.liga_divisiones || []).reduce((s: number, d: any) => s + (d.liga_division_jugadores || []).length, 0)),
            String((l.liga_fechas || [{ count: 0 }])[0]?.count || 0),
            String((l.liga_partidos || [{ count: 0 }])[0]?.count || 0),
          ]),
          ...estiloTabla(COLOR.morado),
          ...pintaEstado(1),
          columnStyles: { 1: { cellWidth: 26, halign: 'center' }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' } },
        })
      }

      if (preview.torneos.length === 0 && preview.ligas.length === 0) sinDatos(doc, y)
    }

    piePagina(doc, `${club}  ·  Reporte ${catInfo.label}  ·  ${titulo}`)
    const jn = categoriaRep === 'jugador' && preview.jugador ? `_${preview.jugador.nombre.replace(/ /g, '_')}` : ''
    doc.save(`reporte_${categoriaRep}${jn}_${titulo.replace(/ /g, '_')}.pdf`)
    } catch (e: any) {
      console.error('[reportes] falló generar el PDF', e)
      setErrorRep(`No se pudo generar el PDF: ${e?.message || e}`)
    } finally {
      setGenerando(false)
    }

  }

  const { titulo } = getRango()
  // Las mensualidades se guardan por mes y año, no por fecha: la vista pedía
  // `m.fecha` y mostraba una columna entera de "undefined".
  const mesDeVista = (m: any) => (m?.mes ? `${mesesN[m.mes - 1]} ${m.anio}` : '—')

  return (
    <div>
      {/* Selector de tipo de reporte */}
      <div style={{ ...card, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>¿Qué reporte necesitas?</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10 }}>
          {categoriasReporte.map(c => {
            const activa = categoriaRep === c.key
            return (
              <button key={c.key} onClick={() => setCategoriaRep(c.key)}
                style={{ padding:'14px 14px', borderRadius:12, border: activa ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: activa ? '#ede9fe' : '#f8fafc', cursor:'pointer', textAlign:'left', display:'flex', flexDirection:'column', gap:4, transition:'all .15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ fontSize:15 }}>{c.emoji}</span>
                  <span style={{ fontSize:13.5, fontWeight:700, color: activa ? '#3730a3' : text }}>{c.label}</span>
                </div>
                <div style={{ fontSize:11, fontWeight:600, color: activa ? '#4f46e5' : muted }}>{c.desc}</div>
                {/* Sin este renglón nadie sabía qué iba a salir hasta bajar el PDF. */}
                <div style={{ fontSize:10.5, color: hint, lineHeight:1.35 }}>{c.trae}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Configuración de período */}
      <div style={{ ...card, padding:20, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:16 }}>Configurar período</div>
        <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
          {(['mensual','trimestral','semestral','anual'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:tipo===t?'#4f46e5':'#f4f7fa', color:tipo===t?'white': muted, fontSize:12, cursor:'pointer', fontWeight: tipo===t ? 600 : 400, textTransform:'capitalize' }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: categoriaRep === 'jugador' ? 0 : 16 }}>
          {tipo==='mensual' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Mes</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={mes} onChange={e=>setMes(parseInt(e.target.value))}>
                {mesesN.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {tipo==='trimestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Trimestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={trimestre} onChange={e=>setTrimestre(parseInt(e.target.value))}>
                <option value={1}>Q1 — Ene, Feb, Mar</option><option value={2}>Q2 — Abr, May, Jun</option>
                <option value={3}>Q3 — Jul, Ago, Sep</option><option value={4}>Q4 — Oct, Nov, Dic</option>
              </select>
            </div>
          )}
          {tipo==='semestral' && (
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Semestre</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={semestre} onChange={e=>setSemestre(parseInt(e.target.value))}>
                <option value={1}>1er Semestre</option><option value={2}>2do Semestre</option>
              </select>
            </div>
          )}
          <div style={{ flex:1, minWidth:120 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Año</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }} value={anio} onChange={e=>setAnio(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {categoriaRep === 'jugador' && (
          <div style={{ marginTop:14, marginBottom:16 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Jugador</label>
            <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
              value={jugadorId} onChange={e => setJugadorId(e.target.value)}>
              <option value="">— Seleccionar jugador —</option>
              {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre} ({j.categoria || 'Sin cat.'}) {j.estado !== 'activo' ? `[${j.estado}]` : ''}</option>)}
            </select>
          </div>
        )}
        {/* Los dos botones tenían el mismo peso visual y colores que se peleaban
            (lila contra rosa). Son dos pasos de lo mismo: primero se mira, y el
            PDF recién se habilita cuando hay algo que bajar. */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={generarPreview} disabled={generando || (categoriaRep === 'jugador' && !jugadorId)}
            style={{ flex:'1 1 200px', padding:'13px 18px', background: (categoriaRep === 'jugador' && !jugadorId) ? '#e2e8f0' : 'linear-gradient(135deg, #4f46e5, #6366f1)', color: (categoriaRep === 'jugador' && !jugadorId) ? hint : 'white', border:'none', borderRadius:10, fontSize:13.5, fontWeight:700, cursor: (categoriaRep === 'jugador' && !jugadorId) ? 'not-allowed' : 'pointer' }}>
            {generando ? 'Cargando…' : preview ? '↻ Actualizar vista' : 'Ver el reporte'}
          </button>
          <button onClick={exportarPDF} disabled={generando || !preview}
            style={{ flex:'1 1 200px', padding:'13px 18px', background: preview ? '#ffffff' : '#f8fafc', color: preview ? '#3730a3' : hint, border: `1.5px solid ${preview ? '#c4b5fd' : '#e2e8f0'}`, borderRadius:10, fontSize:13.5, fontWeight:700, cursor: preview ? 'pointer' : 'not-allowed' }}>
            {generando ? 'Generando…' : '📄 Descargar PDF'}
          </button>
          {!preview && !errorRep && (
            <div style={{ flexBasis:'100%', fontSize:11.5, color: hint }}>
              {categoriaRep === 'jugador' && !jugadorId
                ? 'Elige un jugador para poder generar el reporte.'
                : 'Primero mira el reporte en pantalla; el PDF se habilita al tenerlo listo.'}
            </div>
          )}
          {/* El error tiene que verse en pantalla: si solo va a la consola, lo
              único que se nota es que el botón se quedó pensando para siempre. */}
          {errorRep && (
            <div style={{ flexBasis:'100%', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'11px 13px', fontSize:12, color:'#dc2626' }}>
              {errorRep}
            </div>
          )}
        </div>
      </div>

      {/* Vista previa — General. Es el mismo análisis que imprime el PDF
          (`analizarGeneral`), para que lo que se ve en pantalla y lo que sale
          en papel no puedan decir cosas distintas. */}
      {preview && categoriaRep === 'general' && (() => {
        const resumen = analizarGeneral(preview, fmtVista)
        const tonoBg: Record<string, { bg: string; borde: string; color: string }> = {
          bien:   { bg:'#f0fdf4', borde:'#bbf7d0', color:'#16a34a' },
          ojo:    { bg:'#fffbeb', borde:'#fde68a', color:'#d97706' },
          mal:    { bg:'#fef2f2', borde:'#fecaca', color:'#dc2626' },
          info:   { bg:'#eff6ff', borde:'#bfdbfe', color:'#2563eb' },
          neutro: { bg:'#f8fafc', borde:'#e2e8f0', color: muted },
        }
        const Bloque = ({ titulo: t, datos }: { titulo: string; datos: any[] }) => (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color: text, marginBottom:10 }}>{t}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:12 }}>
              {datos.map(d => {
                const c = tonoBg[d.tono]
                return (
                  <div key={d.etiqueta} style={{ background:c.bg, border:`1px solid ${c.borde}`, borderRadius:12, padding:'14px 15px' }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color: muted, letterSpacing:.3, textTransform:'uppercase' }}>{d.etiqueta}</div>
                    <div style={{ fontSize:19, fontWeight:700, color:c.color, marginTop:5, wordBreak:'break-word' }}>{d.valor}</div>
                    {d.detalle && <div style={{ fontSize:11, color: hint, marginTop:4, lineHeight:1.35 }}>{d.detalle}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )
        return (
          <div>
            <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>{titulo} — cómo va el club</div>

            <div style={{ background: resumen.balance >= 0 ? '#f0fdf4' : '#fef2f2', border:`1px solid ${resumen.balance >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius:14, padding:'16px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <div style={{ fontSize:13, color: muted }}>Resultado del período {resumen.balance >= 0 ? '— a favor' : '— en contra'}</div>
              <div style={{ fontSize:26, fontWeight:700, color: resumen.balance >= 0 ? '#16a34a' : '#dc2626', fontFamily:'monospace' }}>{fmtVista(resumen.balance)}</div>
            </div>

            <div style={{ ...card, padding:18, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color: text, marginBottom:10 }}>Lo que hay que mirar</div>
              {resumen.hallazgos.map((h, i) => (
                <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start', padding:'7px 0', borderBottom: i < resumen.hallazgos.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: tonoBg[h.tono].color, marginTop:5, flexShrink:0 }} />
                  <span style={{ fontSize:12.5, color: text, lineHeight:1.45 }}>{h.texto}</span>
                </div>
              ))}
            </div>

            <Bloque titulo="La plata" datos={resumen.plata} />
            <Bloque titulo="La gente" datos={resumen.gente} />

            {preview.morosos.length > 0 && (
              <div style={{ ...card, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#dc2626', marginBottom:10 }}>A quién cobrarle ({preview.morosos.length})</div>
                <div style={{ fontSize:11.5, color: hint, marginBottom:8 }}>En el PDF va con los meses impagos, el monto de cada uno y si sigue entrenando.</div>
                {preview.morosos.slice(0, 8).map((j: any) => (
                  <div key={j.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                    <span style={{ color: text }}>{j.nombre}</span>
                    <span style={{ color: muted }}>{resumen.asistPorJug.get(j.id) ?? 0} clases en el período</span>
                  </div>
                ))}
                {preview.morosos.length > 8 && <div style={{ fontSize:11.5, color: hint, paddingTop:8 }}>y {preview.morosos.length - 8} más en el PDF.</div>}
              </div>
            )}
          </div>
        )
      })()}

      {/* Vista previa — Jugador */}
      {preview && categoriaRep === 'jugador' && preview.jugador && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — {preview.jugador.nombre} — {titulo}</div>
          <div style={{ ...card, padding:20, marginBottom:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, fontSize:13 }}>
              {([['Categoría', preview.jugador.categoria || '—'], ['Estado', preview.jugador.estado || '—'], ['Plan', preview.jugador.tipo_plan || '—'], ['Asistencias (período)', String((preview.asistencias || []).length)], ['Mensualidad', preview.jugador.mensualidad ? fmtVista(preview.jugador.mensualidad) : '—'], ['RUT', preview.jugador.rut || '—'], ['Email', preview.jugador.email || '—']] as [string, any][]).map(([l, v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ color: muted }}>{l}</span>
                  <span style={{ color: text, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Pagado (período)', value:fmtVista(preview.totalPagado), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Pendiente', value:fmtVista(preview.totalPendiente), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' }, { label:'Asistencias', value:String(preview.asistencias.length), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }].map(s => (
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
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Monto</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th></tr></thead>
                  <tbody>{preview.mensualidades.map((m: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text }}>{mesDeVista(m)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: text }}>{m.monto ? fmtVista(m.monto) : '—'}</td>
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

      {/* Vista previa — Finanzas */}
      {preview && categoriaRep === 'finanzas' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Finanzas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Ingresos', value:fmtVista(preview.ingresos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Gastos', value:fmtVista(preview.gastos), color:'#dc2626', bg:'#fef2f2', border:'#fecaca' }, { label:'Balance', value:fmtVista(preview.ingresos - preview.gastos), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }].map(s => (
              <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:12, color:s.color, marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#16a34a', fontFamily:'monospace' }}>{fmtVista(preview.totalMensPagado)}</div>
              <div style={{ fontSize:12, color:'#16a34a', marginTop:4 }}>Mensualidades cobradas</div>
            </div>
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:12, padding:16, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'#dc2626', fontFamily:'monospace' }}>{fmtVista(preview.totalMensPendiente)}</div>
              <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>Mensualidades pendientes</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Ingresos por categoría</div>
              {Object.entries(preview.desgloseIngresos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#16a34a', fontFamily:'monospace' }}>{fmtVista(total as number)}</span>
                </div>
              ))}
              {Object.keys(preview.desgloseIngresos).length === 0 && <p style={{ fontSize:12, color: hint }}>Sin ingresos</p>}
            </div>
            <div style={{ ...card, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>Gastos por categoría</div>
              {Object.entries(preview.desgloseGastos).map(([cat, total]) => (
                <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                  <span style={{ color: muted }}>{catLabel[cat] || cat}</span>
                  <span style={{ color:'#dc2626', fontFamily:'monospace' }}>{fmtVista(total as number)}</span>
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
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Mes</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Ingresos</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Gastos</th><th style={{ textAlign:'right', padding:'8px 6px', color: muted }}>Balance</th></tr></thead>
                  <tbody>{Object.entries(preview.porMes).sort().map(([mk, v]: any) => (
                    <tr key={mk} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text }}>{mesesN[parseInt(mk.slice(5, 7)) - 1]} {mk.slice(0, 4)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#16a34a' }}>{fmtVista(v.ingresos)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color:'#dc2626' }}>{fmtVista(v.gastos)}</td>
                      <td style={{ padding:'8px 6px', textAlign:'right', fontFamily:'monospace', color: v.ingresos - v.gastos >= 0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>{fmtVista(v.ingresos - v.gastos)}</td>
                    </tr>
                  ))}</tbody>
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
                  <span><span style={{ color: muted, marginRight:8 }}>{mesDeVista(m)}</span><span style={{ fontFamily:'monospace', color:'#dc2626' }}>{m.monto ? fmtVista(m.monto) : '—'}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vista previa — Asistencia */}
      {preview && categoriaRep === 'asistencia' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Asistencia — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Total asistencias', value:String(preview.totalAsist), color:'#3730a3', bg:'#ede9fe', border:'#c4b5fd' }, { label:'Días con registro', value:String(preview.diasUnicos), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }, { label:'Promedio diario', value:String(preview.promedioDiario), color:'#d97706', bg:'#fffbeb', border:'#fde68a' }].map(s => (
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
                    <div style={{ width:`${(preview.porDiaSemana[i] / max) * 100}%`, height:'100%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius:4 }} />
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

      {/* Vista previa — Torneos y Ligas */}
      {preview && categoriaRep === 'torneos' && (
        <div>
          <div style={{ fontSize:14, fontWeight:600, color: text, marginBottom:12 }}>Vista previa — Torneos y Ligas — {titulo}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:16 }}>
            {[{ label:'Torneos', value:String(preview.torneos.length), color:'#d97706', bg:'#fffbeb', border:'#fde68a' }, { label:'Ligas', value:String(preview.ligas.length), color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe' }, { label:'Ingresos inscripción', value:fmtVista(preview.ingresosInscripcion), color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' }].map(s => (
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
                  <thead><tr style={{ borderBottom:'2px solid #e2e8f0' }}><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Nombre</th><th style={{ textAlign:'left', padding:'8px 6px', color: muted }}>Fecha</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Estado</th><th style={{ textAlign:'center', padding:'8px 6px', color: muted }}>Tipo</th></tr></thead>
                  <tbody>{preview.torneos.map((t: any, i: number) => (
                    <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                      <td style={{ padding:'8px 6px', color: text, fontWeight:500 }}>{t.nombre}</td>
                      <td style={{ padding:'8px 6px', color: muted }}>{t.fecha_inicio || '—'}</td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600, background: t.estado === 'finalizado' ? '#dcfce7' : t.estado === 'en_curso' ? '#dbeafe' : '#fef9c3', color: t.estado === 'finalizado' ? '#16a34a' : t.estado === 'en_curso' ? '#2563eb' : '#d97706' }}>{t.estado}</span>
                      </td>
                      <td style={{ padding:'8px 6px', textAlign:'center', color: muted }}>{t.tipo || '—'}</td>
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
    </div>
  )
}
