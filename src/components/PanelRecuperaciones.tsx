'use client'

// Un día concreto, bloque por bloque: quién avisó que no viene, cuántos lugares
// quedan y a quién meter en ellos.
//
// Es la contraparte de lo que ve el alumno en Mi horario. Él elige y escribe por
// WhatsApp; acá el profe lo asigna. Que el alumno no se asigne solo es la regla
// que pidió Spinhouse, y de paso evita que dos tomen el mismo lugar a la vez.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Plus, Search } from 'lucide-react'
import { diaSemanaDeFecha, hhmm, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { DIAS_VENTANA, sumarDias } from '@/lib/domain/cuposDia'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Bloque = {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
}

type Movimiento = {
  id: string
  bloque_id: string
  jugador_id: string
  fecha: string
  tipo: 'libera' | 'toma'
  con_derecho: boolean
  motivo: string | null
}

type Jugador = { id: string; nombre: string }

export default function PanelRecuperaciones({ clubId }: { clubId: string }) {
  const [fecha, setFecha]       = useState(fechaChile())
  const [bloques, setBloques]   = useState<Bloque[]>([])
  const [movs, setMovs]         = useState<Movimiento[]>([])
  const [libres, setLibres]     = useState<Map<string, number>>(new Map())
  const [jugadores, setJug]     = useState<Jugador[]>([])
  const [suspendidas, setSusp]  = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)

  const [abierto, setAbierto]   = useState<string | null>(null)  // bloque_id con el buscador abierto
  const [busqueda, setBusqueda] = useState('')
  const [error, setError]       = useState('')

  const hoy = fechaChile()

  const cargar = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any
    const [bloquesRes, movsRes, cuposRes, jugRes, excRes] = await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo')
        .eq('club_id', clubId).eq('activo', true)
        .lte('vigente_desde', fecha)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`),
      // El saldo de cada alumno se cuenta sobre su historia, no sobre este día:
      // avisó el lunes y recupera el jueves de la semana siguiente.
      db.from('bloque_cupos_dia')
        .select('id,bloque_id,jugador_id,fecha,tipo,con_derecho,motivo')
        .eq('club_id', clubId),
      // El número de lugares sale de la base, que es la que sabe contar los
      // fijos vigentes a esa fecha. Repetir la cuenta acá sería un segundo lugar
      // donde puede quedar distinta.
      db.rpc('cupos_libres_por_dia', { p_desde: fecha, p_hasta: fecha }),
      db.from('jugadores').select('id,nombre')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false').order('nombre'),
      db.from('bloque_excepciones').select('bloque_id').eq('fecha', fecha),
    ])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    setBloques((bloquesRes.data ?? []) as Bloque[])
    setMovs((movsRes.data ?? []) as Movimiento[])
    setLibres(new Map(((cuposRes.data ?? []) as { bloque_id: string; libres: number }[])
      .map(c => [c.bloque_id, c.libres])))
    setJug((jugRes.data ?? []) as Jugador[])
    setSusp(new Set(((excRes.data ?? []) as { bloque_id: string }[]).map(e => e.bloque_id)))
    setCargando(false)
  }, [clubId, fecha])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(
    ['bloque_cupos_dia', 'bloque_jugadores', 'bloques_horario'],
    clubId, cargar,
    { conClub: ['bloque_cupos_dia', 'bloques_horario'] },
  )

  const nombreDe = useMemo(() => new Map(jugadores.map(j => [j.id, j.nombre])), [jugadores])

  // Cuántas clases le quedan por recuperar a cada alumno: cada aviso con 24
  // horas suma una, cada bloque que ya se le asignó resta.
  const saldoDe = useMemo(() => {
    const saldo = new Map<string, number>()
    for (const m of movs) {
      if (m.tipo === 'libera' && !m.con_derecho) continue
      saldo.set(m.jugador_id, (saldo.get(m.jugador_id) ?? 0) + (m.tipo === 'libera' ? 1 : -1))
    }
    return saldo
  }, [movs])

  const delDia = useMemo(() => movs.filter(m => m.fecha === fecha), [movs, fecha])

  // Los bloques que se dictan ese día, sin los suspendidos.
  const bloquesDelDia = useMemo(() => {
    const dia = diaSemanaDeFecha(fecha)
    return bloques
      .filter(b => b.dia_semana === dia && !suspendidas.has(b.id))
      .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))
  }, [bloques, fecha, suspendidas])

  async function asignar(bloqueId: string, jugadorId: string) {
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).rpc('asignar_recuperacion_dia', {
      p_jugador_id: jugadorId, p_bloque_id: bloqueId, p_fecha: fecha,
    })
    if (err) { setError(err.message); return }
    setAbierto(null); setBusqueda('')
    await cargar()
  }

  async function quitar(movId: string) {
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('bloque_cupos_dia').delete().eq('id', movId)
    if (err) { setError(err.message); return }
    await cargar()
  }

  // A quién ofrecer para ese bloque: los que tienen saldo primero, porque son
  // los que el profe está buscando. El resto queda abajo, para el caso suelto.
  const candidatos = useCallback((bloqueId: string) => {
    const yaEnEsteDia = new Set(delDia.filter(m => m.bloque_id === bloqueId).map(m => m.jugador_id))
    const q = busqueda.trim().toLowerCase()
    return jugadores
      .filter(j => !yaEnEsteDia.has(j.id))
      .filter(j => !q || j.nombre.toLowerCase().includes(q))
      .sort((a, b) => (saldoDe.get(b.id) ?? 0) - (saldoDe.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 30)
  }, [delDia, jugadores, busqueda, saldoDe])

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: muted }}>Día</label>
        <input type="date" value={fecha} min={sumarDias(hoy, -60)} max={sumarDias(hoy, DIAS_VENTANA)}
          onChange={e => { setFecha(e.target.value); setAbierto(null) }}
          style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: text }} />
        {fecha !== hoy && (
          <button onClick={() => setFecha(hoy)}
            style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: muted, cursor: 'pointer' }}>
            Hoy
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {bloquesDelDia.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
          Ese día no se dicta ningún bloque.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bloquesDelDia.map(b => {
            const cancelaron = delDia.filter(m => m.bloque_id === b.id && m.tipo === 'libera')
            const recuperan  = delDia.filter(m => m.bloque_id === b.id && m.tipo === 'toma')
            const cupos      = libres.get(b.id) ?? 0

            return (
              <div key={b.id} style={{ ...card, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{b.nombre}</div>
                    <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                      {rangoHorario(b.hora_inicio, b.hora_fin)} · 📍 {sedeLabel(b.sede)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cupos > 0 ? '#16a34a' : muted }}>
                    {cupos > 0 ? `${cupos} ${cupos === 1 ? 'lugar libre' : 'lugares libres'}` : 'Sin lugares'}
                  </div>
                </div>

                {cancelaron.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Avisaron que no vienen
                    </div>
                    {cancelaron.map(m => (
                      <div key={m.id} style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, color: text }}>{nombreDe.get(m.jugador_id) ?? 'Alumno'}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: m.con_derecho ? '#dcfce7' : '#fee2e2',
                            color:      m.con_derecho ? '#15803d' : '#b91c1c' }}>
                            {m.con_derecho ? 'recupera' : 'pierde la clase'}
                          </span>
                        </div>
                        {m.motivo && (
                          <div style={{ fontSize: 12, color: muted, marginTop: 3, whiteSpace: 'pre-wrap' }}>{m.motivo}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {recuperan.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      Vienen a recuperar
                    </div>
                    {recuperan.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                        <span style={{ flex: 1, fontSize: 13, color: text }}>{nombreDe.get(m.jugador_id) ?? 'Alumno'}</span>
                        <button onClick={() => void quitar(m.id)} title="Sacar de este bloque"
                          style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', cursor: 'pointer', fontSize: 11, padding: '4px 9px' }}>
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {cupos > 0 && (
                  abierto === b.id ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <Search size={13} color={hint} style={{ position: 'absolute', left: 10, top: 10 }} />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
                          placeholder="Buscar alumno..."
                          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px 8px 30px', fontSize: 13, outline: 'none' }} />
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {candidatos(b.id).map(j => {
                          const saldo = saldoDe.get(j.id) ?? 0
                          return (
                            <button key={j.id} onClick={() => void asignar(b.id, j.id)}
                              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: text }}>
                              <Plus size={13} color="#16a34a" />
                              <span style={{ flex: 1 }}>{j.nombre}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: saldo > 0 ? '#dcfce7' : '#f1f5f9',
                                color:      saldo > 0 ? '#15803d' : hint }}>
                                {saldo > 0 ? `${saldo} por recuperar` : 'sin saldo'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <button onClick={() => { setAbierto(null); setBusqueda('') }}
                        style={{ marginTop: 6, background: 'transparent', border: 'none', color: muted, fontSize: 12, cursor: 'pointer', padding: 0 }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setAbierto(b.id); setBusqueda(''); setError('') }}
                      style={{ marginTop: 12, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#4338ca', cursor: 'pointer' }}>
                      Meter a alguien en este bloque
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
