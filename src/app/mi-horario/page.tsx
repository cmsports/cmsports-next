'use client'

// Los grupos en los que entrena el jugador. Nada más.
//
// A propósito no muestra compañeros, cupos ni los demás grupos del club: solo
// dónde y cuándo le toca ir. La base lo respalda desde la 101, así que esto no
// es una pantalla que esconde datos sino una que ya no los recibe.
//
// Se arma desde `bloque_jugadores`, que es la fuente de verdad: si el profe le
// cambia el grupo desde Jugadores, acá cambia solo.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useModulos } from '@/lib/hooks/useModulos'
import PanelRecuperarClases from '@/components/PanelRecuperarClases'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { DIAS, diaLabel, diaSemanaDeFecha, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type MiBloque = {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
}

export default function MiHorarioPage() {
  const { perfil, loading } = usePerfil()
  const { tiene } = useModulos()
  const router = useRouter()
  const [bloques, setBloques]   = useState<MiBloque[]>([])
  const [cargando, setCargando] = useState(true)

  const jugadorId = perfil?.jugador_id ?? null
  const clubId    = perfil?.club_id ?? null
  const hoy       = fechaChile()

  const cargar = useCallback(async () => {
    if (!jugadorId) { setCargando(false); return }
    // Solo las inscripciones abiertas: las cerradas son grupos de los que ya
    // salió y no le sirven para saber a dónde ir hoy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('bloque_jugadores')
      .select('bloques_horario(id,nombre,sede,dia_semana,hora_inicio,hora_fin,vigente_desde,vigente_hasta)')
      .eq('jugador_id', jugadorId)
      .is('vigente_hasta', null)

    const suyos = ((data ?? []) as { bloques_horario: (MiBloque & { vigente_desde: string; vigente_hasta: string | null }) | null }[])
      .map(r => r.bloques_horario)
      .filter((b): b is MiBloque & { vigente_desde: string; vigente_hasta: string | null } =>
        !!b && b.vigente_desde <= hoy && (b.vigente_hasta === null || b.vigente_hasta >= hoy))

    // Sin duplicados y ordenados por día y hora, que es como se lee un horario.
    const unicos = new Map<string, MiBloque>()
    for (const b of suyos) unicos.set(b.id, b)
    const orden = DIAS.map(d => d.value)
    setBloques([...unicos.values()].sort((a, b) => {
      const d = orden.indexOf(a.dia_semana as typeof orden[number]) - orden.indexOf(b.dia_semana as typeof orden[number])
      return d !== 0 ? d : a.hora_inicio.localeCompare(b.hora_inicio)
    }))
    setCargando(false)
  }, [jugadorId, hoy])

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.replace('/login'); return }
    void cargar()
  }, [cargar, loading, perfil, router])

  // Si el profe le cambia el grupo, se ve sin recargar la página.
  //
  // `bloques_horario` se filtra por club: hay cuatro clubes en la misma base y
  // sin el filtro un cambio de horario en cualquiera recargaba esta pantalla.
  // `bloque_jugadores` no tiene columna de club —cuelga del bloque—, así que no
  // se puede filtrar ahí; lo acota el RLS, que ya solo le deja ver las suyas.
  useEnVivo(['bloque_jugadores', 'bloques_horario'], clubId, cargar, { conClub: ['bloques_horario'] })

  if (loading || !perfil) return null

  const diaDeHoy = diaSemanaDeFecha(hoy)

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>Mi horario</h1>
      <p style={{ fontSize: 12, color: hint, marginTop: 2, marginBottom: 18 }}>
        Los grupos en los que entrenás. Lo define el profe: si te cambia de grupo, acá se actualiza solo.
      </p>

      {cargando ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
      ) : bloques.length === 0 ? (
        <div style={{ ...card, padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🗓️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 4 }}>
            Todavía no tienes grupo asignado
          </div>
          <div style={{ fontSize: 12, color: muted }}>
            Hablalo con el profe y te agrega al horario que te corresponda.
          </div>
        </div>
      ) : (
        <div className="anim-lista" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {bloques.map(b => {
            const esHoy = b.dia_semana === diaDeHoy
            return (
              <div key={b.id} style={{ ...card, padding: 16, position: 'relative',
                border: esHoy ? '2px solid #4f46e5' : '1px solid #e2e8f0' }}>
                {esHoy && (
                  <span style={{ position: 'absolute', top: 12, right: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
                    HOY
                  </span>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {diaLabel(b.dia_semana)}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: text, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {rangoHorario(b.hora_inicio, b.hora_fin)}
                </div>
                <div style={{ fontSize: 13, color: text, marginTop: 8, fontWeight: 600 }}>{b.nombre}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>📍 {sedeLabel(b.sede)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Avisar que no va y ver dónde recuperar. Va detrás de su propio módulo:
          la mayoría de los clubes no quiere que el alumno toque su horario. */}
      {tiene('recuperar_clases') && jugadorId && clubId && (
        <div style={{ marginTop: 26 }}>
          <PanelRecuperarClases clubId={clubId} jugadorId={jugadorId} nombre={perfil.nombre ?? 'un jugador'} />
        </div>
      )}
    </AppLayout>
  )
}
