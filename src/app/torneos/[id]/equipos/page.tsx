'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import MarcadorSets from '@/components/torneos/MarcadorSets'
import { armarEncuentro, borrarEncuentros, eliminarEquipo, generarEncuentros, guardarEquipo, marcarPartidoDeEncuentro } from '@/app/actions/torneoEquipos'
import { modalidadDe } from '@/lib/domain/modalidadTorneo'
import {
  CRUCES, SISTEMA_LABEL, individualesQuePide, minJugadoresPorEquipo, resultadoEncuentro, sistemaDe,
  type Alineacion, type SistemaEquipos,
} from '@/lib/domain/torneoEquipos'
import { useEnVivo } from '@/lib/useEnVivo'

// El torneo por equipos (Swaythling / Corbillon), todos contra todos.
//   1. Con la inscripción abierta: armar los equipos desde los inscritos.
//   2. "Generar encuentros": el todos contra todos entre equipos.
//   3. Cada encuentro: declarar las dos alineaciones → salen sus 5 partidos;
//      marcar cada partido set a set; el encuentro se cierra solo al llegar a 3.
//   4. La tabla de posiciones sale de los encuentros ganados.

const supabase = createClient()
const ink = '#0f172a', muted = '#64748b', hint = '#94a3b8', azul = '#2563eb'
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.08)' } as const
const inp = { background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', color: ink, fontSize: 13, outline: 'none' } as const
const boton = (primario = false, peligro = false) => ({
  background: primario ? azul : peligro ? '#fff' : '#fff', color: primario ? '#fff' : peligro ? '#b91c1c' : ink,
  border: primario ? 'none' : `1px solid ${peligro ? '#fecaca' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}) as const
const LETRAS = ['A', 'B', 'C', 'D', 'E']

type Equipo = { id: string; nombre: string; club: string | null; orden: number; jugadores: string[] }
type Partido = { id: string; encuentroId: string; numero: number; a: string | null; a2: string | null; b: string | null; b2: string | null; ganador: string | null; setsA: number | null; setsB: number | null }
type Encuentro = { id: string; orden: number; equipoA: string | null; equipoB: string | null; ganador: string | null; partidos: Partido[] }

export default function TorneoEquiposPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const params = useParams()
  const router = useRouter()
  const torneoId = String(params.id)
  const esAdmin = perfil?.rol === 'admin'

  const [torneo, setTorneo] = useState<{ nombre: string; fase: string; sistema: SistemaEquipos; esEquipos: boolean } | null>(null)
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [inscritos, setInscritos] = useState<string[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [encuentros, setEncuentros] = useState<Encuentro[]>([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Formulario de equipo
  const [editando, setEditando] = useState<{ id?: string; nombre: string; club: string; jugadores: string[] } | null>(null)
  // Encuentro con alineación abierta / partido marcándose
  const [alineando, setAlineando] = useState<string | null>(null)
  const [alin, setAlin] = useState<{ a: string[]; a2: [string, string]; b: string[]; b2: [string, string] }>({ a: [], a2: ['', ''], b: [], b2: ['', ''] })
  const [marcando, setMarcando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const [{ data: t }, { data: eqs }, { data: mesa }, { data: encs }] = await Promise.all([
      sb.from('torneos').select('nombre, fase, formato, sistema_equipos').eq('id', torneoId).maybeSingle(),
      sb.from('torneo_equipos').select('id, nombre, club_procedencia, orden, torneo_equipo_jugadores(jugador_id, orden)').eq('torneo_id', torneoId).order('orden'),
      sb.from('torneo_grupos').select('id').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle(),
      sb.from('torneo_encuentros').select('id, orden, equipo_a_id, equipo_b_id, ganador_equipo_id').eq('torneo_id', torneoId).order('orden'),
    ])
    if (!t) { router.replace('/torneos'); return }
    setTorneo({ nombre: t.nombre, fase: t.fase, sistema: sistemaDe(t.sistema_equipos), esEquipos: modalidadDe(t.formato) === 'equipos' })
    const listaEq: Equipo[] = ((eqs || []) as Array<Record<string, unknown>>).map(e => ({
      id: e.id as string, nombre: e.nombre as string, club: (e.club_procedencia as string | null) ?? null, orden: e.orden as number,
      jugadores: ((e.torneo_equipo_jugadores as Array<{ jugador_id: string; orden: number }>) ?? []).sort((x, y) => x.orden - y.orden).map(j => j.jugador_id),
    }))
    setEquipos(listaEq)
    let insc: string[] = []
    if (mesa) {
      const { data: gj } = await sb.from('grupo_jugadores').select('jugador_id').eq('grupo_id', mesa.id)
      insc = ((gj || []) as Array<{ jugador_id: string }>).map(r => r.jugador_id)
    }
    setInscritos(insc)
    const encIds = ((encs || []) as Array<{ id: string }>).map(e => e.id)
    let partidos: Partido[] = []
    if (encIds.length) {
      const { data: ps } = await sb.from('torneo_partidos')
        .select('id, encuentro_id, numero_en_encuentro, jugador_a, jugador_a2, jugador_b, jugador_b2, ganador, sets_a, sets_b')
        .in('encuentro_id', encIds).order('numero_en_encuentro')
      partidos = ((ps || []) as Array<Record<string, unknown>>).map(p => ({
        id: p.id as string, encuentroId: p.encuentro_id as string, numero: p.numero_en_encuentro as number,
        a: (p.jugador_a as string | null) ?? null, a2: (p.jugador_a2 as string | null) ?? null,
        b: (p.jugador_b as string | null) ?? null, b2: (p.jugador_b2 as string | null) ?? null,
        ganador: (p.ganador as string | null) ?? null, setsA: (p.sets_a as number | null) ?? null, setsB: (p.sets_b as number | null) ?? null,
      }))
    }
    setEncuentros(((encs || []) as Array<Record<string, unknown>>).map(e => ({
      id: e.id as string, orden: e.orden as number, equipoA: (e.equipo_a_id as string | null) ?? null, equipoB: (e.equipo_b_id as string | null) ?? null,
      ganador: (e.ganador_equipo_id as string | null) ?? null, partidos: partidos.filter(p => p.encuentroId === e.id),
    })))
    // Nombres de todos los que aparecen.
    const ids = [...new Set([...insc, ...listaEq.flatMap(e => e.jugadores), ...partidos.flatMap(p => [p.a, p.a2, p.b, p.b2].filter((x): x is string => !!x))])]
    if (ids.length) {
      const { data: js } = await sb.from('jugadores').select('id, nombre').in('id', ids)
      setNombres(Object.fromEntries(((js || []) as Array<{ id: string; nombre: string }>).map(j => [j.id, j.nombre])))
    }
    setCargando(false)
  }, [torneoId, router])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    void cargar()
  }, [authLoading, perfil, cargar, router])
  useEnVivo(['torneo_partidos'], perfil?.club_id ?? null, () => { void cargar() }, { filtro: `torneo_id=eq.${torneoId}` })

  const nombre = (id: string | null | undefined) => (id ? nombres[id] ?? '—' : '—')
  const equipoDe = (id: string | null) => equipos.find(e => e.id === id) ?? null
  const enEquipo = useMemo(() => new Map(equipos.flatMap(e => e.jugadores.map(j => [j, e.id] as const))), [equipos])
  const hayEncuentros = encuentros.length > 0
  const sistema = torneo?.sistema ?? 'corbillon'
  const minJug = minJugadoresPorEquipo(sistema)
  const pide = individualesQuePide(sistema)

  // Tabla de posiciones: encuentros ganados, y partidos a favor como desempate.
  const tabla = useMemo(() => {
    const filas = new Map(equipos.map(e => [e.id, { equipo: e, j: 0, g: 0, p: 0, pf: 0, pc: 0 }]))
    for (const enc of encuentros) {
      if (!enc.equipoA || !enc.equipoB) continue
      const r = resultadoEncuentro(enc.partidos.map(p => ({ numero: p.numero, ganador: !p.ganador ? null : p.ganador === p.a ? 'a' : 'b' })))
      const fa = filas.get(enc.equipoA), fb = filas.get(enc.equipoB)
      if (!fa || !fb) continue
      fa.pf += r.puntosA; fa.pc += r.puntosB; fb.pf += r.puntosB; fb.pc += r.puntosA
      if (r.terminado) {
        fa.j++; fb.j++
        if (r.ganador === 'a') { fa.g++; fb.p++ } else { fb.g++; fa.p++ }
      }
    }
    return [...filas.values()].sort((x, y) => y.g - x.g || (y.pf - y.pc) - (x.pf - x.pc) || y.pf - x.pf || x.equipo.orden - y.equipo.orden)
  }, [equipos, encuentros])

  async function guardar() {
    if (!editando) return
    setOcupado(true); setMensaje(null)
    const res = await guardarEquipo({ torneoId, equipoId: editando.id, nombre: editando.nombre, clubProcedencia: editando.club, jugadorIds: editando.jugadores })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    setEditando(null)
    await cargar()
  }

  async function borrarEquipo(e: Equipo) {
    if (!confirm(`¿Borrar el equipo "${e.nombre}"?`)) return
    setOcupado(true); setMensaje(null)
    const res = await eliminarEquipo({ torneoId, equipoId: e.id })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    await cargar()
  }

  async function generar() {
    const n = (equipos.length * (equipos.length - 1)) / 2
    if (!confirm(`Se arma el todos contra todos: ${n} encuentro${n === 1 ? '' : 's'} entre ${equipos.length} equipos. La inscripción queda cerrada. ¿Seguir?`)) return
    setOcupado(true); setMensaje(null)
    const res = await generarEncuentros({ torneoId })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    setMensaje({ tipo: 'ok', texto: `${res.encuentros} encuentros armados. Ahora, en cada uno, declara las alineaciones.` })
    await cargar()
  }

  async function deshacerEncuentros() {
    if (!confirm('¿Borrar todos los encuentros y volver a la inscripción? Solo se puede si no hay resultados.')) return
    setOcupado(true); setMensaje(null)
    const res = await borrarEncuentros({ torneoId })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    await cargar()
  }

  function abrirAlineacion(enc: Encuentro) {
    const ea = equipoDe(enc.equipoA), eb = equipoDe(enc.equipoB)
    // Precargado con el orden del plantel (la alineación por defecto).
    setAlin({
      a: (ea?.jugadores ?? []).slice(0, pide), a2: [(ea?.jugadores ?? [])[0] ?? '', (ea?.jugadores ?? [])[1] ?? ''],
      b: (eb?.jugadores ?? []).slice(0, pide), b2: [(eb?.jugadores ?? [])[0] ?? '', (eb?.jugadores ?? [])[1] ?? ''],
    })
    setAlineando(enc.id)
  }

  async function confirmarAlineacion(enc: Encuentro) {
    const alineacionA: Alineacion = { individuales: alin.a, ...(sistema === 'corbillon' ? { dobles: alin.a2 } : {}) }
    const alineacionB: Alineacion = { individuales: alin.b, ...(sistema === 'corbillon' ? { dobles: alin.b2 } : {}) }
    setOcupado(true); setMensaje(null)
    const res = await armarEncuentro({ torneoId, encuentroId: enc.id, alineacionA, alineacionB })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    setAlineando(null)
    await cargar()
  }

  async function marcar(p: Partido, parciales: Array<[number, number]>) {
    setOcupado(true); setMensaje(null)
    const res = await marcarPartidoDeEncuentro({ torneoId, partidoId: p.id, parciales })
    setOcupado(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    setMarcando(null)
    if (res.encuentroTerminado) setMensaje({ tipo: 'ok', texto: 'Encuentro terminado.' })
    await cargar()
  }

  if (authLoading || cargando) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}><div style={{ color: hint }}>Cargando...</div></div>
  }
  if (torneo && !torneo.esEquipos) {
    return <AppLayout perfil={perfil}><div style={{ ...card, padding: 24, maxWidth: 520, margin: '40px auto', textAlign: 'center', color: muted, fontSize: 14 }}>Este torneo no es por equipos.</div></AppLayout>
  }

  const disponibles = inscritos.filter(id => !enEquipo.has(id) || enEquipo.get(id) === editando?.id)

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/torneos/${torneoId}`)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', color: muted, fontSize: 13, cursor: 'pointer' }}>← Torneo</button>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: ink, margin: 0, flex: 1 }}>{torneo?.nombre} · Equipos</h1>
          {esAdmin && !hayEncuentros && (
            <button onClick={generar} disabled={ocupado || equipos.length < 2} style={{ ...boton(true), opacity: equipos.length < 2 ? 0.5 : 1 }}>
              ⚔️ Generar encuentros{equipos.length >= 2 ? ` (${(equipos.length * (equipos.length - 1)) / 2})` : ''}
            </button>
          )}
          {esAdmin && hayEncuentros && encuentros.every(e => e.partidos.every(p => !p.ganador)) && (
            <button onClick={deshacerEncuentros} disabled={ocupado} style={boton(false, true)}>↩ Borrar encuentros</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: hint, marginBottom: 16 }}>
          {SISTEMA_LABEL[sistema]} · equipos de {minJug} a 5 jugadores · todos contra todos · el encuentro se gana con 3 partidos.
        </p>

        {mensaje && (
          <div style={{ background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {mensaje.texto}
          </div>
        )}

        {/* ── Tabla de posiciones ── */}
        {hayEncuentros && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 14, fontWeight: 700, color: ink }}>🏆 Posiciones</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc', color: muted, fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '7px 14px' }}>#</th><th style={{ textAlign: 'left', padding: '7px 8px' }}>Equipo</th>
                <th style={{ padding: '7px 8px' }}>J</th><th style={{ padding: '7px 8px' }}>G</th><th style={{ padding: '7px 8px' }}>P</th><th style={{ padding: '7px 14px' }} title="Partidos a favor / en contra">PF–PC</th>
              </tr></thead>
              <tbody>
                {tabla.map((f, i) => (
                  <tr key={f.equipo.id} style={{ borderTop: '1px solid #f1f5f9', background: i === 0 && f.g > 0 ? '#fefce8' : '#fff' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 800, color: i === 0 ? '#ca8a04' : hint }}>{i + 1}</td>
                    <td style={{ padding: '8px 8px', color: ink, fontWeight: 700 }}>{f.equipo.nombre}{f.equipo.club ? <span style={{ color: hint, fontWeight: 400 }}> · {f.equipo.club}</span> : null}</td>
                    <td style={{ padding: '8px', textAlign: 'center', color: ink }}>{f.j}</td>
                    <td style={{ padding: '8px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{f.g}</td>
                    <td style={{ padding: '8px', textAlign: 'center', color: '#dc2626' }}>{f.p}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'center', color: muted, fontFamily: 'monospace' }}>{f.pf}–{f.pc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Equipos ── */}
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>👥 Equipos <span style={{ color: hint, fontWeight: 500 }}>· {equipos.length}</span></div>
            {esAdmin && !hayEncuentros && !editando && (
              <button onClick={() => setEditando({ nombre: '', club: '', jugadores: [] })} style={boton()}>+ Nuevo equipo</button>
            )}
          </div>
          {!equipos.length && !editando && (
            <div style={{ fontSize: 13, color: muted }}>
              {inscritos.length ? `Hay ${inscritos.length} inscritos en el torneo. Arma los equipos desde acá.` : 'Primero inscribe jugadores en el torneo (la mesa), y después arma los equipos.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {equipos.map(e => (
              <div key={e.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fafbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ fontWeight: 800, color: ink, fontSize: 14 }}>{e.nombre}</div>
                  {esAdmin && !hayEncuentros && (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setEditando({ id: e.id, nombre: e.nombre, club: e.club ?? '', jugadores: e.jugadores })} style={{ background: 'transparent', border: 'none', color: hint, cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => borrarEquipo(e)} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </span>
                  )}
                </div>
                {e.club && <div style={{ fontSize: 11, color: hint }}>{e.club}</div>}
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {e.jugadores.map((j, i) => (
                    <div key={j} style={{ fontSize: 12, color: ink, display: 'flex', gap: 6 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: azul, color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{LETRAS[i] ?? i + 1}</span>
                      {nombre(j)}
                    </div>
                  ))}
                </div>
                {e.jugadores.length < minJug && <div style={{ marginTop: 6, fontSize: 11, color: '#b45309' }}>Le faltan jugadores (mínimo {minJug}).</div>}
              </div>
            ))}
          </div>

          {editando && (
            <div style={{ marginTop: 12, border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ink, marginBottom: 8 }}>{editando.id ? 'Editar equipo' : 'Nuevo equipo'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <input value={editando.nombre} onChange={ev => setEditando({ ...editando, nombre: ev.target.value })} placeholder="Nombre del equipo" style={inp} />
                <input value={editando.club} onChange={ev => setEditando({ ...editando, club: ev.target.value })} placeholder="Club de procedencia (opcional)" style={inp} />
              </div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 6 }}>
                Marca de {minJug} a 5 jugadores. El orden en que los marques es la alineación por defecto (A, B{pide === 3 ? ', C' : ''}); en cada encuentro se puede cambiar.
              </div>
              {!disponibles.length && <div style={{ fontSize: 12, color: '#b45309' }}>No quedan inscritos sin equipo.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                {disponibles.map(id => {
                  const idx = editando.jugadores.indexOf(id)
                  return (
                    <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ink, padding: '4px 6px', borderRadius: 6, background: idx >= 0 ? '#fff' : 'transparent', cursor: 'pointer' }}>
                      <input type="checkbox" checked={idx >= 0} onChange={ev => {
                        const lista = ev.target.checked ? [...editando.jugadores, id] : editando.jugadores.filter(x => x !== id)
                        setEditando({ ...editando, jugadores: lista })
                      }} />
                      {idx >= 0 && <span style={{ width: 16, height: 16, borderRadius: 4, background: azul, color: '#fff', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{LETRAS[idx] ?? idx + 1}</span>}
                      {nombre(id)}
                    </label>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={guardar} disabled={ocupado} style={boton(true)}>{ocupado ? 'Guardando…' : 'Guardar equipo'}</button>
                <button onClick={() => setEditando(null)} style={{ ...boton(), color: muted }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Encuentros ── */}
        {hayEncuentros && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {encuentros.map(enc => {
              const ea = equipoDe(enc.equipoA), eb = equipoDe(enc.equipoB)
              const armado = enc.partidos.length > 0
              const r = resultadoEncuentro(enc.partidos.map(p => ({ numero: p.numero, ganador: !p.ganador ? null : p.ganador === p.a ? 'a' : 'b' })))
              const conResultados = enc.partidos.some(p => p.ganador)
              const abierto = alineando === enc.id
              return (
                <div key={enc.id} style={{ ...card, overflow: 'hidden', borderColor: r.terminado ? '#bbf7d0' : '#e2e8f0' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: r.terminado ? '#f0fdf4' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: hint, fontWeight: 700 }}>#{enc.orden}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: r.ganador === 'a' ? '#15803d' : ink }}>{ea?.nombre ?? '—'}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 900, color: ink, background: '#f1f5f9', borderRadius: 8, padding: '2px 10px' }}>{r.puntosA} – {r.puntosB}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: r.ganador === 'b' ? '#15803d' : ink }}>{eb?.nombre ?? '—'}</span>
                    <span style={{ flex: 1 }} />
                    {r.terminado && <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 20, padding: '3px 10px' }}>✅ Terminado</span>}
                    {!armado && !abierto && <span style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', borderRadius: 20, padding: '3px 10px' }}>Sin alineación</span>}
                    {esAdmin && !abierto && (!armado || !conResultados) && (
                      <button onClick={() => abrirAlineacion(enc)} style={boton(!armado)}>{armado ? 'Cambiar alineación' : '📋 Declarar alineaciones'}</button>
                    )}
                  </div>

                  {abierto && (
                    <div style={{ padding: 14, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {(['a', 'b'] as const).map(lado => {
                          const eq = lado === 'a' ? ea : eb
                          const ind = lado === 'a' ? alin.a : alin.b
                          const dob = lado === 'a' ? alin.a2 : alin.b2
                          const setInd = (i: number, v: string) => setAlin(prev => { const arr = [...(lado === 'a' ? prev.a : prev.b)]; arr[i] = v; return { ...prev, [lado]: arr } })
                          const setDob = (i: 0 | 1, v: string) => setAlin(prev => { const par: [string, string] = [...(lado === 'a' ? prev.a2 : prev.b2)] as [string, string]; par[i] = v; return { ...prev, [lado === 'a' ? 'a2' : 'b2']: par } })
                          const letras = lado === 'a' ? ['A', 'B', 'C'] : ['X', 'Y', 'Z']
                          return (
                            <div key={lado}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: ink, marginBottom: 6 }}>{eq?.nombre ?? '—'}</div>
                              {Array.from({ length: pide }).map((_, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ width: 18, fontSize: 11, fontWeight: 800, color: azul }}>{letras[i]}</span>
                                  <select value={ind[i] ?? ''} onChange={ev => setInd(i, ev.target.value)} style={{ ...inp, flex: 1 }}>
                                    <option value="">— elegir —</option>
                                    {(eq?.jugadores ?? []).map(j => <option key={j} value={j}>{nombre(j)}</option>)}
                                  </select>
                                </div>
                              ))}
                              {sistema === 'corbillon' && (
                                <div style={{ marginTop: 6 }}>
                                  <div style={{ fontSize: 11, color: muted, fontWeight: 700, marginBottom: 4 }}>Dobles</div>
                                  {([0, 1] as const).map(i => (
                                    <select key={i} value={dob[i]} onChange={ev => setDob(i, ev.target.value)} style={{ ...inp, width: '100%', marginBottom: 4 }}>
                                      <option value="">— elegir —</option>
                                      {(eq?.jugadores ?? []).map(j => <option key={j} value={j}>{nombre(j)}</option>)}
                                    </select>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: hint, margin: '8px 0' }}>
                        Orden de los partidos: {CRUCES[sistema].map(c => c.tipo === 'dobles' ? 'Dobles' : `${['A', 'B', 'C'][c.a[0]]}–${['X', 'Y', 'Z'][c.b[0]]}`).join(' · ')}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => confirmarAlineacion(enc)} disabled={ocupado} style={boton(true)}>{ocupado ? 'Armando…' : 'Armar los partidos'}</button>
                        <button onClick={() => setAlineando(null)} style={{ ...boton(), color: muted }}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  {armado && (
                    <div>
                      {enc.partidos.map(p => {
                        const noSeJuega = r.noSeJuegan.includes(p.numero)
                        const jugado = !!p.ganador
                        const ganoA = jugado && p.ganador === p.a
                        const esDobles = !!p.a2
                        const abiertoP = marcando === p.id
                        return (
                          <div key={p.id} style={{ borderTop: '1px solid #f1f5f9', padding: '8px 14px', opacity: noSeJuega ? 0.45 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ width: 22, height: 22, borderRadius: '50%', background: jugado ? '#dcfce7' : '#f1f5f9', color: jugado ? '#15803d' : muted, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{p.numero}</span>
                              <span style={{ fontSize: 11, color: hint, width: 46 }}>{esDobles ? 'Dobles' : 'Individ.'}</span>
                              <span style={{ fontSize: 13, color: ganoA ? '#15803d' : ink, fontWeight: ganoA ? 800 : 600 }}>{nombre(p.a)}{p.a2 ? ` / ${nombre(p.a2)}` : ''}</span>
                              <span style={{ fontSize: 11, color: hint }}>vs</span>
                              <span style={{ fontSize: 13, color: jugado && !ganoA ? '#15803d' : ink, fontWeight: jugado && !ganoA ? 800 : 600 }}>{nombre(p.b)}{p.b2 ? ` / ${nombre(p.b2)}` : ''}</span>
                              <span style={{ flex: 1 }} />
                              {jugado && <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#15803d', background: '#dcfce7', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>{p.setsA}–{p.setsB}</span>}
                              {noSeJuega && !jugado && <span style={{ fontSize: 11, color: muted }}>no se juega</span>}
                              {esAdmin && !noSeJuega && (
                                <button onClick={() => setMarcando(abiertoP ? null : p.id)} style={{ ...boton(!jugado), padding: '4px 10px', fontSize: 11 }}>{abiertoP ? 'Cerrar' : jugado ? 'Corregir' : '📝 Marcar'}</button>
                              )}
                            </div>
                            {abiertoP && (
                              <MarcadorSets
                                key={`${p.id}-${p.setsA ?? ''}`}
                                nombreA={`${nombre(p.a)}${p.a2 ? ` / ${nombre(p.a2)}` : ''}`}
                                nombreB={`${nombre(p.b)}${p.b2 ? ` / ${nombre(p.b2)}` : ''}`}
                                formato="bo5"
                                guardando={ocupado}
                                onCancelar={() => setMarcando(null)}
                                onListo={parciales => marcar(p, parciales)}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
