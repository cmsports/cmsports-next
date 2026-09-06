'use client'
import { FORMATO_LABEL, FORMATO_EXPLICACION, FORMATOS, type FormatoPartido } from '@/lib/domain/marcador'

// A cuántos sets se juega el torneo, elegido al crearlo.
//
// Va por fase y no una sola vez porque así se juega de verdad: los grupos al
// mejor de 3 para que quepan en las mesas y en el horario, y la llave al mejor
// de 5 desde que empieza a definirse. Los dos arrancan en Mejor de 5, que es
// como jugó el club hasta ahora.
//
// La explicación va escrita al lado y no en el manual: quien crea el torneo
// tiene que ver ahí mismo qué significa lo que está eligiendo, porque después
// no se puede cambiar sin invalidar los marcadores ya cargados.

const FILA = { display: 'flex', gap: 8 } as const

export default function SelectorFormato({
  formatoGrupos,
  formatoLlave,
  onCambiar,
  colorActivo = '#7c3aed',
}: {
  formatoGrupos: FormatoPartido
  formatoLlave: FormatoPartido
  onCambiar: (fase: 'grupos' | 'llave', formato: FormatoPartido) => void
  colorActivo?: string
}) {
  const boton = (fase: 'grupos' | 'llave', formato: FormatoPartido, activo: boolean) => (
    <button
      key={`${fase}-${formato}`}
      type="button"
      onClick={() => onCambiar(fase, formato)}
      title={FORMATO_EXPLICACION[formato]}
      style={{
        flex: 1,
        background: activo ? colorActivo : '#f4f7fa',
        color: activo ? '#fff' : '#64748b',
        border: `1px solid ${activo ? colorActivo : '#e2e8f0'}`,
        borderRadius: 8,
        padding: '9px 0',
        fontSize: 12,
        fontWeight: activo ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {FORMATO_LABEL[formato]}
    </button>
  )

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>
        ¿Al mejor de cuántos sets?
      </label>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Fase de grupos</div>
        <div style={FILA}>{FORMATOS.map(f => boton('grupos', f, formatoGrupos === f))}</div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Llave (playoffs)</div>
        <div style={FILA}>{FORMATOS.map(f => boton('llave', f, formatoLlave === f))}</div>
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
        Grupos: {FORMATO_EXPLICACION[formatoGrupos]}. Llave: {FORMATO_EXPLICACION[formatoLlave]}.
        {formatoGrupos === 'bo3' && ' Al mejor de 3 los grupos duran bastante menos, y el desempate a tres se decide más seguido por los puntos de cada set.'}
      </div>
    </div>
  )
}
