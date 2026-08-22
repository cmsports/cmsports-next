'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Plus, X, Search, Users } from 'lucide-react'
import { agregarJugadorABloque, quitarJugadorDeBloque } from '@/app/actions/horario'
import { DIAS, hhmm, rangoHorario, type BloqueHorario } from '@/lib/domain/horario'
import { SEDES, sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { soloVigentes } from '@/lib/supabase/vigentes'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Jugador = { id: string; nombre: string; grupo: string | null; categoria: string | null }
type Bloque = BloqueHorario & { profesores: string[] }

export default function PanelCupos({ clubId, esStaff }: { clubId: string; esStaff: boolean }) {
  const [bloques, setBloques]     = useState<Bloque[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [inscritos, setInscritos] = useState<Record<string, string[]>>({})  // bloque_id -> jugador_id[]
  const [cargando, setCargando]   = useState(true)
  const [sedeActiva, setSede]     = useState('buin')
  const [abierto, setAbierto]     = useState<Bloque | null>(null)
  const [busqueda, setBusqueda]   = useState('')
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError]         = useState('')

  const cargar = useCallback(async () => {
    const [{ data: bloquesData }, { data: jugadoresData }, { data: rel }, { data: profRel }, { data: profs }] = await Promise.all([
      // Sin el filtro de vigencia, un grupo dado de baja seguía ocupando cupos.
      soloVigentes(supabase.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
        .eq('club_id', clubId).eq('activo', true), fechaChile()).order('hora_inicio'),
      supabase.from('jugadores').select('id,nombre,grupo,categoria')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false').order('nombre'),
      supabase.from('bloque_jugadores').select('bloque_id,jugador_id').is('vigente_hasta', null),
      supabase.from('bloque_profesores').select('bloque_id,profesor_id').is('vigente_hasta', null),
      supabase.from('profesores').select('id,nombre').eq('club_id', clubId),
    ])

    const nombreProf = new Map((profs ?? []).map(p => [p.id, p.nombre]))
    const profesoresDe = new Map<string, string[]>()
    for (const r of profRel ?? []) {
      profesoresDe.set(r.bloque_id, [...(profesoresDe.get(r.bloque_id) ?? []), nombreProf.get(r.profesor_id) ?? ''])
    }

    const porBloque: Record<string, string[]> = {}
    for (const r of rel ?? []) {
      porBloque[r.bloque_id] = [...(porBloque[r.bloque_id] ?? []), r.jugador_id]
    }

    setBloques(((bloquesData ?? []) as BloqueHorario[]).map(b => ({ ...b, profesores: (profesoresDe.get(b.id) ?? []).filter(Boolean) })))
    setJugadores((jugadoresData ?? []) as Jugador[])
    setInscritos(porBloque)
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  // Si alguien mueve gente desde otro dispositivo, esta pantalla se entera sola.
  useEnVivo(['bloque_jugadores', 'bloques_horario'], clubId, cargar, { conClub: ['bloques_horario'] })

  const jugadorPorId = useMemo(() => new Map(jugadores.map(j => [j.id, j])), [jugadores])

  // La lista se actualiza antes de que el servidor conteste y se deshace si
  // falla. Esperar el viaje de ida y vuelta para mover un nombre se siente
  // lento, y acá el profe mueve muchos seguidos.
  async function agregar(bloque: Bloque, jugadorId: string) {
    const antes = inscritos[bloque.id] ?? []
    setInscritos(prev => ({ ...prev, [bloque.id]: [...antes, jugadorId] }))
    setBusqueda('')
    setError('')

    const res = await agregarJugadorABloque({ bloqueId: bloque.id, jugadorId })
    if (res?.error) {
      setInscritos(prev => ({ ...prev, [bloque.id]: antes }))
      setError(String(res.error))
    }
  }

  async function quitar(bloque: Bloque, jugadorId: string) {
    const antes = inscritos[bloque.id] ?? []
    setInscritos(prev => ({ ...prev, [bloque.id]: antes.filter(id => id !== jugadorId) }))
    setError('')

    const res = await quitarJugadorDeBloque({ bloqueId: bloque.id, jugadorId })
    if (res?.error) {
      setInscritos(prev => ({ ...prev, [bloque.id]: antes }))
      setError(String(res.error))
    }
  }

  const bloquesSede = bloques.filter(b => b.sede === sedeActiva)

  // Al abrir un bloque se ofrecen los jugadores que todavía no están en él.
  const candidatos = useMemo(() => {
    if (!abierto) return []
    const yaEstan = new Set(inscritos[abierto.id] ?? [])
    const q = busqueda.trim().toLowerCase()
    return jugadores
      .filter(j => !yaEstan.has(j.id))
      .filter(j => !q || j.nombre.toLowerCase().includes(q))
      .slice(0, 40)
  }, [abierto, inscritos, jugadores, busqueda])

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando cupos...</div>

  return (
    <>
      {/* Sedes */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SEDES.filter(s => s.value !== 'ambos').map(s => {
          const activa = sedeActiva === s.value
          return (
            <button key={s.value} onClick={() => setSede(s.value)}
              style={{ background: activa ? '#4f46e5' : '#f4f7fa', color: activa ? '#fff' : muted,
                border: `1px solid ${activa ? '#4f46e5' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 14px',
                fontSize: 13, fontWeight: activa ? 600 : 400, cursor: 'pointer' }}>
              {s.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Bloques por día */}
      {DIAS.filter(d => bloquesSede.some(b => b.dia_semana === d.value)).map(d => (
        <div key={d.value} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {d.label}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {bloquesSede
              .filter(b => b.dia_semana === d.value)
              .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))
              .map(b => {
                const n = (inscritos[b.id] ?? []).length
                const libres = b.cupo_maximo - n
                const lleno = libres <= 0
                const sobre = n > b.cupo_maximo
                const pct = b.cupo_maximo > 0 ? Math.min(100, Math.round((n / b.cupo_maximo) * 100)) : 0
                const color = sobre ? '#dc2626' : lleno ? '#d97706' : '#16a34a'
                return (
                  <button key={b.id} onClick={() => { setAbierto(b); setBusqueda(''); setError('') }}
                    className="tocable" style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', border: `1px solid ${sobre ? '#fecaca' : '#e2e8f0'}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 2 }}>{b.nombre}</div>
                    <div style={{ fontSize: 11, color: muted }}>{rangoHorario(b.hora_inicio, b.hora_fin)}</div>
                    {b.profesores.length > 0 && (
                      <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{b.profesores.join(' + ')}</div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'monospace' }}>{n}</span>
                      <span style={{ fontSize: 12, color: muted }}>de {b.cupo_maximo}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color }}>
                        {sobre ? `⚠ ${n - b.cupo_maximo} de más` : lleno ? 'Lleno' : `${libres} libre${libres !== 1 ? 's' : ''}`}
                      </span>
                    </div>

                    <div style={{ height: 5, background: '#f1f5f9', borderRadius: 20, overflow: 'hidden', marginTop: 6 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
      ))}

      {bloquesSede.length === 0 && (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
          Sin bloques en {sedeLabel(sedeActiva)}.
        </div>
      )}

      {/* Detalle del bloque */}
      {abierto && (
        <div className="anim-fondo" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setAbierto(null) }}>
          <div className="anim-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>

            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{abierto.nombre}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                  {DIAS.find(d => d.value === abierto.dia_semana)?.label} · {rangoHorario(abierto.hora_inicio, abierto.hora_fin)} · {sedeLabel(abierto.sede).split(' ')[0]}
                </div>
                {(() => {
                  const n = (inscritos[abierto.id] ?? []).length
                  const sobre = n > abierto.cupo_maximo
                  return (
                    <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600, color: sobre ? '#dc2626' : n >= abierto.cupo_maximo ? '#d97706' : '#16a34a' }}>
                      {n} de {abierto.cupo_maximo} cupos fijos
                      {sobre && ` · ⚠ ${n - abierto.cupo_maximo} por sobre el cupo`}
                      {/* Los de plan libre acceso van en su propia bolsa: `cupo_maximo`
                          es "lugares para jugadores con días fijos" y `cupo_libres` es
                          aparte (migración 073). Antes decía "reservados", que se leía
                          como si salieran de los mismos cupos y no es así. */}
                      {abierto.cupo_libres > 0 && ` · ${abierto.cupo_libres} más para libre acceso`}
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setAbierto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '14px 22px', flex: 1 }}>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
                  {error}
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Users size={12} /> Inscritos
              </div>

              {(inscritos[abierto.id] ?? []).length === 0 ? (
                <div style={{ fontSize: 12, color: hint, padding: '10px 0' }}>Todavía no hay nadie en este bloque.</div>
              ) : (
                (inscritos[abierto.id] ?? [])
                  .map(id => jugadorPorId.get(id))
                  .filter((j): j is Jugador => !!j)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                  .map(j => (
                    <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: text }}>{j.nombre}</div>
                        {(j.grupo || j.categoria) && (
                          <div style={{ fontSize: 10, color: hint }}>{[j.grupo, j.categoria].filter(Boolean).join(' · ')}</div>
                        )}
                      </div>
                      {esStaff && (
                        <button onClick={() => quitar(abierto, j.id)} disabled={guardando === j.id} title="Quitar del bloque"
                          style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', cursor: guardando === j.id ? 'wait' : 'pointer', fontSize: 11, padding: '4px 9px' }}>
                          Quitar
                        </button>
                      )}
                    </div>
                  ))
              )}

              {esStaff && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 8px' }}>
                    Agregar jugador
                  </div>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={13} color={hint} style={{ position: 'absolute', left: 10, top: 10 }} />
                    <input
                      value={busqueda} onChange={e => setBusqueda(e.target.value)}
                      placeholder="Buscar por nombre..."
                      style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px 8px 30px', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {candidatos.length === 0 && (
                      <div style={{ fontSize: 12, color: hint, padding: '8px 0' }}>
                        {busqueda ? 'Nadie coincide con esa búsqueda.' : 'Todos los jugadores ya están en este bloque.'}
                      </div>
                    )}
                    {candidatos.map(j => (
                      <button key={j.id} onClick={() => agregar(abierto, j.id)} disabled={guardando === j.id}
                        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: 'transparent', border: 'none', borderRadius: 6, cursor: guardando === j.id ? 'wait' : 'pointer', fontSize: 13, color: text }}>
                        <Plus size={13} color="#16a34a" />
                        <span style={{ flex: 1 }}>{j.nombre}</span>
                        {(j.grupo || j.categoria) && (
                          <span style={{ fontSize: 10, color: hint }}>{[j.grupo, j.categoria].filter(Boolean).join(' · ')}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
