'use client'

// Lo que el alumno puede hacer con sus clases de las próximas dos semanas:
// avisar que no va a una, y ver dónde recuperarla.
//
// Reubicarlo NO se hace desde acá a propósito: el alumno ve qué hay libre y lo
// conversa con el profe por WhatsApp, y el profe lo asigna desde Cupos/bloques.
// Es la regla que pidió Spinhouse, y además evita que dos alumnos tomen el
// mismo lugar en el mismo segundo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { diaLabel, hhmm, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import {
  DIAS_VENTANA, HORAS_AVISO, conservaDerecho, minutosHastaLaClase, ocurrencias, sumarDias,
  type BloqueSemanal,
} from '@/lib/domain/cuposDia'
import { linkWhatsApp } from '@/lib/whatsapp'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Bloque = BloqueSemanal & {
  nombre: string
  sede: string
  hora_fin: string
  cupo_maximo: number
}

type SaldoFila = { jugador_id: string; saldo: number; vence_el: string }

type Movimiento = {
  bloque_id: string
  fecha: string
  tipo: 'libera' | 'toma'
  con_derecho: boolean
}

/** Cómo se lee una fecha ISO en la lista: "mar 2 sep". */
function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function PanelRecuperarClases({
  clubId, jugadorId, nombre,
}: { clubId: string; jugadorId: string; nombre: string }) {
  const [mios, setMios]           = useState<Bloque[]>([])
  const [delClub, setDelClub]     = useState<Bloque[]>([])
  const [movs, setMovs]           = useState<Movimiento[]>([])
  const [libres, setLibres]       = useState<Map<string, number>>(new Map())
  const [suspendidas, setSusp]    = useState<Set<string>>(new Set())
  const [profesores, setProfes]   = useState<Map<string, string[]>>(new Map())
  const [telefono, setTelefono]   = useState<string | null>(null)
  const [saldoFila, setSaldo]     = useState<SaldoFila | null>(null)
  const [cargando, setCargando]   = useState(true)

  // La clase que se está por cancelar, con el comentario que la acompaña.
  const [aCancelar, setACancelar] = useState<{ bloque: Bloque; fecha: string } | null>(null)
  const [motivo, setMotivo]       = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  const hoy   = fechaChile()
  const hasta = sumarDias(hoy, DIAS_VENTANA)

  const cargar = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any
    const [mis, todos, movimientos, saldos, cupos, exc, profRel, profs, club] = await Promise.all([
      db.from('bloque_jugadores')
        .select('bloques_horario(id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,vigente_desde,vigente_hasta)')
        .eq('jugador_id', jugadorId).is('vigente_hasta', null),
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo')
        .eq('club_id', clubId).eq('activo', true)
        .lte('vigente_desde', hasta)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`),
      // Sus movimientos de la ventana visible: sirven para pintar el estado de
      // cada clase, NO para contar el saldo. El saldo lo da la base.
      db.from('bloque_cupos_dia')
        .select('bloque_id,fecha,tipo,con_derecho')
        .eq('jugador_id', jugadorId).gte('fecha', sumarDias(hoy, -DIAS_VENTANA)),
      db.rpc('saldos_recuperacion'),
      db.rpc('cupos_libres_por_dia', { p_desde: hoy, p_hasta: hasta }),
      db.from('bloque_excepciones').select('bloque_id,fecha').gte('fecha', hoy).lte('fecha', hasta),
      db.from('bloque_profesores').select('bloque_id,profesor_id').is('vigente_hasta', null),
      db.from('profesores').select('id,nombre').eq('club_id', clubId),
      db.from('clubes').select('telefono').eq('id', clubId).maybeSingle(),
    ])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const vigentes = ((mis.data ?? []) as { bloques_horario: (Bloque & { vigente_desde: string; vigente_hasta: string | null }) | null }[])
      .map(r => r.bloques_horario)
      .filter((b): b is Bloque & { vigente_desde: string; vigente_hasta: string | null } =>
        !!b && b.vigente_desde <= hasta && (b.vigente_hasta === null || b.vigente_hasta >= hoy))
    setMios([...new Map(vigentes.map(b => [b.id, b as Bloque])).values()])

    setDelClub((todos.data ?? []) as Bloque[])
    setMovs((movimientos.data ?? []) as Movimiento[])
    // Una sola fila como mucho: la función solo devuelve al propio jugador.
    setSaldo(((saldos.data ?? []) as SaldoFila[])[0] ?? null)
    setLibres(new Map(((cupos.data ?? []) as { bloque_id: string; fecha: string; libres: number }[])
      .map(c => [`${c.bloque_id}|${c.fecha}`, c.libres])))
    setSusp(new Set(((exc.data ?? []) as { bloque_id: string; fecha: string }[])
      .map(e => `${e.bloque_id}|${e.fecha}`)))

    const nombreProf = new Map(((profs.data ?? []) as { id: string; nombre: string }[]).map(p => [p.id, p.nombre]))
    const porBloque = new Map<string, string[]>()
    for (const r of (profRel.data ?? []) as { bloque_id: string; profesor_id: string }[]) {
      const n = nombreProf.get(r.profesor_id)
      if (n) porBloque.set(r.bloque_id, [...(porBloque.get(r.bloque_id) ?? []), n])
    }
    setProfes(porBloque)
    setTelefono((club.data as { telefono: string | null } | null)?.telefono ?? null)
    setCargando(false)
  }, [clubId, jugadorId, hoy, hasta])

  useEffect(() => { void cargar() }, [cargar])
  // Si el profe lo asigna a un bloque de recuperación, aparece sin recargar.
  useEnVivo(
    ['bloque_cupos_dia', 'bloque_jugadores', 'bloques_horario'],
    clubId, cargar,
    { conClub: ['bloque_cupos_dia', 'bloques_horario'] },
  )

  const movPorClase = useMemo(
    () => new Map(movs.map(m => [`${m.bloque_id}|${m.fecha}`, m])),
    [movs],
  )

  // Sus clases de las próximas dos semanas, ya en fechas.
  const proximas = useMemo(
    () => ocurrencias({ bloques: mios, hoy, dias: DIAS_VENTANA, excluir: suspendidas }),
    [mios, hoy, suspendidas],
  )

  // Las que el profe le asignó para recuperar: bloques que no son suyos.
  const recuperaciones = useMemo(() => {
    const porId = new Map(delClub.map(b => [b.id, b]))
    return movs
      .filter(m => m.tipo === 'toma' && m.fecha >= hoy)
      .map(m => ({ bloque: porId.get(m.bloque_id), fecha: m.fecha }))
      .filter((r): r is { bloque: Bloque; fecha: string } => !!r.bloque)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [movs, delClub, hoy])

  // El saldo lo calcula `saldos_recuperacion()` (migración 231) y NO esta
  // pantalla. Calculado acá quedaba atado a la ventana de 14 días de la
  // consulta de arriba: un crédito de hace 20 días desaparecía para el alumno
  // mientras el profe lo seguía viendo, y la resta podía dar negativo.
  const saldo = saldoFila?.saldo ?? 0

  // Dónde podría recuperar: clases con lugar, de bloques que no son suyos.
  const disponibles = useMemo(() => {
    if (saldo <= 0) return []
    const esMio = new Set(mios.map(b => b.id))
    const ahora = horaChile()
    return ocurrencias({ bloques: delClub.filter(b => !esMio.has(b.id)), hoy, dias: DIAS_VENTANA, excluir: suspendidas })
      .filter(o => (libres.get(`${o.bloque.id}|${o.fecha}`) ?? 0) > 0)
      // Una clase que ya empezó no se puede pedir.
      .filter(o => minutosHastaLaClase({ fecha: o.fecha, horaInicio: o.bloque.hora_inicio, hoy, ahora }) > 0)
      // Y la que ya le asignaron tampoco se vuelve a pedir.
      .filter(o => !movPorClase.has(`${o.bloque.id}|${o.fecha}`))
  }, [saldo, delClub, mios, hoy, suspendidas, libres, movPorClase])

  async function cancelar() {
    if (!aCancelar) return
    setGuardando(true); setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).rpc('cancelar_bloque_dia', {
      p_bloque_id: aCancelar.bloque.id,
      p_fecha:     aCancelar.fecha,
      p_motivo:    motivo,
    })
    setGuardando(false)
    if (err) { setError(err.message); return }
    setACancelar(null); setMotivo('')
    await cargar()
  }

  async function deshacer(bloqueId: string, fecha: string) {
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).rpc('deshacer_cancelacion_dia', {
      p_bloque_id: bloqueId, p_fecha: fecha,
    })
    if (err) { setError(err.message); return }
    await cargar()
  }

  if (cargando) {
    return <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando tus clases...</div>
  }

  const ahora = horaChile()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Saldo de clases por recuperar ── */}
      {saldo > 0 && (
        <div style={{ ...card, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>
            Tenés {saldo} {saldo === 1 ? 'clase' : 'clases'} por recuperar
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 4, lineHeight: 1.5 }}>
            Elegí abajo un bloque con lugar y mandale el mensaje al profe. Él te asigna y te aparece acá.
          </div>
          {/* Que caduquen sin avisar es lo que hacía la versión anterior, y era
              lo peor: el alumno perdía el derecho sin que nada se lo dijera. */}
          {saldoFila?.vence_el && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 6, fontWeight: 600 }}>
              ⏳ La primera vence el {fechaCorta(saldoFila.vence_el)}. Después se pierde.
            </div>
          )}
        </div>
      )}

      {/* ── Recuperaciones ya asignadas ── */}
      {recuperaciones.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: text, margin: '0 0 8px' }}>Vas a recuperar en</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recuperaciones.map(r => (
              <div key={`${r.bloque.id}|${r.fecha}`} style={{ ...card, padding: 14, borderLeft: '4px solid #16a34a' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>{r.bloque.nombre}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                  {fechaCorta(r.fecha)} · {rangoHorario(r.bloque.hora_inicio, r.bloque.hora_fin)} · 📍 {sedeLabel(r.bloque.sede)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Próximas clases ── */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: text, margin: '0 0 2px' }}>Tus próximas clases</h2>
        <p style={{ fontSize: 12, color: hint, margin: '0 0 10px' }}>
          Si no vas a poder ir, avisá acá. Con {HORAS_AVISO} horas o más de anticipación conservás el derecho a recuperarla.
        </p>

        {proximas.length === 0 ? (
          <div style={{ ...card, padding: 24, textAlign: 'center', color: hint, fontSize: 13 }}>
            No tenés clases en las próximas dos semanas.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {proximas.map(({ bloque, fecha }) => {
              const clave     = `${bloque.id}|${fecha}`
              const mov       = movPorClase.get(clave)
              const cancelada = mov?.tipo === 'libera'
              const minutos   = minutosHastaLaClase({ fecha, horaInicio: bloque.hora_inicio, hoy, ahora })
              const empezada  = minutos <= 0
              const conDerecho = conservaDerecho({ fecha, horaInicio: bloque.hora_inicio, hoy, ahora })

              return (
                <div key={clave} style={{
                  ...card, padding: 14,
                  borderLeft: `4px solid ${cancelada ? '#f59e0b' : '#4f46e5'}`,
                  opacity: cancelada ? 0.85 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: cancelada ? '#b45309' : '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {fechaCorta(fecha)}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {rangoHorario(bloque.hora_inicio, bloque.hora_fin)}
                      </div>
                      <div style={{ fontSize: 13, color: text, marginTop: 4, fontWeight: 600 }}>{bloque.nombre}</div>
                      <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>📍 {sedeLabel(bloque.sede)}</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      {cancelada ? (
                        <>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                            background: mov?.con_derecho ? '#dcfce7' : '#fee2e2',
                            color:      mov?.con_derecho ? '#15803d' : '#b91c1c',
                          }}>
                            {mov?.con_derecho ? 'Avisado · recuperable' : 'Avisado · sin recuperación'}
                          </span>
                          {conDerecho && (
                            <button onClick={() => void deshacer(bloque.id, fecha)}
                              style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: muted, cursor: 'pointer' }}>
                              Sí voy a ir, deshacer
                            </button>
                          )}
                        </>
                      ) : empezada ? (
                        <span style={{ fontSize: 11, color: hint }}>Ya empezó</span>
                      ) : (
                        <button onClick={() => { setACancelar({ bloque, fecha }); setMotivo(''); setError('') }}
                          className="tocable"
                          style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#b45309', cursor: 'pointer' }}>
                          No podré asistir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Dónde recuperar ── */}
      {saldo > 0 && (
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: text, margin: '0 0 2px' }}>Dónde podés recuperar</h2>
          <p style={{ fontSize: 12, color: hint, margin: '0 0 10px' }}>
            Bloques con lugar en las próximas dos semanas. Elegí uno y mandale el mensaje al profe: él te asigna.
          </p>

          {disponibles.length === 0 ? (
            <div style={{ ...card, padding: 24, textAlign: 'center', color: hint, fontSize: 13 }}>
              Ahora mismo no hay bloques con lugar. Volvé a mirar en un rato: cuando alguien avisa que no va, aparece acá.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
              {disponibles.map(({ bloque, fecha }) => {
                const cupos = libres.get(`${bloque.id}|${fecha}`) ?? 0
                const profes = profesores.get(bloque.id) ?? []
                const link = linkWhatsApp(telefono,
                  `Hola! Soy ${nombre}. Avisé que no podré ir a una de mis clases y me gustaría recuperarla en ` +
                  `${bloque.nombre}, ${diaLabel(bloque.dia_semana)} ${fechaCorta(fecha)} a las ${hhmm(bloque.hora_inicio)}. ¿Se puede?`)

                return (
                  <div key={`${bloque.id}|${fecha}`} style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {fechaCorta(fecha)}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        {rangoHorario(bloque.hora_inicio, bloque.hora_fin)}
                      </div>
                      <div style={{ fontSize: 13, color: text, marginTop: 4, fontWeight: 600 }}>{bloque.nombre}</div>
                      <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>📍 {sedeLabel(bloque.sede)}</div>
                      {profes.length > 0 && (
                        <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{profes.join(' + ')}</div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', marginTop: 6 }}>
                        {cupos} {cupos === 1 ? 'lugar libre' : 'lugares libres'}
                      </div>
                    </div>

                    {link ? (
                      <WhatsAppBtn href={link} variant="compact" style={{ justifyContent: 'center', padding: '9px 12px', fontSize: 12 }}>
                        Pedirle este bloque al profe
                      </WhatsAppBtn>
                    ) : (
                      <div style={{ fontSize: 11, color: hint }}>
                        El club todavía no cargó su WhatsApp. Avisale al profe en la cancha.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Confirmación de la cancelación ── */}
      {aCancelar && (() => {
        const conDerecho = conservaDerecho({
          fecha: aCancelar.fecha, horaInicio: aCancelar.bloque.hora_inicio, hoy, ahora,
        })
        return (
          <div className="anim-fondo" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
            onClick={e => { if (e.target === e.currentTarget && !guardando) setACancelar(null) }}>
            <div className="anim-modal" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, padding: 22, boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: text }}>
                {aCancelar.bloque.nombre}
              </div>
              <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 14 }}>
                {fechaCorta(aCancelar.fecha)} · {rangoHorario(aCancelar.bloque.hora_inicio, aCancelar.bloque.hora_fin)}
              </div>

              {conDerecho ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
                  Estás avisando con más de {HORAS_AVISO} horas, así que <strong>conservás el derecho a recuperar</strong> esta
                  clase. Tu lugar queda disponible para otro compañero.
                </div>
              ) : (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>
                  Quedan menos de {HORAS_AVISO} horas para esta clase. Si confirmás, <strong>perdés el bloque y no vas a poder
                  recuperarlo</strong>. Tu lugar igual queda disponible para otro compañero.
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12, color: muted, margin: '16px 0 6px' }}>
                ¿Por qué no vas a poder ir? <span style={{ color: hint }}>(lo lee el profe)</span>
              </label>
              <textarea
                value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
                placeholder="Opcional. Ej: tengo prueba ese día."
                style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: text, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginTop: 10 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setACancelar(null)} disabled={guardando}
                  style={{ flex: 1, padding: '11px 16px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, color: muted, cursor: guardando ? 'wait' : 'pointer' }}>
                  Mejor no
                </button>
                <button onClick={() => void cancelar()} disabled={guardando}
                  style={{ flex: 1, padding: '11px 16px', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: guardando ? 'wait' : 'pointer',
                    background: conDerecho ? '#f59e0b' : '#dc2626' }}>
                  {guardando ? 'Avisando...' : conDerecho ? 'Confirmar aviso' : 'Sí, perder la clase'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
