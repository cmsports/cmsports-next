'use client'

// Marcha en seco: a quién le tocaría un aviso, un bloqueo o una alerta si esto
// estuviera encendido. **No toca a nadie.**
//
// Es la pantalla que el plan exige revisar durante un mes completo antes de
// activar el bloqueo automático, y la razón es concreta: un umbral mal
// calculado bloquea a un alumno que está al día, y quien se entera es él, en la
// puerta, delante de sus compañeros.
//
// Si en ese mes aparece UN SOLO falso positivo, no se enciende: se corrige el
// umbral y se cuenta otro mes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { CircleCheck, Eye, TriangleAlert } from 'lucide-react'
import { fechaChile } from '@/lib/domain/fechaChile'
import { linkWhatsApp } from '@/lib/whatsapp'
import {
  conAlgoQueHacer, simular,
  type Cuota, type JugadorParaRevisar, type Marca, type Veredicto,
} from '@/lib/domain/retencion'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { configDelClub } from '@/lib/supabase/clubConfig'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

/** Cuánto historial de asistencia hace falta para contar faltas seguidas. */
const DIAS_DE_MARCAS = 60

const COLOR: Record<Veredicto['estado'], { bg: string; fg: string; label: string }> = {
  para_bloquear: { bg: '#fef2f2', fg: '#b91c1c', label: 'Se bloquearía' },
  para_avisar:   { bg: '#fffbeb', fg: '#b45309', label: 'Se le avisaría' },
  con_deuda:     { bg: '#f8fafc', fg: '#64748b', label: 'Con deuda' },
  al_dia:        { bg: '#f0fdf4', fg: '#15803d', label: 'Al día' },
}

