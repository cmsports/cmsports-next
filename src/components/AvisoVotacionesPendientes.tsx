'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { votacionesPendientes } from '@/lib/domain/votaciones'

// Los tipos generados todavía no conocen las tablas de la migración 303.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient() as any

type VotacionCorta = { id: string; titulo: string; estado: string }

/**
 * Votaciones abiertas en las que el alumno está habilitado y todavía no vota.
 * El RLS le entrega solo las suyas y solo su propio voto, así que no hace falta
 * filtrar por jugador acá. Los votos no están en realtime (voto secreto): se
 * vuelven a pedir en cada carga, que es lo que pasa al volver de votar.
 */
export default function AvisoVotacionesPendientes({ clubId }: { clubId: string }) {
  const [pendientes, setPendientes] = useState<VotacionCorta[]>([])

  const cargar = useCallback(async () => {
    try {
      const votaciones = await cachedFetch<VotacionCorta[]>(`votaciones-alumno:${clubId}`, async () => {
        const { data, error } = await db.from('votaciones').select('id,titulo,estado')
          .eq('club_id', clubId).eq('estado', 'abierta').order('creado_en', { ascending: false })
        if (error) throw new Error(error.message)
        return (data ?? []) as VotacionCorta[]
      }, 60_000, ['votaciones'])
      const { data: votos, error } = await db.from('votacion_votos').select('votacion_id')
      if (error) throw new Error(error.message)
      const votadas = new Set(((votos ?? []) as { votacion_id: string }[]).map(v => v.votacion_id))
      setPendientes(votacionesPendientes(votaciones, votadas))
    } catch (error) {
      console.error('[votaciones-pendientes]', error)
      setPendientes([])
    }
  }, [clubId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['votaciones'], clubId, () => { void cargar() }, { conClub: ['votaciones'] })

  if (pendientes.length === 0) return null
  const una = pendientes.length === 1

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#3730a3' }}>
          🗳️ {una ? 'Tienes una votación pendiente' : `Tienes ${pendientes.length} votaciones pendientes`}
        </div>
        <div style={{ fontSize: 12, color: '#4338ca', marginTop: 2 }}>
          {pendientes.map(v => v.titulo).join(' · ')}
        </div>
      </div>
      <Link href="/votaciones" style={{ background: '#4f46e5', color: '#fff', borderRadius: 8, padding: '8px 16px',
        fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
        Votar
      </Link>
    </div>
  )
}
