'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { registrarAsistenciaAction } from '@/app/actions/asistencia'
import { usePerfil } from '@/lib/auth/PerfilProvider'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Aviso = { id: string; tipo: 'jugar' | 'ganaste' | 'perdiste' | 'campeon'; texto: string }

const POSICION_LABEL: Record<string, string> = {
  fase_grupos: 'Fase de grupos', octavos: 'Octavos de final', cuartos: 'Cuartos de final',
  semifinal: 'Semifinal', subcampeon: 'Subcampeón', campeon: 'Campeón 🏆'
}

export default function PerfilPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugador, setJugador] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [historialElo, setHistorialElo] = useState<any[]>([])
  const [externos, setExternos] = useState<any[]>([])
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [yaRegistroHoy, setYaRegistroHoy] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [aceptandoCompromiso, setAceptandoCompromiso] = useState(false)
  const [torneoActivo, setTorneoActivo] = useState<any>(null)
  const [miGrupo, setMiGrupo] = useState<any>(null)
  const [gruposT, setGruposT] = useState<any[]>([])
  const [misPartidosPendientes, setMisPartidosPendientes] = useState<any[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [yaFelicite, setYaFelicite] = useState(false)
  const [felicitacionesCount, setFelicitacionesCount] = useState(0)
  const [esCampeon, setEsCampeon] = useState(false)
  const prevPartidosRef = useRef<any[]>([])
  const prevFaseRef = useRef<string | null>(null)
  const esCampeonRef = useRef(false)
  const router = useRouter()

  const trimestre = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}-${new Date().getFullYear()}`
  const hoy = new Date().toISOString().slice(0, 10)
  const hora = new Date().toTimeString().slice(0, 5)

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }

      if (perfil.jugador_id) {
        const mesActual = new Date().getMonth() + 1
        const anioActual = new Date().getFullYear()

        // Ronda 1 — todo en paralelo, incluyendo el check de torneo activo
        const [
          { data: j },
          { data: a },
          { data: h },
          { data: ext },
          { data: mens },
          { data: evs },
          { data: asistHoy },
          { data: td },
        ] = await Promise.all([
          supabase.from('jugadores').select('*').eq('id', perfil.jugador_id).single(),
          supabase.from('asistencia').select('*').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false }).limit(10),
          supabase.from('historial_elo').select('*,torneos(nombre)').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: true }),
          supabase.from('torneos_externos').select('*').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false }),
          supabase.from('mensualidades').select('*').eq('jugador_id', perfil.jugador_id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
          supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', perfil.jugador_id).order('creado_en', { ascending: false }).limit(2),
          supabase.from('asistencia').select('id').eq('jugador_id', perfil.jugador_id).eq('fecha', hoy),
          perfil.club_id
            ? supabase.from('torneos').select('id, nombre, fase, estado').eq('club_id', perfil.club_id).neq('fase', 'inscripcion').neq('estado', 'archivado')
                .or(`estado.eq.en_curso,and(estado.eq.finalizado,fecha_fin.gte.${new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()})`)
                .order('fecha_inicio', { ascending: false }).limit(1).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])

        setJugador(j)
        setAsistencias(a || [])
        setHistorialElo(h || [])
        setExternos(ext || [])
        setMensualidadActual(mens)
        setEvaluaciones(evs || [])
        setYaRegistroHoy((asistHoy || []).length > 0)

        // Ronda 2 — solo si hay torneo activo: grupos + partidos en paralelo
        if (td && j) {
          setTorneoActivo(td)
          const [{ data: gd }, { data: partidos }] = await Promise.all([
            supabase.from('torneo_grupos').select('id, nombre').eq('torneo_id', td.id).order('nombre'),
            supabase.from('torneo_partidos')
              .select('id, jugador_a, jugador_b, ganador, ja:jugador_a(id,nombre), jb:jugador_b(id,nombre)')
              .eq('torneo_id', td.id)
              .is('ganador', null)
              .or(`jugador_a.eq.${j.id},jugador_b.eq.${j.id}`)
          ])
          const gruposReales = (gd || []).filter((g: any) => g.nombre !== 'MESA')
          const grupoIds = gruposReales.map((g: any) => g.id)

          // Ronda 3 — jugadores de cada grupo (necesita los IDs de ronda 2)
          if (grupoIds.length) {
            const { data: gjData } = await supabase
              .from('grupo_jugadores').select('grupo_id, jugador_id, jugadores(id, nombre, elo)').in('grupo_id', grupoIds)
            const gruposConJ = gruposReales.map((g: any) => ({
              ...g, miembros: (gjData || []).filter((x: any) => x.grupo_id === g.id)
            }))
            setGruposT(gruposConJ)
            const miEntry = (gjData || []).find((x: any) => x.jugador_id === j.id)
            setMiGrupo(miEntry ? (gruposConJ.find((g: any) => g.id === miEntry.grupo_id) ?? null) : null)
            setMisPartidosPendientes(partidos || [])
            prevPartidosRef.current = partidos || []
            if (td) prevFaseRef.current = td.fase
          }

          if (td.fase === 'finalizado') {
            const [{ data: misFeli }, { count }, { data: campeonRec }] = await Promise.all([
              supabase.from('torneo_felicitaciones').select('id').eq('torneo_id', td.id).eq('jugador_id', j.id).maybeSingle(),
              supabase.from('torneo_felicitaciones').select('id', { count: 'exact', head: true }).eq('torneo_id', td.id),
              supabase.from('historial_elo').select('id').eq('torneo_id', td.id).eq('jugador_id', j.id).eq('posicion', 'campeon').maybeSingle(),
            ])
            setYaFelicite(!!misFeli)
            setFelicitacionesCount(count || 0)
            setEsCampeon(!!campeonRec)
          }
        }
      }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil])

  async function handleMarcarAsistencia() {
    if (!jugador || !perfil?.club_id) return
    setMostrarConfirm(false)
    setRegistrando(true)
    const result = await registrarAsistenciaAction(perfil.club_id, jugador.id, hoy, hora)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(false)
      setTimeout(() => setMensaje(null), 6000)
      return
    }
    setMensaje({ tipo: 'ok', texto: '¡Asistencia registrada!' })
    setYaRegistroHoy(true)
    setRegistrando(false)
    setTimeout(() => setMensaje(null), 4000)
  }

  useEffect(() => { esCampeonRef.current = esCampeon }, [esCampeon])

  // Realtime — suscripción al torneo activo
  useEffect(() => {
    if (!torneoActivo?.id || !jugador?.id) return
    const tId = torneoActivo.id
    const jId = jugador.id

    async function recargarTorneo() {
      const [{ data: td }, { data: gd }, { data: partidos }] = await Promise.all([
        supabase.from('torneos').select('id, nombre, fase, estado').eq('id', tId).single(),
        supabase.from('torneo_grupos').select('id, nombre').eq('torneo_id', tId).order('nombre'),
        supabase.from('torneo_partidos')
          .select('id, jugador_a, jugador_b, ganador, ja:jugador_a(id,nombre), jb:jugador_b(id,nombre)')
          .eq('torneo_id', tId)
          .is('ganador', null)
          .or(`jugador_a.eq.${jId},jugador_b.eq.${jId}`)
      ])

      // Detectar avisos comparando con estado anterior
      const prevPartidos = prevPartidosRef.current
      const prevFase = prevFaseRef.current
      const nuevosPartidos_arr = partidos || []
      const prevIds = new Set(prevPartidos.map((p: any) => p.id))
      const newIds = new Set(nuevosPartidos_arr.map((p: any) => p.id))
      const nuevosAvisos: Aviso[] = []

      // Partidos nuevos pendientes → "jugar"
      const partidosNuevos = nuevosPartidos_arr.filter((p: any) => !prevIds.has(p.id))
      for (const p of partidosNuevos) {
        const rival = (p.jugador_a === jId ? p.jb : p.ja) as any
        nuevosAvisos.push({ id: `jugar-${p.id}`, tipo: 'jugar', texto: `⚡ ¡A jugar! vs ${rival?.nombre || '—'}` })
      }

      // Partidos que desaparecieron del pendiente → query resultado → "ganaste"/"perdiste"
      const completados = prevPartidos.filter((p: any) => !newIds.has(p.id))
      if (completados.length > 0) {
        const { data: results } = await supabase
          .from('torneo_partidos').select('id, ganador').in('id', completados.map((p: any) => p.id))
        for (const r of (results || [])) {
          if (r.ganador === jId) {
            nuevosAvisos.push({ id: `ganaste-${r.id}`, tipo: 'ganaste', texto: '🎉 ¡Enhorabuena! ¡Ganaste el partido!' })
          } else if (r.ganador) {
            nuevosAvisos.push({ id: `perdiste-${r.id}`, tipo: 'perdiste', texto: '💪 Para la próxima será. ¡Buen partido!' })
          }
        }
      }

      // Fase cambió a 'finalizado' → "campeon" + cargar estado de felicitaciones/campeón
      if (td && td.fase === 'finalizado' && prevFase !== 'finalizado') {
        nuevosAvisos.push({ id: `campeon-${td.id}`, tipo: 'campeon', texto: '🏆 ¡El torneo ha finalizado! Revisa los resultados.' })
        const [{ data: misFeli }, { count }, { data: campeonRec }] = await Promise.all([
          supabase.from('torneo_felicitaciones').select('id').eq('torneo_id', tId).eq('jugador_id', jId).maybeSingle(),
          supabase.from('torneo_felicitaciones').select('id', { count: 'exact', head: true }).eq('torneo_id', tId),
          supabase.from('historial_elo').select('id').eq('torneo_id', tId).eq('jugador_id', jId).eq('posicion', 'campeon').maybeSingle(),
        ])
        setYaFelicite(!!misFeli)
        setFelicitacionesCount(count || 0)
        setEsCampeon(!!campeonRec)
      }

      // Actualizar refs antes de actualizar estado
      prevPartidosRef.current = nuevosPartidos_arr
      if (td) prevFaseRef.current = td.fase

      // Actualizar estado
      if (td) setTorneoActivo(td)
      if (td?.fase === 'grupos') {
        const gruposReales = (gd || []).filter((g: any) => g.nombre !== 'MESA')
        const grupoIds = gruposReales.map((g: any) => g.id)
        if (grupoIds.length) {
          const { data: gjData } = await supabase
            .from('grupo_jugadores').select('grupo_id, jugador_id, jugadores(id, nombre, elo)').in('grupo_id', grupoIds)
          const gruposConJ = gruposReales.map((g: any) => ({
            ...g, miembros: (gjData || []).filter((x: any) => x.grupo_id === g.id)
          }))
          setGruposT(gruposConJ)
          const miEntry = (gjData || []).find((x: any) => x.jugador_id === jId)
          setMiGrupo(miEntry ? (gruposConJ.find((g: any) => g.id === miEntry.grupo_id) ?? null) : null)
        }
      } else {
        setGruposT([])
        setMiGrupo(null)
      }
      setMisPartidosPendientes(nuevosPartidos_arr)

      // Lanzar avisos con auto-remove a los 8 segundos
      if (nuevosAvisos.length > 0) {
        setAvisos(prev => [...prev, ...nuevosAvisos])
        const ids = new Set(nuevosAvisos.map(a => a.id))
        setTimeout(() => setAvisos(prev => prev.filter(a => !ids.has(a.id))), 8000)
      }
    }

    const canal = supabase
      .channel(`torneo-${tId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_partidos', filter: `torneo_id=eq.${tId}` }, recargarTorneo)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'torneos', filter: `id=eq.${tId}` }, recargarTorneo)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'torneo_felicitaciones', filter: `torneo_id=eq.${tId}` }, () => {
        setFelicitacionesCount(c => c + 1)
        if (esCampeonRef.current) {
          const id = `felicita-${Date.now()}`
          setAvisos(prev => [...prev, { id, tipo: 'ganaste', texto: '🎊 ¡Alguien te acaba de felicitar!' }])
          setTimeout(() => setAvisos(prev => prev.filter(a => a.id !== id)), 8000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [torneoActivo?.id, jugador?.id])

  async function aceptarCompromiso() {
    const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)
    if (!evalActual) return
    setAceptandoCompromiso(true)
    await supabase.from('evaluaciones_trimestrales').update({ firmado_alumno: true }).eq('id', evalActual.id)
    const { data: evs } = await supabase.from('evaluaciones_trimestrales').select('*').eq('jugador_id', jugador.id).order('creado_en', { ascending: false }).limit(2)
    setEvaluaciones(evs || [])
    setAceptandoCompromiso(false)
  }

  async function enviarFelicitaciones() {
    if (!torneoActivo?.id || !jugador?.id || yaFelicite) return
    const { error } = await supabase.from('torneo_felicitaciones').insert({ torneo_id: torneoActivo.id, jugador_id: jugador.id })
    if (!error) {
      setYaFelicite(true)
      setFelicitacionesCount(c => c + 1)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ ...card, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏓</div>
        <div style={{ fontSize: 16, color: text, marginBottom: 8 }}>Perfil no vinculado</div>
        <div style={{ fontSize: 13, color: muted }}>Contacta al administrador del club</div>
      </div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const torneosInternos = new Set(historialElo.filter((h: any) => h.torneo_id).map((h: any) => h.torneo_id)).size
  const torneosTotal = torneosInternos + externos.length
  const mensEstado = mensualidadActual?.estado
  const mensLabel = mensEstado === 'pagado' ? '✅ Pagado' : mensEstado === 'atrasado' ? '❌ Atrasado' : mensEstado === 'pendiente' ? '⚠️ Pendiente' : '—'
  const mensColor = mensEstado === 'pagado' ? '#86efac' : mensEstado === 'atrasado' ? '#fca5a5' : mensEstado === 'pendiente' ? '#fde68a' : 'rgba(255,255,255,0.7)'

  const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)

  const eloLabels = [
    ...historialElo.map((h: any) => {
      if (!h.fecha) return ''
      const d = new Date(h.fecha)
      return d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
    }),
    'Hoy'
  ]
  const eloData = [...historialElo.map((h: any) => h.elo_despues), jugador?.elo || 1200]
  const eloNombres = [...historialElo.map((h: any) => (h as any).torneos?.nombre || 'Torneo externo'), 'ELO actual']
  const eloTooltips = [...historialElo.map((h: any) => h.posicion || ''), '']

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0 }}>
            {iniciales}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{jugador.nombre}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{jugador.categoria}</div>
          </div>
          <button
            onClick={() => router.push(`/jugadores/${jugador.id}`)}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
          >
            Ver perfil →
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'monospace' }}>{torneosTotal}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Torneos</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: mensColor, lineHeight: 1.8 }}>{mensLabel}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Mensualidad</div>
          </div>
        </div>

        {/* Sesiones */}
        {jugador.tipo_plan !== 'libre' && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Sesiones del mes</span>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 4, height: 6 }}>
              <div style={{ width: `${Math.min(((jugador.sesiones_usadas || 0) / (jugador.sesiones_limite || 1)) * 100, 100)}%`, background: (jugador.sesiones_usadas || 0) >= (jugador.sesiones_limite || 1) ? '#fca5a5' : '#fff', borderRadius: 4, height: '100%', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Avisos animados del torneo */}
      <AvisoBanner avisos={avisos} />

      {/* Torneo en vivo */}
      {torneoActivo && (
        <TorneoEnVivoBanner
          torneo={torneoActivo}
          miGrupo={miGrupo}
          grupos={gruposT}
          misPartidos={misPartidosPendientes}
          jugadorId={jugador?.id}
          yaFelicite={yaFelicite}
          felicitacionesCount={felicitacionesCount}
          onFelicitar={enviarFelicitaciones}
          esCampeon={esCampeon}
        />
      )}

      {/* Marcar asistencia */}
      {mensaje && (
        <div style={{ background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, textAlign: 'center', fontSize: 14, fontWeight: 600, color: mensaje.tipo === 'ok' ? '#16a34a' : '#dc2626' }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        {yaRegistroHoy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Asistencia registrada</div>
              <div style={{ fontSize: 12, color: muted }}>¡Buen entrenamiento hoy!</div>
            </div>
          </div>
        ) : mostrarConfirm ? (
          <div>
            <div style={{ fontSize: 13, color: text, marginBottom: 12 }}>¿Confirmar asistencia para hoy?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setMostrarConfirm(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleMarcarAsistencia} disabled={registrando} style={{ flex: 1, padding: '10px', background: registrando ? '#94a3b8' : '#4f46e5', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: registrando ? 'not-allowed' : 'pointer' }}>
                {registrando ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setMostrarConfirm(true)} style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg,#3730a3,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🏓 Marcar asistencia de hoy
          </button>
        )}
      </div>

      {/* Feedback del entrenador */}
      {evalActual?.feedback_profesor && (
        <div style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 8 }}>📝 Informe del entrenador — {trimestre}</div>
          <div style={{ fontSize: 13, color: text, lineHeight: 1.6, marginBottom: evalActual.meta_proximo_periodo ? 12 : 0 }}>{evalActual.feedback_profesor}</div>
          {evalActual.meta_proximo_periodo && (
            <div style={{ background: '#ede9fe', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Meta del próximo período</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.6 }}>{evalActual.meta_proximo_periodo}</div>
            </div>
          )}
          {evalActual.firmado_alumno ? (
            <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'center', border: '1px solid #bbf7d0', marginTop: 12 }}>✅ Compromiso aceptado</div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>He leído el informe y acepto las metas del próximo período.</div>
              <button onClick={aceptarCompromiso} disabled={aceptandoCompromiso} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg,#3730a3,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: aceptandoCompromiso ? 'not-allowed' : 'pointer' }}>
                {aceptandoCompromiso ? 'Guardando...' : '✍️ Aceptar compromiso del trimestre'}
              </button>
            </div>
          )}
        </div>
      )}


      {/* Últimas asistencias */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
          Últimas asistencias
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Sin asistencias registradas</div>
        ) : asistencias.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13, color: text }}>{a.fecha}</span>
            <span style={{ fontSize: 13, color: muted }}>{a.hora?.slice(0, 5)}</span>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}

