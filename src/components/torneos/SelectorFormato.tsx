'use client'
import { FORMATO_LABEL, FORMATO_EXPLICACION, FORMATOS, type FormatoPartido } from '@/lib/domain/marcador'
import { type CampoFormato, type FaseDeSets } from '@/lib/domain/modalidadTorneo'

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
//
// ── Por qué las fases ahora llegan por prop (migración 264) ────────────────
//
// Hasta las modalidades, este componente preguntaba siempre por "Fase de
// grupos" y "Llave (playoffs)", que eran las dos que existían. Una liguilla no
// tiene ninguna de las dos: se juega todo de una y no hay playoffs. Un torneo
// por equipos, tampoco.
//
// Así que qué preguntar —cuántas veces y con qué nombre— lo decide la
// modalidad, en `fasesDeSets()`. El componente solo lo pinta.

const FILA = { display: 'flex', gap: 8 } as const

export default function SelectorFormato({
  fases,
  valores,
  onCambiar,
  colorActivo = '#7c3aed',
}: {
  /** Qué selectores mostrar y cómo llamarlos. Sale de `fasesDeSets(modalidad)`. */
  fases: ReadonlyArray<FaseDeSets>
  valores: Record<CampoFormato, FormatoPartido>
  onCambiar: (campo: CampoFormato, formato: FormatoPartido) => void
  colorActivo?: string
}) {
  const boton = (campo: CampoFormato, formato: FormatoPartido, activo: boolean) => (
    <button
      key={`${campo}-${formato}`}
      type="button"
      onClick={() => onCambiar(campo, formato)}
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

      {fases.map((fase, i) => (
        <div key={fase.campo} style={{ marginBottom: i < fases.length - 1 ? 8 : 0 }}>
          {/* Con un solo selector el subtítulo sobra: la etiqueta de arriba ya
              dice todo y repetirlo agrega ruido a un formulario de teléfono. */}
          {fases.length > 1 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{fase.label}</div>
          )}
          <div style={FILA}>
            {FORMATOS.map(f => boton(fase.campo, f, valores[fase.campo] === f))}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>
        {fases.map(f => `${f.label}: ${FORMATO_EXPLICACION[valores[f.campo]]}`).join('. ')}.
        {fases.some(f => valores[f.campo] === 'bo3') &&
          ' Al mejor de 3 se juega bastante menos, y el desempate a tres se decide más seguido por los puntos de cada set.'}
      </div>
    </div>
  )
}
