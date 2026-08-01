'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { registrarPago, generarMensualidadesPendientes, marcarAtrasado as marcarAtrasadoAction, revertirPago } from '@/app/actions/mensualidades'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { linkWhatsApp } from '@/lib/whatsapp'
import FiltroMultiSelect from '@/components/FiltroMultiSelect'
import { SEDES, GRUPOS, entrenaEnSede } from '@/lib/domain/sedeGrupo'
import { montoEsperado, montoIngresado, SIN_CUOTA } from '@/lib/domain/mensualidades'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const mesesN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function MensualidadesPanel({ onPagoRegistrado, mes: mesProp, anio: anioProp }: { onPagoRegistrado?: () => void; mes?: number; anio?: number } = {}) {
  const { perfil } = usePerfil()
  const [jugadores, setJugadores] = useState<any[]>([])
  const [mensualidades, setMensualidades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mesLocal, setMesLocal] = useState(new Date().getMonth() + 1)
  const [anioLocal, setAnioLocal] = useState(new Date().getFullYear())
  const mes = mesProp ?? mesLocal
  const anio = anioProp ?? anioLocal
  const tienePropsExternos = mesProp !== undefined
  const [modalPago, setModalPago] = useState<any>(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [montoPago, setMontoPago] = useState('')
  const [errorPago, setErrorPago] = useState('')
  const [registrandoPago, setRegistrandoPago] = useState(false)
  const pagoOperacionId = useRef<string | null>(null)
  const clubInfoCargada = useRef(false)
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'pagado'|'pendiente'|'atrasado'>('todos')
  // "Este mes" es la vista de siempre. "Deuda acumulada" junta todo lo impago
  // de meses ya vencidos: es lo que hace falta para cobrar, porque nadie debe
  // una cuota, debe tres.
  const [alcance, setAlcance] = useState<'mes'|'deuda'>('mes')
  const [impagas, setImpagas] = useState<any[]>([])
  // Deudores que no están en `jugadores`: se fueron del club, o deben un mes
  // viejo y no tienen cuota del mes que se está mirando. La deuda no se borra
  // porque la persona ya no venga.
  const [jugadoresDeuda, setJugadoresDeuda] = useState<any[]>([])
  const [cargandoDeuda, setCargandoDeuda] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat]     = useState<Set<string>>(new Set())
  const [filtroGrupo, setFiltroGrupo] = useState<Set<string>>(new Set())
  const [filtroSede, setFiltroSede]   = useState<Set<string>>(new Set())
  const [clubNombre, setClubNombre] = useState('')
  const clubId = perfil?.club_id ?? null

  useEffect(() => {
    if (!clubId) return
    const tasks: PromiseLike<any>[] = [cargarMensualidades(clubId)]
    if (!clubInfoCargada.current) {
      clubInfoCargada.current = true
      tasks.push(
        supabase.from('clubes').select('nombre,mensualidad_base').eq('id', clubId).single()
          .then(({ data }) => {
            // La cuota base del club no se precarga acá: el monto lo pone el
            // modal con la cuota real del jugador, y si no tiene queda vacío.
            if (data?.nombre) setClubNombre(data.nombre)
          })
      )
    }
    Promise.all(tasks).then(() => setLoading(false))
  }, [clubId, mes, anio])

  async function cargarMensualidades(cid?: string) {
    const id = cid || clubId
    const [{ data: j }, { data: m }] = await Promise.all([
      supabase.from('jugadores').select('id,nombre,rut,estado,mensualidad,tipo_plan,sesiones_limite,categoria,categorias,grupo,sede,telefono').eq('club_id', id).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false').order('nombre'),
      supabase.from('mensualidades').select('id,club_id,jugador_id,mes,anio,monto,estado,fecha_pago,notas').eq('club_id', id).eq('mes', mes).eq('anio', anio)
    ])
    // ponytail: un jugador dado de baja igual puede tener mensualidad del mes;
    // sin esto desaparece de la tabla y su pago queda invisible
    const jugActivos = j || []
    const mens = m || []
    const idsActivos = new Set(jugActivos.map((jug: any) => jug.id))
    const idsFaltantes = [...new Set(mens.filter((me: any) => !idsActivos.has(me.jugador_id)).map((me: any) => me.jugador_id))]
    let jugTodos = jugActivos
    if (idsFaltantes.length > 0) {
      const { data: extras } = await supabase.from('jugadores').select('id,nombre,rut,estado,mensualidad,tipo_plan,sesiones_limite,categoria,categorias,grupo,sede,telefono').in('id', idsFaltantes)
      if (extras?.length) jugTodos = [...jugActivos, ...extras].sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
    }
    setJugadores(jugTodos)
    setMensualidades(mens)

    // Auto-generar registros pendientes solo para el mes actual para no crear
    // filas históricas al navegar a meses anteriores
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const esMesActual = mes === mesActual && anio === anioActual
    if (esMesActual) {
      const sinMens = (j || []).filter(jug => !(m || []).find((mens: any) => mens.jugador_id === jug.id))
      if (sinMens.length > 0) {
        await generarMensualidadesPendientes({ jugadorIds: sinMens.map(jug => jug.id), mes, anio })
        const { data: mActual2 } = await supabase.from('mensualidades').select('id,club_id,jugador_id,mes,anio,monto,estado,fecha_pago,notas').eq('club_id', id).eq('mes', mes).eq('anio', anio)
        setMensualidades(mActual2 || [])
      }
    }
  }

  // Todo lo impago del club, sin importar el mes. No se filtra por período en
  // la consulta: las mensualidades solo se emiten para el mes en curso, así que
  // no existen filas anteriores al ingreso de cada jugador y no hay forma de
  // que alguien aparezca debiendo meses en los que todavía no estaba.
  async function cargarDeuda(cid?: string) {
    const id = cid || clubId
    if (!id) return
    setCargandoDeuda(true)
    const { data } = await supabase
      .from('mensualidades')
      .select('id,jugador_id,mes,anio,monto,estado')
      .eq('club_id', id)
      .neq('estado', 'pagado')
      .order('anio').order('mes')
    const deudas = data || []
    setImpagas(deudas)

    // Sin esto, quien debe marzo pero ya no figura en la tabla del mes que se
    // está mirando desaparece de la lista y su deuda queda invisible. Es el
    // mismo agujero que la vista del mes ya tapó para los dados de baja.
    const conocidos = new Set(jugadores.map((j: any) => j.id))
    const faltantes = [...new Set(deudas.map((m: any) => m.jugador_id).filter((jid: string) => !conocidos.has(jid)))]
    if (faltantes.length > 0) {
      const { data: extras } = await supabase.from('jugadores')
        .select('id,nombre,rut,estado,mensualidad,tipo_plan,sesiones_limite,categoria,categorias,grupo,sede,telefono')
        .in('id', faltantes as string[])
      setJugadoresDeuda(extras || [])
    } else {
      setJugadoresDeuda([])
    }
    setCargandoDeuda(false)
  }

  useEffect(() => {
    if (alcance === 'deuda' && clubId) void cargarDeuda(clubId)
  }, [alcance, clubId])

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++ }
    if (nuevoMes < 1) { nuevoMes = 12; nuevoAnio-- }
    setMesLocal(nuevoMes)
    setAnioLocal(nuevoAnio)
  }

  async function marcarPagado(jugadorId: string, mensId: string) {
    if (registrandoPago) return
    // Un pago es plata que entra al libro. Sin monto escrito no se registra
    // nada: antes se guardaban $25.000 por defecto, y un movimiento inventado
    // en finanzas no hay cómo distinguirlo después de uno real.
    const monto = montoIngresado(montoPago)
    if (monto == null || monto <= 0) {
      setErrorPago('Escribí el monto que pagó. No se registra un pago sin monto.')
      return
    }
    setErrorPago('')
    setRegistrandoPago(true)
    pagoOperacionId.current ??= crypto.randomUUID()
    const jugador = jugadores.find(j => j.id === jugadorId)
    const resultado = await registrarPago({
      jugadorId, jugadorNombre: jugador?.nombre || '', mensualidadId: mensId || null,
      mes, anio, monto, metodo: metodoPago, registradoPor: perfil?.nombre || 'Admin',
      idempotencyKey: pagoOperacionId.current,
    })
    setRegistrandoPago(false)
    if (resultado.error) { setErrorPago(resultado.error); return }
    pagoOperacionId.current = null
    setModalPago(null)
    cargarMensualidades()
    onPagoRegistrado?.()
  }

  async function marcarAtrasado(mensId: string) {
    await marcarAtrasadoAction({ mensualidadId: mensId })
    cargarMensualidades()
  }

  async function marcarPendiente(mensId: string, jugadorId: string) {
    await revertirPago({ mensualidadId: mensId, jugadorId, mes, anio })
    cargarMensualidades()
    onPagoRegistrado?.()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')

    // En deuda acumulada se exporta lo que se está mirando y nada más: es la
    // lista con la que se sale a cobrar, y mezclarla con el mes suelto la
    // vuelve inútil.
    if (alcance === 'deuda') {
      const wbDeuda = utils.book_new()
      const filas = deudores.map(d => ({
        'Nombre': d.jugador.nombre,
        'RUT': d.jugador.rut || '',
        'Teléfono': d.jugador.telefono || '',
        'Meses adeudados': d.cuotas.length,
        'Cuáles': d.cuotas.map(etiquetaCuota).join(', '),
        'Total adeudado': d.total,
        'Monto incompleto': d.incompleto ? 'Sí — hay cuotas sin monto asignado' : '',
      }))
      const wsDeuda = utils.json_to_sheet(filas)
      wsDeuda['!cols'] = [{ wch:30 },{ wch:14 },{ wch:16 },{ wch:16 },{ wch:34 },{ wch:16 },{ wch:34 }]
      utils.book_append_sheet(wbDeuda, wsDeuda, 'Deuda acumulada')
      writeFile(wbDeuda, `deuda_acumulada_${fechaChile()}.xlsx`)
      return
    }

    const { data: historial } = await supabase.from('mensualidades').select('id,jugador_id,mes,anio,monto,estado,fecha_pago,metodo,notas').eq('club_id', clubId).order('anio').order('mes')
    const wb = utils.book_new()

    const mensualidadPorJugador = new Map(mensualidades.map(m => [m.jugador_id, m]))
    const datosMes = jugadores.map(j => {
      const mens = mensualidadPorJugador.get(j.id)
      const estado = mens?.estado || 'pendiente'
      return {
        'Nombre': j.nombre, 'RUT': j.rut || '', 'Plan': `${j.sesiones_limite} sesiones`,
        'Estado': estado === 'pagado' ? 'Pagado' : estado === 'atrasado' ? 'Atrasado' : 'Pendiente',
        'Fecha pago': mens?.fecha_pago || '', 'Monto': mens?.monto || '', 'Método': mens?.metodo_pago || '',
      }
    })
    const ws1 = utils.json_to_sheet(datosMes)
    ws1['!cols'] = [{ wch:30 },{ wch:15 },{ wch:15 },{ wch:12 },{ wch:14 },{ wch:12 },{ wch:12 }]
    const range = utils.decode_range(ws1['!ref'] || 'A1')
    for (let r = 1; r <= range.e.r; r++) {
      const cell = ws1[utils.encode_cell({ r, c: 3 })]
      if (cell) {
        if (!cell.s) cell.s = {}
        if (cell.v === 'Atrasado') cell.s.fill = { fgColor: { rgb: 'FFE0E0' } }
        else if (cell.v === 'Pendiente') cell.s.fill = { fgColor: { rgb: 'FFF8E0' } }
        else if (cell.v === 'Pagado') cell.s.fill = { fgColor: { rgb: 'E0FFE8' } }
      }
    }
    utils.book_append_sheet(wb, ws1, `${mesesN[mes-1]} ${anio}`)

    const jugadorPorId = new Map(jugadores.map(j => [j.id, j]))
    const datosHistorial = (historial || []).map(h => {
      const jug = jugadorPorId.get(h.jugador_id)
      return { 'Nombre': jug?.nombre || '', 'Mes': mesesN[h.mes-1], 'Año': h.anio, 'Estado': h.estado === 'atrasado' ? 'Atrasado' : h.estado === 'pendiente' ? 'Pendiente' : 'Pagado', 'Fecha pago': h.fecha_pago || '', 'Monto': h.monto || '' }
    })
    const ws2 = utils.json_to_sheet(datosHistorial)
    ws2['!cols'] = [{ wch:30 },{ wch:14 },{ wch:8 },{ wch:12 },{ wch:14 },{ wch:12 }]
    utils.book_append_sheet(wb, ws2, 'Historial completo')

    const historialPorJugador = new Map<string, typeof historial>()
    ;(historial || []).forEach(h => {
      const lista = historialPorJugador.get(h.jugador_id) || []
      lista.push(h)
      historialPorJugador.set(h.jugador_id, lista)
    })
    const resumen = jugadores.map(j => {
      const histJug = historialPorJugador.get(j.id) || []
      return { 'Nombre': j.nombre, 'RUT': j.rut || '', 'Categoría': j.categoria, 'Plan (sesiones)': j.sesiones_limite, 'Cuotas pagadas': histJug.filter(h => h.estado === 'pagado').length, 'Cuotas atrasadas': histJug.filter(h => h.estado === 'atrasado').length, 'Cuotas pendientes': histJug.filter(h => h.estado === 'pendiente').length, 'Total pagado': histJug.filter(h => h.estado === 'pagado').reduce((s, h) => s + (h.monto || 0), 0) }
    })
    const ws3 = utils.json_to_sheet(resumen)
    ws3['!cols'] = [{ wch:30 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:16 },{ wch:17 },{ wch:17 },{ wch:14 }]
    utils.book_append_sheet(wb, ws3, 'Resumen por jugador')

    writeFile(wb, `mensualidades_${mesesN[mes-1]}_${anio}.xlsx`)
  }

  const pagados = mensualidades.filter(m => m.estado === 'pagado').length
  const pendientes = mensualidades.filter(m => m.estado === 'pendiente').length
  const atrasados = mensualidades.filter(m => m.estado === 'atrasado').length
  const totalRecaudado = mensualidades.filter(m => m.estado === 'pagado').reduce((s,m) => s + (m.monto||0), 0)
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const categoriasDisponibles = [...new Set(
    jugadores.flatMap(j => (j.categorias?.length ? j.categorias : [j.categoria])).filter(Boolean)
  )].sort((a, b) => String(a).localeCompare(String(b), 'es')) as string[]

  // Los filtros de quién es el jugador. Se comparten entre las dos vistas; el
  // de estado no, porque en deuda acumulada todo lo listado es impago.
  function coincidePerfil(j: any) {
    const coincideBusqueda = !busqueda || j.nombre.toLowerCase().includes(busqueda.toLowerCase())
    // Un jugador puede competir en varias categorías (la suya por edad + TC).
    const coincideCat = filtroCat.size === 0 ||
      [...filtroCat].some(c => (j.categorias?.length ? j.categorias.includes(c) : j.categoria === c))
    const coincideGrupo = filtroGrupo.size === 0 || filtroGrupo.has(j.grupo)
    const coincideSede = filtroSede.size === 0 || [...filtroSede].some(s => entrenaEnSede(j.sede, s))
    return coincideBusqueda && coincideCat && coincideGrupo && coincideSede
  }

  const jugadoresFiltrados = jugadores.filter(j => {
    const mens = mensualidades.find(m => m.jugador_id === j.id)
    const estado = mens?.estado || 'pendiente'
    const coincideEstado = filtroEstado === 'todos' || estado === filtroEstado
    return coincideEstado && coincidePerfil(j)
  })

  // El mes de hoy, no el que se está mirando: una cuota del mes que viene no es
  // una deuda, aunque figure como pendiente.
  const periodoHoy = new Date().getFullYear() * 100 + (new Date().getMonth() + 1)

  // Por id y no concatenando a secas: si la deuda se cargó antes que la tabla
  // del mes, el mismo jugador viene por las dos listas y saldría dos veces.
  const deudores = [...new Map(
    [...jugadores, ...jugadoresDeuda].map((j: any) => [j.id, j]),
  ).values()]
    .filter(coincidePerfil)
    .map(j => {
      const cuotas = impagas
        .filter(m => m.jugador_id === j.id && (m.anio * 100 + m.mes) <= periodoHoy)
        .sort((a, b) => (a.anio * 100 + a.mes) - (b.anio * 100 + b.mes))
      return {
        jugador: j,
        cuotas,
        total: cuotas.reduce((s, c) => s + (montoEsperado(j, c) ?? 0), 0),
        // Si a alguna cuota no le asignaron monto, el total que se muestra es
        // menor al real. Hay que decirlo, no dejar que se lea como exacto.
        incompleto: cuotas.some(c => montoEsperado(j, c) == null),
      }
    })
    .filter(d => d.cuotas.length > 0)
    .sort((a, b) => b.cuotas.length - a.cuotas.length || b.total - a.total)

  const totalAdeudado = deudores.reduce((s, d) => s + d.total, 0)
  const cuotasImpagas = deudores.reduce((s, d) => s + d.cuotas.length, 0)
  const masAntigua = deudores.flatMap(d => d.cuotas).reduce<{ mes: number; anio: number } | null>(
    (viejo, c) => (!viejo || (c.anio * 100 + c.mes) < (viejo.anio * 100 + viejo.mes) ? { mes: c.mes, anio: c.anio } : viejo),
    null,
  )
  const etiquetaCuota = (c: { mes: number; anio: number }) =>
    c.anio === new Date().getFullYear() ? mesesN[c.mes - 1] : `${mesesN[c.mes - 1]} ${c.anio}`

  if (loading) return <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Cargando mensualidades...</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        {!tienePropsExternos && alcance === 'mes' && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => cambiarMes(-1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>◀</button>
            <span style={{ fontSize:16, fontWeight:600, color: text, minWidth:160, textAlign:'center' }}>{mesesN[mes-1]} {anio}</span>
            <button onClick={() => cambiarMes(1)} style={{ ...card, border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', color: muted, cursor:'pointer' }}>▶</button>
          </div>
        )}
        <button onClick={exportarExcel} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer' }}>📊 Exportar Excel</button>
      </div>

      {/* Alcance: un mes suelto o todo lo que se debe */}
      <div style={{ display:'flex', background:'#e2e8f0', borderRadius:10, padding:4, marginBottom:16 }}>
        {([
          { key:'mes',   label:`📅 ${mesesN[mes-1]} ${anio}` },
          { key:'deuda', label:'🧾 Deuda acumulada' },
        ] as const).map(t => (
          <div key={t.key} onClick={() => setAlcance(t.key)}
            style={{ flex:1, padding:'9px', textAlign:'center', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:500, background: alcance===t.key?'#ffffff':'transparent', color: alcance===t.key?'#3730a3': muted, transition:'all 0.15s', boxShadow: alcance===t.key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
        {(alcance === 'deuda' ? [
          { label:'👥 Deudores', value:deudores.length, color:'#dc2626', bg:'#fef2f2' },
          { label:'🧾 Cuotas impagas', value:cuotasImpagas, color:'#d97706', bg:'#fffbeb' },
          { label:'💸 Total adeudado', value:fmt(totalAdeudado), color:'#dc2626', bg:'#fef2f2' },
          { label:'📅 Más antigua', value: masAntigua ? etiquetaCuota(masAntigua) : '—', color:'#3730a3', bg:'#ede9fe' },
        ] : [
          { label:'✅ Pagados', value:pagados, color:'#16a34a', bg:'#f0fdf4' },
          { label:'⏳ Pendientes', value:pendientes, color:'#d97706', bg:'#fffbeb' },
          { label:'⚠️ Atrasados', value:atrasados, color:'#dc2626', bg:'#fef2f2' },
          { label:'💰 Recaudado', value:fmt(totalRecaudado), color:'#3730a3', bg:'#ede9fe' },
        ]).map(s => (
          <div key={s.label} style={{ background: s.bg, border:`1px solid ${s.color}33`, borderRadius:14, padding:16, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:22, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
            <div style={{ fontSize:12, color: muted, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <input style={{ flex:1, minWidth:200, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'9px 12px', color: text, fontSize:13, outline:'none' }}
          placeholder="Buscar jugador..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />

        <FiltroMultiSelect
          label="Categoría"
          options={categoriasDisponibles.map(c => ({ value: c, label: c }))}
          selected={filtroCat}
          onChange={setFiltroCat}
        />
        <FiltroMultiSelect
          label="Grupo"
          options={GRUPOS.map(g => ({ value: g.value, label: g.label }))}
          selected={filtroGrupo}
          onChange={setFiltroGrupo}
        />
        <FiltroMultiSelect
          label="Sede"
          options={SEDES.map(s => ({ value: s.value, label: s.label }))}
          selected={filtroSede}
          onChange={setFiltroSede}
        />
        {/* En deuda acumulada no van: todo lo que se lista está impago. */}
        {alcance === 'mes' && (['todos','pagado','pendiente','atrasado'] as const).map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #e2e8f0', background: filtroEstado===e?'#ede9fe':'#ffffff', color: filtroEstado===e?'#3730a3': muted, fontSize:12, cursor:'pointer', textTransform:'capitalize', boxShadow: filtroEstado===e ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {e === 'todos' ? '🔍 Todos' : e === 'pagado' ? '✅ Pagados' : e === 'pendiente' ? '⏳ Pendientes' : '⚠️ Atrasados'}
          </button>
        ))}
      </div>

      {/* Tabla de deuda acumulada */}
      {alcance === 'deuda' && (
        <div style={{ ...card, overflow:'hidden' }}>
          {cargandoDeuda ? (
            <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>Calculando la deuda...</div>
          ) : deudores.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
              🎉 No hay deuda pendiente con los filtros aplicados.
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                    {['Nombre','Meses','Cuáles','Total adeudado'].map(h => (
                      <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deudores.map(d => {
                    const detalle = d.cuotas.map(etiquetaCuota).join(', ')
                    const url = linkWhatsApp(
                      d.jugador.telefono,
                      `Hola ${d.jugador.nombre.split(' ')[0]}! 👋 Te escribimos de ${clubNombre || 'el club'}. Tenés ${d.cuotas.length} ${d.cuotas.length === 1 ? 'mensualidad pendiente' : 'mensualidades pendientes'}: *${detalle}*${d.total > 0 ? `, por un total de $${d.total.toLocaleString('es-CL')}` : ''}. Cuando puedas, regularicemos. ¡Gracias! 🏓`,
                    )
                    return (
                      <tr key={d.jugador.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>
                          {d.jugador.nombre}
                          {url && <WhatsAppBtn href={url} variant="compact" style={{ marginLeft:8 }} />}
                        </td>
                        <td style={{ padding:'12px 16px' }}>
                          <span style={{ background: d.cuotas.length >= 3 ? '#fef2f2' : '#fffbeb', color: d.cuotas.length >= 3 ? '#dc2626' : '#d97706', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700 }}>
                            {d.cuotas.length}
                          </span>
                        </td>
                        <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>{detalle}</td>
                        <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700, fontFamily:'monospace', color:'#dc2626', whiteSpace:'nowrap' }}>
                          {fmt(d.total)}
                          {d.incompleto && (
                            <span title={`Hay cuotas sin monto asignado: el total es menor al real. ${SIN_CUOTA}.`}
                              style={{ marginLeft:6, fontFamily:'inherit', fontSize:10, fontWeight:600, color:'#c2410c', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'2px 6px', cursor:'help' }}>
                              incompleto
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabla del mes */}
      {alcance === 'mes' && (
      <div style={{ ...card, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                {['Nombre','Plan','Estado','Fecha pago','Monto','Acciones'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color: muted, fontWeight:600, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jugadoresFiltrados.map(j => {
                const mens = mensualidades.find(m => m.jugador_id === j.id)
                const estado = mens?.estado || 'pendiente'
                const col = estado === 'pagado' ? '#16a34a' : estado === 'atrasado' ? '#dc2626' : '#d97706'
                const colBg = estado === 'pagado' ? '#f0fdf4' : estado === 'atrasado' ? '#fef2f2' : '#fffbeb'
                return (
                  <tr key={j.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color: text, whiteSpace:'nowrap' }}>
                      {j.nombre}
                      {estado !== 'pagado' && (() => {
                        const url = linkWhatsApp(j.telefono, `Hola ${j.nombre.split(' ')[0]}! 👋 Te contactamos desde ${clubNombre || 'el club'}. Tu mensualidad de ${mesesN[mes-1]} ${anio}${mens?.monto ? ` ($${Number(mens.monto).toLocaleString('es-CL')})` : ''} figura como *${estado === 'atrasado' ? 'atrasada ⚠️' : 'pendiente ⏳'}*. Por favor regularizá tu pago cuando puedas. ¡Gracias! 🏓`)
                        return url ? <WhatsAppBtn href={url} variant="compact" style={{ marginLeft:8 }} /> : null
                      })()}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted, whiteSpace:'nowrap' }}>{j.sesiones_limite} ses.</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background: colBg, color: col, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                        {estado === 'pagado' ? '✅ Pagado' : estado === 'atrasado' ? '⚠️ Atrasado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:12, color: muted }}>
                      {mens?.fecha_pago || '—'}
                    </td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#3730a3', fontFamily:'monospace' }}>
                      {/* Un guion no dice nada: puede leerse como cero o como
                          "no corresponde". Sin cuota asignada hay algo que hacer,
                          y tiene que verse. */}
                      {mens?.monto
                        ? fmt(mens.monto)
                        : montoEsperado(j, mens) != null
                          ? fmt(montoEsperado(j, mens)!)
                          : <span style={{ fontFamily:'inherit', fontSize:11, fontWeight:600, color:'#c2410c', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'3px 7px', whiteSpace:'nowrap' }}>{SIN_CUOTA}</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {estado !== 'pagado' && (
                          <button onClick={() => { pagoOperacionId.current = crypto.randomUUID(); const esperado = montoEsperado(j, mens); setModalPago({ jugadorId: j.id, mensId: mens?.id, nombre: j.nombre, esperado }); setMontoPago(esperado == null ? '' : String(esperado)); setErrorPago('') }}
                            style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}>
                            ✅ Marcar pagado
                          </button>
                        )}
                        {estado === 'pendiente' && mens?.id && (
                          <button onClick={() => marcarAtrasado(mens.id)}
                            style={{ background:'#fef2f2', color:'#dc2626', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            ⚠️ Atrasar
                          </button>
                        )}
                        {estado === 'pagado' && mens?.id && (
                          <button onClick={() => marcarPendiente(mens.id, j.id)}
                            style={{ background:'#fffbeb', color:'#d97706', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                            ↩️ Revertir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {jugadoresFiltrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color: hint, fontSize:13 }}>
            {busqueda || filtroEstado !== 'todos' ? 'No hay jugadores con ese filtro' : 'Sin jugadores activos'}
          </div>
        )}
      </div>
      )}

      {/* Modal pago */}
      {modalPago && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:28, width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:6 }}>💳 Confirmar pago</div>
            <div style={{ fontSize:13, color: muted, marginBottom:20 }}>{modalPago.nombre}</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Monto (CLP)</label>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)} />
              {/* Aviso si se está registrando algo distinto a la cuota del mes. */}
              {modalPago.esperado && parseInt(montoPago) !== modalPago.esperado && (
                <div style={{ marginTop:6, fontSize:11, color:'#c2410c', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'6px 9px' }}>
                  La cuota de este mes es <strong>{fmt(modalPago.esperado)}</strong>.
                  {parseInt(montoPago) ? ` Estás registrando ${fmt(parseInt(montoPago))}.` : ''}
                </div>
              )}
              {!modalPago.esperado && (
                <div style={{ marginTop:6, fontSize:11, color: hint }}>
                  Este jugador no tiene cuota asignada. Escribí cuánto pagó.
                </div>
              )}
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Método de pago</label>
              <select style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            {/* El aviso vive dentro del modal. Arriba de la página quedaba
                tapado y se leía como "apreté y no pasó nada". */}
            {errorPago && (
              <div style={{ marginBottom:14, fontSize:12, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px' }}>
                {errorPago}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setErrorPago(''); setModalPago(null) }} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:14, cursor:'pointer' }}>Cancelar</button>
              <button disabled={registrandoPago} onClick={() => marcarPagado(modalPago.jugadorId, modalPago.mensId)} style={{ flex:1, padding:11, background:'#16a34a', border:'none', borderRadius:8, color:'white', fontSize:14, fontWeight:600, cursor:'pointer' }}>{registrandoPago ? 'Registrando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
