'use client'

// Cómo funciona este club: los ajustes que hacen que dos clubes con los mismos
// módulos se comporten distinto.
//
// Casi todo lo edita el admin, porque son decisiones sobre su propio club. Las
// dos claves reservadas al superadmin no se esconden: se muestran en gris con
// el motivo escrito, porque un ajuste que desaparece de la pantalla se
// convierte en una llamada por WhatsApp preguntando dónde está.
//
// La base es la que manda (migración 250). Esto es cortesía: esconder el
// control en vez de dejar que el admin apriete y reciba un error de RLS que no
// explica nada.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Lock, RotateCcw, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import {
  CONFIG_CLUB, esClaveConfig, normalizarValor, puedeEditarClave, valorPorDefecto,
  type ClaveConfig,
} from '@/lib/domain/clubConfig'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

/** Cómo se agrupan las claves en pantalla. El prefijo antes del punto. */
const GRUPOS: Record<string, { titulo: string; ayuda: string }> = {
  cupos:        { titulo: 'Cupos',        ayuda: 'De dónde sale cuánta gente entra en cada bloque.' },
  mensualidad:  { titulo: 'Mensualidades', ayuda: 'Cómo se determina lo que paga cada jugador.' },
  morosidad:    { titulo: 'Morosidad',    ayuda: 'Qué pasa cuando alguien se atrasa con un pago.' },
  retencion:    { titulo: 'Retención',    ayuda: 'Cuándo avisar que un jugador se está desenganchando.' },
  liga:         { titulo: 'Liga',         ayuda: 'El puntaje de la tabla de posiciones.' },
  inscripcion:  { titulo: 'Inscripción',  ayuda: 'Quién puede meter a un jugador en un bloque.' },
}

/** Los textos de las opciones. La clave cruda no le dice nada a nadie. */
const ETIQUETAS: Record<string, string> = {
  numero:          'El número escrito en cada bloque',
  por_mesas:       'Las mesas asignadas × jugadores por mesa',
  monto_libre:     'Un monto propio para cada jugador',
  por_plan:        'Según el plan que tenga contratado',
  off:             'Solo el staff inscribe',
  pide_aprobacion: 'El alumno pide y el staff aprueba',
  directo:         'El alumno se inscribe solo',
}

/**
 * Las claves cuyo valor distinto de cero ACTÚA SOBRE UNA PERSONA.
 *
 * No cambian de permiso —son del admin— pero la pantalla se lo dice antes, con
 * todas las letras. Es la diferencia entre un ajuste y una decisión: quien la
 * toma tiene que ver la consecuencia en el momento de tomarla, no descubrirla
 * cuando un alumno no puede entrar a su cuenta.
 */
const CONSECUENCIA: Partial<Record<ClaveConfig, string>> = {
  'morosidad.dias_bloqueo':
    'Con un valor mayor que cero, las cuentas con esa deuda se bloquean solas y el alumno no puede entrar. Se puede desbloquear a mano, pero quien se entera primero es él.',
  'retencion.dias_inactivo':
    'Con un valor mayor que cero, los jugadores sin movimiento pasan a inactivos y dejan de contar en el padrón y en los indicadores.',
}

type Fila = { clave: string; valor: unknown }

