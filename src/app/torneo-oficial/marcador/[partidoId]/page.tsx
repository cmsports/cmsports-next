'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
import {
  guardarMarcadorLocal,
  limpiarMarcadorLocal,
  mergeEstadoMarcador,
} from '@/lib/marcador-oficial-persist'
import MarcadorPantalla from '@/components/marcador/MarcadorPantalla'
import type { SetMarcador } from '@/lib/domain/oficial-ittf'
import { cargarOficialConCache } from '@/lib/torneo-oficial/carga-cliente'

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
  const cargadoRef = useRef(false)
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  type DatosMarcador = {
    partido: PartidoRow | null
    evento: EventoRow | null
    nombreA: string
    nombreB: string
    estadoInicial: EstadoMarcador
  }

  function estadoDesdePartido(p: { ganador_id: string | null; sets: SetMarcador[] }): EstadoMarcador {
    if (p.ganador_id) {
      return { ...estadoInicial(), finalizado: true, historial_sets: (p.sets || []) as Array<[number, number]> }
    }
    if (p.sets?.length) {
      const sets = p.sets
      let games_a = 0
      let games_b = 0
      for (const [pa, pb] of sets) {
        if (pa > pb) games_a++
        else if (pb > pa) games_b++
      }
      return {
        puntos_a: 0,
        puntos_b: 0,
        games_a,
        games_b,
        juego_actual: sets.length + 1,
        historial_sets: sets,
        ganador_lado: null,
        finalizado: false,
      }
    }
    return estadoInicial()
  }

  const aplicarDatos = useCallback((d: DatosMarcador, silencioso: boolean) => {
    setPartido(d.partido)
    setEvento(d.evento)
    setNombreA(d.nombreA)
    setNombreB(d.nombreB)
    const cerrado = Boolean(d.partido?.ganador_id)
    const merged = d.partido
      ? mergeEstadoMarcador(partidoId, d.estadoInicial, cerrado)
      : d.estadoInicial
    if (!silencioso || cerrado) {
      setEstado(merged)
    } else if (!estadoRef.current.finalizado) {
      const localActivo = merged.puntos_a > 0 || merged.puntos_b > 0
        || merged.historial_sets.length > estadoRef.current.historial_sets.length
      if (localActivo) setEstado(merged)
    }
    cargadoRef.current = true
  }, [partidoId])

  const cargar = useCallback(async (silencioso = false) => {
    if (!perfil?.club_id) return

    await cargarOficialConCache(
      `oficial:marcador:${partidoId}:${perfil.club_id}`,
      async (): Promise<DatosMarcador> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any

        const { data: p } = await db.from('oficial_partidos')
          .select('id,evento_id,inscrito_a_id,inscrito_b_id,ganador_id,sets')
          .eq('id', partidoId).eq('club_id', perfil.club_id).maybeSingle()
        if (!p) {
          return { partido: null, evento: null, nombreA: 'Jugador A', nombreB: 'Jugador B', estadoInicial: estadoInicial() }
        }

        const partidoRow = { ...p, sets: (p.sets || []) as SetMarcador[] }

        const { data: ev } = await db.from('oficial_eventos')
          .select('formato_partido,nombre').eq('id', p.evento_id).maybeSingle()

        let nombreA = 'Jugador A'
        let nombreB = 'Jugador B'
        const ids = [p.inscrito_a_id, p.inscrito_b_id].filter(Boolean) as string[]
        if (ids.length) {
          const { data: ins } = await db.from('oficial_inscritos').select('id,nombre,asociacion').in('id', ids)
          const map = new Map<string, string>((ins || []).map((i: { id: string; nombre: string; asociacion: string | null }) => [
            i.id,
            i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre,
          ] as [string, string]))
          if (p.inscrito_a_id) nombreA = map.get(p.inscrito_a_id) || nombreA
          if (p.inscrito_b_id) nombreB = map.get(p.inscrito_b_id) || nombreB
        }

        return {
          partido: partidoRow,
          evento: ev,
          nombreA,
          nombreB,
          estadoInicial: estadoDesdePartido(partidoRow),
        }
      },
      {
        tablas: ['oficial_partidos', 'oficial_eventos', 'oficial_inscritos'],
        silencioso,
        aplicar: (d) => aplicarDatos(d, silencioso),
        setLoading,
        tieneDatos: () => cargadoRef.current,
      },
    )
  }, [partidoId, perfil?.club_id, aplicarDatos])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    void cargar()
  }, [authLoading, perfil, cargar, router])

  useEnVivo(
    ['oficial_partidos'],
    perfil?.club_id ?? null,
    () => { void cargar(true) },
    { conClub: ['oficial_partidos'] },
  )

  useEffect(() => {
    if (!partido?.ganador_id) {
      guardarMarcadorLocal(partidoId, estado)
    }
  }, [estado, partidoId, partido?.ganador_id])

  const formato: FormatoPartido = evento?.formato_partido || 'bo5'
  const cerrado = Boolean(partido?.ganador_id)

  async function syncSets(nuevo: EstadoMarcador) {
    if (cerrado) return
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
    guardarMarcadorLocal(partidoId, nuevo)
    if (nuevo.historial_sets.length > prevSets) void syncSets(nuevo)
    if (nuevo.finalizado && nuevo.ganador_lado) void finalizar(nuevo)
  }

  async function deshacer(lado: Lado) {
    if (cerrado || estado.finalizado) return
    const prevLen = estado.historial_sets.length
    const nuevo = deshacerPunto(estado, lado)
    if (!nuevo) return
    setEstado(nuevo)
    guardarMarcadorLocal(partidoId, nuevo)
    if (nuevo.historial_sets.length !== prevLen) void syncSets(nuevo)
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
    limpiarMarcadorLocal(partidoId)
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

        {loading && !partido ? (
          <p style={{ color: '#94a3b8' }}>Cargando marcador…</p>
        ) : !partido ? (
          <p style={{ color: '#e11d48' }}>Partido no encontrado</p>
        ) : (
          <>
            {errorMsg && (
              <p style={{ color: '#e11d48', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{errorMsg}</p>
            )}

            <MarcadorPantalla
              nombreA={nombreA}
              nombreB={nombreB}
              estado={estado}
              formato={formato}
              cerrado={cerrado}
              cerrando={cerrando}
              onPunto={(lado) => void punto(lado)}
              onDeshacer={(lado) => void deshacer(lado)}
              subtitulo={evento?.nombre}
            />
          </>
        )}
      </div>
    </AppLayout>
  )
}

const btnBack: CSSProperties = {
  background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '6px 12px', marginBottom: 14, cursor: 'pointer',
}
