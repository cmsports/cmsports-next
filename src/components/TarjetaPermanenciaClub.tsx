'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch, invalidarPorTabla } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { fechaChile } from '@/lib/domain/fechaChile'
import { movimientosDelPadronDelMes, type EventoPermanencia } from '@/lib/domain/altasBajas'
import { registrarPermanencia } from '@/app/actions/permanencia'
import { configDelClub } from '@/lib/supabase/clubConfig'

type Jugador = { id: string; nombre: string }
type Evento = EventoPermanencia & { id: string; motivo: string; registradoEn: string }
type Datos = { jugadores: Jugador[]; eventos: Evento[]; diasInactivo: number }
const etiquetas: Record<EventoPermanencia['tipo'], string> = {
  alta: 'Alta', inactivo: 'Baja por inactividad', retiro: 'Retiro declarado',
  reingreso: 'Reingreso', bloqueo_mora: 'Bloqueo por deuda', desbloqueo_mora: 'Desbloqueo',
}

export default function TarjetaPermanenciaClub({ clubId }: { clubId: string | null | undefined }) {
  const { perfil } = usePerfil()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [detalle, setDetalle] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [jugadorId, setJugadorId] = useState('')
  const [tipo, setTipo] = useState<'retiro' | 'reingreso'>('retiro')
  const [fecha, setFecha] = useState(fechaChile())
  const [motivo, setMotivo] = useState('')
  const hoy = fechaChile()
  const mes = { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }

  const cargar = useCallback(async () => {
    if (!clubId) return
    try {
      const nuevos = await cachedFetch<Datos>(`permanencia:${clubId}`, async () => {
        // Las tablas nuevas se habilitan mediante el módulo; los demás clubes
        // conservan la tarjeta original y no hacen estas consultas.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createClient() as any
        const { data: jugadores, error: eJugadores } = await db.from('jugadores')
          .select('id,nombre').eq('club_id', clubId)
          .or('es_externo.is.null,es_externo.eq.false').order('nombre')
        if (eJugadores) throw new Error(eJugadores.message)
        const eventos: Evento[] = []
        // Paginación: un club con más de 1.000 eventos no pierde movimientos.
        for (let pagina = 0; ; pagina++) {
          const { data, error: eEventos } = await db.from('retencion_eventos')
            .select('id,jugador_id,tipo,fecha,ocurrido_en,motivo').eq('club_id', clubId)
            .order('ocurrido_en', { ascending: false }).order('id')
            .range(pagina * 1000, pagina * 1000 + 999)
          if (eEventos) throw new Error(eEventos.message)
          for (const r of data ?? []) eventos.push({
            id: r.id, jugadorId: r.jugador_id, tipo: r.tipo,
            fecha: r.fecha ?? fechaChile(new Date(r.ocurrido_en)),
            registradoEn: r.ocurrido_en, motivo: r.motivo,
          })
          if ((data ?? []).length < 1000) break
        }
        const config = await configDelClub(clubId)
        return { jugadores: jugadores ?? [], eventos, diasInactivo: config('retencion.dias_inactivo') }
      }, 60_000, ['jugadores', 'retencion_eventos', 'retencion_estado', 'club_config'])
      setDatos(nuevos)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
    }
  }, [clubId])
  useEffect(() => { const id = setTimeout(() => { void cargar() }, 0); return () => clearTimeout(id) }, [cargar])
  useEnVivo(['jugadores', 'retencion_eventos', 'retencion_estado', 'club_config'], clubId ?? '', () => { void cargar() })
  const resumen = movimientosDelPadronDelMes(datos?.eventos ?? [], mes)
  const nombres = new Map(datos?.jugadores.map(j => [j.id, j.nombre]) ?? [])
  const historial = (datos?.eventos ?? []).filter(e => ['alta', 'retiro', 'inactivo', 'reingreso'].includes(e.tipo))
  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    setGuardando(true)
    setMensaje('')
    try {
      const resultado = await registrarPermanencia({ jugadorId, tipo, fecha, motivo })
      if (resultado.error) { setMensaje(resultado.error); return }
      invalidarPorTabla('retencion_eventos')
      invalidarPorTabla('retencion_estado')
      setMotivo('')
      setMensaje('Movimiento registrado en el historial')
      await cargar()
    } catch {
      setMensaje('No se pudo registrar el movimiento. Intenta nuevamente.')
    } finally {
      setGuardando(false)
    }
  }
  if (!datos && !error) return null
  const input = { border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, width: '100%', background: '#fff', color: '#0f172a', fontSize: 12 } as const
  return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, color: '#0f172a', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
    <div style={{ fontSize: 12, color: '#64748b' }}>Altas y bajas del club · {hoy.slice(0, 7)}</div>
    <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 12px', color: resumen.neto < 0 ? '#dc2626' : '#16a34a' }}>
      {error ? '—' : `${resumen.neto > 0 ? '+' : ''}${resumen.neto}`} <span style={{ fontSize: 12, color: '#64748b' }}>neto</span>
    </div>
    <div style={{ display: 'flex', gap: 16, borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
      {[{ n: resumen.altas, label: 'altas' }, { n: resumen.bajas, label: 'bajas' }, { n: resumen.reingresos, label: 'reingresos' }].map(c => <div key={c.label}>
        <strong style={{ fontSize: 17 }}>{error ? '—' : c.n}</strong><div style={{ fontSize: 11, color: '#64748b' }}>{c.label}</div>
      </div>)}
    </div>
    <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
      Alta: nuevo jugador del club. Baja: retiro declarado{datos && datos.diasInactivo > 0 ? ` o ${datos.diasInactivo} días sin asistencia presente ni pago, con automatización activada` : ' o inactividad registrada por retención'}.
      Reingreso: vuelta después de una baja. Cambiar de bloque o bloquear por deuda no cuenta como baja.
      Cada transición cuenta; el historial comienza al activar el indicador y no reconstruye bajas anteriores.
    </p>
    {error && <p role="alert" style={{ color: '#dc2626', fontSize: 12 }}>No se pudo cargar: {error} <button onClick={() => { void cargar() }}>Reintentar</button></p>}
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
      <button type="button" onClick={() => setDetalle(!detalle)} aria-expanded={detalle} style={{ color: '#4f46e5', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {detalle ? 'Cerrar historial' : 'Historial y retiro/reingreso'}
      </button>
      <Link href="/finanzas?tab=retencion" style={{ color: '#4f46e5', textDecoration: 'none' }}>Ver retención →</Link>
    </div>
    {detalle && <div style={{ marginTop: 14 }}>
      {perfil?.rol === 'admin' && <form onSubmit={guardar} style={{ display: 'grid', gap: 8 }}>
        <label style={{ fontSize: 12 }}>Jugador<select value={jugadorId} onChange={e => setJugadorId(e.target.value)} required style={input}>
          <option value="">Selecciona un jugador</option>{datos?.jugadores.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select></label>
        <label style={{ fontSize: 12 }}>Movimiento<select value={tipo} onChange={e => setTipo(e.target.value as 'retiro' | 'reingreso')} style={input}>
          <option value="retiro">Retiro declarado</option><option value="reingreso">Reingreso declarado</option>
        </select></label>
        <label style={{ fontSize: 12 }}>Fecha del movimiento<input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} required style={input} /></label>
        <label style={{ fontSize: 12 }}>Motivo<textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500} required style={input} /></label>
        <button type="submit" disabled={guardando || !!error} style={{ ...input, background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>{guardando ? 'Registrando…' : 'Registrar movimiento'}</button>
        {mensaje && <p role="status" style={{ fontSize: 12, margin: 0 }}>{mensaje}</p>}
      </form>}
      <p style={{ fontSize: 11, color: '#64748b' }}>Últimos 30 movimientos de permanencia ({historial.length} registrados).</p>
      <ul style={{ paddingLeft: 16, fontSize: 11, lineHeight: 1.6 }}>
        {historial.slice(0, 30).map(e => <li key={e.id}>{e.fecha} · {nombres.get(e.jugadorId ?? '') ?? 'Ficha eliminada'} · {etiquetas[e.tipo]}<br /><span style={{ color: '#64748b' }}>{e.motivo}</span></li>)}
      </ul>
      {historial.length === 0 && <p style={{ color: '#64748b', fontSize: 12 }}>Aún no hay movimientos registrados. Los jugadores existentes no se cuentan como altas nuevas.</p>}
    </div>}
  </div>
}
