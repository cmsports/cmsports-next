'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import {
  registrarResultadoOficial,
  sincronizarSetsMarcadorOficial,
} from '@/app/actions/torneo-oficial'
import {
  aplicarPunto,
  deshacerPunto,
  estadoInicial,
  type EstadoMarcador,
  type FormatoPartido,
  type Lado,
} from '@/lib/marcador-oficial'
import type { SetMarcador } from '@/lib/domain/oficial-ittf'

const supabase = createClient()

type PartidoRow = {
  id: string
  evento_id: string
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
}

type EventoRow = { formato_partido: FormatoPartido; nombre: string }

export default function MarcadorOficialPage() {
  const { partidoId } = useParams<{ partidoId: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  const [partido, setPartido] = useState<PartidoRow | null>(null)
  const [evento, setEvento] = useState<EventoRow | null>(null)
  const [nombreA, setNombreA] = useState('Jugador A')
  const [nombreB, setNombreB] = useState('Jugador B')
  const [estado, setEstado] = useState<EstadoMarcador>(estadoInicial())
  const [loading, setLoading] = useState(true)
  const [cerrando, setCerrando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const cargar = useCallback(async () => {
    if (!perfil?.club_id) return
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: p } = await db.from('oficial_partidos')
      .select('id,evento_id,inscrito_a_id,inscrito_b_id,ganador_id,sets')
      .eq('id', partidoId).eq('club_id', perfil.club_id).maybeSingle()
    if (!p) { setPartido(null); setLoading(false); return }

    setPartido({ ...p, sets: (p.sets || []) as SetMarcador[] })

    const { data: ev } = await db.from('oficial_eventos')
      .select('formato_partido,nombre').eq('id', p.evento_id).maybeSingle()
    setEvento(ev)

    const ids = [p.inscrito_a_id, p.inscrito_b_id].filter(Boolean) as string[]
    if (ids.length) {
      const { data: ins } = await db.from('oficial_inscritos').select('id,nombre,asociacion').in('id', ids)
      const map = new Map<string, string>((ins || []).map((i: { id: string; nombre: string; asociacion: string | null }) => [
        i.id,
        i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre,
      ] as [string, string]))
      if (p.inscrito_a_id) setNombreA(map.get(p.inscrito_a_id) || 'Jugador A')
      if (p.inscrito_b_id) setNombreB(map.get(p.inscrito_b_id) || 'Jugador B')
    }

    if (p.ganador_id) {
      setEstado(prev => ({ ...prev, finalizado: true, historial_sets: (p.sets || []) as Array<[number, number]> }))
    } else if ((p.sets as SetMarcador[])?.length) {
      const sets = p.sets as SetMarcador[]
      let games_a = 0
      let games_b = 0
      for (const [pa, pb] of sets) {
        if (pa > pb) games_a++
        else if (pb > pa) games_b++
      }
      setEstado({
        puntos_a: 0,
        puntos_b: 0,
        games_a,
        games_b,
        juego_actual: sets.length + 1,
        historial_sets: sets,
        ganador_lado: null,
        finalizado: false,
      })
    } else {
      setEstado(estadoInicial())
    }

    setLoading(false)
  }, [partidoId, perfil?.club_id])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    void cargar()
  }, [authLoading, perfil, cargar, router])

  useEnVivo(
    ['oficial_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar() },
    { conClub: ['oficial_partidos'] },
  )

  const formato: FormatoPartido = evento?.formato_partido || 'bo5'
  const cerrado = Boolean(partido?.ganador_id)

  async function syncSets(nuevo: EstadoMarcador) {
    if (!nuevo.historial_sets.length || cerrado) return
    await sincronizarSetsMarcadorOficial({
      partidoId,
      sets: nuevo.historial_sets,
    })
  }

  async function punto(lado: Lado) {
    if (cerrado || estado.finalizado) return
    const prevSets = estado.historial_sets.length
    const nuevo = aplicarPunto(estado, lado, formato)
    setEstado(nuevo)
    if (nuevo.historial_sets.length > prevSets) void syncSets(nuevo)
    if (nuevo.finalizado && nuevo.ganador_lado) void finalizar(nuevo)
  }

  function deshacer(lado: Lado) {
    if (cerrado || estado.finalizado) return
    const nuevo = deshacerPunto(estado, lado)
    if (nuevo) setEstado(nuevo)
  }

  async function finalizar(estadoFinal: EstadoMarcador) {
    if (!partido?.inscrito_a_id || !partido.inscrito_b_id) return
    setCerrando(true)
    setErrorMsg('')
    const ganadorId = estadoFinal.ganador_lado === 'a'
      ? partido.inscrito_a_id
      : partido.inscrito_b_id
    const res = await registrarResultadoOficial({
      partidoId,
      sets: estadoFinal.historial_sets,
      ganadorId,
    })
    setCerrando(false)
    if (res.error) { setErrorMsg(res.error); return }
    router.push(`/torneo-oficial/evento/${partido.evento_id}`)
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 12px 80px' }}>
        <button
          type="button"
          onClick={() => router.push(partido ? `/torneo-oficial/evento/${partido.evento_id}` : '/torneo-oficial')}
          style={btnBack}
        >
          ← Volver al evento
        </button>

        {loading ? (
          <p style={{ color: '#94a3b8' }}>Cargando marcador…</p>
        ) : !partido ? (
          <p style={{ color: '#e11d48' }}>Partido no encontrado</p>
        ) : (
          <>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, textAlign: 'center' }}>
              {evento?.nombre} · {formato.toUpperCase()}
            </p>

            {errorMsg && (
              <p style={{ color: '#e11d48', fontSize: 13, textAlign: 'center' }}>{errorMsg}</p>
            )}

            <div style={marcadorCard}>
              <div style={{ ...filaJugador, background: '#eff6ff' }}>
                <div>
                  <div style={nombreStyle}>{nombreA}</div>
                  <div style={gamesStyle}>{estado.games_a} sets</div>
                </div>
                <div style={puntosStyle}>{estado.puntos_a}</div>
                {!cerrado && !estado.finalizado && (
                  <div style={botonesLado}>
                    <button type="button" onClick={() => void punto('a')} style={btnPunto}>+1</button>
                    <button type="button" onClick={() => deshacer('a')} style={btnDeshacer}>↩</button>
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', padding: '8px 0', color: '#94a3b8', fontSize: 12 }}>
                Set {estado.juego_actual}
                {estado.historial_sets.length > 0 && (
                  <span> · {estado.historial_sets.map(([a, b]) => `${a}-${b}`).join(' · ')}</span>
                )}
              </div>

              <div style={{ ...filaJugador, background: '#fdf2f8' }}>
                <div>
                  <div style={nombreStyle}>{nombreB}</div>
                  <div style={gamesStyle}>{estado.games_b} sets</div>
                </div>
                <div style={puntosStyle}>{estado.puntos_b}</div>
                {!cerrado && !estado.finalizado && (
                  <div style={botonesLado}>
                    <button type="button" onClick={() => void punto('b')} style={btnPunto}>+1</button>
                    <button type="button" onClick={() => deshacer('b')} style={btnDeshacer}>↩</button>
                  </div>
                )}
              </div>
            </div>

            {(cerrado || estado.finalizado) && (
              <p style={{ textAlign: 'center', marginTop: 16, color: '#16a34a', fontWeight: 600 }}>
                {cerrando ? 'Guardando resultado…' : 'Partido finalizado'}
              </p>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

const marcadorCard: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
}

const filaJugador: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: 12,
  alignItems: 'center',
  padding: '20px 16px',
}

const nombreStyle: CSSProperties = { fontSize: 16, fontWeight: 600, color: '#0f172a' }
const gamesStyle: CSSProperties = { fontSize: 12, color: '#64748b', marginTop: 2 }
const puntosStyle: CSSProperties = { fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'center' }
const botonesLado: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const btnPunto: CSSProperties = {
  background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8,
  width: 52, height: 44, fontSize: 18, fontWeight: 700, cursor: 'pointer',
}
const btnDeshacer: CSSProperties = {
  background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8,
  width: 52, height: 32, fontSize: 14, cursor: 'pointer',
}
const btnBack: CSSProperties = {
  background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '6px 12px', marginBottom: 14, cursor: 'pointer',
}
