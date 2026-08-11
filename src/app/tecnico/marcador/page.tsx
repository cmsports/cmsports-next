'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  FORMATO_LABEL,
  type FormatoPartido,
  type PartidoTecnico,
  type TimerModo,
} from '@/lib/tecnico/marcador'

const supabase = createClient()

type Jugador = { id: string; nombre: string }

const card = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  boxShadow: '0 1px 3px rgba(15,23,42,0.08)',
} as const

export default function MarcadorListaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [partidos, setPartidos] = useState<PartidoTecnico[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)

  const [titulo, setTitulo] = useState('Partido técnico')
  const [ronda, setRonda] = useState('')
  const [formato, setFormato] = useState<FormatoPartido>('bo5')
  const [timerModo, setTimerModo] = useState<TimerModo>('cronometro')
  const [timerMinutos, setTimerMinutos] = useState('10')
  const [jugadorA, setJugadorA] = useState('')
  const [jugadorB, setJugadorB] = useState('')
  const [nombreA, setNombreA] = useState('')
  const [nombreB, setNombreB] = useState('')

  const esStaff = ['admin', 'profesor', 'superadmin'].includes(perfil?.rol ?? '')

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    let partidosQ = db.from('tecnico_partidos')
      .select('*')
      .eq('club_id', perfil.club_id)
      .order('creado_en', { ascending: false })
      .limit(40)

    if (perfil.rol === 'jugador') {
      partidosQ = partidosQ.or(`jugador_a_id.eq.${perfil.jugador_id},jugador_b_id.eq.${perfil.jugador_id}`)
    }

    const [{ data: p, error: pErr }, { data: j }] = await Promise.all([
      partidosQ,
      esStaff
        ? db.from('jugadores').select('id,nombre').eq('club_id', perfil.club_id).eq('estado', 'activo').or('es_externo.is.null,es_externo.eq.false').order('nombre')
        : Promise.resolve({ data: [] }),
    ])

    if (pErr) {
      setError('Falta aplicar la migración 154_tecnico_marcador_partidos en Supabase.')
      setPartidos([])
    } else {
      setError('')
      setPartidos(p ?? [])
    }
    setJugadores(j ?? [])
    setCargando(false)
  }, [esStaff, perfil])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    void cargar()
  }, [authLoading, cargar, perfil, router])

  useEnVivo(
    ['tecnico_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['tecnico_partidos'] },
  )

  async function crearPartido() {
    if (!perfil?.club_id || !esStaff) return
    const na = nombreA.trim() || jugadores.find(j => j.id === jugadorA)?.nombre || ''
    const nb = nombreB.trim() || jugadores.find(j => j.id === jugadorB)?.nombre || ''
    if (!na || !nb) {
      setError('Indica el nombre de ambos jugadores (o elígelos de la lista).')
      return
    }
    setCreando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data, error: insErr } = await db.from('tecnico_partidos').insert({
      club_id: perfil.club_id,
      titulo: titulo.trim() || 'Partido técnico',
      ronda: ronda.trim() || null,
      formato,
      timer_modo: timerModo,
      timer_limite_segundos: timerModo === 'cuenta_atras' ? Math.max(1, Number(timerMinutos) || 10) * 60 : null,
      jugador_a_id: jugadorA || null,
      jugador_b_id: jugadorB || null,
      nombre_a: na,
      nombre_b: nb,
      creado_por: perfil.id ?? null,
      estado: 'preparacion',
    }).select('id').single()

    setCreando(false)
    if (insErr || !data?.id) {
      setError(insErr?.message || 'No se pudo crear el partido.')
      return
    }
    router.push(`/tecnico/marcador/${data.id}`)
  }

  async function eliminarPartido(partido: PartidoTecnico) {
    if (!perfil?.club_id || !esStaff || eliminandoId) return
    const confirmado = window.confirm(
      `¿Borrar "${partido.titulo}" (${partido.nombre_a} vs ${partido.nombre_b})?\n\nSe eliminarán también sus puntos, sets, tarjetas y registro de eventos. Esta acción no se puede deshacer.`,
    )
    if (!confirmado) return

    setEliminandoId(partido.id)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Un marcador asociado al torneo oficial no debe quedar huérfano.
    const { data: oficial } = await db
      .from('oficial_partidos')
      .select('id')
      .eq('club_id', perfil.club_id)
      .eq('marcador_id', partido.id)
      .maybeSingle()

    if (oficial) {
      setError('Este partido está vinculado a un torneo oficial y no se puede borrar desde Partidos recientes.')
      setEliminandoId(null)
      return
    }

    const { error: deleteError } = await db
      .from('tecnico_partidos')
      .delete()
      .eq('id', partido.id)
      .eq('club_id', perfil.club_id)

    setEliminandoId(null)
    if (deleteError) {
      setError(deleteError.message || 'No se pudo borrar el partido.')
      return
    }
    setPartidos(actuales => actuales.filter(item => item.id !== partido.id))
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' }}>Cargando marcador...</div>
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-start' }}>
        <div>
          <Link href="/tecnico" style={{ color: '#64748b', fontSize: 12, textDecoration: 'none' }}>← Perfil técnico</Link>
          <h1 style={{ margin: '6px 0 0', color: '#0f172a', fontSize: 22 }}>Marcador en vivo</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>
            Partidos de entrenamiento o competencia con scoreboard tipo tablet.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: 14, marginBottom: 14, background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e', fontSize: 13 }}>
          {error}
        </div>
      )}

      {esStaff && (
        <div style={{ ...card, padding: 18, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Nuevo partido</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <Campo label="Título">
              <input value={titulo} onChange={e => setTitulo(e.target.value)} style={input} />
            </Campo>
            <Campo label="Ronda (opcional)">
              <input value={ronda} onChange={e => setRonda(e.target.value)} placeholder="Ej. Cuartos · Game day" style={input} />
            </Campo>
            <Campo label="Formato">
              <select value={formato} onChange={e => setFormato(e.target.value as FormatoPartido)} style={input}>
                <option value="bo3">{FORMATO_LABEL.bo3}</option>
                <option value="bo5">{FORMATO_LABEL.bo5}</option>
                <option value="bo7">{FORMATO_LABEL.bo7}</option>
              </select>
            </Campo>
            <Campo label="Tiempo">
              <select value={timerModo} onChange={e => setTimerModo(e.target.value as TimerModo)} style={input}>
                <option value="cronometro">Cronómetro</option>
                <option value="cuenta_atras">Cuenta atrás</option>
              </select>
            </Campo>
            {timerModo === 'cuenta_atras' && (
              <Campo label="Minutos (cuenta atrás)">
                <input type="number" min={1} max={120} value={timerMinutos} onChange={e => setTimerMinutos(e.target.value)} style={input} />
              </Campo>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div style={{ background: '#eff6ff', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', marginBottom: 8 }}>Lado A</div>
              <select
                value={jugadorA}
                onChange={e => {
                  setJugadorA(e.target.value)
                  const j = jugadores.find(x => x.id === e.target.value)
                  if (j) setNombreA(j.nombre)
                }}
                style={{ ...input, marginBottom: 8 }}
              >
                <option value="">— Elegir jugador —</option>
                {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
              <input value={nombreA} onChange={e => setNombreA(e.target.value)} placeholder="Nombre en marcador" style={input} />
            </div>
            <div style={{ background: '#fff7ed', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', marginBottom: 8 }}>Lado B</div>
              <select
                value={jugadorB}
                onChange={e => {
                  setJugadorB(e.target.value)
                  const j = jugadores.find(x => x.id === e.target.value)
                  if (j) setNombreB(j.nombre)
                }}
                style={{ ...input, marginBottom: 8 }}
              >
                <option value="">— Elegir jugador —</option>
                {jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
              <input value={nombreB} onChange={e => setNombreB(e.target.value)} placeholder="Nombre en marcador" style={input} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void crearPartido()}
            disabled={creando}
            style={{ marginTop: 14, border: 0, borderRadius: 10, padding: '11px 16px', background: '#0f172a', color: '#fff', fontWeight: 800, fontSize: 13, cursor: creando ? 'wait' : 'pointer' }}
          >
            {creando ? 'Creando…' : 'Abrir marcador'}
          </button>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
          Partidos recientes
        </div>
        {partidos.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Aún no hay partidos. {esStaff ? 'Crea el primero arriba.' : ''}
          </div>
        ) : partidos.map(p => (
          <div
            key={p.id}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Link href={`/tecnico/marcador/${p.id}`} style={{ minWidth: 0, flex: 1, textDecoration: 'none' }}>
              <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 14 }}>{p.titulo}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                {p.nombre_a} vs {p.nombre_b}
                {p.ronda ? ` · ${p.ronda}` : ''} · {FORMATO_LABEL[p.formato]}
              </div>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Link href={`/tecnico/marcador/${p.id}`} style={{ textAlign: 'right', textDecoration: 'none' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{p.games_a} – {p.games_b}</div>
                <EstadoBadge estado={p.estado} />
              </Link>
              {esStaff && (
                <button
                  type="button"
                  onClick={() => void eliminarPartido(p)}
                  disabled={eliminandoId === p.id}
                  title="Borrar partido y todo su registro"
                  aria-label={`Borrar partido ${p.titulo}`}
                  style={{
                    width: 36,
                    height: 36,
                    border: '1px solid #fecaca',
                    borderRadius: 9,
                    background: '#fef2f2',
                    color: '#dc2626',
                    cursor: eliminandoId === p.id ? 'wait' : 'pointer',
                    fontSize: 16,
                    fontWeight: 900,
                  }}
                >
                  {eliminandoId === p.id ? '…' : '🗑'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, { bg: string; fg: string; t: string }> = {
    preparacion: { bg: '#f1f5f9', fg: '#475569', t: 'Preparación' },
    en_curso: { bg: '#dcfce7', fg: '#166534', t: 'En curso' },
    pausado: { bg: '#fef3c7', fg: '#92400e', t: 'Pausado' },
    finalizado: { bg: '#e0e7ff', fg: '#3730a3', t: 'Finalizado' },
  }
  const s = map[estado] || map.preparacion
  return (
    <span style={{ display: 'inline-block', marginTop: 4, background: s.bg, color: s.fg, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 800 }}>
      {s.t}
    </span>
  )
}

const input = {
  width: '100%',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  color: '#0f172a',
  background: '#fff',
  boxSizing: 'border-box' as const,
}
