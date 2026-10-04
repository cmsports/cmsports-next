'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch, invalidarPorTabla } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { TIPOS_ACTIVIDAD, clasesDelMes, partidosPropiosDelMes, rangoMesCalendario, sumarDiasCalendario, type ActividadCalendario, type InscripcionCalendario, type ItemCalendario, type PartidoCalendario } from '@/lib/domain/calendarioIntegrado'
import { esUuid } from '@/lib/domain/uuid'
import type { Perfil } from '@/types'

const supabase = createClient()
const TABLAS = ['calendario_actividades','calendario_nomina','ligas','liga_fechas','liga_fecha_sesiones','liga_divisiones','liga_partidos','liga_mesas','bloque_jugadores','bloques_horario','eventos','torneos','jugadores']
const CON_CLUB = ['calendario_actividades','calendario_nomina','ligas','bloques_horario','eventos','torneos','jugadores']
const estilo = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12 }
const entrada = { padding: 9, border: '1px solid #cbd5e1', borderRadius: 8, width: '100%' }
const boton = { padding: '9px 14px', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', background: '#fff' }
const etiquetas: Record<string,string> = { externo: 'Torneo externo', clinica: 'Clínica', campamento: 'Campamento', reunion: 'Reunión', suspension: 'Suspensión', feriado: 'Feriado', otro: 'Otro', clase: 'Mi clase', liga_tdm: 'Liga de tenis de mesa', torneo: 'Torneo' }
const vacio = () => ({ titulo: '', tipo: 'externo', fecha: fechaChile(), hora_inicio: '', hora_fin: '', lugar: '', descripcion: '', publico: false })
type Datos = { actividades: ActividadCalendario[]; items: ItemCalendario[]; jugadores: { id: string; nombre: string }[]; nomina: { actividad_id: string; jugador_id: string }[] }
type FechaLiga = { id: string; numero: number; fecha: string | null; liga_id: string; ligas: { nombre: string; hora_inicio: string; hora_fin: string }; liga_fecha_sesiones: { division_id: string; dia_offset: number; liga_divisiones: { nombre: string } }[] }

export default function CalendarioIntegrado({ perfil }: { perfil: Perfil }) {
  const [mes, setMes] = useState(fechaChile().slice(0,7))
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const [editar, setEditar] = useState(false)
  const [idEdicion, setIdEdicion] = useState<string | null>(null)
  const [form, setForm] = useState(vacio)
  const [nomina, setNomina] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [dia, setDia] = useState('')
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
    setIdEdicion(a?.id ?? null)
    setForm(a ? { titulo:a.titulo,tipo:a.tipo,fecha:a.fecha,hora_inicio:a.hora_inicio?.slice(0,5) ?? '',hora_fin:a.hora_fin?.slice(0,5) ?? '',lugar:a.lugar,descripcion:a.descripcion,publico:a.publico } : vacio())
    setNomina(a ? datos?.nomina.filter(n => n.actividad_id === a.id).map(n => n.jugador_id) ?? [] : [])
    setEditar(true)
  }
  async function guardar() {
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
  const visibles = datos?.items.filter(i => !dia || i.fecha === dia) ?? []
  const proximaLiga = datos?.items.find(i => i.origen === 'liga' && i.fecha >= fechaChile())
  return <div style={{color:'#0f172a'}}>
    <h1 style={{fontSize:22}}>Calendario del club</h1>
    <p>Clases propias, jornadas de liga y actividades del club. Las cuentas de jugadores y apoderados ven las clases del alumno vinculado.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16,alignItems:'center'}}>
      <label>Mes <input aria-label="Mes del calendario" type="month" value={mes} onChange={e => { if(e.target.value) { setMes(e.target.value); setDia(''); setDatos(null) } }} style={entrada}/></label>
      <label>Día <input type="date" value={dia} onChange={e => { setDia(e.target.value); if(e.target.value) setMes(e.target.value.slice(0,7)) }} style={entrada}/></label>
      {dia && <button style={boton} onClick={() => setDia('')}>Ver todo el mes</button>}
      {staff && <button style={{...boton,background:'#4f46e5',color:'#fff'}} onClick={() => abrir()}>Agregar actividad</button>}
      <Link href={`/calendario-publico/${clubId}`} target="_blank">Vista pública</Link>
    </div>
    {error && <div role="alert" style={{...estilo,color:'#b91c1c'}}>{error}<button style={{...boton,marginLeft:8}} onClick={() => void cargar()}>Reintentar</button></div>}
    {proximaLiga && <p style={{...estilo}}>Próxima jornada este mes: {proximaLiga.fecha} · {proximaLiga.titulo} · {proximaLiga.hora_inicio?.slice(0,5)}–{proximaLiga.hora_fin?.slice(0,5)}</p>}
    {!datos && !error && <p>Cargando calendario…</p>}
    {datos && visibles.length === 0 && <p style={estilo}>Sin actividades en este período.</p>}
    {visibles.map(i => {
      const convocados = datos?.nomina.filter(n => n.actividad_id === i.id) ?? []
      return <article key={`${i.origen}-${i.id}`} style={estilo}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{i.titulo}</strong>{staff && i.origen === 'actividad' && <button style={boton} onClick={() => abrir(datos!.actividades.find(a => a.id === i.id))}>Editar</button>}</div>
        <p style={{margin:'8px 0',fontSize:13}}>{i.fecha} · {etiquetas[i.tipo] ?? i.tipo}{i.hora_inicio ? ` · ${i.hora_inicio.slice(0,5)}${i.hora_fin ? `–${i.hora_fin.slice(0,5)}` : ''}` : ''}{i.lugar ? ` · ${i.lugar}` : ''}</p>
        {i.descripcion && <p>{i.descripcion}</p>}
        {['suspension','feriado'].includes(i.tipo) && <p>Sin clases habituales este día.</p>}
        {staff && i.tipo === 'externo' && <p style={{fontSize:13}}>Nómina: {convocados.length ? convocados.map(n => datos?.jugadores.find(j => j.id === n.jugador_id)?.nombre ?? 'Jugador').join(', ') : 'Sin jugadores convocados'}</p>}
        {!staff && i.tipo === 'externo' && convocados.length > 0 && <p>Estás en la nómina de este torneo.</p>}
        {i.enlace && <Link href={i.enlace}>Ver programación</Link>}
      </article>
    })}
    {editar && <div role="dialog" aria-modal="true" aria-label="Editar actividad" style={{position:'fixed',inset:0,background:'#0006',zIndex:100,display:'flex',justifyContent:'center',alignItems:'center',padding:16}}><div style={{...estilo,maxWidth:560,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
      <h2>{idEdicion ? 'Editar actividad' : 'Nueva actividad'}</h2>
      <div style={{display:'grid',gap:12}}>
        <label>Título <input maxLength={160} value={form.titulo} onChange={e => setForm({...form,titulo:e.target.value})} style={entrada}/></label>
        <label>Tipo <select value={form.tipo} onChange={e => setForm({...form,tipo:e.target.value})} style={entrada}>{TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{etiquetas[t]}</option>)}</select></label>
        <label>Fecha <input type="date" value={form.fecha} onChange={e => setForm({...form,fecha:e.target.value})} style={entrada}/></label>
        <div style={{display:'flex',gap:10}}><label>Inicio <input type="time" value={form.hora_inicio} onChange={e => setForm({...form,hora_inicio:e.target.value})} style={entrada}/></label><label>Fin <input type="time" value={form.hora_fin} onChange={e => setForm({...form,hora_fin:e.target.value})} style={entrada}/></label></div>
        <label>Lugar <input maxLength={240} value={form.lugar} onChange={e => setForm({...form,lugar:e.target.value})} style={entrada}/></label>
        <label>Detalles internos <textarea maxLength={2000} value={form.descripcion} onChange={e => setForm({...form,descripcion:e.target.value})} style={entrada}/></label>
        <label><input type="checkbox" checked={form.publico} onChange={e => setForm({...form,publico:e.target.checked})}/> Publicar título, fecha, horas y lugar en la vista pública</label>
        <small>Usa un título y lugar sin nombres de alumnos. Los detalles y la nómina se mantienen dentro del club.</small>
        {form.tipo === 'externo' && <fieldset style={{maxHeight:180,overflowY:'auto',border:'1px solid #cbd5e1'}}><legend>Nómina de jugadores</legend>{datos?.jugadores.map(j => <label key={j.id} style={{display:'block',padding:5}}><input type="checkbox" checked={nomina.includes(j.id)} onChange={e => setNomina(e.target.checked ? [...nomina,j.id] : nomina.filter(id => id !== j.id))}/> {j.nombre}</label>)}</fieldset>}
        {error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
        <div style={{display:'flex',gap:8}}><button disabled={guardando} style={boton} onClick={() => setEditar(false)}>Cancelar</button><button disabled={guardando} style={{...boton,background:'#4f46e5',color:'#fff'}} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
      </div>
    </div></div>}
  </div>
}
