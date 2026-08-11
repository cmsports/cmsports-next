'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { alertasCumplimientoPlan, type AlertaPlan } from '@/lib/tecnico/alertas-plan'

const supabase = createClient()

type PeriodoActividad = '7d' | '14d' | '30d' | 'mes'

const PERIODOS_ACTIVIDAD: { value: PeriodoActividad; label: string }[] = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '14d', label: 'Últimos 14 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Este mes' },
]

function desdePeriodo(periodo: PeriodoActividad): string {
  const hoy = fechaChile()
  if (periodo === 'mes') return `${hoy.slice(0, 7)}-01`
  const dias = periodo === '7d' ? 7 : periodo === '14d' ? 14 : 30
  const [y, m, d] = hoy.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() - (dias - 1))
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`
}

type JugadorTecnico = {
  id: string
  nombre: string
  categoria: string | null
  estado: string | null
  sesiones: number
  ultimaSesion: string | null
  ultimaSesionId: string | null
}

type SesionReciente = {
  id: string
  titulo: string
  tipo: string
  estado: string
  fecha: string
  jugador_id: string
  jugadorNombre: string
  videoPendiente: boolean
}

const TIPO_LABEL: Record<string, string> = {
  analisis_video: 'Video libre',
  entrenamiento: 'Entrenamiento',
  competencia: 'Partido',
  evaluacion: 'Evaluación',
}

const DIAS_SIN_REVISION = 21
const ATENCION_MAX = 6
const LISTA_PAGE = 20

type FiltroJugador = 'todos' | 'atencion' | 'alerta' | 'sin_revision'

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
} as const

function diasDesde(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = fechaChile()
  const [y1, m1, d1] = hoy.split('-').map(Number)
  const [y2, m2, d2] = fecha.split('-').map(Number)
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000)
}

function necesitaAtencion(jugador: JugadorTecnico, alerta?: AlertaPlan): boolean {
  if (alerta) return true
  const dias = diasDesde(jugador.ultimaSesion)
  return dias == null || dias >= DIAS_SIN_REVISION
}

function motivoAtencion(jugador: JugadorTecnico, alerta?: AlertaPlan): string {
  if (alerta) return `${alerta.planNombre}: ${alerta.motivo}`
  if (!jugador.ultimaSesion) return 'Sin sesiones técnicas registradas'
  const dias = diasDesde(jugador.ultimaSesion)
  return `Sin revisión hace ${dias} día${dias === 1 ? '' : 's'}`
}

export default function TecnicoPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugadores, setJugadores] = useState<JugadorTecnico[]>([])
  const [alertas, setAlertas] = useState<AlertaPlan[]>([])
  const [recientes, setRecientes] = useState<SesionReciente[]>([])
  const [periodoActividad, setPeriodoActividad] = useState<PeriodoActividad>('14d')
  const [videosPendientes, setVideosPendientes] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtroJugador, setFiltroJugador] = useState<FiltroJugador>('todos')
  const [mostrarTodos, setMostrarTodos] = useState(LISTA_PAGE)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    setCargando(true)
    setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let jugadoresQuery = db.from('jugadores')
      .select('id,nombre,categoria,estado')
      .eq('club_id', perfil.club_id)
      .eq('estado', 'activo')
      .or('es_externo.is.null,es_externo.eq.false')
      .order('nombre')

    if (perfil.rol === 'jugador') {
      jugadoresQuery = jugadoresQuery.eq('id', perfil.jugador_id ?? '')
    }

    const esStaff = ['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')
    let sesionesQuery = db.from('tecnico_sesiones')
      .select('id,jugador_id,fecha,estado,plan_id,ejercicio_id,titulo,tipo')
      .eq('club_id', perfil.club_id)
      .neq('estado', 'archivada')
      .order('fecha', { ascending: false })
    if (perfil.rol === 'jugador') {
      sesionesQuery = sesionesQuery.eq('jugador_id', perfil.jugador_id ?? '').eq('estado', 'publicada')
    }

    const [{ data: jugs, error: jugsError }, { data: sesiones, error: sesionesError }, { data: videos }, planesPack] = await Promise.all([
      jugadoresQuery,
      sesionesQuery,
      esStaff
        ? db.from('tecnico_videos')
          .select('id,sesion_id,estado_procesamiento')
          .eq('club_id', perfil.club_id)
          .eq('estado', 'activo')
          .in('estado_procesamiento', ['pendiente', 'error'])
        : Promise.resolve({ data: [] }),
      esStaff
        ? Promise.all([
          db.from('tecnico_planes').select('id,nombre').eq('club_id', perfil.club_id).eq('activo', true),
          db.from('tecnico_plan_jugadores').select('plan_id,jugador_id,estado,fecha_inicio').eq('club_id', perfil.club_id).in('estado', ['asignado', 'en_curso']),
          db.from('tecnico_plan_ejercicios').select('id,plan_id').eq('club_id', perfil.club_id),
        ])
        : Promise.resolve([null, null, null] as const),
    ])

    if (jugsError || sesionesError) {
      setError('El módulo técnico todavía necesita aplicar su migración en Supabase.')
      setJugadores([])
      setAlertas([])
      setRecientes([])
      setVideosPendientes(0)
      setCargando(false)
      return
    }

    const nombres = new Map((jugs ?? []).map((j: { id: string; nombre: string }) => [j.id, j.nombre]))
    const pendientesPorSesion = new Set(
      (videos ?? [])
        .filter((v: { estado_procesamiento: string }) => v.estado_procesamiento === 'pendiente' || v.estado_procesamiento === 'error')
        .map((v: { sesion_id: string }) => v.sesion_id),
    )
    setVideosPendientes(pendientesPorSesion.size)

    const porJugador = new Map<string, { total: number; ultima: string | null; ultimaId: string | null }>()
    for (const sesion of sesiones ?? []) {
      const actual = porJugador.get(sesion.jugador_id) ?? { total: 0, ultima: null, ultimaId: null }
      actual.total++
      if (!actual.ultima || sesion.fecha > actual.ultima) {
        actual.ultima = sesion.fecha
        actual.ultimaId = sesion.id
      }
      porJugador.set(sesion.jugador_id, actual)
    }

    setJugadores((jugs ?? []).map((jugador: { id: string; nombre: string; categoria: string | null; estado: string | null }) => ({
      ...jugador,
      sesiones: porJugador.get(jugador.id)?.total ?? 0,
      ultimaSesion: porJugador.get(jugador.id)?.ultima ?? null,
      ultimaSesionId: porJugador.get(jugador.id)?.ultimaId ?? null,
    })))

    setRecientes((sesiones ?? []).map((s: {
      id: string
      titulo: string
      tipo: string
      estado: string
      fecha: string
      jugador_id: string
    }) => ({
      id: s.id,
      titulo: s.titulo,
      tipo: s.tipo,
      estado: s.estado,
      fecha: s.fecha,
      jugador_id: s.jugador_id,
      jugadorNombre: nombres.get(s.jugador_id) ?? 'Jugador',
      videoPendiente: pendientesPorSesion.has(s.id),
    })))

    if (esStaff && planesPack[0] && planesPack[1] && planesPack[2]) {
      const [{ data: planes }, { data: asignaciones }, { data: ejercicios }] = planesPack
      setAlertas(alertasCumplimientoPlan({
        asignaciones: asignaciones ?? [],
        planes: planes ?? [],
        jugadores: jugs ?? [],
        ejercicios: ejercicios ?? [],
        sesiones: (sesiones ?? []).map((s: { plan_id: string | null; jugador_id: string; ejercicio_id: string | null; fecha: string }) => ({
          plan_id: s.plan_id,
          jugador_id: s.jugador_id,
          ejercicio_id: s.ejercicio_id,
          fecha: s.fecha,
        })),
      }).slice(0, 8))
    } else {
      setAlertas([])
    }
    setCargando(false)
  }, [perfil])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    if (!['admin', 'profesor', 'jugador', 'superadmin'].includes(perfil.rol ?? '')) {
      router.replace('/')
      return
    }
    void cargar()
  }, [authLoading, cargar, perfil, router])

  useEnVivo(
    ['tecnico_sesiones', 'tecnico_evaluaciones', 'tecnico_plan_jugadores', 'tecnico_videos'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['tecnico_sesiones', 'tecnico_evaluaciones', 'tecnico_plan_jugadores', 'tecnico_videos'] },
  )

  const alertasPorJugador = useMemo(() => {
    const map = new Map<string, AlertaPlan>()
    for (const a of alertas) {
      if (!map.has(a.jugadorId) || a.severidad === 'alta') map.set(a.jugadorId, a)
    }
    return map
  }, [alertas])

  const actividadFiltrada = useMemo(() => {
    const desde = desdePeriodo(periodoActividad)
    return recientes
      .filter(s => s.fecha >= desde)
      .slice(0, 12)
  }, [periodoActividad, recientes])

  const jugadoresAtencion = useMemo(() => {
    return jugadores
      .filter(j => necesitaAtencion(j, alertasPorJugador.get(j.id)))
      .sort((a, b) => {
        const aa = alertasPorJugador.get(a.id)
        const bb = alertasPorJugador.get(b.id)
        if (aa && !bb) return -1
        if (!aa && bb) return 1
        if (aa?.severidad === 'alta' && bb?.severidad !== 'alta') return -1
        if (bb?.severidad === 'alta' && aa?.severidad !== 'alta') return 1
        const da = diasDesde(a.ultimaSesion) ?? 9999
        const db = diasDesde(b.ultimaSesion) ?? 9999
        return db - da
      })
  }, [alertasPorJugador, jugadores])

  const jugadoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return jugadores.filter(j => {
      if (q && !j.nombre.toLowerCase().includes(q)) return false
      const alerta = alertasPorJugador.get(j.id)
      if (filtroJugador === 'atencion') return necesitaAtencion(j, alerta)
      if (filtroJugador === 'alerta') return Boolean(alerta)
      if (filtroJugador === 'sin_revision') {
        const dias = diasDesde(j.ultimaSesion)
        return dias == null || dias >= DIAS_SIN_REVISION
      }
      return true
    })
  }, [alertasPorJugador, busqueda, filtroJugador, jugadores])

  useEffect(() => {
    setMostrarTodos(LISTA_PAGE)
  }, [busqueda, filtroJugador])

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando perfil técnico...</div>
  }

  const esStaff = perfil?.rol !== 'jugador'

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24 }}>Perfil técnico</h1>
          <p style={{ color: '#64748b', margin: '5px 0 0', fontSize: 13 }}>
            Videos, evaluaciones y evolución técnica por jugador.
          </p>
        </div>
        {esStaff && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/tecnico/marcador" style={{ background: '#0f172a', color: '#fff', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Marcador en vivo
            </Link>
            <Link href="/tecnico/manual" style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Manual de uso
            </Link>
            <Link href="/tecnico/comparar" style={{ background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Cara a cara
            </Link>
            <Link href="/tecnico/objetivos" style={{ background: '#f1f5f9', color: '#334155', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Objetivos
            </Link>
            <Link href="/tecnico/planes" style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              Planes
            </Link>
            <Link href="/tecnico/nueva" style={{ background: '#4f46e5', color: '#fff', borderRadius: 8, padding: '9px 13px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              + Nueva sesión
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...card, padding: 18, color: '#92400e', background: '#fffbeb', borderColor: '#fcd34d', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {esStaff && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <MiniKpi label="Jugadores" value={String(jugadores.length)} />
          <MiniKpi label="Sesiones" value={String(jugadores.reduce((a, j) => a + j.sesiones, 0))} />
          <MiniKpi label="Alertas plan" value={String(alertas.length)} accent={alertas.length ? '#b45309' : undefined} />
          <MiniKpi label="Videos por optimizar" value={String(videosPendientes)} accent={videosPendientes ? '#075985' : undefined} />
        </div>
      )}

      {esStaff && jugadoresAtencion.length > 0 && (
        <div style={{ ...card, padding: 16, marginBottom: 16, borderColor: '#fcd34d', background: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <div style={{ color: '#92400e', fontWeight: 800, fontSize: 13 }}>
                Necesitan atención ({jugadoresAtencion.length})
              </div>
              <div style={{ color: '#a16207', fontSize: 11, marginTop: 2 }}>
                Plan atrasado o sin revisión hace {DIAS_SIN_REVISION}+ días.
              </div>
            </div>
            {jugadoresAtencion.length > ATENCION_MAX && (
              <button
                type="button"
                onClick={() => setFiltroJugador('atencion')}
                style={{ border: 0, background: 'transparent', color: '#92400e', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                Ver todos en la lista
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {jugadoresAtencion.slice(0, ATENCION_MAX).map(jugador => {
              const alerta = alertasPorJugador.get(jugador.id)
              return (
                <div
                  key={jugador.id}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid #fde68a', flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f' }}>{jugador.nombre}</div>
                    <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                      {motivoAtencion(jugador, alerta)}
                      {alerta && (
                        <span style={{
                          marginLeft: 8,
                          background: alerta.severidad === 'alta' ? '#fee2e2' : '#fff',
                          color: alerta.severidad === 'alta' ? '#991b1b' : '#92400e',
                          borderRadius: 999,
                          padding: '2px 7px',
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          {alerta.severidad === 'alta' ? 'ALTA' : 'MEDIA'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    {alerta && (
                      <Link href={`/tecnico/planes/${alerta.planId}`} style={{ color: '#92400e', fontSize: 11, fontWeight: 700 }}>Plan</Link>
                    )}
                    <Link href={`/tecnico/jugadores/${jugador.id}`} style={{ color: '#92400e', fontSize: 11, fontWeight: 700 }}>Historial</Link>
                    {jugador.ultimaSesionId && (
                      <Link href={`/tecnico/sesiones/${jugador.ultimaSesionId}`} style={{ color: '#92400e', fontSize: 11, fontWeight: 700 }}>Sesión</Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!error && jugadores.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center', color: '#64748b', marginBottom: 16 }}>
          No hay jugadores disponibles para el perfil técnico.
        </div>
      ) : (
        <div style={{ ...card, padding: 0, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 700 }}>Jugadores</div>
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                {jugadoresFiltrados.length} de {jugadores.length}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre…"
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 11px', fontSize: 12, color: '#0f172a', background: '#fff', minWidth: 180 }}
              />
              {([
                ['todos', 'Todos'],
                ['atencion', 'Atención'],
                ['alerta', 'Con alerta'],
                ['sin_revision', 'Sin revisión'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFiltroJugador(value)}
                  style={{
                    border: filtroJugador === value ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                    background: filtroJugador === value ? '#eef2ff' : '#fff',
                    color: filtroJugador === value ? '#4338ca' : '#475569',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 1.6fr) minmax(80px, 0.8fr) 70px 110px 90px',
              gap: 8,
              padding: '8px 16px',
              color: '#94a3b8',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              borderBottom: '1px solid #f1f5f9',
            }}
            className="tecnico-jugadores-head"
          >
            <span>Nombre</span>
            <span>Categoría</span>
            <span style={{ textAlign: 'right' }}>Sesiones</span>
            <span>Última revisión</span>
            <span style={{ textAlign: 'right' }}>Acción</span>
          </div>

          {jugadoresFiltrados.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              Ningún jugador coincide con la búsqueda o el filtro.
            </div>
          ) : (
            jugadoresFiltrados.slice(0, mostrarTodos).map(jugador => {
              const alerta = alertasPorJugador.get(jugador.id)
              return (
                <div
                  key={jugador.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(140px, 1.6fr) minmax(80px, 0.8fr) 70px 110px 90px',
                    gap: 8,
                    padding: '11px 16px',
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                    background: alerta ? (alerta.severidad === 'alta' ? '#fff7f7' : '#fffbeb') : '#fff',
                  }}
                  className="tecnico-jugadores-row"
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {jugador.nombre}
                    </div>
                    {alerta && (
                      <div style={{ color: '#92400e', fontSize: 10, marginTop: 2, fontWeight: 700 }}>
                        Plan atrasado · {alerta.severidad === 'alta' ? 'alta' : 'media'}
                      </div>
                    )}
                  </div>
                  <span style={{ color: '#64748b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {jugador.categoria || '—'}
                  </span>
                  <span style={{ color: '#0f172a', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>{jugador.sesiones}</span>
                  <span style={{ color: '#334155', fontSize: 12 }}>{jugador.ultimaSesion || 'Sin registros'}</span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Link
                      href={`/tecnico/jugadores/${jugador.id}`}
                      style={{ color: '#4f46e5', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
                    >
                      Historial
                    </Link>
                    {jugador.ultimaSesionId && (
                      <Link
                        href={`/tecnico/sesiones/${jugador.ultimaSesionId}`}
                        style={{ color: '#64748b', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
                      >
                        Sesión
                      </Link>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {jugadoresFiltrados.length > mostrarTodos && (
            <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                onClick={() => setMostrarTodos(n => n + LISTA_PAGE)}
                style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', background: '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Mostrar más ({jugadoresFiltrados.length - mostrarTodos} restantes)
              </button>
            </div>
          )}

          <style>{`
            @media (max-width: 720px) {
              .tecnico-jugadores-head { display: none !important; }
              .tecnico-jugadores-row {
                grid-template-columns: 1fr auto !important;
                gap: 4px 12px !important;
              }
              .tecnico-jugadores-row > :nth-child(2),
              .tecnico-jugadores-row > :nth-child(3),
              .tecnico-jugadores-row > :nth-child(4) {
                grid-column: 1;
                font-size: 11px !important;
              }
              .tecnico-jugadores-row > :nth-child(5) {
                grid-column: 2;
                grid-row: 1 / span 4;
                align-self: center;
                flex-direction: column;
                align-items: flex-end;
              }
            }
          `}</style>
        </div>
      )}

      <div style={{ ...card, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 15 }}>Actividad reciente</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={periodoActividad}
              onChange={e => setPeriodoActividad(e.target.value as PeriodoActividad)}
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#334155', background: '#fff' }}
            >
              {PERIODOS_ACTIVIDAD.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {esStaff && (
              <Link href="/tecnico/nueva" style={{ color: '#4f46e5', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>+ Nueva sesión</Link>
            )}
          </div>
        </div>
        {actividadFiltrada.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 12, padding: '6px 0' }}>
            No hay sesiones en este período.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {actividadFiltrada.map(sesion => (
              <Link
                key={sesion.id}
                href={`/tecnico/sesiones/${sesion.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: '1px solid #f1f5f9', textDecoration: 'none', flexWrap: 'wrap' }}
              >
                <div>
                  <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>{sesion.titulo}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    {sesion.jugadorNombre} · {TIPO_LABEL[sesion.tipo] || sesion.tipo} · {sesion.estado}
                    {sesion.videoPendiente ? ' · video pendiente' : ''}
                  </div>
                </div>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>{sesion.fecha}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function MiniKpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ color: '#64748b', fontSize: 10 }}>{label}</div>
      <div style={{ color: accent || '#0f172a', fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  )
}
