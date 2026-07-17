'use client'

import { useId, useMemo, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from 'lucide-react'

export type CabezaSerieJugador = {
  id: string
  nombre: string
}

export type ResultadoGuardarCabezas = void | {
  error?: string | null
}

type CabezasSerieEditorProps = {
  cabezas: CabezaSerieJugador[]
  candidatos: CabezaSerieJugador[]
  disabled?: boolean
  onChange: (cabezas: CabezaSerieJugador[]) => void
  onGuardar: (jugadorIds: string[]) => Promise<ResultadoGuardarCabezas>
}

const botonIcono: CSSProperties = {
  width: 34,
  height: 34,
  display: 'inline-grid',
  placeItems: 'center',
  flexShrink: 0,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
}

export default function CabezasSerieEditor({
  cabezas,
  candidatos,
  disabled = false,
  onChange,
  onGuardar,
}: CabezasSerieEditorProps) {
  const tituloId = useId()
  const selectorId = useId()
  const [candidatoId, setCandidatoId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const idsDuplicados = useMemo(() => {
    const vistos = new Set<string>()
    const duplicados = new Set<string>()
    for (const cabeza of cabezas) {
      if (!cabeza.id || vistos.has(cabeza.id)) duplicados.add(cabeza.id)
      vistos.add(cabeza.id)
    }
    return duplicados
  }, [cabezas])

  const candidatosDisponibles = useMemo(() => {
    const seleccionados = new Set(cabezas.map(cabeza => cabeza.id))
    const vistos = new Set<string>()
    return candidatos.filter(candidato => {
      if (!candidato.id || seleccionados.has(candidato.id) || vistos.has(candidato.id)) return false
      vistos.add(candidato.id)
      return true
    })
  }, [cabezas, candidatos])

  const bloqueado = disabled || guardando

  function cambiar(nuevaLista: CabezaSerieJugador[]) {
    setError('')
    setMensaje('')
    onChange(nuevaLista)
  }

  function agregar() {
    const candidato = candidatosDisponibles.find(item => item.id === candidatoId)
    if (!candidato) {
      setError('Selecciona un jugador disponible.')
      return
    }
    if (cabezas.some(cabeza => cabeza.id === candidato.id)) {
      setError('Ese jugador ya es cabeza de serie.')
      return
    }
    cambiar([...cabezas, candidato])
    setCandidatoId('')
  }

  function quitar(indice: number) {
    cambiar(cabezas.filter((_, posicion) => posicion !== indice))
  }

  function mover(indice: number, desplazamiento: -1 | 1) {
    const destino = indice + desplazamiento
    if (destino < 0 || destino >= cabezas.length) return
    const nuevaLista = [...cabezas]
    ;[nuevaLista[indice], nuevaLista[destino]] = [nuevaLista[destino], nuevaLista[indice]]
    cambiar(nuevaLista)
  }

  async function guardar() {
    setError('')
    setMensaje('')
    if (idsDuplicados.size > 0) {
      setError('La lista contiene jugadores duplicados.')
      return
    }

    setGuardando(true)
    try {
      const resultado = await onGuardar(cabezas.map(cabeza => cabeza.id))
      if (resultado && resultado.error) {
        setError(resultado.error)
        return
      }
      setMensaje('Cambios guardados.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los cambios.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section
      aria-labelledby={tituloId}
      style={{
        width: '100%',
        padding: 16,
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        background: '#fff',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h3 id={tituloId} style={{ margin: 0, color: '#0f172a', fontSize: 15, fontWeight: 700 }}>
          Cabezas de serie
        </h3>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.45 }}>
          El número define la prioridad, la posición espejo del bracket y el orden para recibir BYE.
        </p>
      </div>

      {cabezas.length === 0 ? (
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13 }}>
          No hay cabezas de serie seleccionados.
        </p>
      ) : (
        <ol aria-label="Lista ordenada de cabezas de serie" style={{ margin: '0 0 14px', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {cabezas.map((cabeza, indice) => (
            <li
              key={`${cabeza.id}-${indice}`}
              style={{
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: '36px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 8,
                padding: 8,
                border: idsDuplicados.has(cabeza.id) ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                borderRadius: 10,
                background: idsDuplicados.has(cabeza.id) ? '#fef2f2' : '#f8fafc',
              }}
            >
              <span aria-label={`Prioridad ${indice + 1}`} style={{ color: '#4f46e5', fontSize: 13, fontWeight: 800, textAlign: 'center' }}>
                #{indice + 1}
              </span>
              <span style={{ minWidth: 0, overflow: 'hidden', color: '#0f172a', fontSize: 13, fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cabeza.nombre || 'Jugador sin nombre'}
              </span>
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  type="button"
                  onClick={() => mover(indice, -1)}
                  disabled={bloqueado || indice === 0}
                  aria-label={`Subir a ${cabeza.nombre || 'jugador'}`}
                  title="Subir prioridad"
                  style={{ ...botonIcono, opacity: bloqueado || indice === 0 ? 0.4 : 1, cursor: bloqueado || indice === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => mover(indice, 1)}
                  disabled={bloqueado || indice === cabezas.length - 1}
                  aria-label={`Bajar a ${cabeza.nombre || 'jugador'}`}
                  title="Bajar prioridad"
                  style={{ ...botonIcono, opacity: bloqueado || indice === cabezas.length - 1 ? 0.4 : 1, cursor: bloqueado || indice === cabezas.length - 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => quitar(indice)}
                  disabled={bloqueado}
                  aria-label={`Quitar a ${cabeza.nombre || 'jugador'}`}
                  title="Quitar cabeza de serie"
                  style={{ ...botonIcono, borderColor: '#fecaca', color: '#dc2626', opacity: bloqueado ? 0.4 : 1, cursor: bloqueado ? 'not-allowed' : 'pointer' }}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <label htmlFor={selectorId} style={{ display: 'block', marginBottom: 5, color: '#334155', fontSize: 12, fontWeight: 600 }}>
        Agregar jugador
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
        <select
          id={selectorId}
          value={candidatoId}
          onChange={event => {
            setCandidatoId(event.target.value)
            setError('')
          }}
          disabled={bloqueado || candidatosDisponibles.length === 0}
          style={{ minWidth: 0, width: '100%', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a', fontSize: 13 }}
        >
          <option value="">{candidatosDisponibles.length === 0 ? 'No hay jugadores disponibles' : 'Seleccionar jugador'}</option>
          {candidatosDisponibles.map(candidato => (
            <option key={candidato.id} value={candidato.id}>{candidato.nombre || 'Jugador sin nombre'}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={agregar}
          disabled={bloqueado || !candidatoId}
          aria-label="Agregar cabeza de serie"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', border: '1px solid #c7d2fe', borderRadius: 8, background: '#eef2ff', color: '#4338ca', fontSize: 13, fontWeight: 700, opacity: bloqueado || !candidatoId ? 0.5 : 1, cursor: bloqueado || !candidatoId ? 'not-allowed' : 'pointer' }}
        >
          <Plus aria-hidden="true" size={16} /> Agregar
        </button>
      </div>

      <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>
        {(error || idsDuplicados.size > 0) && (
          <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 12 }}>
            {error || 'La lista contiene jugadores duplicados.'}
          </p>
        )}
        {!error && idsDuplicados.size === 0 && mensaje && (
          <p style={{ margin: 0, color: '#15803d', fontSize: 12 }}>{mensaje}</p>
        )}
      </div>

      <button
        type="button"
        onClick={guardar}
        disabled={bloqueado || idsDuplicados.size > 0}
        style={{
          width: '100%',
          marginTop: 4,
          padding: '10px 14px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          border: 0,
          borderRadius: 9,
          background: '#4f46e5',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          opacity: bloqueado || idsDuplicados.size > 0 ? 0.55 : 1,
          cursor: bloqueado || idsDuplicados.size > 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {guardando ? <Loader2 aria-hidden="true" size={16} /> : <Save aria-hidden="true" size={16} />}
        {guardando ? 'Guardando…' : 'Guardar cabezas de serie'}
      </button>
    </section>
  )
}
