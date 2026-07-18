'use client'

import { useId, useMemo, useState } from 'react'
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
      setMensaje('Guardado.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los cambios.')
    } finally {
      setGuardando(false)
    }
  }

  const btn = (dis: boolean): React.CSSProperties => ({
    width: 26, height: 26, display: 'inline-grid', placeItems: 'center', flexShrink: 0,
    border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#475569',
    cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1, padding: 0,
  })

  return (
    <section
      aria-labelledby={tituloId}
      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', boxSizing: 'border-box' }}
    >
      <h4 id={tituloId} style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 13, fontWeight: 700 }}>
        Cabezas de serie
      </h4>

      {cabezas.length > 0 && (
        <ol aria-label="Cabezas de serie" style={{ margin: '0 0 8px', padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
          {cabezas.map((cabeza, indice) => (
            <li
              key={`${cabeza.id}-${indice}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                border: idsDuplicados.has(cabeza.id) ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                borderRadius: 7, background: idsDuplicados.has(cabeza.id) ? '#fef2f2' : '#f8fafc',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#4f46e5', fontWeight: 800, width: 22, textAlign: 'center', flexShrink: 0 }}>
                #{indice + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 600 }}>
                {cabeza.nombre || 'Sin nombre'}
              </span>
              <button type="button" onClick={() => mover(indice, -1)} disabled={bloqueado || indice === 0} aria-label="Subir" style={btn(bloqueado || indice === 0)}>
                <ArrowUp size={13} />
              </button>
              <button type="button" onClick={() => mover(indice, 1)} disabled={bloqueado || indice === cabezas.length - 1} aria-label="Bajar" style={btn(bloqueado || indice === cabezas.length - 1)}>
                <ArrowDown size={13} />
              </button>
              <button type="button" onClick={() => quitar(indice)} disabled={bloqueado} aria-label="Quitar" style={{ ...btn(bloqueado), borderColor: '#fecaca', color: '#dc2626' }}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          id={selectorId}
          value={candidatoId}
          onChange={e => { setCandidatoId(e.target.value); setError('') }}
          disabled={bloqueado || candidatosDisponibles.length === 0}
          aria-label="Agregar cabeza de serie"
          style={{ flex: 1, minWidth: 0, padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#0f172a', fontSize: 12 }}
        >
          <option value="">{candidatosDisponibles.length === 0 ? 'Sin jugadores' : 'Agregar…'}</option>
          {candidatosDisponibles.map(c => <option key={c.id} value={c.id}>{c.nombre || 'Sin nombre'}</option>)}
        </select>
        <button
          type="button"
          onClick={agregar}
          disabled={bloqueado || !candidatoId}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px', border: '1px solid #c7d2fe', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 700, cursor: bloqueado || !candidatoId ? 'not-allowed' : 'pointer', opacity: bloqueado || !candidatoId ? 0.5 : 1, whiteSpace: 'nowrap' }}
        >
          <Plus size={13} /> Agregar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={bloqueado || idsDuplicados.size > 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: 0, borderRadius: 6, background: '#4f46e5', color: '#fff', fontSize: 12, fontWeight: 700, cursor: bloqueado || idsDuplicados.size > 0 ? 'not-allowed' : 'pointer', opacity: bloqueado || idsDuplicados.size > 0 ? 0.55 : 1, whiteSpace: 'nowrap' }}
        >
          {guardando ? <Loader2 size={13} /> : <Save size={13} />}
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {(error || idsDuplicados.size > 0 || mensaje) && (
        <p aria-live="polite" style={{ margin: '4px 0 0', fontSize: 11, color: error || idsDuplicados.size > 0 ? '#dc2626' : '#15803d' }}>
          {error || (idsDuplicados.size > 0 ? 'Hay jugadores duplicados.' : mensaje)}
        </p>
      )}
    </section>
  )
}
