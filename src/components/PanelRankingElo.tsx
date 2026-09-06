'use client'

// Índice de fuerza (Elo), arriba del ranking por puestos.
//
// ── Por qué son dos rankings y no uno ──────────────────────────────────────
//
// El de abajo premia el PUESTO alcanzado en un torneo: 100 al campeón, 90 al
// finalista. Este mide fuerza partido a partido contra la del rival. Ganarle al
// mejor del club en un entrenamiento sube mucho acá y cero allá abajo, y eso es
// la función de tener los dos — no una inconsistencia que haya que arreglar.
//
// Va como panel aparte y no como otra pestaña de la página: las pestañas de
// abajo son categorías —U15, adultos—, que es otro eje. Meter "Elo" entre ellas
// haría que se lea como una categoría más.
//
// ── El botón de actualizar no es un parche ─────────────────────────────────
//
// El marcador escribe directo desde el navegador, sin pasar por el servidor, así
// que no hay dónde enganchar "y ahora actualizá el Elo". El porqué completo está
// en `actions/elo.ts` y en la migración 260. Reprocesar es inofensivo: un
// partido ya contado choca contra el UNIQUE y no entra dos veces.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { procesarEloPendientes } from '@/app/actions/elo'

const supabase = createClient()

const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const card = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
  boxShadow: '0 4px 16px rgba(15,23,42,0.18)', marginBottom: 18,
} as const

type Fila = { jugadorId: string; nombre: string; elo: number; partidos: number }

export default function PanelRankingElo({ clubId, esStaff, jugadorId }: {
  clubId: string | null | undefined
  esStaff: boolean
  /** El del usuario, para resaltarle su fila. */
  jugadorId?: string | null
}) {
  const [filas, setFilas]           = useState<Fila[]>([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')
  const [actualizando, setActual]   = useState(false)
  const [aviso, setAviso]           = useState('')

  const cargar = useCallback(async () => {
    if (!clubId) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data, error: err } = await (supabase as any)
      .from('ranking_elo')
      .select('jugador_id, elo, partidos, jugadores!inner(nombre, estado)')
      .eq('club_id', clubId)
      .order('elo', { ascending: false })

    // Una lectura que falla devuelve `data` en null, que se vería igual que
    // "todavía nadie tiene índice". Sin esta rama, un problema de permisos se
    // lee como un club que no jugó nunca.
    if (err) { setError('No se pudo cargar el índice: ' + err.message); setCargando(false); return }

    setError('')
    setFilas((data ?? [])
      // Al que se dio de baja no se lo muestra en la tabla, pero su historial
      // NO se borra: si vuelve, su índice sigue siendo el suyo.
      .filter((r: any) => r.jugadores?.estado === 'activo')
      .map((r: any): Fila => ({
        jugadorId: r.jugador_id,
        nombre: r.jugadores?.nombre ?? '—',
        elo: r.elo,
        partidos: r.partidos,
      })))
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['ranking_elo'], clubId ?? '', () => { void cargar() })

  async function actualizar() {
    if (actualizando) return           // el doble clic no dispara dos pasadas
    setActual(true)
    setAviso('')
    const res = await procesarEloPendientes()
    setActual(false)

    if (res?.error) { setError(String(res.error)); return }
    setError('')
    const n = (res as { procesados?: number })?.procesados ?? 0
    setAviso(n === 0
      ? 'No había partidos nuevos que contar.'
      : `${n} partido${n === 1 ? '' : 's'} contado${n === 1 ? '' : 's'}.`)
    await cargar()
  }

  const promedio = useMemo(
    () => filas.length ? Math.round(filas.reduce((s, f) => s + f.elo, 0) / filas.length) : null,
    [filas],
  )

  if (cargando) return null

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 8px', flexWrap: 'wrap' }}>
        <TrendingUp size={16} color="#4f46e5" />
        <span style={{ fontSize: 15, fontWeight: 700, color: text }}>Índice de fuerza</span>
        {promedio !== null && (
          <span style={{ fontSize: 10.5, color: hint, background: '#f1f5f9', borderRadius: 20, padding: '2px 8px' }}>
            promedio {promedio}
          </span>
        )}
        {esStaff && (
          <button onClick={actualizar} disabled={actualizando} style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '6px 12px', fontSize: 12, color: '#4f46e5',
            cursor: actualizando ? 'wait' : 'pointer', minHeight: 34,
          }}>
            <RefreshCw size={13} />
            {actualizando ? 'Contando…' : 'Actualizar'}
          </button>
        )}
      </div>

      <div style={{ padding: '0 20px 16px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
          Mide fuerza contra la del rival, partido a partido. Es distinto del ranking
          de abajo, que premia el puesto alcanzado en torneos.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {aviso && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
            {aviso}
          </div>
        )}

        {filas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: hint, lineHeight: 1.6 }}>
            Todavía sin índice. Se calcula con los partidos finalizados en{' '}
            <Link href="/tecnico/marcador" style={{ color: '#4f46e5', textDecoration: 'none' }}>el marcador</Link>
            {esStaff && ' — cuando haya alguno, apretá Actualizar'}.
          </div>
        ) : (
          <div>
            {filas.map((f, i) => {
              const soyYo = !!jugadorId && f.jugadorId === jugadorId
              return (
                <div key={f.jugadorId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8, minHeight: 40,
                  background: soyYo ? '#f5f3ff' : 'transparent',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontSize: 11, color: hint, width: 22, fontVariantNumeric: 'tabular-nums' }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: soyYo ? 700 : 500,
                    color: soyYo ? '#5b21b6' : text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.nombre}
                  </span>
                  <span style={{ fontSize: 11, color: hint, fontVariantNumeric: 'tabular-nums' }}>
                    {f.partidos} pj
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: text, fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>
                    {f.elo}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