export default function PanelConfigClub({ clubId, rol }: { clubId: string; rol: string }) {
  const [filas, setFilas]       = useState<Fila[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuard]   = useState<ClaveConfig | null>(null)
  const [error, setError]       = useState('')
  const [guardado, setGuardado] = useState<ClaveConfig | null>(null)

  const cargar = useCallback(async () => {
    if (!clubId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any).from('club_config')
      .select('clave, valor').eq('club_id', clubId)

    if (err) setError('No se pudo leer la configuración: ' + err.message)
    else setFilas((data ?? []) as Fila[])
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['club_config'], clubId, () => { void cargar() })

  /** El valor efectivo de cada clave: lo guardado si está, si no el default. */
  const actual = useMemo(() => {
    const guardadas = new Map<string, unknown>()
    for (const f of filas) if (esClaveConfig(f.clave)) guardadas.set(f.clave, f.valor)

    const out = new Map<ClaveConfig, { valor: unknown; esDefault: boolean }>()
    for (const def of CONFIG_CLUB) {
      const tiene = guardadas.has(def.clave)
      out.set(def.clave, {
        valor: tiene ? normalizarValor(def.clave, guardadas.get(def.clave)) : def.defecto,
        esDefault: !tiene,
      })
    }
    return out
  }, [filas])

  async function guardar(clave: ClaveConfig, valor: unknown) {
    setGuard(clave)
    setError('')
    setGuardado(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('club_config')
      .upsert({ club_id: clubId, clave, valor }, { onConflict: 'club_id,clave' })

    setGuard(null)
    if (err) {
      setError(`No se pudo guardar "${clave}": ${err.message}`)
      return
    }
    setGuardado(clave)
    setTimeout(() => setGuardado(g => (g === clave ? null : g)), 2500)
    await cargar()
  }

  /** Volver al default es BORRAR la fila, no escribir el valor por defecto. */
  async function volverAlDefecto(clave: ClaveConfig) {
    setGuard(clave)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('club_config')
      .delete().eq('club_id', clubId).eq('clave', clave)

    setGuard(null)
    if (err) { setError(`No se pudo restablecer "${clave}": ${err.message}`); return }
    await cargar()
  }

  async function alCambiar(clave: ClaveConfig, crudo: string) {
    const def = CONFIG_CLUB.find(d => d.clave === clave)!
    const valor: unknown = def.tipo === 'entero' ? parseInt(crudo, 10) : crudo

    if (def.tipo === 'entero' && !Number.isInteger(valor)) return

    const aviso = CONSECUENCIA[clave]
    if (aviso && def.tipo === 'entero' && (valor as number) > 0) {
      if (!confirm(`${def.label}\n\n${aviso}\n\n¿Confirmás el valor ${valor}?`)) return
    }

    await guardar(clave, valor)
  }

  if (cargando) return <p style={{ fontSize: 13, color: muted }}>Cargando configuración…</p>

  const grupos = [...new Set(CONFIG_CLUB.map(d => d.clave.split('.')[0]))]

  return (
    <div style={{ ...card, padding: 20, maxWidth: 760, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <SlidersHorizontal size={16} color="#0ea5e9" />
        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Cómo funciona este club</span>
      </div>
      <p style={{ fontSize: 12, color: hint, margin: '0 0 18px', lineHeight: 1.55 }}>
        Los ajustes que hacen que tu club se comporte distinto. Lo que no toques
        queda en su valor por defecto y funciona como siempre.
      </p>

      {error && (
        <div style={{ padding: '11px 14px', marginBottom: 14, borderRadius: 8, background: '#fef2f2', borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      {grupos.map(grupo => {
        const meta = GRUPOS[grupo] ?? { titulo: grupo, ayuda: '' }
        const claves = CONFIG_CLUB.filter(d => d.clave.startsWith(`${grupo}.`))

        return (
          <section key={grupo} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: text, marginBottom: 2 }}>{meta.titulo}</div>
            {meta.ayuda && (
              <p style={{ fontSize: 11.5, color: hint, margin: '0 0 10px' }}>{meta.ayuda}</p>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              {claves.map(def => {
                const estado = actual.get(def.clave)!
                const puede  = puedeEditarClave(def.clave, rol)
                const ocupado = guardando === def.clave
                const aviso = CONSECUENCIA[def.clave]
                const activo = def.tipo === 'entero' && (estado.valor as number) > 0

                return (
                  <div key={def.clave} style={{ padding: '12px 14px', background: puede ? '#f8fafc' : '#f1f5f9', borderRadius: 8, opacity: puede ? 1 : 0.75 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ minWidth: 220, flex: 1 }}>
                        <label htmlFor={def.clave} style={{ fontSize: 13, fontWeight: 600, color: text, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!puede && <Lock size={12} color={hint} />}
                          {def.label}
                        </label>
                        <div style={{ fontSize: 11, color: hint, marginTop: 2, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                          {def.clave}
                          {estado.esDefault && ' · por defecto'}
                          {guardado === def.clave && ' · guardado'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {def.tipo === 'opcion' ? (
                          <select
                            id={def.clave} disabled={!puede || ocupado}
                            value={String(estado.valor)}
                            onChange={e => void alCambiar(def.clave, e.target.value)}
                            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: text, minWidth: 210, cursor: puede ? 'pointer' : 'not-allowed' }}
                          >
                            {def.opciones.map(o => (
                              <option key={o} value={o}>{ETIQUETAS[o] ?? o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={def.clave} type="number" disabled={!puede || ocupado}
                            min={def.min} max={def.max}
                            defaultValue={String(estado.valor)}
                            key={`${def.clave}:${String(estado.valor)}`}
                            onBlur={e => {
                              if (e.target.value !== String(estado.valor)) void alCambiar(def.clave, e.target.value)
                            }}
                            style={{ width: 88, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', cursor: puede ? 'text' : 'not-allowed' }}
                          />
                        )}

                        {puede && !estado.esDefault && (
                          <button
                            type="button" onClick={() => void volverAlDefecto(def.clave)}
                            disabled={ocupado}
                            title={`Volver al valor por defecto (${String(valorPorDefecto(def.clave))})`}
                            aria-label={`Volver al valor por defecto de ${def.label}`}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: 7, cursor: 'pointer', color: hint, display: 'flex' }}
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* El aviso solo cuando el ajuste está actuando de verdad. */}
                    {aviso && activo && (
                      <div style={{ display: 'flex', gap: 7, marginTop: 9, padding: '8px 10px', background: '#fffbeb', borderRadius: 6 }}>
                        <TriangleAlert size={13} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ margin: 0, fontSize: 11.5, color: '#92400e', lineHeight: 1.5 }}>{aviso}</p>
                      </div>
                    )}

                    {!puede && (
                      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: hint, lineHeight: 1.5 }}>
                        Este ajuste lo cambia el equipo de CMsports: encenderlo
                        antes de tiempo deja el club sin poder operar. Pedilo y lo
                        activamos.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
