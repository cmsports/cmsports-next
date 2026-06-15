'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import {
  marcarGanadorPartido,
  cerrarInscripcionYGenerarGrupos,
  generarPlayoffs as generarPlayoffsAction,
  avanzarSiguienteFase as avanzarSiguienteFaseAction,
  finalizarTorneo as finalizarTorneoAction,
  enviarRecaudacionAFinanzas,
  inscribirJugadorTardio,
  actualizarEstadoPago,
  limpiarGruposHuerfanos,
} from '@/app/actions/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'
import { calcularNumGrupos } from '@/lib/domain/torneos'

const supabase = createClient()
const fasesOrden = CONFIG.FASES_ORDEN
const faseLabel: Record<string, string> = CONFIG.FASE_LABELS

export default function TorneoDetallePage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [torneo, setTorneo] = useState<any>(null)
  const [grupos, setGrupos] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mesaOpen, setMesaOpen] = useState(false)
  const [busquedaMesa, setBusquedaMesa] = useState('')
  const [rutMesa, setRutMesa] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [jugadoresInscritos, setJugadoresInscritos] = useState<any[]>([])
  const [cabezasSerie, setCabezasSerie] = useState<Set<string>>(new Set())
  const [criterioEmpate, setCriterioEmpate] = useState<'sets'|'puntos'>('sets')
  const [modalEmpate, setModalEmpate] = useState<any>(null)
  const [empateManual, setEmpateManual] = useState<Record<string, any>>({}) // grupoId -> {primero, segundo}
  const [pagosPorJugador, setPagosPorJugador] = useState<Record<string, 'pagado'|'pendiente'>>({}) // jugadorId -> estado
  const [tabActiva, setTabActiva] = useState<'grupos'|'bracket'>('grupos')
  const router = useRouter()
  const params = useParams()
  const torneoId = params.id as string

  const cargarTorneo = useCallback(async () => {
    const { data: t } = await supabase.from('torneos').select('*').eq('id', torneoId).single()
    setTorneo(t)

    const { data: g } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).order('nombre')
    setGrupos(g || [])

    if (g?.length) {
      const grupoIds = g.map((gr: any) => gr.id)
      const { data: gj } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', grupoIds)
      setJugadores(gj || [])
    } else {
      setJugadores([])
    }

    const { data: pts } = await supabase.from('torneo_partidos').select('*,ja:jugador_a(id,nombre,elo),jb:jugador_b(id,nombre,elo),jg:ganador(id,nombre)').eq('torneo_id', torneoId)
    setPartidos(pts || [])

    const { data: pgs } = await supabase.from('torneo_pagos').select('*').eq('torneo_id', torneoId)
    setPagos(pgs || [])

    // Cargar inscritos para mesa
    if (t?.fase === 'inscripcion') {
      const { data: gMesa } = await supabase.from('torneo_grupos').select('id').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
      if (gMesa) {
        const { data: ins } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').eq('grupo_id', gMesa.id)
        setJugadoresInscritos(ins || [])
      }
    }
  }, [torneoId])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      await cargarTorneo()
      setLoading(false)
    }
    init()
  }, [torneoId, cargarTorneo, router])

  useEffect(() => {
    if (torneo?.fase && (fasesOrden as readonly string[]).includes(torneo.fase)) {
      setTabActiva('bracket')
    }
  }, [torneo?.fase])

  async function marcarGanador(partidoId: string, ganadorId: string) {
    const res = await marcarGanadorPartido({ partidoId, ganadorId })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  async function inscribirEnMesa() {
    if (!busquedaMesa.trim()) return
    
    // Buscar jugador existente
    const { data: jugsExistentes } = await supabase.from('jugadores').select('id,nombre,elo').ilike('nombre', `%${busquedaMesa.trim()}%`).eq('club_id', perfil?.club_id)
    
    let jugadorId: string
    let jugadorElo = 1200
    let jugadorNombre = busquedaMesa.trim()

    if (jugsExistentes?.length) {
      const jug = jugsExistentes[0]
      jugadorId = jug.id
      jugadorElo = jug.elo ?? 1200
      jugadorNombre = jug.nombre ?? jugadorNombre
    } else {
      const { data: nuevo } = await supabase.from('jugadores').insert({
        club_id: perfil?.club_id, nombre: busquedaMesa.trim(),
        rut: rutMesa || null, categoria: 'principiante', sesiones_limite: 0, elo: 1200,
        es_externo: true
      }).select().single()
      if (!nuevo) return
      jugadorId = nuevo.id
    }

    // Verificar si ya está inscrito
    const yaInscrito = jugadoresInscritos.find((j: any) => j.jugador_id === jugadorId)
    if (yaInscrito) { alert('Este jugador ya está inscrito'); return }

    // Inscripción tardía: si el torneo ya pasó de inscripción, ubicar directo en grupo más apto
    if (faseActual !== 'inscripcion') {
      const res = await inscribirJugadorTardio({ torneoId, jugadorId, jugadorElo })
      if (res.error) { alert(res.error); return }
      if (torneo?.cuota_inscripcion > 0) {
        await actualizarEstadoPago({ torneoId, jugadorId, estado: 'pendiente', metodoPago })
      }
      alert(`Jugador agregado al Grupo ${res.grupoNombre}`)
      setBusquedaMesa('')
      setRutMesa('')
      await cargarTorneo()
      return
    }

    // Obtener o crear grupo MESA (solo en fase de inscripción)
    let { data: grupoMesa } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
    if (!grupoMesa) {
      const { data: ng } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: 'MESA' }).select().single()
      grupoMesa = ng
    }

    if (!grupoMesa) return
    await supabase.from('grupo_jugadores').insert({ grupo_id: grupoMesa.id, jugador_id: jugadorId })

    // Crear registro de pago como pendiente — se marca pagado manualmente
    if (torneo?.cuota_inscripcion > 0) {
      await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: jugadorId, estado: 'pendiente', metodo_pago: metodoPago })
    }

    setBusquedaMesa('')
    setRutMesa('')

    // Actualizar lista inscritos inmediatamente
    setJugadoresInscritos(prev => [...prev, { jugador_id: jugadorId, jugadores: { id: jugadorId, nombre: jugadorNombre, elo: jugadorElo } }])
    await cargarTorneo()
  }

  function toggleCabezaSerie(jugadorId: string) {
    setCabezasSerie(prev => {
      const next = new Set(prev)
      if (next.has(jugadorId)) next.delete(jugadorId)
      else next.add(jugadorId)
      return next
    })
  }

  async function cerrarInscripcion() {
    if (!confirm('¿Cerrar inscripción y generar grupos con seeding ELO?')) return
    const res = await cerrarInscripcionYGenerarGrupos({
      torneoId,
      cabezasDeSerie: Array.from(cabezasSerie),
    })
    if (res.error) { alert(res.error); return }
    setMesaOpen(false)
    setCabezasSerie(new Set())
    await cargarTorneo()
  }

  // Calcular estadísticas de grupos con manejo de empates
  function calcularStats(grupoId: string) {
    const jugsGrupo = jugadores.filter((j: any) => j.grupo_id === grupoId)
    const partidosGrupo = partidos.filter(p => p.grupo_id === grupoId)

    const stats: Record<string, { jugador: any, pts: number, pg: number, pp: number, sets: number, puntos: number }> = {}
    jugsGrupo.forEach((j: any) => {
      stats[j.jugador_id] = { jugador: j.jugadores, pts: 0, pg: 0, pp: 0, sets: 0, puntos: 0 }
    })

    partidosGrupo.filter(p => p.ganador).forEach(p => {
      if (stats[p.ganador]) { stats[p.ganador].pts += 2; stats[p.ganador].pg += 1 }
      const perd = p.jugador_a === p.ganador ? p.jugador_b : p.jugador_a
      if (stats[perd]) stats[perd].pp += 1
      // Sets y puntos si están registrados
      if (p.sets_ganador) stats[p.ganador] && (stats[p.ganador].sets += p.sets_ganador)
      if (p.puntos_ganador) stats[p.ganador] && (stats[p.ganador].puntos += p.puntos_ganador)
    })

    let ordenados = Object.values(stats).sort((a: any, b: any) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      // Empate — usar criterio elegido
      if (criterioEmpate === 'sets') return b.sets - a.sets
      return b.puntos - a.puntos
    })

    // Detectar triple empate
    const primerPts = ordenados[0]?.pts
    const empatados = ordenados.filter(j => j.pts === primerPts)
    const hayTripleEmpate = empatados.length >= 3

    return { stats, ordenados, hayTripleEmpate, empatados }
  }

  async function avanzarALlaves() {
    if (!confirm('¿Generar playoffs con regla espejo y BYEs automáticos?')) return

    const gruposReales = grupos.filter((g: any) => g.nombre !== 'MESA')
    const primeros: { id: string; nombre: string; elo: number }[] = []
    const segundos: { id: string; nombre: string; elo: number }[] = []

    for (const grupo of gruposReales) {
      const { ordenados, hayTripleEmpate } = calcularStats(grupo.id)

      if (hayTripleEmpate) {
        const m = empateManual[grupo.id]
        if (!m?.primero || !m?.segundo || m.primero.id === m.segundo.id) {
          alert(`Grupo ${grupo.nombre} tiene triple empate. Debes elegir tanto el 1° como el 2° antes de continuar.`)
          return
        }
        primeros.push({ id: m.primero.id, nombre: m.primero.nombre, elo: m.primero.elo ?? CONFIG.ELO_INICIAL })
        segundos.push({ id: m.segundo.id, nombre: m.segundo.nombre, elo: m.segundo.elo ?? CONFIG.ELO_INICIAL })
      } else {
        if (ordenados[0]?.jugador) primeros.push({ id: ordenados[0].jugador.id, nombre: ordenados[0].jugador.nombre, elo: ordenados[0].jugador.elo ?? CONFIG.ELO_INICIAL })
        if (ordenados[1]?.jugador) segundos.push({ id: ordenados[1].jugador.id, nombre: ordenados[1].jugador.nombre, elo: ordenados[1].jugador.elo ?? CONFIG.ELO_INICIAL })
      }
    }

    primeros.sort((a, b) => b.elo - a.elo)
    segundos.sort((a, b) => b.elo - a.elo)

    const res = await generarPlayoffsAction({ torneoId, clasificadosPrimeros: primeros, clasificadosSegundos: segundos })
    if (res.error) { alert(res.error); return }
    const byeMsg = res.byes && res.byes > 0 ? ` (${res.byes} BYE${res.byes > 1 ? 's' : ''})` : ''
    alert(`Playoffs generados con regla espejo${byeMsg}`)
    setTabActiva('bracket')
    await cargarTorneo()
  }

  async function avanzarSiguienteFase(faseActual: string) {
    const partidosFase = partidos.filter(p => p.fase === faseActual && p.ganador && p.jugador_b !== null)
    const ganadores = partidosFase.map(p => (p as any).jg).filter(Boolean)
    const byesFase = partidos.filter(p => p.fase === faseActual && p.jugador_b === null && p.ganador)
    const ganByes = byesFase.map(p => (p as any).ja).filter(Boolean)
    const todos = [...ganadores, ...ganByes].map((j: any) => ({ id: j.id, nombre: j.nombre, elo: j.elo ?? CONFIG.ELO_INICIAL }))

    const res = await avanzarSiguienteFaseAction({ torneoId, faseActual: faseActual as FaseOrden, ganadores: todos })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  async function finalizarTorneo() {
    if (!confirm('¿Finalizar el torneo?')) return
    const res = await finalizarTorneoAction({ torneoId })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  const esAdmin = perfil?.rol === 'admin'
  const cuota = torneo?.cuota_inscripcion || 0
  // Contar inscritos reales desde grupo_jugadores (excluyendo grupo MESA)
  const gruposReales = grupos.filter((g: any) => g.nombre !== 'MESA')
  const inscritosReales = jugadores.filter((j: any) => gruposReales.some((g: any) => g.id === j.grupo_id))
  const totalInscritos = inscritosReales.length || jugadoresInscritos.length
  const pagados = pagos.filter(p => p.estado === 'pagado').length
  const recaudado = pagados * cuota
  const proyectado = totalInscritos * cuota
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const faseActual = torneo?.fase
  const esPlayoffs = faseActual && (fasesOrden.includes(faseActual) || faseActual === 'finalizado')

  // Fix: verificar todos jugados correctamente incluyendo BYEs
  const partidosFaseActual = partidos.filter(p => p.fase === faseActual)
  const todosJugadosFase = partidosFaseActual.length > 0 && partidosFaseActual.every(p => p.ganador !== null && p.ganador !== undefined)

  const partidosGrupos = partidos.filter(p => p.fase === 'grupos')
  const todosGruposJugados = partidosGrupos.length > 0 && partidosGrupos.every(p => p.ganador !== null && p.ganador !== undefined)

  const numGruposEstimados = calcularNumGrupos(jugadoresInscritos.length)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={() => router.push('/torneos')} style={{ background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'6px 14px', color:'#8890a4', fontSize:13, cursor:'pointer' }}>← Volver</button>
        <h1 style={{ fontSize:20, fontWeight:700, color:'#fff', margin:0 }}>{torneo?.nombre}</h1>
        <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>{faseLabel[faseActual] || faseActual}</span>
        {esAdmin && torneo?.inscripcion_abierta && (
          <button onClick={() => setMesaOpen(true)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🪑 Mesa inscripción</button>
        )}
        {esAdmin && faseActual === 'grupos' && todosGruposJugados && (
          <button onClick={avanzarALlaves} style={{ background:'#a78bfa', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>⚔️ Generar playoffs →</button>
        )}
        {esAdmin && esPlayoffs && todosJugadosFase && faseActual !== 'final' && faseActual !== 'finalizado' && (
          <button onClick={() => avanzarSiguienteFase(faseActual)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Siguiente fase →</button>
        )}
        {esAdmin && faseActual === 'final' && todosJugadosFase && torneo?.estado !== 'finalizado' && (
          <button onClick={finalizarTorneo} style={{ background:'#34d399', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🏆 Finalizar torneo</button>
        )}
      </div>

      {/* Control financiero */}
      {esAdmin && cuota > 0 && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>💰 Control financiero</div>
            {!torneo?.contabilidad_enviada ? (
              <button onClick={async () => {
                if (!confirm(`¿Enviar ${fmt(recaudado)} a Finanzas?`)) return
                const res = await enviarRecaudacionAFinanzas({ torneoId, torneoNombre: torneo.nombre, monto: recaudado })
                if (res.error) { alert(res.error); return }
                await cargarTorneo()
              }} style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>📤 Enviar a Finanzas</button>
            ) : <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Enviado</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[
              { label:'Inscritos', value:totalInscritos, color:'#c8cfe0' },
              { label:'Meta', value:fmt(proyectado), color:'#6c7280' },
              { label:'Recaudado', value:fmt(recaudado), color:'#34d399' },
              { label:'Pendiente', value:fmt(proyectado-recaudado), color: proyectado-recaudado>0?'#f87171':'#34d399' },
            ].map(s => (
              <div key={s.label} style={{ background:'#0a0c12', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Criterio empate */}
      {faseActual === 'grupos' && esAdmin && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color:'#6c7280' }}>Criterio de desempate:</span>
          <button onClick={() => setCriterioEmpate('sets')} style={{ background: criterioEmpate==='sets'?'#6c63ff':'#0a0c12', color: criterioEmpate==='sets'?'white':'#8890a4', border:'1px solid #1e2030', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>Sets ganados</button>
          <button onClick={() => setCriterioEmpate('puntos')} style={{ background: criterioEmpate==='puntos'?'#6c63ff':'#0a0c12', color: criterioEmpate==='puntos'?'white':'#8890a4', border:'1px solid #1e2030', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>Puntos</button>
        </div>
      )}

      {/* BOTÓN INSCRIPCIÓN TARDÍA — disponible en grupos y playoffs */}
      {esAdmin && (faseActual === 'grupos' || fasesOrden.includes(faseActual)) && (
        <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setMesaOpen(true)} style={{ background:'#14161f', color:'#a78bfa', border:'1px solid #6c63ff44', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer' }}>
            + Inscribir jugador adicional
          </button>
          {gruposReales.some((g: any) => !jugadores.some((j: any) => j.grupo_id === g.id)) && (
            <button onClick={async () => {
              if (!confirm('¿Eliminar grupos vacíos y sus partidos sin jugar?')) return
              const res = await limpiarGruposHuerfanos({ torneoId })
              if (res.error) { alert(res.error); return }
              alert(`Se eliminaron ${res.eliminados} grupo(s) vacío(s)`)
              await cargarTorneo()
            }} style={{ background:'#f8717122', color:'#f87171', border:'1px solid #f8717144', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer' }}>
              🗑️ Limpiar grupos vacíos
            </button>
          )}
          <span style={{ fontSize:11, color:'#4b5063' }}>El jugador se ubica automáticamente en el grupo más adecuado</span>
        </div>
      )}

      {/* Tabs cuando estamos en playoffs o finalizado */}
      {esPlayoffs && (
        <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid #1e2030' }}>
          <button onClick={() => setTabActiva('grupos')} style={{ background:'transparent', border:'none', color: tabActiva==='grupos'?'#a78bfa':'#6c7280', borderBottom: tabActiva==='grupos'?'2px solid #a78bfa':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Fase de grupos</button>
          <button onClick={() => setTabActiva('bracket')} style={{ background:'transparent', border:'none', color: tabActiva==='bracket'?'#a78bfa':'#6c7280', borderBottom: tabActiva==='bracket'?'2px solid #a78bfa':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Bracket</button>
        </div>
      )}

      {/* FASE GRUPOS */}
      {(faseActual === 'grupos' || (esPlayoffs && tabActiva === 'grupos')) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
          {grupos.filter((g: any) => g.nombre !== 'MESA').map(grupo => {
            const { ordenados, hayTripleEmpate, empatados } = calcularStats(grupo.id)
            const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)

            return (
              <div key={grupo.id} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e2030', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, fontWeight:600, color:'#fff' }}>Grupo {grupo.nombre}</span>
                  {hayTripleEmpate && !(empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id) && partidosGrupo.some((p:any) => p.ganador) && <span style={{ background:'#f8717122', color:'#f87171', padding:'2px 8px', borderRadius:10, fontSize:10 }}>⚠️ Triple empate</span>}
                {hayTripleEmpate && empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id && <span style={{ background:'#34d39922', color:'#34d399', padding:'2px 8px', borderRadius:10, fontSize:10 }}>✓ Resuelto</span>}
                </div>
                {ordenados.map((j: any, i: number) => (
                  <div key={j.jugador?.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #1e2030', borderLeft:`3px solid ${i===0?'#fbbf24':i===1?'#94a3b8':'transparent'}` }}>
                    <span style={{ fontSize:14 }}>{i===0?'🥇':i===1?'🥈':'—'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:'#c8cfe0' }}>{j.jugador?.nombre||'—'}</div>
                      <div style={{ fontSize:10, color:'#6c7280' }}>{j.pg}G {j.pp}P · {j.pts}pts</div>
                    </div>
                    {esAdmin && cuota > 0 && (() => {
                      const pago = pagos.find(p => p.jugador_id === j.jugador?.id)
                      return pago?.estado === 'pagado'
                        ? <span style={{ background:'#34d39922', color:'#34d399', padding:'2px 6px', borderRadius:10, fontSize:10 }}>✓</span>
                        : <span onClick={async () => {
                            const ex = pagos.find(p => p.jugador_id === j.jugador?.id)
                            if (ex) await supabase.from('torneo_pagos').update({ estado:'pagado' }).eq('id', ex.id)
                            else await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: j.jugador?.id, estado:'pagado', metodo_pago:'efectivo' })
                            await cargarTorneo()
                          }} style={{ background:'#f8717122', color:'#f87171', padding:'2px 6px', borderRadius:10, fontSize:10, cursor:'pointer' }}>Pend.</span>
                    })()}
                  </div>
                ))}
                {/* PANEL TRIPLE EMPATE - solo cuando hay partidos jugados y empate real */}
                {hayTripleEmpate && partidosGrupo.some((p:any) => p.ganador) && !(empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id) && esAdmin && (
                  <div style={{ background:'#2d1500', borderTop:'1px solid #f9731633', padding:'12px 16px' }}>
                    <div style={{ fontSize:12, color:'#f97316', fontWeight:600, marginBottom:8 }}>⚠️ Triple empate — elige el orden manualmente</div>
                    <div style={{ fontSize:11, color:'#8890a4', marginBottom:10 }}>Revisa las papeletas y marca quién queda 1° y quién queda 2°</div>
                    {empatados.map((j: any, idx: number) => (
                      <div key={j.jugador?.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:12, color:'#c8cfe0', flex:1 }}>{j.jugador?.nombre}</span>
                        <button
                          onClick={() => setEmpateManual((prev: any) => {
                            const actual = prev[grupo.id] || {}
                            return { ...prev, [grupo.id]: { ...actual, primero: j.jugador } }
                          })}
                          style={{ background: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#fbbf24' : '#1e2030', color: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#0f1117' : '#8890a4', border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', fontWeight:600 }}>
                          🥇 1°
                        </button>
                        <button
                          disabled={empateManual[grupo.id]?.primero?.id === j.jugador?.id}
                          onClick={() => setEmpateManual((prev: any) => {
                            const actual = prev[grupo.id] || {}
                            if (actual.primero?.id === j.jugador?.id) return prev // no puede ser 1° y 2°
                            return { ...prev, [grupo.id]: { ...actual, segundo: j.jugador } }
                          })}
                          style={{ background: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#94a3b8' : '#1e2030', color: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#0f1117' : empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#2e3148' : '#8890a4', border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? 'not-allowed' : 'pointer', fontWeight:600 }}>
                          🥈 2°
                        </button>
                      </div>
                    ))}
                    {/* Confirmación solo cuando AMBOS están elegidos y son distintos */}
                    {empateManual[grupo.id]?.primero && !empateManual[grupo.id]?.segundo && (
                      <div style={{ marginTop:8, padding:'8px', background:'#1e1b4b', borderRadius:8, fontSize:11, color:'#a78bfa', textAlign:'center' }}>
                        ✓ 1°: {empateManual[grupo.id].primero.nombre} — Ahora elige quién queda 2°
                      </div>
                    )}
                    {empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo &&
                      empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id && (
                      <div style={{ marginTop:8, padding:'8px', background:'#052e16', borderRadius:8, fontSize:12, color:'#34d399', textAlign:'center' }}>
                        ✓ Resuelto — 1°: {empateManual[grupo.id].primero.nombre} · 2°: {empateManual[grupo.id].segundo.nombre}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding:'8px 16px' }}>
                  {partidosGrupo.map(p => {
                    const jugA = ordenados.find((j: any) => j.jugador?.id === p.jugador_a)
                    const jugB = ordenados.find((j: any) => j.jugador?.id === p.jugador_b)
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                        <span style={{ flex:1, color: p.ganador===p.jugador_a?'#34d399':'#c8cfe0', textAlign:'right' }}>{jugA?.jugador?.nombre||'—'}</span>
                        <span style={{ color:'#4b5063', fontSize:10 }}>vs</span>
                        <span style={{ flex:1, color: p.ganador===p.jugador_b?'#34d399':'#c8cfe0' }}>{jugB?.jugador?.nombre||'—'}</span>
                        {esAdmin && !p.ganador && (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => marcarGanador(p.id, p.jugador_a)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>A ✓</button>
                            <button onClick={() => marcarGanador(p.id, p.jugador_b)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>✓ B</button>
                          </div>
                        )}
                        {p.ganador && <span style={{ color:'#34d399', fontSize:10 }}>✓</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PAGOS TARDÍOS — al final, después del bracket */}
      {esAdmin && cuota > 0 && false && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>💳 Pagos pendientes</div>
          {jugadores.filter((j: any) => {
            const pago = pagos.find(p => p.jugador_id === j.jugador_id)
            return !pago || pago.estado !== 'pagado'
          }).length === 0
            ? <p style={{ fontSize:13, color:'#34d399' }}>✓ Todos han pagado</p>
            : jugadores.filter((j: any) => {
                const pago = pagos.find(p => p.jugador_id === j.jugador_id)
                return !pago || pago.estado !== 'pagado'
              }).map((j: any) => (
              <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #1e2030' }}>
                <div style={{ flex:1, fontSize:13, color:'#c8cfe0' }}>{j.jugadores?.nombre||'—'}</div>
                <span style={{ background:'#f8717122', color:'#f87171', padding:'2px 8px', borderRadius:10, fontSize:11 }}>Pendiente</span>
                <button onClick={async () => {
                  const ex = pagos.find(p => p.jugador_id === j.jugador_id)
                  if (ex) await supabase.from('torneo_pagos').update({ estado:'pagado', metodo_pago:'efectivo' }).eq('id', ex.id)
                  else await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: j.jugador_id, estado:'pagado', metodo_pago:'efectivo', fecha_pago: new Date().toISOString().slice(0,10) })
                  await cargarTorneo()
                }} style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                  ✓ Marcar pagado
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* PLAYOFFS BRACKET */}
      {esPlayoffs && tabActiva === 'bracket' && (
        <div>
          <div style={{ background:'#1e1b4b', border:'1px solid #6c63ff44', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#a78bfa', marginBottom:16 }}>
            💡 Haz clic en el nombre del ganador para registrar el resultado
          </div>
          <div style={{ overflowX:'auto', paddingBottom:12 }}>
            <div style={{ display:'flex', gap:20, minWidth:'max-content' }}>
              {fasesOrden.slice(0, faseActual === 'finalizado' ? fasesOrden.length : fasesOrden.indexOf(faseActual)+1).map(fase => {
                const ps = partidos.filter(p => p.fase === fase)
                if (!ps.length) return null
                return (
                  <div key={fase} style={{ minWidth:180 }}>
                    <div style={{ fontSize:11, color:'#4b5063', textTransform:'uppercase', letterSpacing:'1px', textAlign:'center', marginBottom:10, padding:'4px 8px', background:'#0a0c12', borderRadius:6 }}>
                      {faseLabel[fase]}
                    </div>
                    {ps.map((p, i) => {
                      const isBye = p.jugador_b === null
                      return (
                        <div key={p.id} style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, overflow:'hidden', marginBottom:8 }}>
                          <div onClick={() => esAdmin && !p.ganador && !isBye && marcarGanador(p.id, p.jugador_a)}
                            style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #1e2030', cursor: esAdmin&&!p.ganador&&!isBye?'pointer':'default', background: p.ganador===p.jugador_a?'#052e16':'transparent' }}>
                            <span style={{ fontSize:12, color: p.ganador===p.jugador_a?'#34d399':'#c8cfe0' }}>
                              <span style={{ fontSize:9, background:'#1e1b4b', color:'#a78bfa', padding:'1px 4px', borderRadius:3, marginRight:4 }}>{i*2+1}</span>
                              {(p as any).ja?.nombre||'TBD'}
                            </span>
                            {p.ganador===p.jugador_a && <span style={{ color:'#34d399', fontSize:12 }}>✓</span>}
                          </div>
                          {isBye ? (
                            <div style={{ padding:'10px 12px', fontSize:11, color:'#4b5063', fontStyle:'italic' }}>BYE — pasa directo</div>
                          ) : (
                            <div onClick={() => esAdmin && !p.ganador && marcarGanador(p.id, p.jugador_b)}
                              style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor: esAdmin&&!p.ganador?'pointer':'default', background: p.ganador===p.jugador_b?'#052e16':'transparent' }}>
                              <span style={{ fontSize:12, color: p.ganador===p.jugador_b?'#34d399':'#c8cfe0' }}>
                                <span style={{ fontSize:9, background:'#1e1b4b', color:'#a78bfa', padding:'1px 4px', borderRadius:3, marginRight:4 }}>{i*2+2}</span>
                                {(p as any).jb?.nombre||'TBD'}
                              </span>
                              {p.ganador===p.jugador_b && <span style={{ color:'#34d399', fontSize:12 }}>✓</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Campeón */}
          {faseActual === 'finalizado' && (() => {
            const pFinal = partidos.find(p => p.fase === 'final' && p.ganador)
            const campeon = pFinal ? ((pFinal as any).jg) : null
            return campeon ? (
              <div style={{ background:'linear-gradient(135deg,#fbbf2422,#14161f)', border:'1px solid #fbbf2444', borderRadius:16, padding:24, textAlign:'center', marginBottom:16 }}>
                <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#fbbf24' }}>¡Campeón!</div>
                <div style={{ fontSize:18, color:'#fff', marginTop:4 }}>{campeon.nombre}</div>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* PAGOS PENDIENTES — siempre al final */}
      {esAdmin && cuota > 0 && (faseActual === 'grupos' || fasesOrden.includes(faseActual) || faseActual === 'finalizado') && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>💳 Pagos pendientes</div>
          {jugadores.filter((j: any) => {
            const pago = pagos.find(p => p.jugador_id === j.jugador_id)
            return !pago || pago.estado !== 'pagado'
          }).length === 0
            ? <p style={{ fontSize:13, color:'#34d399' }}>✓ Todos han pagado</p>
            : jugadores.filter((j: any) => {
                const pago = pagos.find(p => p.jugador_id === j.jugador_id)
                return !pago || pago.estado !== 'pagado'
              }).map((j: any) => (
              <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #1e2030' }}>
                <div style={{ flex:1, fontSize:13, color:'#c8cfe0' }}>{j.jugadores?.nombre||'—'}</div>
                <span style={{ background:'#f8717122', color:'#f87171', padding:'2px 8px', borderRadius:10, fontSize:11 }}>Pendiente</span>
                <button onClick={async () => {
                  const ex = pagos.find(p => p.jugador_id === j.jugador_id)
                  if (ex) await supabase.from('torneo_pagos').update({ estado:'pagado', metodo_pago:'efectivo', fecha_pago: new Date().toISOString().slice(0,10) }).eq('id', ex.id)
                  else await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: j.jugador_id, estado:'pagado', metodo_pago:'efectivo', fecha_pago: new Date().toISOString().slice(0,10) })
                  await cargarTorneo()
                }} style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                  ✓ Marcar pagado
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* MESA DE INSCRIPCIÓN */}
      {mesaOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>🪑 Mesa de inscripción</div>
              <button onClick={() => setMesaOpen(false)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* Stats en tiempo real */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
              {(faseActual === 'inscripcion' ? [
                { label:'Inscritos', value:jugadoresInscritos.length, color:'#c8cfe0' },
                { label:'Grupos estimados', value:numGruposEstimados, color:'#a78bfa' },
                { label:'Recaudado', value:fmt(recaudado), color:'#34d399' },
              ] : [
                { label:'Inscritos', value:totalInscritos, color:'#c8cfe0' },
                { label:'Grupos', value:gruposReales.length, color:'#a78bfa' },
                { label:'Recaudado', value:fmt(recaudado), color:'#34d399' },
              ]).map(s => (
                <div key={s.label} style={{ background:'#0a0c12', borderRadius:8, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Input inscripción */}
            {/* Búsqueda con autocompletado de jugadores del club */}
            <div style={{ position:'relative', marginBottom:10 }}>
              <input style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                placeholder="Buscar jugador del club o escribir nombre nuevo..."
                value={busquedaMesa}
                onChange={async e => {
                  setBusquedaMesa(e.target.value)
                  setRutMesa('')
                  if (e.target.value.length > 1 && perfil?.club_id) {
                    const { data } = await supabase.from('jugadores').select('id,nombre,rut,elo,categoria').eq('club_id', perfil.club_id).neq('es_externo', true).ilike('nombre', `%${e.target.value}%`).limit(5)
                    // guardar en estado temporal
                    ;(window as any).__jugSuggestions = data || []
                    setBusquedaMesa(e.target.value) // forzar re-render
                  } else {
                    ;(window as any).__jugSuggestions = []
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && inscribirEnMesa()}
              />
              {busquedaMesa.length > 1 && (window as any).__jugSuggestions?.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, zIndex:10, marginTop:4, overflow:'hidden' }}>
                  {((window as any).__jugSuggestions || []).map((j: any) => (
                    <div key={j.id} onClick={() => {
                      setBusquedaMesa(j.nombre)
                      setRutMesa(j.rut || '')
                      ;(window as any).__jugSuggestions = []
                    }} style={{ padding:'10px 12px', borderBottom:'1px solid #1e2030', cursor:'pointer', fontSize:13 }}>
                      <span style={{ color:'#c8cfe0' }}>{j.nombre}</span>
                      <span style={{ color:'#6c7280', fontSize:11, marginLeft:8 }}>ELO {j.elo} · {j.categoria}</span>
                      <span style={{ background:'#34d39922', color:'#34d399', fontSize:10, padding:'1px 6px', borderRadius:10, marginLeft:8 }}>Del club</span>
                    </div>
                  ))}
                  <div style={{ padding:'8px 12px', fontSize:11, color:'#4b5063', borderTop:'1px solid #1e2030' }}>
                    O presiona Enter para inscribir como participante externo
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                placeholder="RUT sin puntos ni guion" value={rutMesa} onChange={e => setRutMesa(e.target.value.replace(/[^0-9kK]/g,''))} maxLength={9} />
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <select style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia</option>
              </select>
              <button onClick={inscribirEnMesa} style={{ flex:1, background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                + Inscribir
              </button>
            </div>

            {/* Lista inscritos en tiempo real (solo durante fase de inscripción) */}
            {faseActual === 'inscripcion' && jugadoresInscritos.length > 0 && (
              <div style={{ background:'#0a0c12', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
                <div style={{ padding:'8px 14px', fontSize:11, color:'#6c7280', textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #1e2030' }}>
                  Jugadores inscritos
                </div>
                {jugadoresInscritos.sort((a: any, b: any) => (b.jugadores?.elo||0) - (a.jugadores?.elo||0)).map((j: any, i: number) => (
                  <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #1e2030' }}>
                    <span style={{ fontSize:12, color:'#6c7280', width:20 }}>{i+1}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color:'#c8cfe0', fontWeight:500 }}>{j.jugadores?.nombre||'—'}</div>
                      <div style={{ fontSize:11, color:'#6c7280' }}>ELO: {j.jugadores?.elo||1200}</div>
                    </div>
                    {/* Cabeza de serie */}
                    <button
                      onClick={() => toggleCabezaSerie(j.jugador_id)}
                      style={{ background: cabezasSerie.has(j.jugador_id)?'#fbbf2422':'transparent', color: cabezasSerie.has(j.jugador_id)?'#fbbf24':'#4b5063', border:`1px solid ${cabezasSerie.has(j.jugador_id)?'#fbbf2444':'#1e2030'}`, borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}
                    >
                      {cabezasSerie.has(j.jugador_id) ? '⭐ Cabeza de serie' : 'Cabeza de serie'}
                    </button>
                    {/* Estado pago */}
                    {(torneo?.cuota_inscripcion > 0) && (() => {
                      const pagoActual = pagos.find(p => p.jugador_id === j.jugador_id)
                      const esPagado = pagoActual?.estado === 'pagado'
                      return (
                        <button onClick={async () => {
                          const res = await actualizarEstadoPago({
                            torneoId,
                            jugadorId: j.jugador_id,
                            estado: esPagado ? 'pendiente' : 'pagado',
                            metodoPago,
                          })
                          if (res.error) { alert(res.error); return }
                          await cargarTorneo()
                        }}
                          style={{ background: esPagado ? '#34d39922' : '#f8717122', color: esPagado ? '#34d399' : '#f87171', border:`1px solid ${esPagado ? '#34d39944' : '#f8717144'}`, borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                          {esPagado ? '✓ Pagado' : 'Pendiente'}
                        </button>
                      )
                    })()}
                    {/* Quitar */}
                    <button onClick={async () => {
                      await supabase.from('grupo_jugadores').delete().eq('jugador_id', j.jugador_id).in('grupo_id', grupos.map((g:any)=>g.id))
                      setJugadoresInscritos(prev => prev.filter((x:any) => x.jugador_id !== j.jugador_id))
                    }} style={{ background:'transparent', border:'none', color:'#f87171', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {faseActual === 'inscripcion' ? (
              <button onClick={cerrarInscripcion} disabled={jugadoresInscritos.length < 4}
                style={{ width:'100%', padding:12, background: jugadoresInscritos.length >= 4?'#34d39922':'#1e2030', color: jugadoresInscritos.length >= 4?'#34d399':'#4b5063', border:`1px solid ${jugadoresInscritos.length >= 4?'#34d39944':'#1e2030'}`, borderRadius:8, fontSize:13, fontWeight:600, cursor: jugadoresInscritos.length >= 4?'pointer':'not-allowed' }}>
                {jugadoresInscritos.length < 4 ? `Mínimo 4 jugadores (faltan ${4-jugadoresInscritos.length})` : `✓ Cerrar inscripción y generar ${numGruposEstimados} grupos`}
              </button>
            ) : (
              <div style={{ background:'#1e1b4b', border:'1px solid #6c63ff44', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#a78bfa', textAlign:'center' }}>
                💡 Cada jugador se agrega al grupo con menos integrantes (ELO más cercano).
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
