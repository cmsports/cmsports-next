'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch, invalidarPorTabla } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { TIPOS_ACTIVIDAD, clasesDelMes, partidosPropiosDelMes, rangoMesCalendario, sumarDiasCalendario, type ActividadCalendario, type InscripcionCalendario, type ItemCalendario, type PartidoCalendario } from '@/lib/domain/calendarioIntegrado'
import { esUuid } from '@/lib/domain/uuid'
import type { Perfil } from '@/types'
import styles from './CalendarioIntegrado.module.css'
import { eliminarActividadCalendario } from '@/app/actions/calendario'

const supabase = createClient()
const TABLAS = ['calendario_actividades','calendario_nomina','ligas','liga_fechas','liga_fecha_sesiones','liga_divisiones','liga_partidos','liga_mesas','bloque_jugadores','bloques_horario','eventos','torneos','jugadores']
const CON_CLUB = ['calendario_actividades','calendario_nomina','ligas','bloques_horario','eventos','torneos','jugadores']
const etiquetas: Record<string,string> = { externo: 'Torneo externo', clinica: 'Clínica', campamento: 'Campamento', reunion: 'Reunión', suspension: 'Suspensión', feriado: 'Feriado', otro: 'Otro', clase: 'Mi clase', liga_tdm: 'Liga de tenis de mesa', torneo: 'Torneo', entrenamiento: 'Entrenamiento', pago: 'Pago' }
const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const colores: Record<string, string> = { clase: '#f43f5e', entrenamiento: '#16a34a', torneo: '#4f46e5', externo: '#4f46e5', liga_tdm: '#059669', feriado: '#dc2626', suspension: '#dc2626', pago: '#d97706', clinica: '#0284c7', campamento: '#0284c7', reunion: '#d97706', otro: '#64748b' }
const vacio = () => ({ titulo: '', tipo: 'externo', fecha: fechaChile(), hora_inicio: '', hora_fin: '', lugar: '', descripcion: '', publico: false })
type Datos = { actividades: ActividadCalendario[]; items: ItemCalendario[]; jugadores: { id: string; nombre: string }[]; nomina: { actividad_id: string; jugador_id: string }[] }
type FechaLiga = { id: string; numero: number; fecha: string | null; liga_id: string; ligas: { nombre: string; hora_inicio: string; hora_fin: string }; liga_fecha_sesiones: { division_id: string; dia_offset: number; liga_divisiones: { nombre: string } }[] }

