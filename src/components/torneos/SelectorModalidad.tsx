'use client'
import {
  MODALIDAD_EXPLICACION,
  MODALIDAD_LABEL,
  usaRuedas,
  type ModalidadTorneo,
} from '@/lib/domain/modalidadTorneo'
import {
  SISTEMAS,
  SISTEMA_EXPLICACION,
  minJugadoresPorEquipo,
  type SistemaEquipos,
} from '@/lib/domain/torneoEquipos'

// Cómo se corre el torneo, elegido al crearlo.
//
// Va ARRIBA del nombre en el formulario, y eso no es estética: la modalidad
// decide qué campos vienen abajo —la liguilla pide ruedas, el resto no— y qué
// pregunta el selector de sets. Puesta al final, el formulario cambia de forma
// después de estar lleno.
//
// ── Si no hay nada que elegir, no se muestra nada ──────────────────────────
//
// Con una sola modalidad disponible el componente devuelve `null`. Eso es lo
// que deja el formulario de un club sin el módulo EXACTAMENTE como estaba:
// no un selector de una sola opción, ni un cuadro deshabilitado. Nada.
//
// Las modalidades disponibles las calcula `modalidadesDisponibles()`, la misma
// función contra la que valida `crearTorneo`.

const RUEDAS = [
  { valor: 1 as const, label: 'Una rueda', ayuda: 'cada uno juega contra todos una vez' },
  { valor: 2 as const, label: 'Ida y vuelta', ayuda: 'cada cruce se juega dos veces' },
]

export default function SelectorModalidad({
  disponibles,
  modalidad,
  ruedas,
  sistemaEquipos,
  onCambiarModalidad,
  onCambiarRuedas,
  onCambiarSistema,
  colorActivo = '#7c3aed',
}: {
  disponibles: ReadonlyArray<ModalidadTorneo>
  modalidad: ModalidadTorneo
  ruedas: 1 | 2
  sistemaEquipos: SistemaEquipos
  onCambiarModalidad: (modalidad: ModalidadTorneo) => void
  onCambiarRuedas: (ruedas: 1 | 2) => void
  onCambiarSistema: (sistema: SistemaEquipos) => void
  colorActivo?: string
}) {
  if (disponibles.length < 2) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 5 }}>
        Tipo de torneo
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {disponibles.map(m => {
          const activo = m === modalidad
          return (
            <button
              key={m}
              type="button"
              onClick={() => onCambiarModalidad(m)}
              style={{
                background: activo ? colorActivo : '#f4f7fa',
                color: activo ? '#fff' : '#64748b',
                border: `1px solid ${activo ? colorActivo : '#e2e8f0'}`,
                borderRadius: 8,
                padding: '9px 8px',
                fontSize: 12,
                fontWeight: activo ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'center',
                lineHeight: 1.35,
              }}
            >
              {MODALIDAD_LABEL[m]}
              <div style={{ fontSize: 11, fontWeight: 400, opacity: activo ? 0.85 : 1, color: activo ? '#fff' : '#94a3b8', marginTop: 2 }}>
                {MODALIDAD_EXPLICACION[m]}
              </div>
            </button>
          )
        })}
      </div>

      {usaRuedas(modalidad) && (
        <div style={{ marginTop: 10, borderLeft: `2px solid ${colorActivo}`, paddingLeft: 10 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>¿Cuántas ruedas?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RUEDAS.map(r => {
              const activo = r.valor === ruedas
              return (
                <button
                  key={r.valor}
                  type="button"
                  onClick={() => onCambiarRuedas(r.valor)}
                  title={r.ayuda}
                  style={{
                    flex: 1,
                    background: activo ? colorActivo : '#f4f7fa',
                    color: activo ? '#fff' : '#64748b',
                    border: `1px solid ${activo ? colorActivo : '#e2e8f0'}`,
                    borderRadius: 8,
                    padding: '8px 0',
                    fontSize: 12,
                    fontWeight: activo ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
          {/* El número de partidos exacto no se puede decir todavía: los
              jugadores se inscriben el día del torneo. El aviso con la cifra
              real va al cerrar la inscripción, que es cuando se sabe y cuando
              todavía se puede echar pie atrás. */}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
            {ruedas === 2
              ? 'Ojo: ida y vuelta duplica los partidos. Con 12 inscritos son 132 en vez de 66.'
              : 'Con 12 inscritos son 66 partidos.'}
          </div>
        </div>
      )}

      {modalidad === 'equipos' && (
        <div style={{ marginTop: 10, borderLeft: `2px solid ${colorActivo}`, paddingLeft: 10 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 5 }}>¿Qué sistema?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SISTEMAS.map(s => {
              const activo = s === sistemaEquipos
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onCambiarSistema(s)}
                  title={SISTEMA_EXPLICACION[s]}
                  style={{
                    flex: 1,
                    background: activo ? colorActivo : '#f4f7fa',
                    color: activo ? '#fff' : '#64748b',
                    border: `1px solid ${activo ? colorActivo : '#e2e8f0'}`,
                    borderRadius: 8,
                    padding: '8px 6px',
                    fontSize: 12,
                    fontWeight: activo ? 700 : 500,
                    cursor: 'pointer',
                    lineHeight: 1.3,
                  }}
                >
                  {s === 'swaythling' ? 'Swaythling' : 'Corbillon'}
                  <div style={{ fontSize: 10, fontWeight: 400, color: activo ? '#fff' : '#94a3b8', marginTop: 2 }}>
                    {s === 'swaythling' ? '5 individuales' : '4 y un dobles'}
                  </div>
                </button>
              )
            })}
          </div>
          {/* El mínimo de jugadores es lo que de verdad decide cuál se puede
              jugar: con Corbillon alcanzan dos por equipo. */}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
            {SISTEMA_EXPLICACION[sistemaEquipos]}. Cada equipo necesita al menos{' '}
            {minJugadoresPorEquipo(sistemaEquipos)} jugadores. El encuentro se juega al mejor de 5:
            termina apenas un equipo gana 3.
          </div>
        </div>
      )}
    </div>
  )
}
