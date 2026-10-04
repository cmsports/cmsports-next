'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { cachedFetch, invalidarPorTabla } from '@/lib/query-cache'
import { fechaChile } from '@/lib/domain/fechaChile'
import { linkWhatsApp } from '@/lib/whatsapp'
import { activarRetencion, ejecutarRetencion, pausarRetencion } from '@/app/actions/retencion'
import { conAlgoQueHacer, mensajeFaltasApoderado, simular, type Cuota, type JugadorParaRevisar, type Marca } from '@/lib/domain/retencion'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { leerRetencionPaginada } from '@/lib/supabase/retencionPaginada'
import { configDelClub } from '@/lib/supabase/clubConfig'
import { useModulos } from '@/lib/hooks/useModulos'

const supabase = createClient()
const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12 } as const
const boton = { border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13 } as const
const TABLAS = ['jugadores', 'mensualidades', 'asistencia', 'movimientos', 'club_config', 'retencion_estado', 'retencion_control', 'retencion_alertas', 'retencion_eventos']
type Control = { preparacion_en: string; activado_en: string | null }
type Estado = { jugador_id: string; inactivo: boolean; bloqueado_por_mora: boolean; retirado_manual: boolean; actualizado_en: string }
type Evento = { jugador_id: string | null; tipo: string; fecha: string | null; ocurrido_en: string }
type Alerta = { jugador_id: string; tipo: 'deuda' | 'faltas'; mensaje: string }
type Jugador = { id: string; nombre: string; telefono: string | null; creado_en: string | null; estado: string }