export default function CalendarioIntegrado({ perfil }: { perfil: Perfil }) {
  const searchParams = useSearchParams()
  const fechaEnlace = searchParams.get('fecha')
  const fechaInicial = fechaEnlace && /^\d{4}-\d{2}-\d{2}$/.test(fechaEnlace) && !Number.isNaN(new Date(`${fechaEnlace}T12:00:00Z`).getTime()) && new Date(`${fechaEnlace}T12:00:00Z`).toISOString().slice(0,10) === fechaEnlace ? fechaEnlace : ''
  const [mes, setMes] = useState((fechaInicial || fechaChile()).slice(0,7))
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [editar, setEditar] = useState(false)
  const [idEdicion, setIdEdicion] = useState<string | null>(null)
  const [form, setForm] = useState(vacio)
  const [nomina, setNomina] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [confirmacion, setConfirmacion] = useState<ItemCalendario | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [dia, setDia] = useState(fechaInicial)
  const carga = useRef(0)
  const clubId = perfil.club_id!
  const staff = perfil.rol === 'admin' || perfil.rol === 'profesor'
  const cargar = useCallback(async () => {
    const generacion = ++carga.current
    const { desde, hasta } = rangoMesCalendario(mes)
    try {
      const respuesta = await cachedFetch(`calendario-integrado:${clubId}:${perfil.id}:${perfil.rol}:${perfil.jugador_id ?? "sin-alumno"}:${mes}`, async () => {
        const consultas = await Promise.all([
          supabase.from('calendario_actividades').select('*').eq('club_id',clubId).gte('fecha',desde).lte('fecha',hasta).order('fecha'),
          staff ? supabase.from('liga_fechas').select('id,numero,fecha,liga_id,ligas!inner(nombre,club_id,hora_inicio,hora_fin),liga_fecha_sesiones(division_id,dia_offset,liga_divisiones(nombre))').eq('ligas.club_id',clubId).gte('fecha',sumarDiasCalendario(desde,-6)).lte('fecha',hasta) : Promise.resolve({ data: [], error: null }),
          perfil.jugador_id ? supabase.from('bloque_jugadores').select('vigente_desde,vigente_hasta,bloques_horario!inner(id,nombre,sede,dia_semana,hora_inicio,hora_fin,vigente_desde,vigente_hasta,club_id,activo)').eq('jugador_id',perfil.jugador_id).eq('bloques_horario.club_id',clubId).is('vigente_hasta',null) : Promise.resolve({ data: [], error: null }),
          supabase.from('eventos').select('id,titulo,tipo,fecha_inicio,hora_inicio,hora_fin,descripcion').eq('club_id',clubId).gte('fecha_inicio',desde).lte('fecha_inicio',hasta),
          supabase.from('torneos').select('id,nombre,fecha_inicio').eq('club_id',clubId).neq('estado','archivado').gte('fecha_inicio',desde).lte('fecha_inicio',hasta),
          staff ? supabase.from('jugadores').select('id,nombre').eq('club_id',clubId).order('nombre') : Promise.resolve({ data: [], error: null }),
          supabase.from('calendario_nomina').select('actividad_id,jugador_id').eq('club_id',clubId),
          !staff && perfil.jugador_id && esUuid(perfil.jugador_id) ? supabase.from('liga_partidos').select('id,jugador_a_id,jugador_b_id,arbitro_id,dia_offset,bloque_horario,ligas!inner(nombre,club_id),liga_fechas!inner(fecha,numero),liga_divisiones(nombre),liga_mesas(numero)').eq('ligas.club_id',clubId).is('deleted_at',null).gte('liga_fechas.fecha',sumarDiasCalendario(desde,-6)).lte('liga_fechas.fecha',hasta).or(`jugador_a_id.eq.${perfil.jugador_id},jugador_b_id.eq.${perfil.jugador_id},arbitro_id.eq.${perfil.jugador_id}`) : Promise.resolve({ data: [], error: null }),
        ])
        for (const q of consultas) if(q.error) throw new Error(q.error.message)
        const actividades = consultas[0].data as ActividadCalendario[] ?? []
        const items: ItemCalendario[] = actividades.map(a => ({ ...a, origen: 'actividad' }))
        for (const f of consultas[1].data as unknown as FechaLiga[] ?? []) {
          if (!f.fecha) continue
          const sesiones = f.liga_fecha_sesiones?.length ? f.liga_fecha_sesiones : [{ division_id: '', dia_offset: 0, liga_divisiones: { nombre: '' } }]
          for (const s of sesiones) {
            const fecha = sumarDiasCalendario(f.fecha,s.dia_offset)
            if (fecha < desde || fecha > hasta) continue
            items.push({ id: `liga-${f.id}-${s.division_id}`, origen: 'liga', tipo: 'liga_tdm', titulo: `${f.ligas.nombre} · Jornada ${f.numero}${s.liga_divisiones?.nombre ? ` · ${s.liga_divisiones.nombre}` : ''}`, fecha, hora_inicio: f.ligas.hora_inicio, hora_fin: f.ligas.hora_fin, lugar: '', descripcion: '', enlace: perfil.rol === 'admin' ? `/liga/fecha/${f.id}` : undefined })
          }
        }
        if (!staff && perfil.jugador_id) items.push(...partidosPropiosDelMes(mes,clubId,perfil.jugador_id,consultas[7].data as unknown as PartidoCalendario[] ?? []))
        items.push(...clasesDelMes(mes,clubId,consultas[2].data as unknown as InscripcionCalendario[] ?? [],actividades))
        for (const e of consultas[3].data ?? []) items.push({ ...e, origen: 'evento', fecha: e.fecha_inicio.slice(0,10), lugar: '', descripcion: e.descripcion ?? '' })
        for (const t of consultas[4].data ?? []) items.push({ id:t.id,titulo:t.nombre,tipo:'torneo',fecha:t.fecha_inicio.slice(0,10),hora_inicio:null,hora_fin:null,lugar:'',descripcion:'',origen:'torneo',enlace:`/torneos/${t.id}` })
        items.sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))
        return { actividades, items, jugadores: consultas[5].data ?? [], nomina: consultas[6].data ?? [] } as Datos
      }, 60_000, TABLAS)
      if (generacion !== carga.current) return
      setDatos(respuesta); setError('')
    } catch(e) { if (generacion === carga.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el calendario') }
  }, [clubId,mes,perfil.id,perfil.jugador_id,perfil.rol,staff])
  useEffect(() => { const control = carga; void Promise.resolve().then(cargar); return () => { control.current++ } },[cargar])
  useEnVivo(TABLAS,clubId,cargar,{conClub:CON_CLUB})

  function abrir(a?: ActividadCalendario) {
    setMensaje('')
    setIdEdicion(a?.id ?? null)
    setForm(a ? { titulo:a.titulo,tipo:a.tipo,fecha:a.fecha,hora_inicio:a.hora_inicio?.slice(0,5) ?? '',hora_fin:a.hora_fin?.slice(0,5) ?? '',lugar:a.lugar,descripcion:a.descripcion,publico:a.publico } : { ...vacio(), fecha: dia || fechaChile() })
    setNomina(a ? datos?.nomina.filter(n => n.actividad_id === a.id).map(n => n.jugador_id) ?? [] : [])
    setEditar(true)
  }
  async function guardar() {
    if (guardando || eliminando) return
    if (!form.titulo.trim() || !form.fecha) { setError('Completa título y fecha'); return }
    if (form.hora_fin && (!form.hora_inicio || form.hora_fin <= form.hora_inicio)) { setError('La hora final debe ser posterior al inicio'); return }
    setGuardando(true)
    try {
      const { error: e } = await supabase.rpc('guardar_calendario_actividad',{ p_id:idEdicion,p_datos:form,p_jugadores:form.tipo === 'externo' ? nomina : [] })
      if(e) throw new Error(e.message)
      invalidarPorTabla('calendario_actividades'); invalidarPorTabla('calendario_nomina')
      setEditar(false); setMes(form.fecha.slice(0,7)); setDia(form.fecha); await cargar()
    } catch(e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el evento') }
    finally { setGuardando(false) }
  }
  async function eliminar() {
    if (!confirmacion || eliminando || guardando || !['actividad', 'evento'].includes(confirmacion.origen)) return
    const actividad = confirmacion
    setEliminando(true); setError(''); setMensaje('')
    try {
      const resultado = await eliminarActividadCalendario({ id: actividad.id, origen: actividad.origen as 'actividad' | 'evento' })
      if (resultado.error) { setError(resultado.error); return }
      invalidarPorTabla(actividad.origen === 'actividad' ? 'calendario_actividades' : 'eventos')
      if (actividad.origen === 'actividad') invalidarPorTabla('calendario_nomina')
      setDatos(actuales => actuales ? {
        ...actuales,
        actividades: actuales.actividades.filter(a => actividad.origen !== 'actividad' || a.id !== actividad.id),
        items: actuales.items.filter(i => i.origen !== actividad.origen || i.id !== actividad.id),
        nomina: actuales.nomina.filter(n => actividad.origen !== 'actividad' || n.actividad_id !== actividad.id),
      } : actuales)
      setConfirmacion(null); setEditar(false); setMensaje('Actividad eliminada.')
      await cargar()
    } catch { setError('No se pudo eliminar la actividad. Intenta nuevamente.') }
    finally { setEliminando(false) }
  }
  const [anio, numeroMes] = mes.split('-').map(Number)
  const primerDia = new Date(anio, numeroMes - 1, 1).getDay()
  const diasEnMes = new Date(anio, numeroMes, 0).getDate()
  const hoy = fechaChile()
  const porDia = new Map<string, ItemCalendario[]>()
  for (const item of datos?.items ?? []) porDia.set(item.fecha, [...(porDia.get(item.fecha) ?? []), item])
  const itemsDelDia = porDia.get(dia) ?? []
  const proximaLiga = datos?.items.find(i => i.origen === 'liga' && i.fecha >= hoy)

  function irAlMes(destino: string) {
    if (destino === mes) return
    setMes(destino); setDia(''); setDatos(null)
  }
  function cambiarMes(direccion: number) {
    const destino = new Date(anio, numeroMes - 1 + direccion, 1)
    irAlMes(`${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, '0')}`)
  }

  return <div className={styles.root}>
    <div className={styles.toolbar}>
      <div className={styles.navigation}>
        <button type="button" aria-label="Mes anterior" className={`${styles.button} ${styles.arrow}`} onClick={() => cambiarMes(-1)}>◀</button>
        <span className={styles.month} aria-live="polite">{meses[numeroMes - 1]} {anio}</span>
        <button type="button" aria-label="Mes siguiente" className={`${styles.button} ${styles.arrow}`} onClick={() => cambiarMes(1)}>▶</button>
        <button type="button" className={styles.button} onClick={() => { irAlMes(hoy.slice(0, 7)); setDia(hoy) }}>Hoy</button>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button} href={`/calendario-publico/${clubId}`} target="_blank" rel="noopener noreferrer">Vista pública ↗</Link>
        {staff && <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => abrir()}>+ Agregar actividad</button>}
      </div>
    </div>
    <p className={styles.subtitle}>{staff ? 'Torneos, jornadas de liga y actividades del club. Selecciona un día para ver el detalle.' : 'Tus clases, partidos de liga y actividades del club. Selecciona un día para ver el detalle.'}</p>
    {error && <div role="alert" className={styles.notice}>{error} <button className={styles.button} onClick={() => void cargar()}>Reintentar</button></div>}
    {mensaje && <div role="status" className={`${styles.notice} ${styles.success}`}>{mensaje}</div>}
    <div className={`${styles.layout}${dia ? ` ${styles.withPanel}` : ''}`}>
      <div>
        <div className={`${styles.card} ${styles.calendar}`} aria-label="Calendario mensual" aria-busy={!datos && !error}>
          <div className={styles.week}>{diasSemana.map(d => <span key={d}>{d}</span>)}</div>
          <div className={styles.days}>
            {Array.from({ length: primerDia }, (_, i) => <div key={`vacio-${i}`} className={styles.blank} aria-hidden="true" />)}
            {Array.from({ length: diasEnMes }, (_, i) => {
              const fecha = `${mes}-${String(i + 1).padStart(2, '0')}`
              const items = porDia.get(fecha) ?? []
              const seleccionado = dia === fecha
              return <button type="button" key={fecha} aria-label={`${i + 1} de ${meses[numeroMes - 1]}, ${items.length} actividades`} aria-pressed={seleccionado} className={`${styles.day}${seleccionado ? ` ${styles.selected}` : ''}`} onClick={() => setDia(seleccionado ? '' : fecha)}>
                <span className={`${styles.number}${fecha === hoy ? ` ${styles.today}` : ''}`}>{i + 1}</span>
                {items.slice(0, 2).map(item => <span key={`${item.origen}-${item.id}`} className={styles.eventLabel} style={{ color: colores[item.tipo] ?? '#64748b' }}>{item.titulo}</span>)}
                {items.length > 2 && <span className={styles.more}>+{items.length - 2} más</span>}
                {items.length > 0 && <span className={styles.dots} style={{ color: colores[items[0].tipo] ?? '#64748b' }}>●{items.length > 1 ? ` ${items.length}` : ''}</span>}
              </button>
            })}
          </div>
        </div>
        <div className={styles.legend}>
          {[['clase', 'Clases'], ['torneo', 'Torneos'], ['liga_tdm', 'Liga'], ['clinica', 'Actividades'], ['feriado', 'Sin actividad']].map(([tipo, nombre]) => <span key={tipo}><i className={styles.dot} style={{ background: colores[tipo] }} />{nombre}</span>)}
        </div>
        {!datos && !error && <p role="status" className={styles.empty}>Cargando calendario…</p>}
        {proximaLiga && <div className={`${styles.card} ${styles.upcoming}`}><strong>Próxima jornada</strong><br />{new Date(`${proximaLiga.fecha}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })} · {proximaLiga.titulo}{proximaLiga.hora_inicio ? ` · ${proximaLiga.hora_inicio.slice(0,5)}${proximaLiga.hora_fin ? `–${proximaLiga.hora_fin.slice(0,5)}` : ''}` : ''}</div>}
      </div>
      {dia && <aside className={`${styles.card} ${styles.panel}`} aria-label="Detalle del día">
        <div className={styles.panelHeader}><h2>{new Date(`${dia}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><button type="button" className={styles.close} aria-label="Cerrar detalle del día" onClick={() => setDia('')}>✕</button></div>
        {itemsDelDia.map(i => {
          const convocados = datos?.nomina.filter(n => n.actividad_id === i.id) ?? []
          return <article key={`${i.origen}-${i.id}`} className={styles.item} style={{ borderLeftColor: colores[i.tipo] ?? '#64748b' }}>
            <div className={styles.itemHeader}><h3>{i.titulo}</h3>{staff && ['actividad', 'evento'].includes(i.origen) && <div className={styles.itemActions}>
              {i.origen === 'actividad' && <button type="button" className={`${styles.button} ${styles.edit}`} onClick={() => abrir(datos!.actividades.find(a => a.id === i.id))}>Editar</button>}
              <button type="button" aria-label={`Eliminar ${i.titulo}`} className={`${styles.button} ${styles.edit} ${styles.danger}`} disabled={eliminando || guardando} onClick={() => { setError(''); setConfirmacion(i) }}>Eliminar</button>
            </div>}</div>
            <p className={styles.meta}>{etiquetas[i.tipo] ?? i.tipo}{i.hora_inicio ? ` · ${i.hora_inicio.slice(0,5)}${i.hora_fin ? `–${i.hora_fin.slice(0,5)}` : ''}` : ''}{i.lugar ? ` · ${i.lugar}` : ''}</p>
            {i.descripcion && <p className={styles.description}>{i.descripcion}</p>}
            {['suspension','feriado'].includes(i.tipo) && <p className={styles.description}>Sin clases habituales este día.</p>}
            {staff && i.tipo === 'externo' && <p className={styles.description}>Nómina: {convocados.length ? convocados.map(n => datos?.jugadores.find(j => j.id === n.jugador_id)?.nombre ?? 'Jugador').join(', ') : 'Sin jugadores convocados'}</p>}
            {!staff && i.tipo === 'externo' && convocados.length > 0 && <p className={styles.description}>Estás en la nómina de este torneo.</p>}
            {i.enlace && <Link className={styles.link} href={i.enlace}>Ver programación →</Link>}
          </article>
        })}
        {datos && !itemsDelDia.length && <p className={styles.empty}>Sin actividades este día.</p>}
        {!datos && !error && <p className={styles.empty}>Cargando actividades…</p>}
        {staff && <button type="button" className={`${styles.button} ${styles.primary}`} style={{ width: '100%', marginTop: 8 }} onClick={() => abrir()}>+ Agregar actividad</button>}
      </aside>}
    </div>
    {editar && !confirmacion && <div role="dialog" aria-modal="true" aria-labelledby="titulo-actividad" className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}><h2 id="titulo-actividad">{idEdicion ? 'Editar actividad' : 'Nueva actividad'}</h2><button type="button" className={styles.close} aria-label="Cerrar formulario" disabled={guardando} onClick={() => setEditar(false)}>✕</button></div>
        <div className={styles.form}>
          <label className={styles.label}>Título<input autoFocus maxLength={160} value={form.titulo} onChange={e => setForm({...form,titulo:e.target.value})} className={styles.input} placeholder="Nombre de la actividad" /></label>
          <label className={styles.label}>Tipo<select value={form.tipo} onChange={e => setForm({...form,tipo:e.target.value})} className={styles.input}>{TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{etiquetas[t]}</option>)}</select></label>
          <label className={styles.label}>Fecha<input type="date" value={form.fecha} onChange={e => setForm({...form,fecha:e.target.value})} className={styles.input} /></label>
          <div className={styles.pair}><label className={styles.label}>Hora de inicio<input type="time" value={form.hora_inicio} onChange={e => setForm({...form,hora_inicio:e.target.value})} className={styles.input} /></label><label className={styles.label}>Hora de término<input type="time" value={form.hora_fin} onChange={e => setForm({...form,hora_fin:e.target.value})} className={styles.input} /></label></div>
          <label className={styles.label}>Lugar<input maxLength={240} value={form.lugar} onChange={e => setForm({...form,lugar:e.target.value})} className={styles.input} placeholder="Sede o lugar del evento" /></label>
          <label className={styles.label}>Detalles internos<textarea rows={3} maxLength={2000} value={form.descripcion} onChange={e => setForm({...form,descripcion:e.target.value})} className={styles.input} /></label>
          <label className={styles.checkbox}><input type="checkbox" checked={form.publico} onChange={e => setForm({...form,publico:e.target.checked})} />Publicar título, fecha, horas y lugar en la vista pública</label>
          <p className={styles.help}>Usa un título y lugar sin nombres de alumnos. Los detalles y la nómina se mantienen dentro del club.</p>
          {form.tipo === 'externo' && <fieldset className={styles.roster}><legend>Nómina de jugadores</legend>{datos?.jugadores.map(j => <label key={j.id} className={styles.checkbox}><input type="checkbox" checked={nomina.includes(j.id)} onChange={e => setNomina(e.target.checked ? [...nomina,j.id] : nomina.filter(id => id !== j.id))} />{j.nombre}</label>)}</fieldset>}
          {error && <p role="alert" className={styles.notice}>{error}</p>}
          <div className={styles.footer}>
            {idEdicion && <button type="button" className={`${styles.button} ${styles.danger} ${styles.deleteFromForm}`} disabled={guardando || eliminando} onClick={() => { const actividad = datos?.items.find(i => i.origen === 'actividad' && i.id === idEdicion); if (actividad) { setError(''); setConfirmacion(actividad) } }}>Eliminar actividad</button>}
            <button disabled={guardando} className={styles.button} onClick={() => setEditar(false)}>Cancelar</button><button disabled={guardando} className={`${styles.button} ${styles.primary}`} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar actividad'}</button>
          </div>
        </div>
      </div>
    </div>}
    {confirmacion && <div role="dialog" aria-modal="true" aria-labelledby="titulo-eliminar-actividad" className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}><h2 id="titulo-eliminar-actividad">Eliminar actividad</h2><button type="button" aria-label="Cerrar confirmación" className={styles.close} disabled={eliminando} onClick={() => setConfirmacion(null)}>✕</button></div>
        <p className={styles.confirmText}>¿Quieres eliminar <strong>{confirmacion.titulo}</strong> del calendario?</p>
        <p className={styles.help}>{confirmacion.origen === 'actividad' ? 'También se quitará su nómina de participantes y dejará de aparecer en la agenda pública. ' : ''}Esta acción no se puede deshacer.</p>
        {error && <p role="alert" className={styles.notice} style={{ marginTop: 14 }}>{error}</p>}
        <div className={styles.footer}><button type="button" autoFocus className={styles.button} disabled={eliminando} onClick={() => setConfirmacion(null)}>Cancelar</button><button type="button" className={`${styles.button} ${styles.dangerPrimary}`} disabled={eliminando} onClick={() => void eliminar()}>{eliminando ? 'Eliminando…' : 'Sí, eliminar'}</button></div>
      </div>
    </div>}
  </div>
}
