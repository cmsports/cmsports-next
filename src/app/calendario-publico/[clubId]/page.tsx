'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'
import { fechaChile } from '@/lib/domain/fechaChile'
import { rangoMesCalendario } from '@/lib/domain/calendarioIntegrado'
import { useEnVivo } from '@/lib/useEnVivo'
import { esUuid } from '@/lib/domain/uuid'

type EventoPublico = { id: string; titulo: string; tipo: string; fecha: string; hora_inicio: string | null; hora_fin: string | null; lugar: string }
const tablas = ['calendario_actividades','ligas','liga_fechas','liga_fecha_sesiones','liga_divisiones']
export default function CalendarioPublicoPage() {
  const params = useParams()
  const clubId = String(params.clubId ?? '')
  const [mes,setMes] = useState(fechaChile().slice(0,7))
  const [eventos,setEventos] = useState<EventoPublico[]>([])
  const [error,setError] = useState('')
  const carga = useRef(0)
  const cargar = useCallback(async () => {
    const generacion = ++carga.current
    if (!esUuid(clubId)) { setError('Calendario no disponible'); return }
    try {
      const datos = await cachedFetch(`calendario-publico:${clubId}:${mes}`,async () => {
        const { desde,hasta } = rangoMesCalendario(mes)
        const { data,error: e } = await createClient().rpc('calendario_publico',{p_club:clubId,p_desde:desde,p_hasta:hasta})
        if(e) throw new Error('No fue posible cargar el calendario')
        return (data ?? []) as EventoPublico[]
      },15_000,tablas)
      if (generacion !== carga.current) return
      setEventos(datos.sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))); setError('')
    } catch(e) { if (generacion !== carga.current) return; setError(e instanceof Error ? e.message : 'No fue posible cargar el calendario') }
  },[clubId,mes])
  useEffect(() => { const control = carga; void Promise.resolve().then(cargar); const timer=setInterval(cargar,30_000); return () => { control.current++; clearInterval(timer) } },[cargar])
  // Los visitantes no tienen permisos sobre las tablas privadas; la RPC sirve
  // exclusivamente la proyección pública. El intervalo renueva también anon.
  useEnVivo(tablas,esUuid(clubId) ? clubId : null,cargar,{conClub:['calendario_actividades','ligas']})
  return <main style={{maxWidth:760,margin:'30px auto',padding:20,color:'#0f172a'}}>
    <h1>Calendario público</h1><p>Actividades publicadas y jornadas de liga.</p>
    <label>Mes <input type="month" value={mes} onChange={e => { if(e.target.value) { setMes(e.target.value); setEventos([]) } }} style={{padding:8,marginBottom:20}}/></label>
    {error && <p role="alert">{error}</p>}
    {!error && !eventos.length && <p>No hay actividades públicas disponibles en este mes.</p>}
    {eventos.map(e => <article key={e.id} style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12,marginBottom:12}}><strong>{e.titulo}</strong><p>{e.fecha}{e.hora_inicio ? ` · ${e.hora_inicio.slice(0,5)}${e.hora_fin ? `–${e.hora_fin.slice(0,5)}` : ''}` : ''}{e.lugar ? ` · ${e.lugar}` : ''}</p></article>)}
  </main>
}
