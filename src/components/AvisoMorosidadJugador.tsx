'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'

const supabase = createClient()

/** Aviso de cuenta propio; RLS impide consultar avisos de otra persona. */
export default function AvisoMorosidadJugador({ clubId, jugadorId }: { clubId: string; jugadorId: string }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    try {
      const aviso = await cachedFetch<string | null>(`aviso-mora:${clubId}:${jugadorId}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from('retencion_alertas')
          .select('mensaje').eq('club_id', clubId).eq('jugador_id', jugadorId)
          .eq('tipo', 'deuda').is('resuelta_en', null).maybeSingle()
        if (error) throw new Error(error.message)
        return data?.mensaje ?? null
      }, 60_000, ['retencion_alertas'])
      setMensaje(aviso)
    } catch (error) {
      console.error('[aviso-morosidad]', error)
      setMensaje(null)
    }
  }, [clubId, jugadorId])
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['retencion_alertas'], clubId, () => { void cargar() }, { conClub: ['retencion_alertas'] })
  if (!mensaje) return null
  return <div role="status" style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 13 }}>{mensaje}</div>
}
