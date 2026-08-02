'use client'

// Modal que se abre al apretar "Programar". Junta lo que cada jugador avisó
// que no puede — una fecha entera, o un tramo horario — antes de armar el
// horario, en vez de tener que mover partidos a mano después.
//
// Si nadie tiene nada, se aprieta Programar y listo: funciona igual que antes.

import { useState } from 'react'

export interface RestriccionEditable {
  jugadorId: string
  fechaNumero: number | null   // null = todas las fechas
  horaDesde: string | null
  horaHasta: string | null
}

interface Props {
  jugadores: Array<{ id: string; nombre: string }>
  numFechasRegulares: number
  bloqueInicio: string
  bloqueFin: string
  restriccionesIniciales: RestriccionEditable[]
  guardando: boolean
  onCancelar: () => void
  onProgramar: (restricciones: RestriccionEditable[]) => void
}

const texto = '#0f172a'
const mutado = '#64748b'
const borde = '#e2e8f0'

// Los tres casos que aparecen de verdad; "otro" abre el rango a mano.
type Franja = 'todo' | 'no_puede' | 'manana' | 'tarde' | 'otro'

interface FilaJugador {
  franja: Franja
  desde: string
  hasta: string
  fechas: Set<number>   // vacío = todas
}

export default function ModalRestricciones({
  jugadores, numFechasRegulares, bloqueInicio, bloqueFin,
  restriccionesIniciales, guardando, onCancelar, onProgramar,
}: Props) {
  const mediodia = '12:00'

  // Reconstruye el estado del formulario a partir de lo que ya estaba guardado.
  const [filas, setFilas] = useState<Map<string, FilaJugador>>(() => {
    const mapa = new Map<string, FilaJugador>()
    for (const r of restriccionesIniciales) {
      const previa = mapa.get(r.jugadorId)
      const fechas = previa?.fechas ?? new Set<number>()
      if (r.fechaNumero !== null) fechas.add(r.fechaNumero)

      let franja: Franja = previa?.franja ?? 'todo'
      let desde = previa?.desde ?? bloqueInicio
      let hasta = previa?.hasta ?? bloqueFin
      if (!r.horaDesde && !r.horaHasta) {
        franja = 'no_puede'
      } else if (!r.horaDesde && r.horaHasta === mediodia) {
        franja = 'manana'
      } else if (r.horaDesde === mediodia && !r.horaHasta) {
        franja = 'tarde'
      } else {
        franja = 'otro'
        desde = r.horaDesde ?? bloqueInicio
        hasta = r.horaHasta ?? bloqueFin
      }
      mapa.set(r.jugadorId, { franja, desde, hasta, fechas })
    }
    return mapa
  })

  const filaDe = (id: string): FilaJugador =>
    filas.get(id) ?? { franja: 'todo', desde: bloqueInicio, hasta: bloqueFin, fechas: new Set() }

  function actualizar(id: string, cambio: Partial<FilaJugador>) {
    setFilas(prev => {
      const siguiente = new Map(prev)
      siguiente.set(id, { ...filaDe(id), ...cambio })
      return siguiente
    })
  }

  function alternarFecha(id: string, numero: number) {
    const fila = filaDe(id)
    const fechas = new Set(fila.fechas)
    if (fechas.has(numero)) fechas.delete(numero)
    else fechas.add(numero)
    actualizar(id, { fechas })
  }

  // Traduce el formulario al modelo que entiende el motor.
  function construir(): RestriccionEditable[] {
    const salida: RestriccionEditable[] = []
    for (const j of jugadores) {
      const fila = filas.get(j.id)
      if (!fila || fila.franja === 'todo') continue

      const horas =
        fila.franja === 'no_puede' ? { horaDesde: null, horaHasta: null }
        : fila.franja === 'manana' ? { horaDesde: null, horaHasta: mediodia }
        : fila.franja === 'tarde'  ? { horaDesde: mediodia, horaHasta: null }
        : { horaDesde: fila.desde, horaHasta: fila.hasta }

      // Sin fechas marcadas la restricción vale para toda la liga.
      const fechas = fila.fechas.size > 0 ? [...fila.fechas] : [null]
      for (const fechaNumero of fechas) {
        salida.push({ jugadorId: j.id, fechaNumero, ...horas })
      }
    }
    return salida
  }

  const conRestriccion = jugadores.filter(j => (filas.get(j.id)?.franja ?? 'todo') !== 'todo')
  const numeros = Array.from({ length: numFechasRegulares }, (_, i) => i + 1)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: '#fff', border: `1px solid ${borde}`, borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(15,23,42,0.14)' }}>

        <div style={{ padding: '22px 26px 14px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: texto, marginBottom: 5 }}>
            ¿Alguien avisó que no puede?
          </div>
          <div style={{ fontSize: 12, color: mutado, lineHeight: 1.5 }}>
            Marcá acá lo que sepas y el horario se arma respetándolo. Si no hay nada que marcar,
            apretá Programar directo.
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 26px', flex: 1 }}>
          {jugadores.map(j => {
            const fila = filaDe(j.id)
            const activo = fila.franja !== 'todo'
            return (
              <div key={j.id} style={{
                borderBottom: `1px solid ${borde}`, padding: '11px 0',
                background: activo ? '#fffbeb' : 'transparent',
                marginLeft: activo ? -10 : 0, marginRight: activo ? -10 : 0,
                paddingLeft: activo ? 10 : 0, paddingRight: activo ? 10 : 0,
                borderRadius: activo ? 8 : 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, color: texto, fontWeight: activo ? 600 : 400, flex: 1, minWidth: 130 }}>
                    {j.nombre}
                  </div>
                  <select
                    value={fila.franja}
                    onChange={e => actualizar(j.id, { franja: e.target.value as Franja })}
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 7, border: `1px solid ${borde}`, background: '#fff', color: texto }}>
                    <option value="todo">Puede a cualquier hora</option>
                    <option value="no_puede">No puede ir</option>
                    <option value="manana">Sólo en la mañana</option>
                    <option value="tarde">Sólo en la tarde</option>
                    <option value="otro">Sólo en un horario…</option>
                  </select>
                </div>

                {fila.franja === 'otro' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 12, color: mutado }}>
                    Desde
                    <input type="time" value={fila.desde} step={1800}
                      onChange={e => actualizar(j.id, { desde: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 7px', borderRadius: 6, border: `1px solid ${borde}` }} />
                    hasta
                    <input type="time" value={fila.hasta} step={1800}
                      onChange={e => actualizar(j.id, { hasta: e.target.value })}
                      style={{ fontSize: 12, padding: '4px 7px', borderRadius: 6, border: `1px solid ${borde}` }} />
                  </div>
                )}

                {activo && (
                  <div style={{ marginTop: 9 }}>
                    <div style={{ fontSize: 11, color: mutado, marginBottom: 5 }}>
                      {fila.fechas.size === 0
                        ? 'En todas las fechas — tocá una para que valga sólo en esa'
                        : `Sólo en la${fila.fechas.size > 1 ? 's' : ''} fecha${fila.fechas.size > 1 ? 's' : ''} ${[...fila.fechas].sort((a, b) => a - b).join(', ')}`}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {numeros.map(n => {
                        const marcada = fila.fechas.has(n)
                        return (
                          <button key={n} type="button" onClick={() => alternarFecha(j.id, n)}
                            style={{
                              fontSize: 11, fontWeight: 600, width: 30, height: 27, borderRadius: 7, cursor: 'pointer',
                              border: `1px solid ${marcada ? '#d97706' : borde}`,
                              background: marcada ? '#d97706' : '#fff',
                              color: marcada ? '#fff' : mutado,
                            }}>
                            {n}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '14px 26px 20px', borderTop: `1px solid ${borde}` }}>
          <div style={{ fontSize: 12, color: conRestriccion.length > 0 ? '#92400e' : mutado, marginBottom: 12 }}>
            {conRestriccion.length === 0
              ? 'Nadie tiene restricciones: se programa como siempre.'
              : `${conRestriccion.length} jugador${conRestriccion.length > 1 ? 'es' : ''} con restricciones. ` +
                'Si algún partido no entra, te aviso cuál y por quién.'}
          </div>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancelar} disabled={guardando}
              style={{ fontSize: 13, padding: '9px 16px', borderRadius: 9, border: `1px solid ${borde}`, background: '#fff', color: mutado, cursor: guardando ? 'default' : 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={() => onProgramar(construir())} disabled={guardando}
              style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 9, border: 'none', background: guardando ? '#94a3b8' : '#4f46e5', color: '#fff', cursor: guardando ? 'default' : 'pointer' }}>
              {guardando ? 'Programando…' : 'Programar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
