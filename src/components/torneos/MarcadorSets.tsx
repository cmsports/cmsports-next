'use client'
import { useState } from 'react'
import { esSetValido, resumirBo5 } from '@/lib/domain/marcador'

// Planilla de un partido: los dos nombres y los puntos de cada set. Reemplaza
// los seis botones de marcador (3-0 … 2-3), que daban los sets pero no los
// puntos. Los puntos hacen falta para desempatar a tres en un grupo: cuando el
// ratio de sets también empata, es lo único que separa sin recurrir al juez.
//
// El botón Listo solo se habilita cuando la planilla es un Mejor de Cinco
// terminado de verdad; el servidor vuelve a validar lo mismo con `resumirBo5`.

const MAX_SETS = 5

export default function MarcadorSets({
  nombreA,
  nombreB,
  guardando,
  onListo,
  onCancelar,
}: {
  nombreA: string
  nombreB: string
  guardando?: boolean
  onListo: (parciales: Array<[number, number]>) => void
  onCancelar: () => void
}) {
  // Un casillero vacío es '' y no 0: 0 es un puntaje válido (11-0).
  const [sets, setSets] = useState<Array<[string, string]>>([['', ''], ['', ''], ['', '']])

  const parciales = sets
    .filter(([a, b]) => a !== '' && b !== '')
    .map(([a, b]) => [Number(a), Number(b)] as [number, number])
  // Media fila (11 contra vacío) no es un set jugado: sin esto, `Number('')`
  // la convertiría en un 11-0 válido y habilitaría Listo con datos a medias.
  const hayFilaAMedias = sets.some(([a, b]) => (a === '') !== (b === ''))
  const resumen = hayFilaAMedias ? null : resumirBo5(parciales)

  // Se ofrece un set más solo mientras el partido no esté terminado, para que
  // no queden casilleros de sobra que después invalidan la planilla.
  const puedeAgregar = !resumen && sets.length < MAX_SETS && sets.every(([a, b]) => a !== '' && b !== '')

  const editar = (i: number, lado: 0 | 1, valor: string) => {
    if (valor !== '' && !/^\d{1,2}$/.test(valor)) return
    setSets(prev => prev.map((s, k) => {
      if (k !== i) return s
      const copia: [string, string] = [s[0], s[1]]
      copia[lado] = valor
      return copia
    }))
  }

  const input = (i: number, lado: 0 | 1) => {
    const [a, b] = sets[i]
    const completo = a !== '' && b !== ''
    const malo = completo && !esSetValido(Number(a), Number(b))
    return (
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={30}
        value={sets[i][lado]}
        onChange={e => editar(i, lado, e.target.value)}
        aria-label={`Set ${i + 1}, puntos de ${lado === 0 ? nombreA : nombreB}`}
        style={{
          width: 46, textAlign: 'center', fontSize: 14, padding: '6px 4px',
          border: `1px solid ${malo ? '#fca5a5' : '#cbd5e1'}`, borderRadius: 6,
          background: malo ? '#fef2f2' : '#fff', color: '#0f172a',
        }}
      />
    )
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
        <span style={{ flex: 1, textAlign: 'right' }}>{nombreA || '—'}</span>
        <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 400, width: 92, textAlign: 'center' }}>vs</span>
        <span style={{ flex: 1 }}>{nombreB || '—'}</span>
      </div>

      {sets.map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span style={{ flex: 1, textAlign: 'right' }}>{input(i, 0)}</span>
          <span style={{ width: 92, textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>Set {i + 1}</span>
          <span style={{ flex: 1 }}>{input(i, 1)}</span>
        </div>
      ))}

      {puedeAgregar && (
        <button
          onClick={() => setSets(prev => [...prev, ['', '']])}
          style={{ background: 'transparent', border: '1px dashed #cbd5e1', color: '#64748b', borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: 'pointer', width: '100%', marginBottom: 6 }}
        >+ Set {sets.length + 1}</button>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: resumen ? '#166534' : '#94a3b8' }}>
          {resumen
            ? `${resumen.setsA}-${resumen.setsB} · ${resumen.puntosA}-${resumen.puntosB} puntos`
            : 'Completa los sets (a 11, con dos de ventaja)'}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onCancelar}
            style={{ background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}
          >Cancelar</button>
          <button
            disabled={!resumen || guardando}
            onClick={() => resumen && onListo(parciales)}
            style={{
              background: resumen && !guardando ? '#4f46e5' : '#e2e8f0',
              color: resumen && !guardando ? '#fff' : '#94a3b8',
              border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 11, fontWeight: 600,
              cursor: resumen && !guardando ? 'pointer' : 'default',
            }}
          >{guardando ? 'Guardando…' : 'Listo'}</button>
        </span>
      </div>
    </div>
  )
}