export default function PanelRetencion({ clubId }: { clubId: string }) {
  const { tiene } = useModulos()
  const automaticoDisponible = tiene('retencion_automatica')
  const [config, setConfig] = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [jugadores, setJugadores] = useState<JugadorParaRevisar[]>([])
  const [contactos, setContactos] = useState<Map<string, Jugador>>(new Map())
  const [estados, setEstados] = useState<Estado[]>([])
  const [retiros, setRetiros] = useState<Map<string, string>>(new Map())
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [control, setControl] = useState<Control | null>(null)
  const [nombreClub, setNombreClub] = useState('el club')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [revision, setRevision] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState('')
  const [ahora, setAhora] = useState(() => Date.now())
  const hoy = fechaChile()

  const cargar = useCallback(async () => {
    setError('')
    try {
      const datos = await cachedFetch(`retencion-panel:${clubId}:${automaticoDisponible}:${hoy}`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any
        const [cfg, j, c, m, p, ingresos, club, ctl, est, avisos, eventos] = await Promise.all([
          configDelClub(clubId),
          leerRetencionPaginada((desde, hasta) => db.from('jugadores').select('id,nombre,telefono,estado,creado_en').eq('club_id', clubId).in('estado', ['activo', 'bloqueado']).or('es_externo.is.null,es_externo.eq.false').order('id').range(desde, hasta)),
          leerRetencionPaginada((desde, hasta) => db.from('mensualidades').select('jugador_id,mes,anio,estado,monto').eq('club_id', clubId).order('id').range(desde, hasta)),
          // Toda la historia: una ventana de 60 días perdería justamente a los inactivos.
          leerRetencionPaginada((desde, hasta) => db.from('asistencia').select('jugador_id,fecha,estado').eq('club_id', clubId).lte('fecha', hoy).order('id').range(desde, hasta)),
          leerRetencionPaginada((desde, hasta) => db.from('mensualidades').select('jugador_id,fecha_pago').eq('club_id', clubId).in('estado', ['pagado', 'pagada']).not('fecha_pago', 'is', null).lte('fecha_pago', hoy).order('id').range(desde, hasta)),
          leerRetencionPaginada((desde, hasta) => db.from('movimientos').select('jugador_id,fecha').eq('club_id', clubId).eq('tipo', 'ingreso').gt('monto', 0).not('jugador_id', 'is', null).lte('fecha', hoy).order('id').range(desde, hasta)),
          db.from('clubes').select('nombre').eq('id', clubId).single(),
          automaticoDisponible ? db.from('retencion_control').select('preparacion_en,activado_en').eq('club_id', clubId).maybeSingle() : Promise.resolve({ data: null }),
          automaticoDisponible ? db.from('retencion_estado').select('jugador_id,inactivo,bloqueado_por_mora,retirado_manual,actualizado_en').eq('club_id', clubId) : Promise.resolve({ data: [] }),
          automaticoDisponible ? db.from('retencion_alertas').select('jugador_id,tipo,mensaje').eq('club_id', clubId).is('resuelta_en', null) : Promise.resolve({ data: [] }),
          automaticoDisponible ? leerRetencionPaginada((desde, hasta) => db.from('retencion_eventos').select('jugador_id,tipo,fecha,ocurrido_en').eq('club_id', clubId).in('tipo', ['retiro', 'reingreso']).order('id').range(desde, hasta)) : Promise.resolve({ data: [], error: null }),
        ])
        for (const res of [j, c, m, p, ingresos, club, ctl, est, avisos, eventos]) if (res.error) throw new Error(res.error.message)
        return { cfg, j: j.data as Jugador[], c: c.data as (Cuota & { jugador_id: string })[], m: m.data as (Marca & { jugador_id: string })[], p: p.data as { jugador_id: string; fecha_pago: string }[], ingresos: ingresos.data as { jugador_id: string; fecha: string }[], nombre: club.data.nombre as string, control: ctl.data as Control | null, estados: est.data as Estado[], alertas: avisos.data as Alerta[], eventos: eventos.data as Evento[] }
      }, 60_000, TABLAS)
      const ultima = (fechas: (string | null | undefined)[]) => fechas.filter((f): f is string => Boolean(f)).map(f => f.slice(0, 10)).sort().at(-1) ?? null
      const jugadores = datos.j.map(j => ({ id: j.id, nombre: j.nombre, cuotas: datos.c.filter(c => c.jugador_id === j.id), marcas: datos.m.filter(m => m.jugador_id === j.id), ultimaAsistenciaISO: ultima([...datos.m.filter(m => m.jugador_id === j.id && m.estado === 'presente').map(m => m.fecha), j.creado_en ? fechaChile(new Date(j.creado_en)) : null, ...datos.eventos.filter(e => e.jugador_id === j.id && e.tipo === 'reingreso').map(e => e.fecha ?? fechaChile(new Date(e.ocurrido_en)))]), ultimoPagoISO: ultima([...datos.p.filter(p => p.jugador_id === j.id).map(p => p.fecha_pago), ...datos.ingresos.filter(p => p.jugador_id === j.id).map(p => p.fecha)]) }))
      const retiros = new Map<string, string>()
      for (const e of datos.eventos.filter(e => e.tipo === 'retiro' && e.jugador_id)) {
        const fecha = e.fecha ?? fechaChile(new Date(e.ocurrido_en))
        if (fecha > (retiros.get(e.jugador_id!) ?? '')) retiros.set(e.jugador_id!, fecha)
      }
      setRetiros(retiros)
      setConfig(() => datos.cfg)
      setJugadores(jugadores)
      setContactos(new Map(datos.j.map(j => [j.id, j])))
      setNombreClub(datos.nombre)
      setControl(datos.control)
      setEstados(datos.estados)
      setAlertas(datos.alertas)
      setAhora(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar la retención.')
    } finally { setCargando(false) }
  }, [automaticoDisponible, clubId, hoy])
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(TABLAS, clubId, () => { void cargar() }, { conClub: TABLAS })
  const propuestas = useMemo(() => conAlgoQueHacer(simular({ config, jugadores, hoyISO: hoy }).map(v => {
    const estado = estados.find(e => e.jugador_id === v.id)
    if (!estado?.retirado_manual) return v
    const jugador = jugadores.find(j => j.id === v.id)
    const ultimaSenal = [jugador?.ultimaAsistenciaISO, jugador?.ultimoPagoISO].filter(Boolean).sort().at(-1)
    const retiro = retiros.get(v.id) ?? fechaChile(new Date(estado.actualizado_en))
    const permaneceRetirado = !ultimaSenal || ultimaSenal <= retiro
    return { ...v, paraInactivar: permaneceRetirado, motivo: permaneceRetirado ? `${v.motivo === 'Al día' ? '' : v.motivo + ' · '}Retiro declarado en el padrón` : v.motivo }
  })), [config, jugadores, hoy, estados, retiros])
  const activo = Boolean(control?.activado_en) && config('retencion.automatismo') === 'si'
  const diasRevision = control ? Math.max(0, Math.floor((ahora - Date.parse(control.preparacion_en)) / 86400000)) : 0
  const operar = async (accion: 'ejecutar' | 'activar' | 'pausar') => {
    setOcupado(true); setError(''); setResultado('')
    try {
      const res = accion === 'activar' ? await activarRetencion(revision) : accion === 'pausar' ? await pausarRetencion() : await ejecutarRetencion()
      if ('error' in res && res.error) { setError(res.error); return }
      setResultado(accion === 'activar' ? 'Automatismo activado. Ejecuta la revisión para aplicar las reglas ahora.' : accion === 'pausar' ? 'Bloqueos e inactivación automática pausados.' : ('resultado' in res && res.resultado && typeof res.resultado === 'object' && 'cambios' in res.resultado ? `Revisión completa: ${res.resultado.cambios} cambios de estado. Avisos actualizados.` : 'Revisión completa.'))
      TABLAS.forEach(invalidarPorTabla)
      await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.') }
    finally { setOcupado(false) }
  }
  if (cargando) return <p>Revisando el padrón…</p>
  return <div style={{ color: '#0f172a' }}>
    <div style={card}>
      <strong>{activo ? 'Retención automática activa' : 'Revisión de retención'}</strong>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Aviso por deuda a los {config('morosidad.dias_aviso')} días · bloqueo desde {config('morosidad.dias_bloqueo')} días · alerta con {config('retencion.faltas_alerta')} faltas · inactividad a los {config('retencion.dias_inactivo')} días sin presencia ni pago. Los bloqueos manuales se conservan. Las faltas no bloquean.</p>
      {automaticoDisponible && control && <>
        <p style={{ fontSize: 13 }}>Revisión iniciada el {fechaChile(new Date(control.preparacion_en))}: {diasRevision} de 30 días mínimos. {activo ? 'Las reglas se ejecutan cada día.' : 'Hasta la activación solo se generan avisos; no se bloquea ni inactiva automáticamente.'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button style={boton} disabled={ocupado || Boolean(error)} onClick={() => void operar('ejecutar')}>{ocupado ? 'Procesando…' : activo ? 'Ejecutar reglas ahora' : 'Actualizar avisos'}</button>
          {activo ? <button style={boton} disabled={ocupado} onClick={() => void operar('pausar')}>Pausar automatismo</button> : <>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={revision} onChange={e => setRevision(e.target.checked)} /> Revisé el padrón, las cuotas y el vencimiento; no hay falsos positivos.</label>
            <button style={boton} disabled={ocupado || !revision || diasRevision < 30 || Boolean(error)} onClick={() => void operar('activar')}>Activar bloqueos e inactivación</button>
          </>}
        </div>
      </>}
      <p style={{ color: '#64748b', fontSize: 12 }}>Los avisos quedan en la aplicación. El botón de WhatsApp abre un mensaje para enviarlo manualmente.</p>
    </div>
    {error && <div role="alert" style={{ ...card, color: '#b91c1c' }}>{error}<button style={{ ...boton, marginLeft: 10 }} onClick={() => void cargar()}>Reintentar</button></div>}
    {resultado && <div role="status" style={{ ...card, color: '#15803d' }}>{resultado}</div>}
    {estados.some(e => e.inactivo || e.bloqueado_por_mora) && <div style={card}><strong>Estados registrados</strong>{estados.filter(e => e.inactivo || e.bloqueado_por_mora).map(e => <p key={e.jugador_id} style={{ fontSize: 13 }}>{contactos.get(e.jugador_id)?.nombre ?? 'Jugador'}: {[e.inactivo && 'Inactivo', e.bloqueado_por_mora && 'Bloqueado por mora'].filter(Boolean).join(' · ')}</p>)}</div>}
    {alertas.length > 0 && <div style={card}><strong>Avisos abiertos ({alertas.length})</strong>{alertas.map(a => <p key={`${a.jugador_id}:${a.tipo}`} style={{ fontSize: 13 }}>{contactos.get(a.jugador_id)?.nombre ?? 'Jugador'}: {a.mensaje}</p>)}</div>}
    <h3 style={{ fontSize: 15 }}>Vista previa con las cuotas y asistencias de hoy</h3>
    {propuestas.length === 0 ? <div style={card}>Ningún jugador requiere un aviso o cambio según los umbrales actuales.</div> : propuestas.map(v => {
      const waFaltas = v.alertaPorFaltas ? linkWhatsApp(contactos.get(v.id)?.telefono, mensajeFaltasApoderado({ nombreAlumno: v.nombre, nombreClub })) : null
      const waDeuda = v.diasMora > 0 ? linkWhatsApp(contactos.get(v.id)?.telefono, `Hola, te escribimos de ${nombreClub}. Tu mensualidad lleva ${v.diasMora} días de atraso. Contacta a administración para regularizar tu cuenta.`) : null
      return <div key={v.id} style={card}>
        <strong style={{ fontSize: 14 }}>{v.nombre}</strong>
        <p style={{ fontSize: 13, color: '#64748b' }}>{v.motivo}{v.deuda > 0 ? ` · Deuda: $${v.deuda.toLocaleString('es-CL')}` : ''}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{waFaltas && <a href={waFaltas} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Escribir al apoderado por faltas</a>}{waDeuda && <a href={waDeuda} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Escribir por mensualidad</a>}</div>
      </div>
    })}
  </div>
}