function AvisoBanner({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null

  const estilos: Record<string, { bg: string; border: string; color: string }> = {
    jugar:   { bg: '#fef3c7', border: '#fde68a',  color: '#92400e' },
    ganaste: { bg: '#f0fdf4', border: '#86efac',  color: '#166534' },
    perdiste:{ bg: '#f8fafc', border: '#cbd5e1',  color: '#475569' },
    campeon: { bg: '#fffbeb', border: '#fbbf24',  color: '#78350f' },
  }

  return (
    <>
      <style>{`
        @keyframes toastSlide {
          0%   { opacity: 0; transform: translateY(-10px) scale(0.96); }
          8%   { opacity: 1; transform: translateY(0)    scale(1);    }
          85%  { opacity: 1; transform: translateY(0)    scale(1);    }
          100% { opacity: 0; transform: translateY(-6px) scale(0.98); }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {avisos.map(aviso => {
          const c = estilos[aviso.tipo] || estilos.jugar
          const esCampeon = aviso.tipo === 'campeon'
          return (
            <div key={aviso.id} style={{
              background: esCampeon ? 'linear-gradient(135deg,#fef9c3,#fef3c7)' : c.bg,
              border: `1.5px solid ${c.border}`,
              borderRadius: 12,
              padding: '14px 18px',
              fontSize: esCampeon ? 15 : 14,
              fontWeight: 700,
              color: c.color,
              boxShadow: esCampeon
                ? '0 4px 20px rgba(251,191,36,0.25)'
                : '0 2px 12px rgba(15,23,42,0.08)',
              animation: `toastSlide ${esCampeon ? '12s' : '8s'} forwards`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              letterSpacing: esCampeon ? '0.2px' : undefined,
            }}>
              {aviso.texto}
            </div>
          )
        })}
      </div>
    </>
  )
}

function TorneoEnVivoBanner({ torneo, miGrupo, grupos, misPartidos, jugadorId, yaFelicite, felicitacionesCount, onFelicitar, esCampeon }: {
  torneo: any
  miGrupo: any | null
  grupos: any[]
  misPartidos: any[]
  jugadorId: string
  yaFelicite: boolean
  felicitacionesCount: number
  onFelicitar: () => void
  esCampeon: boolean
}) {
  const [verTodos, setVerTodos] = useState(false)

  const faseLabel: Record<string, string> = {
    grupos: 'Fase de grupos', llaves: 'Playoffs',
    semis: 'Semifinal', final: 'Final', finalizado: 'Finalizado'
  }

  return (
    <div style={{ marginBottom: 16, border: '2px solid #4f46e5', borderRadius: 14, overflow: 'hidden', background: '#ffffff', boxShadow: '0 4px 16px rgba(79,70,229,0.15)' }}>
      {/* Header */}
      <div style={{ background: torneo.fase === 'finalizado' ? 'linear-gradient(135deg,#78350f,#d97706)' : 'linear-gradient(135deg,#3730a3,#4f46e5)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 2 }}>{torneo.nombre}</div>
            <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 8px', fontSize: 10, color: 'rgba(255,255,255,0.9)' }}>
              {faseLabel[torneo.fase] || torneo.fase}
            </span>
          </div>
        </div>
        {torneo.fase === 'finalizado' ? (
          <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>FINALIZADO</span>
          </div>
        ) : (
          <div style={{ background: '#22c55e', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'white' }}>EN VIVO</span>
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {/* Partidos pendientes del jugador */}
        {misPartidos.map((p: any) => {
          const rival = p.jugador_a === jugadorId ? p.jb : p.ja
          return (
            <div key={p.id} style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 800, marginBottom: 3, letterSpacing: '0.3px' }}>⚡ ¡A JUGAR!</div>
                <div style={{ fontSize: 15, color: '#0f172a', fontWeight: 700 }}>vs {rival?.nombre || '—'}</div>
              </div>
              <span style={{ fontSize: 26 }}>🏓</span>
            </div>
          )
        })}

        {/* FASE GRUPOS — mi grupo + otros grupos */}
        {torneo.fase === 'grupos' && (
          <>
            {miGrupo && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#4f46e5', letterSpacing: '0.5px', marginBottom: 8, textTransform: 'uppercase' }}>⭐ Tu grupo</div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Grupo {miGrupo.nombre}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {miGrupo.miembros.map((m: any) => (
                      <div key={m.jugador_id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                        background: m.jugador_id === jugadorId ? 'rgba(79,70,229,0.08)' : 'transparent',
                        border: m.jugador_id === jugadorId ? '1px solid #c4b5fd' : '1px solid transparent'
                      }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.jugador_id === jugadorId ? '#4f46e5' : '#e2e8f0', color: m.jugador_id === jugadorId ? 'white' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {m.jugadores?.nombre?.charAt(0) || '?'}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, color: '#0f172a', fontWeight: m.jugador_id === jugadorId ? 700 : 400 }}>
                          {m.jugadores?.nombre || '—'}
                          {m.jugador_id === jugadorId && <span style={{ marginLeft: 6, fontSize: 10, color: '#4f46e5', fontWeight: 500 }}>(tú)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {grupos.filter(g => g.id !== miGrupo?.id).length > 0 && (
              <div>
                <button
                  onClick={() => setVerTodos(v => !v)}
                  style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>Ver otros grupos ({grupos.filter(g => g.id !== miGrupo?.id).length})</span>
                  <span>{verTodos ? '▲' : '▼'}</span>
                </button>
                {verTodos && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {grupos.filter(g => g.id !== miGrupo?.id).map(g => (
                      <div key={g.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Grupo {g.nombre}</div>
                        {g.miembros.map((m: any) => (
                          <div key={m.jugador_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                            <span style={{ flex: 1, color: '#334155' }}>{m.jugadores?.nombre || '—'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!miGrupo && misPartidos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '10px 0', color: '#94a3b8', fontSize: 13 }}>
                Aún no estás asignado a un grupo en este torneo
              </div>
            )}
          </>
        )}

        {/* FASES PLAYOFF — contexto de ronda */}
        {['llaves', 'semis', 'final'].includes(torneo.fase) && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: misPartidos.length > 0 ? 0 : 4 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Estás en</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{faseLabel[torneo.fase]}</div>
            {misPartidos.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Esperando rival confirmado</div>
            )}
          </div>
        )}

        {/* Finalizado — vista campeón o vista resto */}
        {torneo.fase === 'finalizado' && (
          esCampeon ? (
            <div style={{ marginTop: 12, background: 'linear-gradient(135deg,#fef9c3,#fffbeb)', border: '2px solid #fbbf24', borderRadius: 12, padding: '20px 18px', textAlign: 'center', boxShadow: '0 4px 20px rgba(251,191,36,0.2)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#78350f', marginBottom: 4 }}>¡Eres el campeón!</div>
              <div style={{ fontSize: 13, color: '#92400e', marginBottom: 12, fontWeight: 500 }}>{torneo.nombre}</div>
              <div style={{ background: 'rgba(251,191,36,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400e' }}>
                {felicitacionesCount > 0
                  ? `🎊 ${felicitacionesCount} jugador${felicitacionesCount !== 1 ? 'es' : ''} te felicitaron`
                  : '¡Disfruta tu premio!'}
              </div>
              <div style={{ fontSize: 12, color: '#a16207', marginTop: 10 }}>Te esperamos en el siguiente torneo 🏓</div>
            </div>
          ) : (
            <div style={{ marginTop: 12, background: 'linear-gradient(135deg,#fef9c3,#fef3c7)', border: '2px solid #fbbf24', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>¡Torneo finalizado!</div>
              <div style={{ fontSize: 12, color: '#92400e', marginBottom: 14 }}>
                {felicitacionesCount > 0
                  ? `${felicitacionesCount} jugador${felicitacionesCount !== 1 ? 'es' : ''} enviaron felicitaciones`
                  : 'Sé el primero en felicitar al campeón'}
              </div>
              {yaFelicite ? (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                  🎊 ¡Ya enviaste tus felicitaciones!
                </div>
              ) : (
                <button
                  onClick={onFelicitar}
                  style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg,#d97706,#f59e0b)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(217,119,6,0.3)' }}
                >
                  🎊 Enviar felicitaciones al campeón
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