function pesos(n: number): string {
  return '$' + n.toLocaleString('es-CL')
}

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export default function PanelRetencion({ clubId }: { clubId: string }) {
  const [config, setConfig]     = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [jugadores, setJug]     = useState<JugadorParaRevisar[]>([])
  const [telefonos, setTel]     = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  const hoy = fechaChile()

  const cargar = useCallback(async () => {
    if (!clubId) return
    setError('')
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any
      const desde = restarDias(hoy, DIAS_DE_MARCAS)

      const [cfg, jugRes, cuotasRes, marcasRes, pagosRes] = await Promise.all([
        configDelClub(clubId),
        db.from('jugadores').select('id, nombre, telefono')
          .eq('club_id', clubId).eq('estado', 'activo').order('nombre'),
        db.from('mensualidades').select('jugador_id, mes, anio, estado, monto')
          .eq('club_id', clubId),
        db.from('asistencia').select('jugador_id, fecha, estado')
          .eq('club_id', clubId).gte('fecha', desde),
        db.from('mensualidades').select('jugador_id, fecha_pago')
          .eq('club_id', clubId).not('fecha_pago', 'is', null),
      ])

      if (jugRes.error) throw new Error(jugRes.error.message)
      if (cuotasRes.error) throw new Error(cuotasRes.error.message)
      if (marcasRes.error) throw new Error(marcasRes.error.message)

      const porJugador = new Map<string, Cuota[]>()
      for (const c of (cuotasRes.data ?? []) as (Cuota & { jugador_id: string })[]) {
        if (!c.jugador_id) continue
        const lista = porJugador.get(c.jugador_id) ?? []
        lista.push({ mes: c.mes, anio: c.anio, estado: c.estado, monto: c.monto })
        porJugador.set(c.jugador_id, lista)
      }

      const marcasDe = new Map<string, Marca[]>()
      const ultimaAsistencia = new Map<string, string>()
      for (const m of (marcasRes.data ?? []) as { jugador_id: string; fecha: string; estado: string }[]) {
        const lista = marcasDe.get(m.jugador_id) ?? []
        lista.push({ fecha: m.fecha, estado: m.estado })
        marcasDe.set(m.jugador_id, lista)

        if ((m.estado ?? '').toLowerCase() === 'presente') {
          const previo = ultimaAsistencia.get(m.jugador_id)
          if (!previo || m.fecha > previo) ultimaAsistencia.set(m.jugador_id, m.fecha)
        }
      }

      const ultimoPago = new Map<string, string>()
      for (const p of (pagosRes.data ?? []) as { jugador_id: string; fecha_pago: string }[]) {
        if (!p.jugador_id || !p.fecha_pago) continue
        const fecha = p.fecha_pago.slice(0, 10)
        const previo = ultimoPago.get(p.jugador_id)
        if (!previo || fecha > previo) ultimoPago.set(p.jugador_id, fecha)
      }

      const tel = new Map<string, string>()
      const lista: JugadorParaRevisar[] = []
      for (const j of (jugRes.data ?? []) as { id: string; nombre: string; telefono: string | null }[]) {
        if (j.telefono) tel.set(j.id, j.telefono)
        lista.push({
          id: j.id,
          nombre: j.nombre,
          cuotas: porJugador.get(j.id) ?? [],
          marcas: marcasDe.get(j.id) ?? [],
          ultimaAsistenciaISO: ultimaAsistencia.get(j.id) ?? null,
          ultimoPagoISO: ultimoPago.get(j.id) ?? null,
        })
      }

      setConfig(() => cfg)
      setJug(lista)
      setTel(tel)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la marcha en seco.')
    } finally {
      setCargando(false)
    }
  }, [clubId, hoy])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['jugadores', 'mensualidades', 'asistencia', 'club_config'], clubId, () => { void cargar() })

  const veredictos = useMemo(
    () => simular({ config, jugadores, hoyISO: hoy }),
    [config, jugadores, hoy],
  )
  const conAlgo = useMemo(() => conAlgoQueHacer(veredictos), [veredictos])

  const bloqueo = config('morosidad.dias_bloqueo')
  const aviso   = config('morosidad.dias_aviso')
  const faltas  = config('retencion.faltas_alerta')
  const inact   = config('retencion.dias_inactivo')
  const todoApagado = bloqueo === 0 && aviso === 0 && faltas === 0 && inact === 0

  if (cargando) return <p style={{ fontSize: 13, color: muted }}>Revisando el padrón…</p>

  return (
    <div>
      {/* El cartel que define qué es esta pantalla. Va primero y no se saca. */}
      <div style={{ ...card, padding: '15px 18px', marginBottom: 14, borderLeft: '3px solid #3730a3', display: 'flex', gap: 10 }}>
        <Eye size={16} color="#3730a3" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: text }}>
            Esto no bloquea a nadie
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: muted, lineHeight: 1.6, maxWidth: 640 }}>
            Muestra a quién le tocaría un aviso o un bloqueo con los umbrales de
            hoy. Reviselo un mes completo antes de encender nada: si aparece{' '}
            <strong>un solo</strong> alumno que en realidad está al día, el umbral
            está mal y hay que corregirlo, no encenderlo igual.
          </p>
        </div>
      </div>

      {/* Los umbrales vigentes, para saber contra qué se está comparando. */}
      <div style={{ ...card, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: text, marginBottom: 8 }}>
          Umbrales de hoy
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {[
            ['Avisar por deuda', aviso, 'días'],
            ['Bloquear por deuda', bloqueo, 'días'],
            ['Alertar por faltas', faltas, 'clases'],
            ['Marcar inactivo', inact, 'días'],
          ].map(([label, valor, unidad]) => (
            <div key={label as string} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: hint }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: (valor as number) > 0 ? text : hint, marginTop: 1 }}>
                {(valor as number) > 0 ? `${valor} ${unidad}` : 'Nunca'}
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
          Se cambian en Configuración. Un umbral en <strong>Nunca</strong> no
          dispara jamás, por muchos días de mora que haya.
        </p>
      </div>

      {error && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      {todoApagado ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <CircleCheck size={30} color="#15803d" style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Todos los umbrales están apagados
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 460, lineHeight: 1.55 }}>
            El club no avisa ni bloquea a nadie automáticamente, que es como
            funciona hoy. Poné umbrales en Configuración para ver acá a quién
            afectarían — sin que les pase nada todavía.
          </p>
        </div>
      ) : conAlgo.length === 0 ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <CircleCheck size={30} color="#15803d" style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Con estos umbrales no le pasaría nada a nadie
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 460, lineHeight: 1.55 }}>
            De los {jugadores.length} jugadores activos, ninguno cae en un aviso
            ni en un bloqueo.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {(['para_bloquear', 'para_avisar'] as const).map(estado => {
              const cuantos = conAlgo.filter(v => v.estado === estado).length
              if (cuantos === 0) return null
              const c = COLOR[estado]
              return (
                <span key={estado} style={{ padding: '6px 11px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 12.5, fontWeight: 700 }}>
                  {cuantos} {c.label.toLowerCase()}
                </span>
              )
            })}
            <span style={{ padding: '6px 11px', borderRadius: 999, background: '#f8fafc', color: muted, fontSize: 12.5 }}>
              de {jugadores.length} activos
            </span>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {conAlgo.map(v => {
              const c = COLOR[v.estado]
              // `linkWhatsApp` devuelve null si el teléfono no es un número
              // chileno válido. Sin este chequeo el botón se dibujaba igual y
              // llevaba a ninguna parte.
              const wa = linkWhatsApp(
                telefonos.get(v.id),
                'Hola, te escribimos del club por tu cuenta.',
              )
              return (
                <div key={v.id} style={{ ...card, padding: '13px 16px', borderLeft: `3px solid ${c.fg}` }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>{v.nombre}</div>
                      <div style={{ fontSize: 12, color: muted, marginTop: 2, lineHeight: 1.5 }}>
                        {v.motivo}
                        {v.deuda > 0 && ` · debe ${pesos(v.deuda)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ padding: '5px 10px', borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {v.estado === 'para_bloquear' || v.estado === 'para_avisar' ? c.label : 'Alerta'}
                      </span>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#3730a3', textDecoration: 'none', border: '1px solid #c7d2fe', borderRadius: 8, padding: '7px 11px', whiteSpace: 'nowrap' }}
                        >
                          Escribirle
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ ...card, padding: '13px 16px', marginTop: 14, borderLeft: '3px solid #b45309', display: 'flex', gap: 9 }}>
            <TriangleAlert size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
              <strong>Revisá esta lista con nombre y apellido.</strong> Si
              reconocés a alguien que está al día, el umbral o la fecha de
              vencimiento están mal. Encender el bloqueo con un solo falso
              positivo acá significa dejar afuera a un alumno que paga.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
