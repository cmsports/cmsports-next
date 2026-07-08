'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import AppLayout from '@/app/layout-app'
import {
  marcarGanadorPartido,
  corregirResultadoGrupos,
  cerrarInscripcionYGenerarGrupos,
  generarPlayoffs as generarPlayoffsAction,
  avanzarSiguienteFase as avanzarSiguienteFaseAction,
  finalizarTorneo as finalizarTorneoAction,
  inscribirJugadorTardio,
  actualizarEstadoPago,
  limpiarGruposHuerfanos,
  volverAGrupos as volverAGruposAction,
  corregirResultadoPlayoff,
  intercambiarJugadores,
  eliminarTorneo,
  guardarPremios,
  inscribirEnMesa,
  actualizarCabezasSerie,
  moverJugadorEntreGrupos,
} from '@/app/actions/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'
import { calcularNumGrupos } from '@/lib/domain/torneos'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { copiarTexto } from '@/lib/clipboard'
import { descargarExcelTorneo } from '@/lib/torneo-excel'
import { QRCodeSVG } from 'qrcode.react'

const supabase = createClient()
const fasesOrden = CONFIG.FASES_ORDEN
const faseLabel: Record<string, string> = CONFIG.FASE_LABELS

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function TorneoDetallePage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [torneo, setTorneo] = useState<any>(null)
  const [grupos, setGrupos] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mesaOpen, setMesaOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [busquedaMesa, setBusquedaMesa] = useState('')
  const [rutMesa, setRutMesa] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [jugadoresInscritos, setJugadoresInscritos] = useState<any[]>([])
  const [cabezasSerie, setCabezasSerie] = useState<Set<string>>(new Set())
  const [criterioEmpate, setCriterioEmpate] = useState<'sets'|'puntos'>('sets')
  const [empateManual, setEmpateManual] = useState<Record<string, any>>({})
  const [tabActiva, setTabActiva] = useState<'grupos'|'bracket'>('grupos')
  const [partidoEditando, setPartidoEditando] = useState<string|null>(null)
  const [partidoPlayoffEditando, setPartidoPlayoffEditando] = useState<string|null>(null)
  const [dragSlot, setDragSlot] = useState<{partidoId:string; posicion:'jugador_a'|'jugador_b'; jugadorId:string}|null>(null)
  const [dragOver, setDragOver] = useState<{partidoId:string; posicion:'jugador_a'|'jugador_b'}|null>(null)
  const [inscribiendo, setInscribiendo] = useState(false)
  const [premio1, setPremio1] = useState('')
  const [premio2, setPremio2] = useState('')
  const [premio3, setPremio3] = useState('')
  const [premioTerceroOpen, setPremioTerceroOpen] = useState(false)
  const [guardandoPremios, setGuardandoPremios] = useState(false)
  const [modalPremios, setModalPremios] = useState(false)
  const [cabezaSerie1, setCabezaSerie1] = useState('')
  const [cabezaSerie2, setCabezaSerie2] = useState('')
  const [guardandoCabezas, setGuardandoCabezas] = useState(false)
  const [dragJugadorGrupo, setDragJugadorGrupo] = useState<{ jugadorId: string; grupoId: string } | null>(null)
  const router = useRouter()
  const params = useParams()
  const torneoId = params.id as string

  const cargarTorneo = useCallback(async () => {
    // Tanda 1: 4 queries en paralelo (todas solo necesitan torneoId)
    const [
      { data: t },
      { data: g },
      { data: pts },
      { data: pgs },
    ] = await Promise.all([
      supabase.from('torneos').select('*').eq('id', torneoId).single(),
      supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).order('nombre'),
      supabase.from('torneo_partidos').select('*,ja:jugador_a(id,nombre,elo),jb:jugador_b(id,nombre,elo),jg:ganador(id,nombre)').eq('torneo_id', torneoId),
      supabase.from('torneo_pagos').select('*').eq('torneo_id', torneoId),
    ])

    setTorneo(t)
    setGrupos(g || [])
    setPartidos(pts || [])
    setPagos(pgs || [])

    // Tanda 2: grupo_jugadores para todos los grupos (real + MESA) en una sola query
    const todosGrupoIds = (g || []).map((gr: any) => gr.id)
    if (todosGrupoIds.length) {
      const { data: gj } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', todosGrupoIds)
      const todos = gj || []
      const grupoMesaId = (g || []).find((gr: any) => gr.nombre === 'MESA')?.id
      setJugadores(grupoMesaId ? todos.filter((j: any) => j.grupo_id !== grupoMesaId) : todos)
      if (t?.fase === 'inscripcion' && grupoMesaId) {
        setJugadoresInscritos(todos.filter((j: any) => j.grupo_id === grupoMesaId))
      }
    } else {
      setJugadores([])
    }
  }, [torneoId])

  useEffect(() => {
    async function init() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      await cargarTorneo()
      setLoading(false)
    }
    init()
  }, [authLoading, perfil, torneoId, cargarTorneo, router])

  useEffect(() => {
    if (torneo?.fase && (fasesOrden as readonly string[]).includes(torneo.fase)) {
      setTabActiva('bracket')
    }
  }, [torneo?.fase])

  useEffect(() => {
    if (torneo?.id) {
      setPremio1(torneo.premio_primero?.toString() ?? '')
      setPremio2(torneo.premio_segundo?.toString() ?? '')
      const p3 = torneo.premio_tercero?.toString() ?? ''
      setPremio3(p3)
      setPremioTerceroOpen(!!p3)
      setCabezaSerie1(torneo.cabeza_serie_1 ?? '')
      setCabezaSerie2(torneo.cabeza_serie_2 ?? '')
    }
  }, [torneo?.id, torneo?.cabeza_serie_1, torneo?.cabeza_serie_2])

  async function guardarCabezasSerie(nuevo1: string, nuevo2: string) {
    setGuardandoCabezas(true)
    const res = await actualizarCabezasSerie({ torneoId, cabezaSerie1: nuevo1 || null, cabezaSerie2: nuevo2 || null })
    setGuardandoCabezas(false)
    if (res.error) { alert(res.error); return }
    setCabezaSerie1(nuevo1)
    setCabezaSerie2(nuevo2)
  }

  async function moverAGrupo(jugadorId: string, grupoOrigenId: string, grupoDestinoId: string) {
    if (grupoOrigenId === grupoDestinoId) return
    const res = await moverJugadorEntreGrupos({ torneoId, jugadorId, grupoOrigenId, grupoDestinoId })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  async function marcarGanador(partidoId: string, ganadorId: string) {
    const res = await marcarGanadorPartido({ partidoId, ganadorId })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  async function handleInscribirEnMesa() {
    if (inscribiendo || !busquedaMesa.trim()) return
    setInscribiendo(true)
    try {
      if (faseActual !== 'inscripcion') {
        const { data: jugsExistentes } = await supabase.from('jugadores').select('id,nombre,elo').ilike('nombre', `%${busquedaMesa.trim()}%`).eq('club_id', perfil?.club_id)
        const jugadorId = jugsExistentes?.[0]?.id
        const jugadorElo = jugsExistentes?.[0]?.elo ?? 1200
        if (!jugadorId) { alert('Jugador no encontrado; en fase de inscripción se puede crear uno nuevo desde aquí.'); return }

        const yaInscrito = jugadoresInscritos.find((j: any) => j.jugador_id === jugadorId)
          || jugadores.find((j: any) => j.jugador_id === jugadorId)
        if (yaInscrito) { alert('Este jugador ya está inscrito en este torneo'); return }

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

      const res = await inscribirEnMesa({ torneoId, busqueda: busquedaMesa, rut: rutMesa, metodoPago })
      if (res.error) { alert(res.error); return }

      setBusquedaMesa('')
      setRutMesa('')
      setJugadoresInscritos(prev => [...prev, { jugador_id: res.jugadorId!, jugadores: { id: res.jugadorId, nombre: res.jugadorNombre, elo: res.jugadorElo } }])
      await cargarTorneo()
    } finally {
      setInscribiendo(false)
    }
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
      if (p.sets_ganador) stats[p.ganador] && (stats[p.ganador].sets += p.sets_ganador)
      if (p.puntos_ganador) stats[p.ganador] && (stats[p.ganador].puntos += p.puntos_ganador)
    })

    let ordenados = Object.values(stats).sort((a: any, b: any) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (criterioEmpate === 'sets') return b.sets - a.sets
      return b.puntos - a.puntos
    })

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

    // El ELO ya no influye en el sembrado: mandan los cabezas de serie manuales.
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

  async function corregirPlayoff(partidoId: string, nuevoGanadorId: string) {
    const res = await corregirResultadoPlayoff({ partidoId, nuevoGanadorId })
    if (res.error) { alert(res.error); return }
    setPartidoPlayoffEditando(null)
    await cargarTorneo()
  }

  async function volverAGrupos() {
    if (!confirm('⚠️ ¿Volver a la fase de grupos?\n\nSe borrarán todos los partidos de playoffs. Los resultados de grupos se conservan.')) return
    const res = await volverAGruposAction({ torneoId })
    if (res.error) { alert(res.error); return }
    setTabActiva('grupos')
    await cargarTorneo()
  }

  async function handleSwap(targetPartidoId: string, targetPosicion: 'jugador_a' | 'jugador_b') {
    if (!dragSlot) return
    if (dragSlot.partidoId === targetPartidoId && dragSlot.posicion === targetPosicion) { setDragSlot(null); setDragOver(null); return }
    const src = dragSlot
    setDragSlot(null)
    setDragOver(null)
    const res = await intercambiarJugadores({ torneoId, slotA: { partidoId: src.partidoId, posicion: src.posicion }, slotB: { partidoId: targetPartidoId, posicion: targetPosicion } })
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
  const jugadoresUnicos: any[] = Array.from(new Map(jugadores.map((j: any) => [j.jugador_id, j])).values())
  const gruposReales = grupos.filter((g: any) => g.nombre !== 'MESA')
  const inscritosReales = jugadores.filter((j: any) => gruposReales.some((g: any) => g.id === j.grupo_id))
  const totalInscritos = inscritosReales.length || jugadoresInscritos.length
  const pagados = pagos.filter(p => p.estado === 'pagado').length
  const recaudado = pagados * cuota
  const proyectado = totalInscritos * cuota
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const faseActual = torneo?.fase
  const esPlayoffs = faseActual && (fasesOrden.includes(faseActual) || faseActual === 'finalizado')

  const partidosFaseActual = partidos.filter(p => p.fase === faseActual)
  const todosJugadosFase = partidosFaseActual.length > 0 && partidosFaseActual.every(p => p.ganador !== null && p.ganador !== undefined)

  const partidosGrupos = partidos.filter(p => p.fase === 'grupos')
  const todosGruposJugados = partidosGrupos.length > 0 && partidosGrupos.every(p => p.ganador !== null && p.ganador !== undefined)

  const numGruposEstimados = calcularNumGrupos(jugadoresInscritos.length)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={() => router.push('/torneos')} style={{ background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 14px', color: muted, fontSize:13, cursor:'pointer' }}>← Volver</button>
        {esAdmin && (
          <button onClick={async () => {
            if (!confirm(`¿Eliminar "${torneo?.nombre}" y todos sus datos? Esta acción no se puede deshacer.`)) return
            const res = await eliminarTorneo({ torneoId })
            if (res.error) { alert(res.error); return }
            router.push('/torneos')
          }} style={{ background:'transparent', border:'1px solid #fecaca', borderRadius:8, padding:'6px 14px', color:'#dc2626', fontSize:13, cursor:'pointer' }}>
            🗑 Eliminar
          </button>
        )}
        <h1 style={{ fontSize:20, fontWeight:700, color: text, margin:0 }}>{torneo?.nombre}</h1>
        <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>{faseLabel[faseActual] || faseActual}</span>
        {torneo?.codigo && (
          <button
            onClick={() => setQrOpen(true)}
            title="Mostrar QR y link para ver en vivo (sin cuenta)"
            style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            📺 En vivo: <span style={{ fontFamily:'monospace', letterSpacing:1 }}>{torneo.codigo}</span> QR
          </button>
        )}
        {esAdmin && torneo?.inscripcion_abierta && (
          <button onClick={() => setMesaOpen(true)} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🪑 Mesa inscripción</button>
        )}
        {esAdmin && faseActual !== 'inscripcion' && (
          <button
            onClick={() => descargarExcelTorneo({ torneo, grupos, partidos, statsDeGrupo: (id) => calcularStats(id), faseLabel, fasesOrden })}
            title="Descargar respaldo del torneo en Excel (una hoja por fase)"
            style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            📊 Descargar Excel
          </button>
        )}
        {esAdmin && faseActual === 'grupos' && todosGruposJugados && (
          <button onClick={avanzarALlaves} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>⚔️ Generar playoffs →</button>
        )}
        {esAdmin && esPlayoffs && todosJugadosFase && faseActual !== 'final' && faseActual !== 'finalizado' && (
          <button onClick={() => avanzarSiguienteFase(faseActual)} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Siguiente fase →</button>
        )}
        {esAdmin && faseActual === 'final' && todosJugadosFase && torneo?.estado !== 'finalizado' && (
          <button onClick={finalizarTorneo} style={{ background:'#16a34a', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🏆 Finalizar torneo</button>
        )}
      </div>

      {/* Control financiero */}
      {esAdmin && cuota > 0 && (
        <div style={{ ...card, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color: text }}>💰 Control financiero</div>
            {torneo?.contabilidad_enviada
              ? <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Enviado a Finanzas</span>
              : <span style={{ background:'#fffbeb', color:'#d97706', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500 }}>📤 Se enviará con los premios</span>
            }
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[
              { label:'Inscritos', value:totalInscritos, color: text },
              { label:'Meta', value:fmt(proyectado), color: muted },
              { label:'Recaudado', value:fmt(recaudado), color:'#16a34a' },
              { label:'Pendiente', value:fmt(proyectado-recaudado), color: proyectado-recaudado>0?'#dc2626':'#16a34a' },
            ].map(s => (
              <div key={s.label} style={{ background:'#f4f7fa', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Criterio empate */}
      {faseActual === 'grupos' && esAdmin && (
        <div style={{ ...card, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color: muted }}>Criterio de desempate:</span>
          <button onClick={() => setCriterioEmpate('sets')} style={{ background: criterioEmpate==='sets'?'#4f46e5':'#f4f7fa', color: criterioEmpate==='sets'?'white': muted, border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>Sets ganados</button>
          <button onClick={() => setCriterioEmpate('puntos')} style={{ background: criterioEmpate==='puntos'?'#4f46e5':'#f4f7fa', color: criterioEmpate==='puntos'?'white': muted, border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>Puntos</button>
        </div>
      )}

      {/* BOTÓN INSCRIPCIÓN TARDÍA */}
      {esAdmin && (faseActual === 'grupos' || fasesOrden.includes(faseActual)) && (
        <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setMesaOpen(true)} style={{ background:'#ffffff', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer' }}>
            + Inscribir jugador adicional
          </button>
          {gruposReales.some((g: any) => !jugadores.some((j: any) => j.grupo_id === g.id)) && (
            <button onClick={async () => {
              if (!confirm('¿Eliminar grupos vacíos y sus partidos sin jugar?')) return
              const res = await limpiarGruposHuerfanos({ torneoId })
              if (res.error) { alert(res.error); return }
              alert(`Se eliminaron ${res.eliminados} grupo(s) vacío(s)`)
              await cargarTorneo()
            }} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer' }}>
              🗑️ Limpiar grupos vacíos
            </button>
          )}
          <span style={{ fontSize:11, color: hint }}>El jugador se ubica automáticamente en el grupo más adecuado</span>
        </div>
      )}

      {/* Tabs */}
      {esPlayoffs && (
        <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid #e2e8f0' }}>
          <button onClick={() => setTabActiva('grupos')} style={{ background:'transparent', border:'none', color: tabActiva==='grupos'?'#4f46e5': muted, borderBottom: tabActiva==='grupos'?'2px solid #4f46e5':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Fase de grupos</button>
          <button onClick={() => setTabActiva('bracket')} style={{ background:'transparent', border:'none', color: tabActiva==='bracket'?'#4f46e5': muted, borderBottom: tabActiva==='bracket'?'2px solid #4f46e5':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Bracket</button>
        </div>
      )}

      {/* FASE GRUPOS */}
      {(faseActual === 'grupos' || (esPlayoffs && tabActiva === 'grupos')) && esAdmin && (
        <div style={{ ...card, padding:'14px 16px', marginBottom:16, display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:11, color: muted, marginBottom:4 }}>⭐ Cabeza de serie 1°</div>
            <select
              value={cabezaSerie1}
              disabled={guardandoCabezas}
              onChange={e => guardarCabezasSerie(e.target.value, cabezaSerie2 === e.target.value ? '' : cabezaSerie2)}
              style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', color: text, fontSize:13, minWidth:180 }}
            >
              <option value="">Sin asignar (usa ELO)</option>
              {jugadores.map((j: any) => (
                <option key={j.jugador?.id} value={j.jugador?.id}>{j.jugador?.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, color: muted, marginBottom:4 }}>⭐ Cabeza de serie 2°</div>
            <select
              value={cabezaSerie2}
              disabled={guardandoCabezas}
              onChange={e => guardarCabezasSerie(cabezaSerie1 === e.target.value ? '' : cabezaSerie1, e.target.value)}
              style={{ background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', color: text, fontSize:13, minWidth:180 }}
            >
              <option value="">Sin asignar (usa ELO)</option>
              {jugadores.map((j: any) => (
                <option key={j.jugador?.id} value={j.jugador?.id}>{j.jugador?.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ fontSize:11, color: hint, maxWidth:280 }}>
            Quedan en lados opuestos del cuadro al generar llaves: solo se enfrentan en la final.
          </div>
        </div>
      )}

      {(faseActual === 'grupos' || (esPlayoffs && tabActiva === 'grupos')) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
          {grupos.filter((g: any) => g.nombre !== 'MESA').map(grupo => {
            const { ordenados, hayTripleEmpate, empatados } = calcularStats(grupo.id)
            const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)

            return (
              <div key={grupo.id} style={{ ...card, overflow:'hidden' }}
                onDragOver={esAdmin ? (e) => e.preventDefault() : undefined}
                onDrop={esAdmin ? (e) => {
                  e.preventDefault()
                  if (dragJugadorGrupo) moverAGrupo(dragJugadorGrupo.jugadorId, dragJugadorGrupo.grupoId, grupo.id)
                  setDragJugadorGrupo(null)
                } : undefined}
              >
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, fontWeight:600, color: text }}>Grupo {grupo.nombre}</span>
                  {hayTripleEmpate && !(empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id) && partidosGrupo.some((p:any) => p.ganador) && <span style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontSize:10 }}>⚠️ Triple empate</span>}
                  {hayTripleEmpate && empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id && <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'2px 8px', borderRadius:10, fontSize:10 }}>✓ Resuelto</span>}
                </div>
                {ordenados.map((j: any, i: number) => (
                  <div key={`${grupo.id}-${j.jugador?.id ?? i}`}
                    draggable={esAdmin && !!j.jugador?.id}
                    onDragStart={esAdmin && j.jugador?.id ? () => setDragJugadorGrupo({ jugadorId: j.jugador.id, grupoId: grupo.id }) : undefined}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #f1f5f9', borderLeft:`3px solid ${i===0?'#d97706':i===1?'#94a3b8':'transparent'}`, cursor: esAdmin ? 'grab' : 'default', opacity: dragJugadorGrupo?.jugadorId === j.jugador?.id ? 0.4 : 1 }}>
                    <span style={{ fontSize:14 }}>{i===0?'🥇':i===1?'🥈':'—'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: text }}>{j.jugador?.nombre||'—'}</div>
                      <div style={{ fontSize:10, color: muted }}>{j.pg}G {j.pp}P · {j.pts}pts</div>
                    </div>
                    {esAdmin && cuota > 0 && (() => {
                      const pago = pagos.find(p => p.jugador_id === j.jugador?.id)
                      return pago?.estado === 'pagado'
                        ? <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'2px 6px', borderRadius:10, fontSize:10 }}>✓</span>
                        : <span onClick={async () => {
                            if (!j.jugador?.id) return
                            await actualizarEstadoPago({ torneoId, jugadorId: j.jugador.id, estado: 'pagado', metodoPago: 'efectivo' })
                            await cargarTorneo()
                          }} style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 6px', borderRadius:10, fontSize:10, cursor:'pointer' }}>Pend.</span>
                    })()}
                  </div>
                ))}
                {/* PANEL TRIPLE EMPATE */}
                {hayTripleEmpate && partidosGrupo.some((p:any) => p.ganador) && !(empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo && empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id) && esAdmin && (
                  <div style={{ background:'#fff7ed', borderTop:'1px solid #fed7aa', padding:'12px 16px' }}>
                    <div style={{ fontSize:12, color:'#f43f5e', fontWeight:600, marginBottom:8 }}>⚠️ Triple empate — elige el orden manualmente</div>
                    <div style={{ fontSize:11, color: muted, marginBottom:10 }}>Revisa las papeletas y marca quién queda 1° y quién queda 2°</div>
                    {empatados.map((j: any, idx: number) => (
                      <div key={`${grupo.id}-empate-${j.jugador?.id ?? idx}`} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:12, color: text, flex:1 }}>{j.jugador?.nombre}</span>
                        <button
                          onClick={() => setEmpateManual((prev: any) => {
                            const actual = prev[grupo.id] || {}
                            return { ...prev, [grupo.id]: { ...actual, primero: j.jugador } }
                          })}
                          style={{ background: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#fbbf24' : '#f4f7fa', color: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#0f172a' : muted, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', fontWeight:600 }}>
                          🥇 1°
                        </button>
                        <button
                          disabled={empateManual[grupo.id]?.primero?.id === j.jugador?.id}
                          onClick={() => setEmpateManual((prev: any) => {
                            const actual = prev[grupo.id] || {}
                            if (actual.primero?.id === j.jugador?.id) return prev
                            return { ...prev, [grupo.id]: { ...actual, segundo: j.jugador } }
                          })}
                          style={{ background: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#94a3b8' : '#f4f7fa', color: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#0f172a' : empateManual[grupo.id]?.primero?.id === j.jugador?.id ? '#cbd5e1' : muted, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor: empateManual[grupo.id]?.primero?.id === j.jugador?.id ? 'not-allowed' : 'pointer', fontWeight:600 }}>
                          🥈 2°
                        </button>
                      </div>
                    ))}
                    {empateManual[grupo.id]?.primero && !empateManual[grupo.id]?.segundo && (
                      <div style={{ marginTop:8, padding:'8px', background:'#ede9fe', borderRadius:8, fontSize:11, color:'#3730a3', textAlign:'center' }}>
                        ✓ 1°: {empateManual[grupo.id].primero.nombre} — Ahora elige quién queda 2°
                      </div>
                    )}
                    {empateManual[grupo.id]?.primero && empateManual[grupo.id]?.segundo &&
                      empateManual[grupo.id].primero.id !== empateManual[grupo.id].segundo.id && (
                      <div style={{ marginTop:8, padding:'8px', background:'#f0fdf4', borderRadius:8, fontSize:12, color:'#16a34a', textAlign:'center' }}>
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
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                        <span style={{ flex:1, color: p.ganador===p.jugador_a?'#16a34a': text, textAlign:'right' }}>{jugA?.jugador?.nombre||'—'}</span>
                        <span style={{ color: hint, fontSize:10 }}>vs</span>
                        <span style={{ flex:1, color: p.ganador===p.jugador_b?'#16a34a': text }}>{jugB?.jugador?.nombre||'—'}</span>
                        {esAdmin && !p.ganador && (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => marcarGanador(p.id, p.jugador_a)} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>A ✓</button>
                            <button onClick={() => marcarGanador(p.id, p.jugador_b)} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>✓ B</button>
                          </div>
                        )}
                        {p.ganador && partidoEditando !== p.id && (
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ color:'#16a34a', fontSize:10 }}>✓</span>
                            {esAdmin && faseActual === 'grupos' && (
                              <button onClick={() => setPartidoEditando(p.id)} style={{ background:'transparent', border:'none', color:'#94a3b8', fontSize:10, cursor:'pointer', padding:'2px 4px' }} title="Corregir resultado">✏️</button>
                            )}
                          </div>
                        )}
                        {p.ganador && partidoEditando === p.id && (
                          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                            <span style={{ fontSize:10, color:'#94a3b8' }}>¿Quién ganó?</span>
                            <button onClick={async () => {
                              const res = await corregirResultadoGrupos({ partidoId: p.id, nuevoGanadorId: p.jugador_a })
                              if (res.error) { alert(res.error); return }
                              setPartidoEditando(null)
                              await cargarTorneo()
                            }} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>
                              {jugA?.jugador?.nombre?.split(' ')[0] || 'A'}
                            </button>
                            <button onClick={async () => {
                              const res = await corregirResultadoGrupos({ partidoId: p.id, nuevoGanadorId: p.jugador_b })
                              if (res.error) { alert(res.error); return }
                              setPartidoEditando(null)
                              await cargarTorneo()
                            }} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>
                              {jugB?.jugador?.nombre?.split(' ')[0] || 'B'}
                            </button>
                            <button onClick={() => setPartidoEditando(null)} style={{ background:'transparent', border:'none', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>✕</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PLAYOFFS BRACKET */}
      {esPlayoffs && tabActiva === 'bracket' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#3730a3' }}>
              💡 Haz clic en el nombre del ganador para registrar el resultado
            </div>
            {esAdmin && faseActual !== 'finalizado' && (
              <button onClick={volverAGrupos} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                ⚠️ Volver a grupos
              </button>
            )}
          </div>
          {/* SVG Bracket */}
          {(() => {
            const CARD_H = 80
            const SLOT_H = 96
            const COL_W = 190
            const CONN_W = 22

            const fasesVis = fasesOrden
              .slice(0, faseActual === 'finalizado' ? fasesOrden.length : fasesOrden.indexOf(faseActual) + 1)
              .filter(f => partidos.some(p => p.fase === f))

            if (!fasesVis.length) return null

            const byFase: Record<string, any[]> = {}
            for (const f of fasesVis) {
              byFase[f] = partidos.filter(p => p.fase === f).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            }

            const N0 = byFase[fasesVis[0]].length
            const totalH = N0 * SLOT_H
            const cy = (j: number, N: number) => ((j + 0.5) / N) * totalH

            return (
              <div style={{ overflowX: 'auto', paddingBottom: 16, paddingTop: 44 }}>
                <div style={{ display: 'flex', minWidth: 'max-content' }}>
                  {fasesVis.flatMap((fase, pi) => {
                    const ps = byFase[fase]
                    const N = ps.length
                    const isLast = pi === fasesVis.length - 1

                    const col = (
                      <div key={fase} style={{ width: COL_W, position: 'relative', height: totalH }}>
                        <div style={{ position: 'absolute', top: -36, left: 0, right: 0, fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center', background: '#f4f7fa', padding: '3px 6px', borderRadius: 5 }}>
                          {faseLabel[fase]}
                        </div>
                        {ps.map((p, i) => {
                          const top = cy(i, N) - CARD_H / 2
                          const isBye = p.jugador_b === null
                          const editandoEste = partidoPlayoffEditando === p.id
                          const showEdit = !!p.ganador && esAdmin && !isBye && faseActual !== 'finalizado'
                          const rowH = showEdit ? `${Math.floor((CARD_H - 20) / 2)}px` : '50%'

                          return (
                            <div key={p.id} style={{ position: 'absolute', left: 0, right: 0, top, height: CARD_H, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
                              {editandoEste ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: '8px 10px', background: '#fafafa' }}>
                                  <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>¿Quién ganó?</span>
                                  <div style={{ display: 'flex', gap: 5 }}>
                                    <button onClick={() => corregirPlayoff(p.id, p.jugador_a)} style={{ flex: 1, background: '#ede9fe', color: '#3730a3', border: 'none', borderRadius: 5, padding: '5px 2px', fontSize: 11, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {(p as any).ja?.nombre?.split(' ')[0] || 'A'}
                                    </button>
                                    <button onClick={() => corregirPlayoff(p.id, p.jugador_b)} style={{ flex: 1, background: '#ede9fe', color: '#3730a3', border: 'none', borderRadius: 5, padding: '5px 2px', fontSize: 11, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {(p as any).jb?.nombre?.split(' ')[0] || 'B'}
                                    </button>
                                    <button onClick={() => setPartidoPlayoffEditando(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div
                                    onClick={() => esAdmin && !p.ganador && !isBye && marcarGanador(p.id, p.jugador_a)}
                                    draggable={esAdmin && !p.ganador ? true : undefined}
                                    onDragStart={esAdmin && !p.ganador ? () => setDragSlot({ partidoId: p.id, posicion: 'jugador_a', jugadorId: p.jugador_a }) : undefined}
                                    onDragOver={esAdmin && !p.ganador ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'jugador_a' }) } : undefined}
                                    onDrop={esAdmin && !p.ganador ? (e) => { e.preventDefault(); handleSwap(p.id, 'jugador_a') } : undefined}
                                    onDragLeave={(e) => { if (!(e.currentTarget as HTMLDivElement).contains(e.relatedTarget as Node)) setDragOver(null) }}
                                    onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                                    style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid #f1f5f9', cursor: esAdmin && !p.ganador && !isBye ? 'grab' : 'default', background: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_a' ? '#dbeafe' : p.ganador === p.jugador_a ? '#f0fdf4' : 'transparent', outline: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_a' ? '2px solid #93c5fd' : 'none', opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === 'jugador_a' ? 0.4 : 1 }}>
                                    <span style={{ fontSize: 12, color: p.ganador === p.jugador_a ? '#16a34a' : text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                      <span style={{ fontSize: 9, background: '#ede9fe', color: '#3730a3', padding: '1px 3px', borderRadius: 3, marginRight: 4 }}>{i * 2 + 1}</span>
                                      {(p as any).ja?.nombre || 'TBD'}
                                    </span>
                                    {p.ganador === p.jugador_a && <span style={{ color: '#16a34a', fontSize: 11, marginLeft: 4 }}>✓</span>}
                                  </div>
                                  {isBye ? (
                                    <div style={{ height: rowH, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, color: hint, fontStyle: 'italic' }}>BYE</div>
                                  ) : (
                                    <div
                                      onClick={() => esAdmin && !p.ganador && marcarGanador(p.id, p.jugador_b)}
                                      draggable={esAdmin && !p.ganador ? true : undefined}
                                      onDragStart={esAdmin && !p.ganador ? () => setDragSlot({ partidoId: p.id, posicion: 'jugador_b', jugadorId: p.jugador_b }) : undefined}
                                      onDragOver={esAdmin && !p.ganador ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'jugador_b' }) } : undefined}
                                      onDrop={esAdmin && !p.ganador ? (e) => { e.preventDefault(); handleSwap(p.id, 'jugador_b') } : undefined}
                                      onDragLeave={(e) => { if (!(e.currentTarget as HTMLDivElement).contains(e.relatedTarget as Node)) setDragOver(null) }}
                                      onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                                      style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', cursor: esAdmin && !p.ganador ? 'grab' : 'default', background: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_b' ? '#dbeafe' : p.ganador === p.jugador_b ? '#f0fdf4' : 'transparent', outline: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_b' ? '2px solid #93c5fd' : 'none', opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === 'jugador_b' ? 0.4 : 1 }}>
                                      <span style={{ fontSize: 12, color: p.ganador === p.jugador_b ? '#16a34a' : text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        <span style={{ fontSize: 9, background: '#ede9fe', color: '#3730a3', padding: '1px 3px', borderRadius: 3, marginRight: 4 }}>{i * 2 + 2}</span>
                                        {(p as any).jb?.nombre || 'TBD'}
                                      </span>
                                      {p.ganador === p.jugador_b && <span style={{ color: '#16a34a', fontSize: 11, marginLeft: 4 }}>✓</span>}
                                    </div>
                                  )}
                                  {showEdit && (
                                    <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 6px', borderTop: '1px solid #f1f5f9' }}>
                                      <button onClick={() => setPartidoPlayoffEditando(p.id)} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', fontSize: 10, cursor: 'pointer', padding: '0 2px' }} title="Corregir resultado">✏️</button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )

                    if (isLast) return [col]

                    const nextFase = fasesVis[pi + 1]
                    const N2 = byFase[nextFase].length
                    const connector = (
                      <svg key={`conn-${pi}`} width={CONN_W} height={totalH} style={{ flexShrink: 0, display: 'block' }}>
                        {Array.from({ length: N2 }, (_, j) => {
                          const a = Math.round(j * N / N2)
                          const b = Math.round((j + 1) * N / N2) - 1
                          const y1 = cy(a, N)
                          const y2 = cy(b, N)
                          const ym = cy(j, N2)
                          const mx = CONN_W / 2
                          return a === b
                            ? <path key={j} d={`M 0,${y1} H ${CONN_W}`} stroke="#c4b5fd" strokeWidth={1.5} fill="none" />
                            : <path key={j} d={`M 0,${y1} H ${mx} V ${y2} M 0,${y2} H ${mx} M ${mx},${ym} H ${CONN_W}`} stroke="#c4b5fd" strokeWidth={1.5} fill="none" />
                        })}
                      </svg>
                    )

                    return [col, connector]
                  })}
                </div>
              </div>
            )
          })()}

          {/* Campeón */}
          {faseActual === 'finalizado' && (() => {
            const pFinal = partidos.find(p => p.fase === 'final' && p.ganador)
            const campeon = pFinal ? ((pFinal as any).jg) : null
            return campeon ? (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:16, padding:24, textAlign:'center', marginBottom:16 }}>
                <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#d97706' }}>¡Campeón!</div>
                <div style={{ fontSize:18, color: text, marginTop:4 }}>{campeon.nombre}</div>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* PANEL PREMIOS */}
      {esAdmin && faseActual === 'finalizado' && (() => {
        const pFinal = partidos.find(p => p.fase === 'final' && p.ganador)
        const campeon1 = pFinal ? (pFinal as any).jg : null
        const subcampeon = pFinal
          ? (pFinal.ganador === pFinal.jugador_a ? (pFinal as any).jb : (pFinal as any).ja)
          : null

        const inputStyle = {
          width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0',
          borderRadius: 8, padding: '9px 12px', color: text, fontSize: 13, outline: 'none',
          fontVariantNumeric: 'tabular-nums' as const,
        }

        return (
          <div style={{ ...card, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 16 }}>🏅 Premios del torneo</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 5 }}>
                  🥇 Primer lugar{campeon1 ? ` — ${campeon1.nombre}` : ''}
                </label>
                <input
                  type="number"
                  placeholder="$ monto"
                  value={premio1}
                  onChange={e => setPremio1(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 5 }}>
                  🥈 Segundo lugar{subcampeon ? ` — ${subcampeon.nombre}` : ''}
                </label>
                <input
                  type="number"
                  placeholder="$ monto"
                  value={premio2}
                  onChange={e => setPremio2(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {!premioTerceroOpen ? (
              <button
                onClick={() => setPremioTerceroOpen(true)}
                style={{ background: 'transparent', border: '1px dashed #e2e8f0', borderRadius: 8, padding: '8px 14px', color: muted, fontSize: 12, cursor: 'pointer', width: '100%', marginBottom: 12 }}
              >
                + Agregar premio 3° lugar
              </button>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: 11, color: muted }}>🥉 Tercer lugar</label>
                  <button onClick={() => { setPremioTerceroOpen(false); setPremio3('') }} style={{ background: 'transparent', border: 'none', color: hint, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                </div>
                <input
                  type="number"
                  placeholder="$ monto"
                  value={premio3}
                  onChange={e => setPremio3(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {torneo?.contabilidad_enviada ? (
              <div style={{ width: '100%', padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#16a34a', textAlign: 'center' }}>
                ✓ Enviado a Finanzas
              </div>
            ) : (
              <button
                onClick={() => setModalPremios(true)}
                style={{ width: '100%', padding: '10px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Guardar premios →
              </button>
            )}

            {/* Modal confirmación premios + ingresos */}
            {modalPremios && (() => {
              const p1 = premio1 ? parseInt(premio1) : null
              const p2 = premio2 ? parseInt(premio2) : null
              const p3 = premioTerceroOpen && premio3 ? parseInt(premio3) : null
              const totalPremios = (p1 || 0) + (p2 || 0) + (p3 || 0)
              const enviarRec = !torneo?.contabilidad_enviada && recaudado > 0
              const neto = recaudado - totalPremios
              const fmtM = (n: number) => '$' + n.toLocaleString('es-CL')
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: text, marginBottom: 4 }}>Confirmar y enviar a Finanzas</div>
                    <div style={{ fontSize: 12, color: muted, marginBottom: 20 }}>Esto registrará los movimientos en Finanzas.</div>

                    <div style={{ background: '#f4f7fa', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {enviarRec && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: '#16a34a' }}>📥 Ingresos (cuotas)</span>
                          <strong style={{ color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{fmtM(recaudado)}</strong>
                        </div>
                      )}
                      {(p1 !== null) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: text }}>🥇 Premio 1°{campeon1 ? ` — ${campeon1.nombre}` : ''}</span>
                          <strong style={{ color: p1 > 0 ? '#dc2626' : muted, fontVariantNumeric: 'tabular-nums' }}>{p1 > 0 ? `− ${fmtM(p1)}` : '$0'}</strong>
                        </div>
                      )}
                      {(p2 !== null) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: text }}>🥈 Premio 2°{subcampeon ? ` — ${subcampeon.nombre}` : ''}</span>
                          <strong style={{ color: p2 > 0 ? '#dc2626' : muted, fontVariantNumeric: 'tabular-nums' }}>{p2 > 0 ? `− ${fmtM(p2)}` : '$0'}</strong>
                        </div>
                      )}
                      {p3 !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: text }}>🥉 Premio 3°</span>
                          <strong style={{ color: p3 > 0 ? '#dc2626' : muted, fontVariantNumeric: 'tabular-nums' }}>{p3 > 0 ? `− ${fmtM(p3)}` : '$0'}</strong>
                        </div>
                      )}
                      {enviarRec && (
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 9, display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                          <span style={{ color: neto >= 0 ? '#16a34a' : '#dc2626' }}>Queda para el club</span>
                          <span style={{ color: neto >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtM(neto)}</span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const pendientes = cuota > 0
                        ? jugadoresUnicos.filter((j: any) => {
                            const pago = pagos.find((p: any) => p.jugador_id === j.jugador_id)
                            return !pago || pago.estado !== 'pagado'
                          })
                        : []
                      if (!pendientes.length) return null
                      return (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#d97706', marginBottom: 8 }}>⚠️ Pagos pendientes</div>
                          {pendientes.map((j: any) => (
                            <div key={j.jugador_id} style={{ fontSize: 12, color: '#92400e', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', flexShrink: 0, display: 'inline-block' }} />
                              {j.jugadores?.nombre || '—'} — pendiente de pago
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setModalPremios(false)} style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button
                        onClick={async () => {
                          setGuardandoPremios(true)
                          const res = await guardarPremios({ torneoId, torneoNombre: torneo?.nombre || '', primero: p1, segundo: p2, tercero: p3, montoRecaudado: recaudado, enviarRecaudacion: enviarRec })
                          setGuardandoPremios(false)
                          setModalPremios(false)
                          if (res.error) { alert(res.error); return }
                          await cargarTorneo()
                        }}
                        disabled={guardandoPremios}
                        style={{ flex: 1, padding: 11, background: guardandoPremios ? '#94a3b8' : '#4f46e5', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: guardandoPremios ? 'not-allowed' : 'pointer' }}
                      >
                        {guardandoPremios ? 'Enviando...' : 'Confirmar y enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )
      })()}

      {/* PAGOS PENDIENTES */}
      {esAdmin && cuota > 0 && (faseActual === 'grupos' || fasesOrden.includes(faseActual) || faseActual === 'finalizado') && (
        <div style={{ ...card, padding:16, marginBottom:16, marginTop:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color: text, marginBottom:12 }}>💳 Pagos pendientes</div>
          {jugadoresUnicos.filter((j: any) => {
            const pago = pagos.find(p => p.jugador_id === j.jugador_id)
            return !pago || pago.estado !== 'pagado'
          }).length === 0
            ? <p style={{ fontSize:13, color:'#16a34a' }}>✓ Todos han pagado</p>
            : jugadoresUnicos.filter((j: any) => {
                const pago = pagos.find(p => p.jugador_id === j.jugador_id)
                return !pago || pago.estado !== 'pagado'
              }).map((j: any) => (
              <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f1f5f9' }}>
                <div style={{ flex:1, fontSize:13, color: text }}>{j.jugadores?.nombre||'—'}</div>
                <span style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontSize:11 }}>Pendiente</span>
                <button onClick={async () => {
                  await actualizarEstadoPago({ torneoId, jugadorId: j.jugador_id, estado: 'pagado', metodoPago: 'efectivo' })
                  await cargarTorneo()
                }} style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                  ✓ Marcar pagado
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* MESA DE INSCRIPCIÓN */}
      {mesaOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.14)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600, color: text }}>🪑 Mesa de inscripción</div>
              <button onClick={() => setMesaOpen(false)} style={{ background:'transparent', border:'none', color: muted, cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* Stats en tiempo real */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
              {(faseActual === 'inscripcion' ? [
                { label:'Inscritos', value:jugadoresInscritos.length, color: text },
                { label:'Grupos estimados', value:numGruposEstimados, color:'#3730a3' },
                { label:'Recaudado', value:fmt(recaudado), color:'#16a34a' },
              ] : [
                { label:'Inscritos', value:totalInscritos, color: text },
                { label:'Grupos', value:gruposReales.length, color:'#3730a3' },
                { label:'Recaudado', value:fmt(recaudado), color:'#16a34a' },
              ]).map(s => (
                <div key={s.label} style={{ background:'#f4f7fa', borderRadius:8, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                  <div style={{ fontSize:10, color: muted }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Input inscripción */}
            <div style={{ position:'relative', marginBottom:10 }}>
              <input style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                placeholder="Buscar jugador del club o escribir nombre nuevo..."
                value={busquedaMesa}
                onChange={async e => {
                  setBusquedaMesa(e.target.value)
                  setRutMesa('')
                  if (e.target.value.length > 1 && perfil?.club_id) {
                    const { data } = await supabase.from('jugadores').select('id,nombre,rut,elo,categoria').eq('club_id', perfil.club_id).neq('es_externo', true).ilike('nombre', `%${e.target.value}%`).limit(5)
                    ;(window as any).__jugSuggestions = data || []
                    setBusquedaMesa(e.target.value)
                  } else {
                    ;(window as any).__jugSuggestions = []
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleInscribirEnMesa()}
              />
              {busquedaMesa.length > 1 && (window as any).__jugSuggestions?.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, zIndex:10, marginTop:4, overflow:'hidden', boxShadow:'0 4px 12px rgba(15,23,42,0.1)' }}>
                  {((window as any).__jugSuggestions || []).map((j: any) => (
                    <div key={j.id} onClick={() => {
                      setBusquedaMesa(j.nombre)
                      setRutMesa(j.rut || '')
                      ;(window as any).__jugSuggestions = []
                    }} style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:13 }}>
                      <span style={{ color: text }}>{j.nombre}</span>
                      <span style={{ color: muted, fontSize:11, marginLeft:8 }}>ELO {j.elo} · {j.categoria}</span>
                      <span style={{ background:'#f0fdf4', color:'#16a34a', fontSize:10, padding:'1px 6px', borderRadius:10, marginLeft:8 }}>Del club</span>
                    </div>
                  ))}
                  <div style={{ padding:'8px 12px', fontSize:11, color: hint, borderTop:'1px solid #f1f5f9' }}>
                    O presiona Enter para inscribir como participante externo
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input style={{ flex:1, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                placeholder="12345678-9" value={rutMesa} onChange={e => setRutMesa(formatRut(e.target.value))} maxLength={10} />
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <select style={{ flex:1, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:13, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia</option>
              </select>
              <button onClick={handleInscribirEnMesa} disabled={inscribiendo} style={{ flex:1, background: inscribiendo ? '#94a3b8' : '#f43f5e', color:'white', border:'none', borderRadius:8, padding:'10px', fontSize:13, fontWeight:600, cursor: inscribiendo ? 'not-allowed' : 'pointer' }}>
                {inscribiendo ? 'Inscribiendo...' : '+ Inscribir'}
              </button>
            </div>

            {/* Lista inscritos en tiempo real */}
            {faseActual === 'inscripcion' && jugadoresInscritos.length > 0 && (
              <div style={{ background:'#f4f7fa', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
                <div style={{ padding:'8px 14px', fontSize:11, color: muted, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #e2e8f0' }}>
                  Jugadores inscritos
                </div>
                {jugadoresInscritos.sort((a: any, b: any) => (b.jugadores?.elo||0) - (a.jugadores?.elo||0)).map((j: any, i: number) => (
                  <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #e2e8f0', background:'#ffffff' }}>
                    <span style={{ fontSize:12, color: muted, width:20 }}>{i+1}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: text, fontWeight:500 }}>{j.jugadores?.nombre||'—'}</div>
                      <div style={{ fontSize:11, color: muted }}>ELO: {j.jugadores?.elo||1200}</div>
                    </div>
                    {/* Cabeza de serie */}
                    <button
                      onClick={() => toggleCabezaSerie(j.jugador_id)}
                      style={{ background: cabezasSerie.has(j.jugador_id)?'#fffbeb':'transparent', color: cabezasSerie.has(j.jugador_id)?'#d97706': hint, border:`1px solid ${cabezasSerie.has(j.jugador_id)?'#fde68a':'#e2e8f0'}`, borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}
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
                          style={{ background: esPagado ? '#f0fdf4' : '#fef2f2', color: esPagado ? '#16a34a' : '#dc2626', border:`1px solid ${esPagado ? '#bbf7d0' : '#fecaca'}`, borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                          {esPagado ? '✓ Pagado' : 'Pendiente'}
                        </button>
                      )
                    })()}
                    {/* Quitar */}
                    <button onClick={async () => {
                      await supabase.from('grupo_jugadores').delete().eq('jugador_id', j.jugador_id).in('grupo_id', grupos.map((g:any)=>g.id))
                      setJugadoresInscritos(prev => prev.filter((x:any) => x.jugador_id !== j.jugador_id))
                    }} style={{ background:'transparent', border:'none', color:'#dc2626', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {faseActual === 'inscripcion' ? (
              <button onClick={cerrarInscripcion} disabled={jugadoresInscritos.length < 4}
                style={{ width:'100%', padding:12, background: jugadoresInscritos.length >= 4?'#f0fdf4':'#f4f7fa', color: jugadoresInscritos.length >= 4?'#16a34a': hint, border:`1px solid ${jugadoresInscritos.length >= 4?'#bbf7d0':'#e2e8f0'}`, borderRadius:8, fontSize:13, fontWeight:600, cursor: jugadoresInscritos.length >= 4?'pointer':'not-allowed' }}>
                {jugadoresInscritos.length < 4 ? `Mínimo 4 jugadores (faltan ${4-jugadoresInscritos.length})` : `✓ Cerrar inscripción y generar ${numGruposEstimados} grupos`}
              </button>
            ) : (
              <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#3730a3', textAlign:'center' }}>
                💡 Cada jugador se agrega al grupo con menos integrantes (ELO más cercano).
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
