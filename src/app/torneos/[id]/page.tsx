'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import AppLayout from '@/app/layout-app'
import {
  corregirResultadoGrupos,
  cerrarInscripcionYGenerarGrupos,
  sincronizarLlaves as sincronizarLlavesAction,
  finalizarTorneo as finalizarTorneoAction,
  generarGruposTardios,
  actualizarEstadoPago,
  subirPagosPendientesAFinanzas,
  limpiarGruposHuerfanos,
  volverAGrupos as volverAGruposAction,
  corregirResultadoPlayoff,
  archivarTorneo,
  guardarPremios,
  inscribirEnMesa,
  configurarCabezasSerie,
  crearGrupoManual,
  finalizarGrupoManual,
  eliminarGrupoManualVacio,
  moverJugadorEntreGrupos,
  reordenarJugadorEnGrupo,
  quitarJugadorDeMesa,
  enviarRecaudacionAFinanzas,
  guardarDesempateGrupo,
  intercambiarJugadores,
} from '@/app/actions/torneos'
import { CONFIG, type FaseOrden } from '@/lib/config'
import { calcularNumGrupos, construirLlavesLayoutNumerado } from '@/lib/domain/torneos'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { copiarTexto } from '@/lib/clipboard'
import dynamic from 'next/dynamic'
const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })), { ssr: false })
import CabezasSerieEditor, { type CabezaSerieJugador } from '@/components/torneos/CabezasSerieEditor'

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
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'pendiente'>('pendiente')
  const [pagoLoading, setPagoLoading] = useState<string|null>(null)
  const [pagosSeleccionados, setPagosSeleccionados] = useState<Set<string>>(new Set())
  const [metodoPagosFinales, setMetodoPagosFinales] = useState<'efectivo'|'transferencia'>('efectivo')
  const [subiendoPagos, setSubiendoPagos] = useState(false)
  const [jugadoresInscritos, setJugadoresInscritos] = useState<any[]>([])
  const [cabezasNumeradas, setCabezasNumeradas] = useState<CabezaSerieJugador[]>([])
  const [cabezasPersistidas, setCabezasPersistidas] = useState<CabezaSerieJugador[]>([])
  const [jugSuggestions, setJugSuggestions] = useState<any[]>([])
  const [empateManual, setEmpateManual] = useState<Record<string, any>>({})
  const [tabActiva, setTabActiva] = useState<'grupos'|'bracket'>('grupos')
  const [partidoEditando, setPartidoEditando] = useState<string|null>(null)
  const [partidoPlayoffEditando, setPartidoPlayoffEditando] = useState<string|null>(null)
  const [dragSlot, setDragSlot] = useState<{ partidoId: string; posicion: 'jugador_a' | 'jugador_b' } | null>(null)
  const [dragOver, setDragOver] = useState<{ partidoId: string; posicion: 'jugador_a' | 'jugador_b' } | null>(null)
  const [inscribiendo, setInscribiendo] = useState(false)
  const [premio1, setPremio1] = useState('')
  const [premio2, setPremio2] = useState('')
  const [premio3, setPremio3] = useState('')
  const [premioTerceroOpen, setPremioTerceroOpen] = useState(false)
  const [premioMetodo, setPremioMetodo] = useState<'efectivo'|'transferencia'>('efectivo')
  const [guardandoPremios, setGuardandoPremios] = useState(false)
  const [modalPremios, setModalPremios] = useState(false)
  const [enviandoRecaudacion, setEnviandoRecaudacion] = useState(false)
  const [dragJugadorGrupo, setDragJugadorGrupo] = useState<{ jugadorId: string; grupoId: string } | null>(null)
  const [moviendoJugadorId, setMoviendoJugadorId] = useState<string | null>(null)
  const [cerrandoInscripcion, setCerrandoInscripcion] = useState(false)
  const [generandoTardios, setGenerandoTardios] = useState(false)
  const [creandoGrupoManual, setCreandoGrupoManual] = useState(false)
  const [accionGrupoManual, setAccionGrupoManual] = useState<{ grupoId: string; tipo: 'finalizar' | 'cancelar' } | null>(null)
  const [informeOpen, setInformeOpen] = useState(false)
  const [gastosGestion, setGastosGestion] = useState<{ tipo: string; monto: string }[]>([{ tipo: '', monto: '' }])
  // En celu NO montamos el cuadro SVG (divs absolutos + SVG de conectores): con
  // display:none React lo reconcilía igual en cada re-render y reventaba la
  // pestaña por memoria al marcar. Con este flag el SVG ni entra al árbol.
  const [isMobile, setIsMobile] = useState(false)
  const [torneosActivos, setTorneosActivos] = useState<{ id: string; nombre: string; fase: string }[]>([])
  const sincronizandoRef = useRef(false)
  const ultimaSyncRef = useRef('')
  const marcandoRef = useRef(false)
  const router = useRouter()
  const params = useParams()
  const torneoId = params.id as string

  const cargarTorneo = useCallback(async () => {
    // Un solo viaje: las 5 queries en paralelo. grupo_jugadores se filtra por
    // torneo vía el join a torneo_grupos, así no hay que esperar los grupos.
    const [
      { data: t },
      { data: g },
      { data: pts },
      { data: pgs },
      { data: gj },
      { data: cabezasData },
    ] = await Promise.all([
      supabase.from('torneos').select('*').eq('id', torneoId).single(),
      supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).order('orden', { nullsFirst: false }).order('nombre'),
      supabase.from('torneo_partidos').select('*,ja:jugador_a(id,nombre),jb:jugador_b(id,nombre),jg:ganador(id,nombre)').eq('torneo_id', torneoId),
      supabase.from('torneo_pagos').select('*').eq('torneo_id', torneoId),
      supabase.from('grupo_jugadores').select('*,jugadores(id,nombre),torneo_grupos!inner(torneo_id)').eq('torneo_grupos.torneo_id', torneoId),
      supabase.from('torneo_cabezas_serie').select('jugador_id,numero,jugadores(id,nombre)').eq('torneo_id', torneoId).order('numero'),
    ])

    setTorneo(t)
    setGrupos(g || [])
    setPartidos(pts || [])
    setPagos(pgs || [])
    const cabezasCargadas = (cabezasData || []).map((c: any) => ({
      id: c.jugador_id,
      nombre: Array.isArray(c.jugadores) ? c.jugadores[0]?.nombre || '—' : c.jugadores?.nombre || '—',
    }))
    setCabezasNumeradas(cabezasCargadas)
    setCabezasPersistidas(cabezasCargadas)

    const todos = [...(gj || [])].sort((a: any, b: any) =>
      String(a.grupo_id ?? '').localeCompare(String(b.grupo_id ?? '')) ||
      (a.orden ?? 0) - (b.orden ?? 0) ||
      String(a.jugadores?.nombre ?? '').localeCompare(String(b.jugadores?.nombre ?? ''), 'es')
    )
    const grupoMesaId = (g || []).find((gr: any) => gr.nombre === 'MESA')?.id
    setJugadores(grupoMesaId ? todos.filter((j: any) => j.grupo_id !== grupoMesaId) : todos)
    if (grupoMesaId) {
      setJugadoresInscritos(todos.filter((j: any) => j.grupo_id === grupoMesaId))
    } else {
      setJugadoresInscritos([])
    }
  }, [torneoId])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    cargarTorneo().finally(() => setLoading(false))
    // Depende de perfil?.id (no del objeto): la revalidación en segundo plano
    // de PerfilProvider crea un objeto nuevo y recargaba el torneo dos veces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, perfil?.id, torneoId])

  useEffect(() => {
    if (!perfil?.club_id) return
    supabase.from('torneos').select('id,nombre,fase').eq('club_id', perfil.club_id).eq('estado', 'en_curso').order('fecha_inicio', { ascending: false })
      .then(({ data }) => setTorneosActivos(data || []))
  }, [perfil?.club_id, torneoId])

  useEffect(() => {
    if (torneo?.fase && (fasesOrden as readonly string[]).includes(torneo.fase)) {
      setTabActiva('bracket')
    }
  }, [torneo?.fase])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // Crea el esqueleto al cerrar al menos la mitad de los grupos y luego va
  // completando los cupos restantes sin regenerar el árbol.
  useEffect(() => {
    if (loading || authLoading) return
    if (perfil?.rol !== 'admin') return
    if (torneo?.fase !== 'grupos') return
    if (cabezasNumeradas.map(c => c.id).join(',') !== cabezasPersistidas.map(c => c.id).join(',')) return

    const clasificados = calcularClasificados()
    const gruposReales = grupos.filter((g: any) => g.nombre !== 'MESA')
    if (gruposReales.some((g: any) => g.en_preparacion)) return
    if (!gruposReales.length || clasificados.length < Math.ceil(gruposReales.length / 2)) return
    const firmaLayout = [
      cabezasPersistidas.map(c => c.id).join(','),
      gruposReales.map((g: any) => g.id).sort().join(','),
    ].join(':')
    const firma = `${firmaLayout}|${clasificados.map(c => `${c.grupoId}:${c.primeroId}:${c.segundoId}`).sort().join(',')}`
    if (firma === ultimaSyncRef.current || sincronizandoRef.current) return

    sincronizandoRef.current = true
    ultimaSyncRef.current = firma
    sincronizarLlavesAction({ torneoId })
      .then(res => {
        if ('error' in res && res.error) {
          // ponytail: NO resetear ultimaSyncRef aquí (causaba bucle de
          // alerts si el server fallaba). Marcela usa el botón manual si
          // quiere reintentar.
          console.error('sincronizarLlaves error:', res.error)
          return
        }
        return cargarTorneo()
      })
      .catch(err => { console.error('sincronizarLlaves throw:', err); ultimaSyncRef.current = '' })
      .finally(() => { sincronizandoRef.current = false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidos, grupos, torneo?.fase, cabezasNumeradas, cabezasPersistidas, perfil?.rol, loading, authLoading])

  useEffect(() => {
    if (torneo?.id) {
      setPremio1(torneo.premio_primero?.toString() ?? '')
      setPremio2(torneo.premio_segundo?.toString() ?? '')
      const p3 = torneo.premio_tercero?.toString() ?? ''
      setPremio3(p3)
      setPremioTerceroOpen(!!p3)
    }
  }, [torneo?.id])

  async function guardarCabezasNumeradas(jugadorIds: string[]) {
    const res = await configurarCabezasSerie({ torneoId, jugadorIds })
    if (res.error) return { error: res.error }
    await cargarTorneo()
    return {}
  }
  async function moverAGrupo(jugadorId: string, grupoOrigenId: string, grupoDestinoId: string) {
    if (grupoOrigenId === grupoDestinoId || moviendoJugadorId) return
    setMoviendoJugadorId(jugadorId)
    try {
      const res = await moverJugadorEntreGrupos({ torneoId, jugadorId, grupoOrigenId, grupoDestinoId })
      if (res.error) { alert(res.error); return }
      await cargarTorneo()
    } finally {
      setMoviendoJugadorId(null)
    }
  }

  async function reordenarEnGrupo(jugadorId: string, grupoId: string, direccion: 'arriba' | 'abajo') {
    const res = await reordenarJugadorEnGrupo({ torneoId, jugadorId, grupoId, direccion })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  async function marcarGanador(partidoId: string, ganadorId: string) {
    // ponytail: semáforo anti-doble-tap (iPhone registra dos touches a veces)
    if (marcandoRef.current) return
    marcandoRef.current = true

    const previo = partidos
    const partido = partidos.find(p => p.id === partidoId)
    const ganador = partido?.jugador_a === ganadorId
      ? (partido as any).ja
      : partido?.jugador_b === ganadorId ? (partido as any).jb : null
    setPartidos(prev => prev.map(p => p.id === partidoId ? { ...p, ganador: ganadorId, jg: ganador } : p))

    try {
      // ponytail: fetch a API route en vez de server action directa. La server
      // action pasa por el protocolo RSC flight de Next.js (serializa/deserializa
      // el árbol completo); en un componente de 1500 líneas con 30 hooks eso
      // reventaba la pestaña de Safari en iPhone por memoria. El API route
      // devuelve JSON plano → cero overhead RSC.
      const res = await fetch('/api/marcar-ganador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partidoId, ganadorId }),
      }).then(r => r.json())
      if (res.error) { setPartidos(previo); alert(res.error); return }
      // Para grupos: el update optimista es suficiente; calcularStats() re-deriva
      // el ranking instantáneamente. Recargar pisaría el estado antes de que
      // Supabase propague el write → ranking a 0 pts momentáneo.
      // Para playoffs: el RPC crea filas nuevas en la siguiente fase (semis/final).
      // Sin reload esas filas nunca aparecen en pantalla.
      if (partido?.fase && partido.fase !== 'grupos') {
        await cargarTorneo()
      }
    } catch {
      setPartidos(previo)
    } finally {
      marcandoRef.current = false
    }
  }

  async function handleInscribirEnMesa() {
    if (inscribiendo || !busquedaMesa.trim()) return
    setInscribiendo(true)
    try {
      const res = await inscribirEnMesa({ torneoId, busqueda: busquedaMesa, rut: rutMesa, metodoPago })
      if (res.error) { alert(res.error); return }

      setBusquedaMesa('')
      setRutMesa('')
      setJugadoresInscritos(prev => [...prev, { jugador_id: res.jugadorId!, jugadores: { id: res.jugadorId, nombre: res.jugadorNombre } }])
      await cargarTorneo()
    } finally {
      setInscribiendo(false)
    }
  }

  async function cerrarInscripcion() {
    if (!confirm('¿Cerrar inscripción y generar grupos?')) return
    if (cerrandoInscripcion) return
    setCerrandoInscripcion(true)
    try {
      if (cabezasConCambios) {
        const guardado = await configurarCabezasSerie({ torneoId, jugadorIds: cabezasNumeradas.map(c => c.id) })
        if (guardado.error) { alert(guardado.error); return }
      }
      const res = await cerrarInscripcionYGenerarGrupos({ torneoId })
      if (res.error) { alert(res.error); return }
      setMesaOpen(false)
      await cargarTorneo()
    } finally {
      setCerrandoInscripcion(false)
    }
  }

  function calcularStats(grupoId: string) {
    const jugsGrupo = jugadores.filter((j: any) => j.grupo_id === grupoId)
    const partidosGrupo = partidos.filter(p => p.grupo_id === grupoId)

    const stats: Record<string, { jugador: any, pts: number, pg: number, pp: number, orden: number }> = {}
    jugsGrupo.forEach((j: any) => {
      stats[j.jugador_id] = { jugador: j.jugadores, pts: 0, pg: 0, pp: 0, orden: j.orden ?? 0 }
    })

    partidosGrupo.filter(p => p.ganador).forEach(p => {
      if (stats[p.ganador]) { stats[p.ganador].pts += 2; stats[p.ganador].pg += 1 }
      const perd = p.jugador_a === p.ganador ? p.jugador_b : p.jugador_a
      if (stats[perd]) stats[perd].pp += 1
    })

    const ordenados = Object.values(stats).sort((a: any, b: any) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      const directo = partidosGrupo.find(p =>
        (p.jugador_a === a.jugador?.id && p.jugador_b === b.jugador?.id) ||
        (p.jugador_a === b.jugador?.id && p.jugador_b === a.jugador?.id),
      )
      if (directo?.ganador === a.jugador?.id) return -1
      if (directo?.ganador === b.jugador?.id) return 1
      return a.orden - b.orden
    })

    const puntosCorte = ordenados[1]?.pts
    const empatados = ordenados.filter(j => j.pts === puntosCorte)
    const hayTripleEmpate = empatados.length >= 3

    const primeroFijo = hayTripleEmpate ? ordenados.find(j => j.pts > puntosCorte) ?? null : null
    return { stats, ordenados, hayTripleEmpate, empatados, primeroFijo }
  }

  // Grupos ya cerrados (todos sus partidos jugados y sin triple empate pendiente)
  // con su 1° y 2° resueltos. Son los que ya pueden entrar al cuadro.
  function calcularClasificados(): { grupoId: string; primeroId: string; segundoId: string }[] {
    const out: { grupoId: string; primeroId: string; segundoId: string }[] = []
    for (const grupo of grupos.filter((g: any) => g.nombre !== 'MESA')) {
      const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)
      const cerrado = partidosGrupo.length > 0 && partidosGrupo.every(p => !!p.ganador)
      if (!cerrado) continue

      const { ordenados, hayTripleEmpate } = calcularStats(grupo.id)
      let primeroId: string | undefined
      let segundoId: string | undefined
      if (hayTripleEmpate) {
        primeroId = grupo.desempate_primero_id
        segundoId = grupo.desempate_segundo_id
        if (!primeroId || !segundoId || primeroId === segundoId) continue
      } else {
        primeroId = ordenados[0]?.jugador?.id
        segundoId = ordenados[1]?.jugador?.id
      }
      if (primeroId && segundoId) out.push({ grupoId: grupo.id, primeroId, segundoId })
    }
    return out
  }

  async function armarBracketAhora() {
    const clasificados = calcularClasificados()
    const totalGrupos = grupos.filter((g: any) => g.nombre !== 'MESA').length
    const minimo = Math.ceil(totalGrupos / 2)
    if (!totalGrupos || clasificados.length < minimo) { alert(`Debes cerrar al menos ${minimo} grupos antes de armar el bracket.`); return }
    if (cabezasConCambios) {
      const guardado = await configurarCabezasSerie({ torneoId, jugadorIds: cabezasNumeradas.map(c => c.id) })
      if (guardado.error) { alert(guardado.error); return }
    }
    const res = await sincronizarLlavesAction({ torneoId })
    if ('error' in res && res.error) { alert(`No se pudo armar el bracket: ${res.error}`); return }
    if ('esperandoCabezas' in res && res.esperandoCabezas) { alert('Primero deben terminar los grupos de los cabezas de serie.'); return }
    ultimaSyncRef.current = ''
    await cargarTorneo()
    setTabActiva('bracket')
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

  async function finalizarTorneo() {
    if (!confirm('¿Finalizar el torneo?')) return
    const res = await finalizarTorneoAction({ torneoId })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }

  const esAdmin = perfil?.rol === 'admin'
  const candidatosCabezas = Array.from(new Map(
    [...jugadores, ...jugadoresInscritos]
      .filter((j: any) => j.jugador_id && j.jugadores?.nombre)
      .map((j: any) => [j.jugador_id, { id: j.jugador_id, nombre: j.jugadores.nombre }]),
  ).values()) as CabezaSerieJugador[]
  const cuota = torneo?.cuota_inscripcion || 0
  const jugadoresUnicos: any[] = Array.from(new Map(jugadores.map((j: any) => [j.jugador_id, j])).values())
  const gruposReales = grupos.filter((g: any) => g.nombre !== 'MESA')
  const grupoEnPreparacion = gruposReales.find((g: any) => g.en_preparacion)
  const cabezasConCambios = cabezasNumeradas.map(c => c.id).join(',') !== cabezasPersistidas.map(c => c.id).join(',')
  const inscritosReales = jugadores.filter((j: any) => gruposReales.some((g: any) => g.id === j.grupo_id))
  const totalInscritos = inscritosReales.length || jugadoresInscritos.length
  const pagados = pagos.filter(p => p.estado === 'pagado').length
  const recaudado = pagados * cuota
  const recaudadoTransferencia = pagos.filter(p => p.estado === 'pagado' && p.metodo_pago === 'transferencia').length * cuota
  const recaudadoEfectivo = recaudado - recaudadoTransferencia
  const proyectado = totalInscritos * cuota
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  const faseActual = torneo?.fase
  const esPlayoffs = faseActual && (fasesOrden.includes(faseActual) || faseActual === 'finalizado')

  const partidosFaseActual = partidos.filter(p => p.fase === faseActual)
  const todosJugadosFase = partidosFaseActual.length > 0 && partidosFaseActual.every(p => p.ganador !== null && p.ganador !== undefined)

  const numGruposEstimados = calcularNumGrupos(jugadoresInscritos.length)

  // El cuadro puede existir (parcialmente lleno) mientras la fase sigue siendo
  // "grupos": mostramos las pestañas y el bracket también en ese caso.
  const hayBracket = partidos.some(p => p.fase !== 'grupos')
  const mostrarLlaves = !!esPlayoffs || hayBracket

  // Layout determinista del cuadro (mismo sembrado que el servidor), para poder
  // etiquetar los cupos vacíos con su grupo/posición y distinguir BYE reales de
  // cupos aún por definir.
  const clasificadosActuales = calcularClasificados()
  const slotCabeza = (jid?: string | null): { grupoIdx: number; pos: 1 | 2 } | null => {
    if (!jid) return null
    const c = clasificadosActuales.find(x => x.primeroId === jid || x.segundoId === jid)
    if (!c) return null
    const grupoIdx = gruposReales.findIndex((g: any) => g.id === c.grupoId)
    if (grupoIdx < 0) return null
    return { grupoIdx, pos: c.primeroId === jid ? 1 : 2 }
  }
  const slotsCabezas = cabezasPersistidas.map((c, indice) => {
    const slot = slotCabeza(c.id)
    return slot ? { ...slot, numero: indice + 1 } : null
  }).filter((c): c is { grupoIdx: number; pos: 1 | 2; numero: number } => !!c)

  async function intercambiarCupos(partidoId: string, posicion: 'jugador_a' | 'jugador_b') {
    if (!dragSlot) return
    const origen = dragSlot
    setDragSlot(null)
    setDragOver(null)
    if (origen.partidoId === partidoId && origen.posicion === posicion) return
    const res = await intercambiarJugadores({
      torneoId,
      slotA: origen,
      slotB: { partidoId, posicion },
    })
    if (res.error) { alert(res.error); return }
    await cargarTorneo()
  }
  const llavesLayout = gruposReales.length >= 2
    ? construirLlavesLayoutNumerado(gruposReales.length, slotsCabezas)
    : null
  const byeOrdenesInicial = new Set((llavesLayout?.matches || []).filter(m => m.b === null).map(m => m.orden))
  const etiquetaCupo = (partido: any, pos: 'a' | 'b'): string => {
    const grupoId = pos === 'a' ? partido.slot_a_grupo_id : partido.slot_b_grupo_id
    const posicion = pos === 'a' ? partido.slot_a_posicion : partido.slot_b_posicion
    if (grupoId && (posicion === 1 || posicion === 2)) {
      return `Grupo ${gruposReales.find((g: any) => g.id === grupoId)?.nombre ?? ''} · ${posicion}°`
    }
    if (!llavesLayout || partido.fase !== llavesLayout.faseInicial) return 'Por definir'
    const m = llavesLayout.matches.find(x => x.orden === partido.orden)
    const slot = pos === 'a' ? m?.a : m?.b
    return slot ? `Grupo ${gruposReales[slot.grupoIdx]?.nombre ?? ''} · ${slot.pos}°` : 'Por definir'
  }
  const esByeMatch = (partido: any): boolean => {
    if (partido.slot_a_grupo_id) return !partido.slot_b_grupo_id
    if (llavesLayout && partido.fase === llavesLayout.faseInicial) {
      return byeOrdenesInicial.has(partido.orden ?? 0)
    }
    return false
  }

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
            if (!confirm(`¿Archivar "${torneo?.nombre}"? Quedará guardado, pero no aparecerá en la lista normal.`)) return
            const res = await archivarTorneo({ torneoId })
            if (res.error) { alert(res.error); return }
            router.push('/torneos')
          }} style={{ background:'transparent', border:'1px solid #fecaca', borderRadius:8, padding:'6px 14px', color:'#dc2626', fontSize:13, cursor:'pointer' }}>
            Archivar
          </button>
        )}
        <h1 style={{ fontSize:20, fontWeight:700, color: text, margin:0, flex:'1 1 auto' }}>{torneo?.nombre}</h1>
        <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>{faseActual === 'grupos' && hayBracket ? 'Grupos + playoffs' : (faseLabel[faseActual] || faseActual)}</span>
        {torneo?.codigo && (
          <button
            onClick={() => setQrOpen(true)}
            title="Mostrar QR y link para ver en vivo (sin cuenta)"
            style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            📺 En vivo: <span style={{ fontFamily:'monospace', letterSpacing:1 }}>{torneo.codigo}</span> QR
          </button>
        )}
        {esAdmin && torneo?.inscripcion_abierta && !hayBracket && (
          <button onClick={() => setMesaOpen(true)} style={{ background:'#f43f5e', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🪑 Mesa inscripción</button>
        )}
        {esAdmin && faseActual !== 'inscripcion' && (
          <button
            onClick={async () => {
              const { descargarExcelTorneo } = await import('@/lib/torneo-excel')
              descargarExcelTorneo({ torneo, grupos, partidos, statsDeGrupo: (id) => calcularStats(id), faseLabel, fasesOrden })
            }}
            title="Descargar respaldo del torneo en Excel (una hoja por fase)"
            style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            📊 Descargar Excel
          </button>
        )}
        {esAdmin && faseActual === 'finalizado' && (
          <button
            onClick={() => setInformeOpen(true)}
            title="Descargar informe financiero del torneo (PDF)"
            style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            📄 Informe financiero
          </button>
        )}
        {esAdmin && faseActual === 'grupos' && hayBracket && (
          <button onClick={() => setTabActiva('bracket')} style={{ background:'#4f46e5', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>⚔️ Ver llaves →</button>
        )}
        {esAdmin && faseActual === 'grupos' && (
          <button
            onClick={armarBracketAhora}
            title="Fuerza el armado/rellenado del cuadro con los grupos ya cerrados"
            style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            🔄 Armar bracket ahora
          </button>
        )}
        {esAdmin && faseActual === 'final' && todosJugadosFase && torneo?.estado !== 'finalizado' && (
          <button onClick={finalizarTorneo} style={{ background:'#16a34a', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🏆 Finalizar torneo</button>
        )}
      </div>

      {/* Switcher de torneos activos */}
      {torneosActivos.length > 1 && (
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:11, color: hint, marginRight:4 }}>Torneos activos:</span>
          {torneosActivos.map(ta => (
            <button key={ta.id} onClick={() => { if (ta.id !== torneoId) router.push(`/torneos/${ta.id}`) }}
              style={{ padding:'5px 12px', borderRadius:8, border: ta.id === torneoId ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: ta.id === torneoId ? '#ede9fe' : '#f8fafc', color: ta.id === torneoId ? '#4f46e5' : muted, fontSize:12, fontWeight: ta.id === torneoId ? 600 : 400, cursor: ta.id === torneoId ? 'default' : 'pointer' }}>
              {ta.nombre}
              <span style={{ marginLeft:6, fontSize:10, opacity:0.7 }}>{faseLabel[ta.fase] || ta.fase}</span>
            </button>
          ))}
        </div>
      )}

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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
            {[
              { label:'Inscritos', value:totalInscritos, color: text },
              { label:'Meta', value:fmt(proyectado), color: muted },
              { label:'Recaudado', value:fmt(recaudado), color:'#16a34a' },
              { label:'Efectivo', value:fmt(recaudadoEfectivo), color:'#15803d' },
              { label:'Transferencias', value:fmt(recaudadoTransferencia), color:'#4f46e5' },
              { label:'Pendiente', value:fmt(proyectado-recaudado), color: proyectado-recaudado>0?'#dc2626':'#16a34a' },
            ].map(s => (
              <div key={s.label} style={{ background:'#f4f7fa', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color: muted }}>{s.label}</div>
              </div>
            ))}
          </div>
          {!torneo?.contabilidad_enviada && recaudado > 0 && (
            <button
              disabled={enviandoRecaudacion}
              onClick={async () => {
                if (!confirm(`¿Registrar ${fmt(recaudado)} en Finanzas?\n\nEfectivo: ${fmt(recaudadoEfectivo)}\nTransferencia: ${fmt(recaudadoTransferencia)}`)) return
                setEnviandoRecaudacion(true)
                const res = await enviarRecaudacionAFinanzas({ torneoId, torneoNombre: torneo?.nombre || '', montoEfectivo: recaudadoEfectivo, montoTransferencia: recaudadoTransferencia })
                setEnviandoRecaudacion(false)
                if (res.error) { alert(res.error); return }
                setTorneo((t: any) => ({ ...t, contabilidad_enviada: true }))
              }}
              style={{ marginTop:10, width:'100%', padding:'10px', background:'#4f46e5', color:'white', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor: enviandoRecaudacion ? 'not-allowed' : 'pointer', opacity: enviandoRecaudacion ? 0.7 : 1 }}
            >
              {enviandoRecaudacion ? 'Registrando...' : `📤 Registrar ${fmt(recaudado)} en Finanzas`}
            </button>
          )}
        </div>
      )}

      {/* BOTÓN INSCRIPCIÓN TARDÍA */}
      {esAdmin && faseActual === 'grupos' && !hayBracket && (
        <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <button onClick={() => setMesaOpen(true)} style={{ background:'#ffffff', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, padding:'7px 14px', fontSize:12, cursor:'pointer' }}>
            + Inscribir jugador adicional
          </button>
          {faseActual === 'grupos' && !hayBracket && !gruposReales.some((g: any) => g.en_preparacion) && (
            <button disabled={creandoGrupoManual} onClick={async () => {
              if (creandoGrupoManual) return
              setCreandoGrupoManual(true)
              try {
                const res = await crearGrupoManual({ torneoId })
                if (res.error) { alert(res.error); return }
                alert(`Grupo ${res.nombre} creado en preparación. Agrega 3 o 4 jugadores; los partidos se crearán al finalizarlo.`)
                await cargarTorneo()
              } finally {
                setCreandoGrupoManual(false)
              }
            }} style={{ background:'#eef2ff', color:'#4338ca', border:'1px solid #c7d2fe', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:creandoGrupoManual?'not-allowed':'pointer', opacity:creandoGrupoManual?0.6:1 }}>
              {creandoGrupoManual ? 'Creando grupo…' : '+ Crear grupo vacío'}
            </button>
          )}
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
          <span style={{ fontSize:11, color: hint }}>Se acumulan en mesa — luego creas grupo(s) con ellos</span>
        </div>
      )}

      {/* Tabs */}
      {mostrarLlaves && (
        <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid #e2e8f0' }}>
          <button onClick={() => setTabActiva('grupos')} style={{ background:'transparent', border:'none', color: tabActiva==='grupos'?'#4f46e5': muted, borderBottom: tabActiva==='grupos'?'2px solid #4f46e5':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Fase de grupos</button>
          <button onClick={() => setTabActiva('bracket')} style={{ background:'transparent', border:'none', color: tabActiva==='bracket'?'#4f46e5': muted, borderBottom: tabActiva==='bracket'?'2px solid #4f46e5':'2px solid transparent', padding:'10px 14px', fontSize:13, fontWeight:600, cursor:'pointer' }}>Bracket</button>
        </div>
      )}

      {/* FASE GRUPOS */}
      {faseActual === 'grupos' && !hayBracket && esAdmin && (
        <div style={{ marginBottom:16 }}>
          <CabezasSerieEditor
            cabezas={cabezasNumeradas}
            candidatos={candidatosCabezas}
            onChange={setCabezasNumeradas}
            onGuardar={guardarCabezasNumeradas}
          />
          <div style={{ marginTop:6, fontSize:11, color:hint }}>
            #1 y #2 quedan lo más separados posible; las demás posiciones siguen el espejo del cuadro. Máximo recomendado: una cabeza por grupo.
          </div>
          {cabezasConCambios && (
            <div role="status" style={{ marginTop:6, color:'#92400e', fontSize:11 }}>
              Hay cambios sin guardar. El armado automático del bracket está pausado.
            </div>
          )}
        </div>
      )}

      {(faseActual === 'grupos' || esPlayoffs) && (!mostrarLlaves || tabActiva === 'grupos') && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
          {grupos.filter((g: any) => g.nombre !== 'MESA').map(grupo => {
            const { ordenados, hayTripleEmpate, empatados, primeroFijo } = calcularStats(grupo.id)
            const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)
            const grupoConResultados = partidosGrupo.some((p: any) => !!p.ganador)
            const desempateResuelto = !!grupo.desempate_primero_id && !!grupo.desempate_segundo_id && grupo.desempate_primero_id !== grupo.desempate_segundo_id
            const nombreDesempate = (id: string | null | undefined) => ordenados.find((j: any) => j.jugador?.id === id)?.jugador?.nombre || '—'
            const primeroSeleccionado = empateManual[grupo.id]?.primero ?? primeroFijo?.jugador ?? null
            const opcionesDesempate = primeroFijo ? [primeroFijo, ...empatados] : empatados
            const accionandoGrupo = accionGrupoManual?.grupoId === grupo.id

            return (
              <div key={grupo.id} style={{ ...card, overflow:'hidden' }}
                onDragOver={esAdmin && !hayBracket ? (e) => e.preventDefault() : undefined}
                onDrop={esAdmin && !hayBracket ? (e) => {
                  e.preventDefault()
                  if (dragJugadorGrupo) moverAGrupo(dragJugadorGrupo.jugadorId, dragJugadorGrupo.grupoId, grupo.id)
                  setDragJugadorGrupo(null)
                } : undefined}
              >
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, fontWeight:600, color: text }}>Grupo {grupo.nombre}</span>
                  {grupo.en_preparacion && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      <span style={{ background:'#fff7ed', color:'#c2410c', padding:'2px 7px', borderRadius:10, fontSize:10, fontWeight:700 }}>En preparación</span>
                      <button disabled={ordenados.length < 3 || ordenados.length > 4 || accionandoGrupo} onClick={async () => {
                        if (accionandoGrupo) return
                        setAccionGrupoManual({ grupoId: grupo.id, tipo: 'finalizar' })
                        try {
                          const res = await finalizarGrupoManual({ torneoId, grupoId: grupo.id })
                          if (res.error) { alert(res.error); return }
                          await cargarTorneo()
                        } finally {
                          setAccionGrupoManual(null)
                        }
                      }} style={{ border:'1px solid #86efac', background:'#f0fdf4', color:'#166534', borderRadius:6, padding:'4px 7px', fontSize:10, cursor:ordenados.length >= 3 && ordenados.length <= 4 && !accionandoGrupo?'pointer':'not-allowed', opacity:ordenados.length >= 3 && ordenados.length <= 4 && !accionandoGrupo?1:0.5 }}>
                        {accionGrupoManual?.grupoId === grupo.id && accionGrupoManual?.tipo === 'finalizar' ? 'Finalizando…' : `Finalizar (${ordenados.length} jugadores)`}
                      </button>
                      {ordenados.length === 0 && <button onClick={async () => {
                        if (accionandoGrupo) return
                        setAccionGrupoManual({ grupoId: grupo.id, tipo: 'cancelar' })
                        try {
                          const res = await eliminarGrupoManualVacio({ torneoId, grupoId: grupo.id })
                          if (res.error) { alert(res.error); return }
                          await cargarTorneo()
                        } finally {
                          setAccionGrupoManual(null)
                        }
                      }} disabled={accionandoGrupo} style={{ border:'1px solid #fecaca', background:'#fff', color:'#dc2626', borderRadius:6, padding:'4px 7px', fontSize:10, cursor:accionandoGrupo?'not-allowed':'pointer', opacity:accionandoGrupo?0.55:1 }}>
                        {accionGrupoManual?.grupoId === grupo.id && accionGrupoManual?.tipo === 'cancelar' ? 'Cancelando…' : 'Cancelar'}
                      </button>}
                    </div>
                  )}
                  {hayTripleEmpate && !desempateResuelto && partidosGrupo.some((p:any) => p.ganador) && <span style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontSize:10 }}>⚠️ Triple empate</span>}
                  {hayTripleEmpate && desempateResuelto && <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'2px 8px', borderRadius:10, fontSize:10 }}>✓ Resuelto y guardado</span>}
                </div>
                {grupo.en_preparacion && ordenados.length === 0 && (
                  <div style={{ padding:'24px 16px', textAlign:'center', color:'#7c3aed', background:'#faf5ff', fontSize:12, borderBottom:'1px dashed #c4b5fd' }}>
                    {isMobile ? 'Usa “Mover a este grupo” en los jugadores que quieras trasladar.' : 'Arrastra aquí los jugadores que formarán el nuevo grupo.'}
                  </div>
                )}
                {ordenados.map((j: any, i: number) => (
                  <div key={`${grupo.id}-${j.jugador?.id ?? i}`}
                    draggable={esAdmin && !hayBracket && !!j.jugador?.id}
                    onDragStart={esAdmin && !hayBracket && j.jugador?.id ? () => setDragJugadorGrupo({ jugadorId: j.jugador.id, grupoId: grupo.id }) : undefined}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #f1f5f9', borderLeft:`3px solid ${i===0?'#d97706':i===1?'#94a3b8':'transparent'}`, cursor: esAdmin && !hayBracket ? 'grab' : 'default', opacity: dragJugadorGrupo?.jugadorId === j.jugador?.id ? 0.4 : 1 }}>
                    <span style={{ fontSize:14 }}>{i===0?'🥇':i===1?'🥈':'—'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: text }}>{j.jugador?.nombre||'—'}</div>
                      <div style={{ fontSize:10, color: muted }}>{j.pg}G {j.pp}P · {j.pts}pts</div>
                    </div>
                    {esAdmin && cuota > 0 && (() => {
                      const pago = pagos.find(p => p.jugador_id === j.jugador?.id)
                      return pago?.estado === 'pagado'
                        ? <span style={{ background:'#f0fdf4', color:'#16a34a', padding:'2px 6px', borderRadius:10, fontSize:10 }}>
                            ✓ {pago.metodo_pago === 'transferencia' ? 'Transf.' : 'Efectivo'}
                          </span>
                        : <span style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 6px', borderRadius:10, fontSize:10 }}>Pend.</span>
                    })()}
                    {esAdmin && !hayBracket && !grupoConResultados && (
                      <div style={{ display:'flex', gap:4 }}>
                        {isMobile && grupoEnPreparacion && grupo.id !== grupoEnPreparacion.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              j.jugador?.id && moverAGrupo(j.jugador.id, grupo.id, grupoEnPreparacion.id)
                            }}
                            disabled={!j.jugador?.id || !!moviendoJugadorId}
                            title={`Mover al Grupo ${grupoEnPreparacion.nombre}`}
                            style={{ minHeight:24, border:'1px solid #c4b5fd', borderRadius:6, background:'#ede9fe', color:'#4338ca', padding:'3px 6px', cursor:moviendoJugadorId?'not-allowed':'pointer', opacity:moviendoJugadorId?0.55:1, fontSize:9, fontWeight:700, whiteSpace:'nowrap' }}
                          >
                            {moviendoJugadorId === j.jugador?.id ? 'Moviendo…' : `Mover → ${grupoEnPreparacion.nombre}`}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            j.jugador?.id && reordenarEnGrupo(j.jugador.id, grupo.id, 'arriba')
                          }}
                          disabled={i === 0}
                          title="Subir en el grupo"
                          style={{ width:24, height:24, border:'1px solid #e2e8f0', borderRadius:6, background:i === 0 ? '#f8fafc' : '#ffffff', color:i === 0 ? hint : text, cursor:i === 0 ? 'not-allowed' : 'pointer', fontSize:12 }}
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            j.jugador?.id && reordenarEnGrupo(j.jugador.id, grupo.id, 'abajo')
                          }}
                          disabled={i === ordenados.length - 1}
                          title="Bajar en el grupo"
                          style={{ width:24, height:24, border:'1px solid #e2e8f0', borderRadius:6, background:i === ordenados.length - 1 ? '#f8fafc' : '#ffffff', color:i === ordenados.length - 1 ? hint : text, cursor:i === ordenados.length - 1 ? 'not-allowed' : 'pointer', fontSize:12 }}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {/* PANEL TRIPLE EMPATE */}
                {hayTripleEmpate && partidosGrupo.every((p:any) => !!p.ganador) && !desempateResuelto && esAdmin && (
                  <div style={{ background:'#fff7ed', borderTop:'1px solid #fed7aa', padding:'12px 16px' }}>
                    <div style={{ fontSize:12, color:'#f43f5e', fontWeight:600, marginBottom:8 }}>⚠️ Triple empate — elige el orden manualmente</div>
                    <div style={{ fontSize:11, color: muted, marginBottom:10 }}>Revisa las papeletas y marca quién queda 1° y quién queda 2°</div>
                    {opcionesDesempate.map((j: any, idx: number) => (
                      <div key={`${grupo.id}-empate-${j.jugador?.id ?? idx}`} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:12, color: text, flex:1 }}>{j.jugador?.nombre}</span>
                        <button
                          disabled={!!primeroFijo && primeroFijo.jugador?.id !== j.jugador?.id}
                          onClick={() => setEmpateManual((prev: any) => {
                            const actual = prev[grupo.id] || {}
                            return { ...prev, [grupo.id]: { ...actual, primero: j.jugador } }
                          })}
                          style={{ background: primeroSeleccionado?.id === j.jugador?.id ? '#fbbf24' : '#f4f7fa', color: primeroSeleccionado?.id === j.jugador?.id ? '#0f172a' : muted, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:primeroFijo && primeroFijo.jugador?.id !== j.jugador?.id?'not-allowed':'pointer', fontWeight:600 }}>
                          🥇 1°
                        </button>
                        <button
                          disabled={primeroSeleccionado?.id === j.jugador?.id}
                          onClick={async () => {
                            const primero = primeroSeleccionado
                            if (!primero?.id || primero.id === j.jugador?.id) return
                            const res = await guardarDesempateGrupo({
                              torneoId,
                              grupoId: grupo.id,
                              primeroId: primero.id,
                              segundoId: j.jugador.id,
                            })
                            if (res.error) { alert(res.error); return }
                            setEmpateManual((prev: any) => ({ ...prev, [grupo.id]: undefined }))
                            ultimaSyncRef.current = ''
                            await cargarTorneo()
                          }}
                          style={{ background: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#94a3b8' : '#f4f7fa', color: empateManual[grupo.id]?.segundo?.id === j.jugador?.id ? '#0f172a' : primeroSeleccionado?.id === j.jugador?.id ? '#cbd5e1' : muted, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, cursor: primeroSeleccionado?.id === j.jugador?.id ? 'not-allowed' : 'pointer', fontWeight:600 }}>
                          🥈 2°
                        </button>
                      </div>
                    ))}
                    {primeroSeleccionado && !empateManual[grupo.id]?.segundo && (
                      <div style={{ marginTop:8, padding:'8px', background:'#ede9fe', borderRadius:8, fontSize:11, color:'#3730a3', textAlign:'center' }}>
                        ✓ 1°: {primeroSeleccionado.nombre} — Ahora elige quién queda 2°
                      </div>
                    )}
                  </div>
                )}
                {hayTripleEmpate && desempateResuelto && esAdmin && (
                  <div style={{ background:'#f0fdf4', borderTop:'1px solid #bbf7d0', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ flex:1, fontSize:11, color:'#166534' }}>1° {nombreDesempate(grupo.desempate_primero_id)} · 2° {nombreDesempate(grupo.desempate_segundo_id)}</span>
                    {!hayBracket && <button onClick={async () => {
                      const res = await guardarDesempateGrupo({ torneoId, grupoId: grupo.id, primeroId: null, segundoId: null })
                      if (res.error) { alert(res.error); return }
                      ultimaSyncRef.current = ''
                      await cargarTorneo()
                    }} style={{ border:'1px solid #86efac', background:'#fff', color:'#166534', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer' }}>Cambiar</button>}
                  </div>
                )}
                <div style={{ padding:'8px 16px' }}>
                  {grupo.en_preparacion ? (
                    <div style={{ padding:'8px 0', color:'#7c3aed', fontSize:11, textAlign:'center' }}>
                      Los partidos se habilitarán cuando finalices la preparación del grupo.
                    </div>
                  ) : partidosGrupo.map(p => {
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
                              if ('error' in res && res.error) { alert(res.error); return }
                              setPartidoEditando(null)
                              await cargarTorneo()
                            }} style={{ background:'#ede9fe', color:'#3730a3', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>
                              {jugA?.jugador?.nombre?.split(' ')[0] || 'A'}
                            </button>
                            <button onClick={async () => {
                              const res = await corregirResultadoGrupos({ partidoId: p.id, nuevoGanadorId: p.jugador_b })
                              if ('error' in res && res.error) { alert(res.error); return }
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
      {mostrarLlaves && tabActiva === 'bracket' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#3730a3' }}>
              {faseActual === 'grupos'
                ? '💡 Bracket en paralelo: los grupos cerrados llenan sus cupos. Puedes jugar ramas listas y arrastrar cupos equivalentes aún no jugados.'
                : '💡 Haz clic para marcar ganador. En la ronda inicial puedes arrastrar cupos equivalentes mientras su rama no esté jugada.'}
            </div>
            {esAdmin && faseActual === 'grupos' && (
              <button onClick={armarBracketAhora} title="Fuerza el armado/rellenado con los grupos ya cerrados" style={{ background:'#ede9fe', color:'#3730a3', border:'1px solid #c4b5fd', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                🔄 Armar bracket ahora
              </button>
            )}
            {esAdmin && hayBracket && faseActual !== 'finalizado' && (
              <button onClick={volverAGrupos} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                ⚠️ Reiniciar bracket
              </button>
            )}
          </div>
          {/* SVG Bracket — solo desktop; en el celu ni se monta (isMobile) porque
              el árbol absoluto + SVG revienta la pestaña por memoria (lista abajo) */}
          {!isMobile && (() => {
            const CARD_H = 80
            const SLOT_H = 96
            const COL_W = 190
            const CONN_W = 22

            // Fase tope a mostrar: durante el armado la fase del torneo aún es
            // "grupos" (no está en fasesOrden), así que caemos a la fase inicial
            // del cuadro para poder dibujar la primera ronda que se va llenando.
            const ultimaFaseConPartidos = [...fasesOrden].reverse().find(f => partidos.some(p => p.fase === f))
            const faseTope = faseActual === 'finalizado'
              ? fasesOrden[fasesOrden.length - 1]
              : faseActual === 'grupos' && ultimaFaseConPartidos
                ? ultimaFaseConPartidos
              : (fasesOrden as readonly string[]).includes(faseActual)
                ? faseActual
                : (llavesLayout?.faseInicial ?? faseActual)
            const fasesVis = fasesOrden
              .slice(0, fasesOrden.indexOf(faseTope as FaseOrden) + 1)
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
                          const isBye = esByeMatch(p)
                          const editandoEste = partidoPlayoffEditando === p.id
                          const showEdit = !!p.ganador && esAdmin && !isBye && faseActual !== 'finalizado'
                          const rowH = showEdit ? `${Math.floor((CARD_H - 20) / 2)}px` : '50%'
                          const puedeMover = esAdmin && p.fase === llavesLayout?.faseInicial && !(p.ganador && p.jugador_b)

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
                                    onClick={() => esAdmin && !p.ganador && !isBye && p.jugador_a && marcarGanador(p.id, p.jugador_a)}
                                    draggable={puedeMover && !!p.jugador_a}
                                    onDragStart={puedeMover && p.jugador_a ? () => setDragSlot({ partidoId: p.id, posicion: 'jugador_a' }) : undefined}
                                    onDragOver={puedeMover && p.jugador_a ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'jugador_a' }) } : undefined}
                                    onDrop={puedeMover && p.jugador_a ? (e) => { e.preventDefault(); intercambiarCupos(p.id, 'jugador_a') } : undefined}
                                    onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                                    style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '1px solid #f1f5f9', cursor: puedeMover && p.jugador_a ? 'grab' : esAdmin && !p.ganador && !isBye && p.jugador_a ? 'pointer' : 'default', background: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_a' ? '#dbeafe' : p.ganador && p.ganador === p.jugador_a ? '#f0fdf4' : 'transparent', opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === 'jugador_a' ? 0.45 : 1 }}>
                                    <span style={{ fontSize: 12, color: p.ganador && p.ganador === p.jugador_a ? '#16a34a' : (p as any).ja?.nombre ? text : hint, fontStyle: (p as any).ja?.nombre ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                      <span style={{ fontSize: 9, background: '#ede9fe', color: '#3730a3', padding: '1px 3px', borderRadius: 3, marginRight: 4 }}>{i * 2 + 1}</span>
                                      {(p as any).ja?.nombre || etiquetaCupo(p, 'a')}
                                    </span>
                                    {!!p.ganador && p.ganador === p.jugador_a && <span style={{ color: '#16a34a', fontSize: 11, marginLeft: 4 }}>✓</span>}
                                  </div>
                                  {isBye ? (
                                    <div style={{ height: rowH, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, color: hint, fontStyle: 'italic' }}>BYE</div>
                                  ) : (
                                    <div
                                      onClick={() => esAdmin && !p.ganador && p.jugador_b && marcarGanador(p.id, p.jugador_b)}
                                      draggable={puedeMover && !!p.jugador_b}
                                      onDragStart={puedeMover && p.jugador_b ? () => setDragSlot({ partidoId: p.id, posicion: 'jugador_b' }) : undefined}
                                      onDragOver={puedeMover && p.jugador_b ? (e) => { e.preventDefault(); setDragOver({ partidoId: p.id, posicion: 'jugador_b' }) } : undefined}
                                      onDrop={puedeMover && p.jugador_b ? (e) => { e.preventDefault(); intercambiarCupos(p.id, 'jugador_b') } : undefined}
                                      onDragEnd={() => { setDragSlot(null); setDragOver(null) }}
                                      style={{ height: rowH, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 10px', cursor: puedeMover && p.jugador_b ? 'grab' : esAdmin && !p.ganador && p.jugador_b ? 'pointer' : 'default', background: dragOver?.partidoId === p.id && dragOver?.posicion === 'jugador_b' ? '#dbeafe' : p.ganador && p.ganador === p.jugador_b ? '#f0fdf4' : 'transparent', opacity: dragSlot?.partidoId === p.id && dragSlot?.posicion === 'jugador_b' ? 0.45 : 1 }}>
                                      <span style={{ fontSize: 12, color: p.ganador && p.ganador === p.jugador_b ? '#16a34a' : (p as any).jb?.nombre ? text : hint, fontStyle: (p as any).jb?.nombre ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                        <span style={{ fontSize: 9, background: '#ede9fe', color: '#3730a3', padding: '1px 3px', borderRadius: 3, marginRight: 4 }}>{i * 2 + 2}</span>
                                        {(p as any).jb?.nombre || etiquetaCupo(p, 'b')}
                                      </span>
                                      {!!p.ganador && p.ganador === p.jugador_b && <span style={{ color: '#16a34a', fontSize: 11, marginLeft: 4 }}>✓</span>}
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

          {/* Bracket móvil: lista por fase (liviana). Mismo dato que el SVG, sin
              divs absolutos ni SVG → no hay OOM. Tocas el nombre para marcar. */}
          {isMobile && (() => {
            const ultimaFaseConPartidos = [...fasesOrden].reverse().find(f => partidos.some(p => p.fase === f))
            const faseTope = faseActual === 'finalizado'
              ? fasesOrden[fasesOrden.length - 1]
              : faseActual === 'grupos' && ultimaFaseConPartidos
                ? ultimaFaseConPartidos
              : (fasesOrden as readonly string[]).includes(faseActual)
                ? faseActual
                : (llavesLayout?.faseInicial ?? faseActual)
            const fasesVis = fasesOrden
              .slice(0, fasesOrden.indexOf(faseTope as FaseOrden) + 1)
              .filter(f => partidos.some(p => p.fase === f))
            if (!fasesVis.length) return null

            const nombre = (p: any, pos: 'a' | 'b') =>
              (pos === 'a' ? p.ja?.nombre : p.jb?.nombre) || etiquetaCupo(p, pos)

            return fasesVis.map(fase => {
              const ps = partidos.filter(p => p.fase === fase).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
              return (
                <div key={fase} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700, marginBottom: 8 }}>{faseLabel[fase]}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ps.map((p, i) => {
                      const isBye = esByeMatch(p)
                      const editando = partidoPlayoffEditando === p.id
                      const definidoA = !!(p as any).ja?.nombre
                      const definidoB = !!(p as any).jb?.nombre
                      const ganoA = !!p.ganador && p.ganador === p.jugador_a
                      const ganoB = !!p.ganador && p.ganador === p.jugador_b
                      const puedeMarcar = esAdmin && !p.ganador && !isBye

                      const Lado = (pos: 'a' | 'b') => {
                        const gano = pos === 'a' ? ganoA : ganoB
                        const jid = pos === 'a' ? p.jugador_a : p.jugador_b
                        const definido = pos === 'a' ? definidoA : definidoB
                        const clickable = puedeMarcar && !!jid && definido
                        return (
                          <button
                            onClick={clickable ? () => marcarGanador(p.id, jid!) : undefined}
                            disabled={!clickable}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              gap: 8, padding: '13px 14px', border: 'none', textAlign: 'left',
                              background: gano ? '#f0fdf4' : 'transparent',
                              color: gano ? '#16a34a' : definido ? text : hint,
                              fontStyle: definido ? 'normal' : 'italic',
                              fontWeight: gano ? 700 : 500, fontSize: 15,
                              cursor: clickable ? 'pointer' : 'default',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre(p, pos)}</span>
                            {gano && <span style={{ color: '#16a34a', fontSize: 15, flexShrink: 0 }}>✓</span>}
                          </button>
                        )
                      }

                      return (
                        <div key={p.id} style={{ ...card, borderRadius: 12, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#3730a3' }}>Llave {i + 1}</span>
                            {!!p.ganador && esAdmin && !isBye && faseActual !== 'finalizado' && !editando && (
                              <button onClick={() => setPartidoPlayoffEditando(p.id)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', padding: '0 2px' }} title="Corregir resultado">✏️</button>
                            )}
                          </div>
                          {editando ? (
                            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>¿Quién ganó?</span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => corregirPlayoff(p.id, p.jugador_a)} style={{ flex: 1, background: '#ede9fe', color: '#3730a3', border: 'none', borderRadius: 8, padding: '11px 6px', fontSize: 14, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(p as any).ja?.nombre?.split(' ')[0] || 'A'}</button>
                                <button onClick={() => corregirPlayoff(p.id, p.jugador_b)} style={{ flex: 1, background: '#ede9fe', color: '#3730a3', border: 'none', borderRadius: 8, padding: '11px 6px', fontSize: 14, fontWeight: 600, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(p as any).jb?.nombre?.split(' ')[0] || 'B'}</button>
                                <button onClick={() => setPartidoPlayoffEditando(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: '0 8px' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {Lado('a')}
                              {isBye ? (
                                <div style={{ padding: '13px 14px', borderTop: '1px solid #f1f5f9', fontSize: 14, color: hint, fontStyle: 'italic' }}>BYE (pasa directo)</div>
                              ) : (
                                <div style={{ borderTop: '1px solid #f1f5f9' }}>{Lado('b')}</div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 5 }}>💵 ¿Cómo se pagó el premio?</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                {([['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setPremioMetodo(v)}
                    style={{ flex: 1, padding: '9px 0', background: premioMetodo === v ? '#4f46e5' : '#f4f7fa', color: premioMetodo === v ? '#fff' : muted, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

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
                          const res = await guardarPremios({ torneoId, torneoNombre: torneo?.nombre || '', primero: p1, segundo: p2, tercero: p3, montoRecaudado: recaudado, montoEfectivo: recaudadoEfectivo, montoTransferencia: recaudadoTransferencia, enviarRecaudacion: enviarRec, metodo: premioMetodo, gastosGestion: gastosGestion.filter(g => g.tipo.trim() && g.monto).map(g => ({ tipo: g.tipo.trim(), monto: parseInt(g.monto) || 0 })) })
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
          {faseActual === 'finalizado' && jugadoresUnicos.some((j: any) => !pagos.some(p => p.jugador_id === j.jugador_id && p.estado === 'pagado')) && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:12, marginBottom:10 }}>
              <div style={{ fontSize:12, color:muted, marginBottom:10 }}>Selecciona quienes pagaron después del cierre y súbelos inmediatamente a Finanzas.</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                {(['efectivo','transferencia'] as const).map(metodo => (
                  <button key={metodo} onClick={() => setMetodoPagosFinales(metodo)} style={{ background:metodoPagosFinales === metodo ? '#4f46e5' : '#fff', color:metodoPagosFinales === metodo ? '#fff' : muted, border:'1px solid #cbd5e1', borderRadius:7, padding:'7px 10px', fontSize:11, cursor:'pointer' }}>
                    {metodo === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
                  </button>
                ))}
                <button disabled={!pagosSeleccionados.size || subiendoPagos} onClick={async () => {
                  setSubiendoPagos(true)
                  try {
                    const res = await subirPagosPendientesAFinanzas({ torneoId, jugadorIds:Array.from(pagosSeleccionados), metodoPago:metodoPagosFinales })
                    if (res.error) { alert(res.error); return }
                    setPagosSeleccionados(new Set())
                    await cargarTorneo()
                    alert(`✓ ${res.cantidad} pago(s) subido(s) a Finanzas`)
                  } finally { setSubiendoPagos(false) }
                }} style={{ marginLeft:'auto', background:!pagosSeleccionados.size || subiendoPagos ? '#94a3b8' : '#16a34a', color:'#fff', border:'none', borderRadius:7, padding:'8px 12px', fontSize:11, fontWeight:700, cursor:!pagosSeleccionados.size || subiendoPagos ? 'not-allowed' : 'pointer' }}>
                  {subiendoPagos ? 'Subiendo...' : `Subir a Finanzas (${pagosSeleccionados.size})`}
                </button>
              </div>
            </div>
          )}
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
                {faseActual === 'finalizado' && <input type="checkbox" checked={pagosSeleccionados.has(j.jugador_id)} onChange={e => setPagosSeleccionados(prev => { const next = new Set(prev); if (e.target.checked) next.add(j.jugador_id); else next.delete(j.jugador_id); return next })} />}
                <div style={{ flex:1, fontSize:13, color: text }}>{j.jugadores?.nombre||'—'}</div>
                <span style={{ background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontSize:11 }}>Pendiente</span>
                {faseActual !== 'finalizado' && (['efectivo', 'transferencia'] as const).map(metodo => (
                  <button key={metodo} disabled={pagoLoading === j.jugador_id} onClick={async () => {
                    if (pagoLoading) return
                    setPagoLoading(j.jugador_id)
                    try {
                      const res = await actualizarEstadoPago({ torneoId, jugadorId: j.jugador_id, estado: 'pagado', metodoPago: metodo })
                      if (res.error) { alert(res.error); return }
                      await cargarTorneo()
                    } finally { setPagoLoading(null) }
                  }} style={{ background: metodo === 'efectivo' ? '#f0fdf4' : '#ede9fe', color: metodo === 'efectivo' ? '#16a34a' : '#4f46e5', border:`1px solid ${metodo === 'efectivo' ? '#bbf7d0' : '#c4b5fd'}`, borderRadius:6, padding:'5px 10px', fontSize:11, cursor: pagoLoading === j.jugador_id ? 'not-allowed' : 'pointer', opacity: pagoLoading === j.jugador_id ? 0.5 : 1 }}>
                    {pagoLoading === j.jugador_id ? '...' : metodo === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
                  </button>
                ))}
              </div>
            ))
          }
        </div>
      )}

      {/* MODAL INFORME FINANCIERO — gastos de gestión antes de descargar */}
      {informeOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 32px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:16, fontWeight:700, color: text, marginBottom:4 }}>📄 Informe financiero</div>
            <div style={{ fontSize:12, color: muted, marginBottom:20 }}>Agrega gastos de gestión o gastos extra (opcional). Se incluirán en el PDF.</div>

            <div style={{ fontSize:12, fontWeight:600, color: text, marginBottom:8 }}>Gastos de gestión</div>
            {gastosGestion.map((g, i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                <input
                  placeholder="Tipo de gasto (ej: arbitraje)"
                  value={g.tipo}
                  onChange={e => setGastosGestion(prev => prev.map((x, idx) => idx === i ? { ...x, tipo: e.target.value } : x))}
                  style={{ flex:2, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'9px 12px', color: text, fontSize:13, outline:'none' }}
                />
                <input
                  type="number"
                  placeholder="$ monto"
                  value={g.monto}
                  onChange={e => setGastosGestion(prev => prev.map((x, idx) => idx === i ? { ...x, monto: e.target.value } : x))}
                  style={{ flex:1, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'9px 12px', color: text, fontSize:13, outline:'none', fontVariantNumeric:'tabular-nums' }}
                />
                <button
                  onClick={() => setGastosGestion(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ tipo:'', monto:'' }])}
                  title="Quitar"
                  style={{ background:'transparent', border:'none', color: hint, cursor:'pointer', fontSize:16, padding:'0 4px' }}>✕</button>
              </div>
            ))}
            <button
              onClick={() => setGastosGestion(prev => [...prev, { tipo:'', monto:'' }])}
              style={{ background:'transparent', border:'1px dashed #c4b5fd', borderRadius:8, padding:'8px 14px', color:'#3730a3', fontSize:12, cursor:'pointer', width:'100%', marginBottom:20 }}>
              + Agregar gasto
            </button>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setInformeOpen(false)} style={{ flex:1, padding:11, background:'transparent', border:'1px solid #e2e8f0', borderRadius:8, color: muted, fontSize:13, cursor:'pointer' }}>Cancelar</button>
              <button
                onClick={async () => {
                  const pFinal = partidos.find(p => p.fase === 'final' && p.ganador)
                  const campeon1 = pFinal ? (pFinal as any).jg : null
                  const subcampeon = pFinal ? (pFinal.ganador === pFinal.jugador_a ? (pFinal as any).jb : (pFinal as any).ja) : null
                  const listaJug = jugadoresUnicos.map((j: any) => ({
                    nombre: j.jugadores?.nombre || '—',
                    pagado: pagos.some(p => p.jugador_id === j.jugador_id && p.estado === 'pagado'),
                    metodoPago: pagos.find(p => p.jugador_id === j.jugador_id && p.estado === 'pagado')?.metodo_pago || null,
                  }))
                  const premios = [
                    { lugar: '1° lugar', nombre: campeon1?.nombre, monto: torneo?.premio_primero },
                    { lugar: '2° lugar', nombre: subcampeon?.nombre, monto: torneo?.premio_segundo },
                    { lugar: '3° lugar', nombre: null, monto: torneo?.premio_tercero },
                  ]
                  const gastos = gastosGestion
                    .filter(g => g.tipo.trim() && g.monto)
                    .map(g => ({ tipo: g.tipo.trim(), monto: parseInt(g.monto) || 0 }))
                  const { descargarInformeFinancieroPdf } = await import('@/lib/torneo-informe-pdf')
                  descargarInformeFinancieroPdf({
                    torneoNombre: torneo?.nombre || 'Torneo',
                    cuota, totalInscritos, pagados, recaudado, proyectado,
                    recaudadoEfectivo, recaudadoTransferencia,
                    jugadores: listaJug, premios, gastos, metodoPremio: premioMetodo,
                  })
                  setInformeOpen(false)
                }}
                style={{ flex:1, padding:11, background:'#4f46e5', border:'none', borderRadius:8, color:'white', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MESA DE INSCRIPCIÓN */}
      {mesaOpen && !hayBracket && (
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
                    const { data } = await supabase.from('jugadores').select('id,nombre,rut,categoria').eq('club_id', perfil.club_id).neq('es_externo', true).ilike('nombre', `%${e.target.value}%`).limit(5)
                    setJugSuggestions(data || [])
                  } else {
                    setJugSuggestions([])
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleInscribirEnMesa()}
              />
              {busquedaMesa.length > 1 && jugSuggestions.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:8, zIndex:10, marginTop:4, overflow:'hidden', boxShadow:'0 4px 12px rgba(15,23,42,0.1)' }}>
                  {jugSuggestions.map((j: any) => (
                    <div key={j.id} onClick={() => {
                      setBusquedaMesa(j.nombre)
                      setRutMesa(j.rut || '')
                      setJugSuggestions([])
                    }} style={{ padding:'10px 12px', borderBottom:'1px solid #f1f5f9', cursor:'pointer', fontSize:13 }}>
                      <span style={{ color: text }}>{j.nombre}</span>
                      <span style={{ color: muted, fontSize:11, marginLeft:8 }}>{j.categoria}</span>
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
                value={metodoPago} onChange={e => setMetodoPago(e.target.value as 'efectivo' | 'transferencia' | 'pendiente')}>
                <option value="pendiente">⏳ Pago pendiente</option>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia</option>
              </select>
              <button onClick={handleInscribirEnMesa} disabled={inscribiendo} style={{ flex:1, background: inscribiendo ? '#94a3b8' : '#f43f5e', color:'white', border:'none', borderRadius:8, padding:'10px', fontSize:13, fontWeight:600, cursor: inscribiendo ? 'not-allowed' : 'pointer' }}>
                {inscribiendo ? 'Inscribiendo...' : '+ Inscribir'}
              </button>
            </div>

            {/* Lista inscritos en tiempo real */}
            {jugadoresInscritos.length > 0 && (
              <div style={{ background:'#f4f7fa', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
                <div style={{ padding:'8px 14px', fontSize:11, color: muted, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'1px solid #e2e8f0' }}>
                  Jugadores inscritos
                </div>
                {[...jugadoresInscritos].sort((a: any, b: any) => (a.jugadores?.nombre || '').localeCompare(b.jugadores?.nombre || '', 'es')).map((j: any, i: number) => (
                  <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid #e2e8f0', background:'#ffffff' }}>
                    <span style={{ fontSize:12, color: muted, width:20 }}>{i+1}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, color: text, fontWeight:500 }}>{j.jugadores?.nombre||'—'}</div>
                      <div style={{ fontSize:11, color: muted }}>{j.jugadores?.categoria || ''}</div>
                    </div>
                    {/* Estado pago */}
                    {(torneo?.cuota_inscripcion > 0) && (() => {
                      const pagoActual = pagos.find(p => p.jugador_id === j.jugador_id)
                      const esPagado = pagoActual?.estado === 'pagado'
                      return (
                        <button disabled={pagoLoading === j.jugador_id} onClick={async () => {
                          if (pagoLoading) return
                          if (!esPagado && metodoPago === 'pendiente') {
                            alert('Selecciona Efectivo o Transferencia para registrar el pago')
                            return
                          }
                          setPagoLoading(j.jugador_id)
                          try {
                            const res = await actualizarEstadoPago({
                              torneoId,
                              jugadorId: j.jugador_id,
                              estado: esPagado ? 'pendiente' : 'pagado',
                              metodoPago: metodoPago === 'pendiente' ? undefined : metodoPago,
                            })
                            if (res.error) { alert(res.error); return }
                            await cargarTorneo()
                          } finally { setPagoLoading(null) }
                        }}
                          style={{ background: esPagado ? '#f0fdf4' : '#fef2f2', color: esPagado ? '#16a34a' : '#dc2626', border:`1px solid ${esPagado ? '#bbf7d0' : '#fecaca'}`, borderRadius:6, padding:'4px 8px', fontSize:10, cursor: pagoLoading === j.jugador_id ? 'not-allowed' : 'pointer', whiteSpace:'nowrap', opacity: pagoLoading === j.jugador_id ? 0.5 : 1 }}>
                          {esPagado
                            ? `✓ ${pagoActual?.metodo_pago === 'transferencia' ? 'Transferencia' : 'Efectivo'}`
                            : 'Pendiente'}
                        </button>
                      )
                    })()}
                    {/* Quitar */}
                    <button onClick={async () => {
                      if (cabezasNumeradas.some(c => c.id === j.jugador_id)) {
                        const nuevas = cabezasNumeradas.filter(c => c.id !== j.jugador_id)
                        const guardado = await configurarCabezasSerie({ torneoId, jugadorIds: nuevas.map(c => c.id) })
                         if (guardado.error) { alert(guardado.error); return }
                         setCabezasNumeradas(nuevas)
                         setCabezasPersistidas(nuevas)
                       }
                      const res = await quitarJugadorDeMesa({ torneoId, jugadorId: j.jugador_id })
                      if (res.error) { alert(res.error); return }
                      setJugadoresInscritos(prev => prev.filter((x:any) => x.jugador_id !== j.jugador_id))
                    }} style={{ background:'transparent', border:'none', color:'#dc2626', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {!hayBracket && candidatosCabezas.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <CabezasSerieEditor
                  cabezas={cabezasNumeradas}
                  candidatos={candidatosCabezas}
                  onChange={setCabezasNumeradas}
                  onGuardar={guardarCabezasNumeradas}
                />
                {cabezasConCambios && faseActual === 'inscripcion' && (
                  <div role="status" style={{ marginTop:6, color:'#92400e', fontSize:11 }}>
                    Los cambios pendientes se guardarán automáticamente al cerrar la inscripción.
                  </div>
                )}
              </div>
            )}

            {faseActual === 'inscripcion' ? (
              <button onClick={cerrarInscripcion} disabled={jugadoresInscritos.length < 4 || cerrandoInscripcion}
                style={{ width:'100%', padding:12, background: jugadoresInscritos.length >= 4 && !cerrandoInscripcion?'#f0fdf4':'#f4f7fa', color: jugadoresInscritos.length >= 4 && !cerrandoInscripcion?'#16a34a': hint, border:`1px solid ${jugadoresInscritos.length >= 4 && !cerrandoInscripcion?'#bbf7d0':'#e2e8f0'}`, borderRadius:8, fontSize:13, fontWeight:600, cursor: jugadoresInscritos.length >= 4 && !cerrandoInscripcion?'pointer':'not-allowed' }}>
                {cerrandoInscripcion
                  ? 'Guardando y generando grupos…'
                  : jugadoresInscritos.length < 4
                    ? `Mínimo 4 jugadores (faltan ${4-jugadoresInscritos.length})`
                    : `✓ ${cabezasConCambios ? 'Guardar cabezas y cerrar' : 'Cerrar inscripción'} · generar ${numGruposEstimados} grupos`}
              </button>
            ) : jugadoresInscritos.length > 0 ? (
              <button disabled={generandoTardios} onClick={async () => {
                if (generandoTardios) return
                const cantidad = jugadoresInscritos.length
                const msg = cantidad === 1
                  ? grupoEnPreparacion
                    ? `¿Agregar este jugador al Grupo ${grupoEnPreparacion.nombre} en preparación? Si es compatible con las cabezas de serie, quedará listo para finalizar.`
                    : '¿Agregar este jugador al grupo disponible con menos jugadores?'
                  : cantidad === 2
                    ? '¿Crear un grupo con estos 2 jugadores? Quedará en preparación, sin partidos, hasta agregar al menos un tercero y finalizarlo.'
                    : `¿Crear grupo(s) con ${cantidad} jugador(es) tardíos? Si alguno queda con menos de 3, permanecerá en preparación y sin partidos.`
                if (!confirm(msg)) return
                setGenerandoTardios(true)
                try {
                  const res = await generarGruposTardios({ torneoId })
                  if (res.error) { alert(res.error); return }
                  const quedoEnPreparacion = cantidad === 2 || String(res.nombres || '').includes('(en preparación)')
                  alert(quedoEnPreparacion
                    ? `Jugador(es) asignados a: ${res.nombres}. El grupo quedó en preparación: agrega al menos un tercero y luego presiona Finalizar.`
                    : `Jugador(es) asignados a: ${res.nombres}`)
                  setMesaOpen(false)
                  await cargarTorneo()
                } finally {
                  setGenerandoTardios(false)
                }
              }}
                style={{ width:'100%', padding:12, background:'#f0fdf4', color:'#16a34a', border:'1px solid #bbf7d0', borderRadius:8, fontSize:13, fontWeight:600, cursor:generandoTardios?'not-allowed':'pointer', opacity:generandoTardios?0.6:1 }}>
                {generandoTardios
                  ? 'Procesando jugadores…'
                  : jugadoresInscritos.length === 1
                    ? grupoEnPreparacion
                      ? `✓ Completar Grupo ${grupoEnPreparacion.nombre} en preparación`
                      : '✓ Agregar al grupo disponible con menos jugadores'
                    : jugadoresInscritos.length === 2
                      ? '✓ Crear grupo con 2 · quedará en preparación'
                      : `✓ Crear grupo(s) con ${jugadoresInscritos.length} jugadores`}
              </button>
            ) : (
              <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#3730a3', textAlign:'center' }}>
                💡 Agrega jugadores tardíos y luego crea grupo(s) con ellos.
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal QR — para proyectar/imprimir y que la gente entre altiro */}
      {qrOpen && torneo?.codigo && (() => {
        const vivoUrl = typeof window !== 'undefined' ? `${window.location.origin}/vivo/${torneo.codigo}` : ''
        return (
          <div onClick={() => setQrOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
            <div onClick={e => e.stopPropagation()} style={{ ...card, padding:28, width:'100%', maxWidth:360, textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <span style={{ fontSize:15, fontWeight:700, color:text }}>Ver torneo en vivo</span>
                <button onClick={() => setQrOpen(false)} style={{ background:'transparent', border:'none', color:muted, cursor:'pointer', fontSize:20 }}>✕</button>
              </div>
              <p style={{ fontSize:12.5, color:muted, marginTop:0, marginBottom:16 }}>Escanea el QR con la cámara del celular y entras al toque, sin cuenta.</p>
              <div style={{ display:'inline-block', background:'#fff', padding:12, borderRadius:12, border:'1px solid #e2e8f0' }}>
                <QRCodeSVG value={vivoUrl} size={200} />
              </div>
              <div style={{ marginTop:16, fontSize:12, color:hint }}>Código</div>
              <div style={{ fontSize:22, fontWeight:800, color:text, fontFamily:'monospace', letterSpacing:2 }}>{torneo.codigo}</div>
              <div style={{ marginTop:14, background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:11.5, color:'#3730a3', wordBreak:'break-all' }}>{vivoUrl}</div>
              <button
                onClick={() => copiarTexto(vivoUrl)}
                style={{ width:'100%', marginTop:12, background:'#4f46e5', color:'#fff', border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                📋 Copiar link
              </button>
            </div>
          </div>
        )
      })()}
    </AppLayout>
  )
}
