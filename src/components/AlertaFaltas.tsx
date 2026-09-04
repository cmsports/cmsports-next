'use client'

// "Matías lleva 3 clases seguidas sin venir" — en el dashboard del profe.
//
// La inasistencia repetida es la señal más temprana de que un alumno va a
// dejar el club, y el club quiere reaccionar antes, no después. Por eso la
// alerta va acá y no en un informe: el profe entra a esta pantalla todos los
// días antes de la clase, y el informe no lo abre nadie.
//
// Y va con el mensaje ya redactado. Un botón que abre WhatsApp en blanco deja
// al profe escribiendo de pie en la cancha; ahí el mensaje o no sale, o sale
// seco. El texto vive en `mensajeFaltasApoderado` (§8.5 del plan maestro).
//
// ── Solo alerta de los que le tocan hoy ────────────────────────────────────
//
// Recibe los alumnos que el dashboard ya cargó: los de sus bloques de hoy. Es
// deliberado y son dos razones. La primera es que hoy es cuando puede hacer
// algo —el alumno debería estar por llegar—. La segunda es que la matriz de
// permisos dice que el entrenador ve sus grupos, no el padrón: pedir el club
// entero desde acá sería ensanchar lo que ve por comodidad de la consulta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle } from 'lucide-react'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { linkWhatsApp } from '@/lib/whatsapp'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { configDelClub } from '@/lib/supabase/clubConfig'
import {
  debeAlertarPorFaltas,
  faltasSeguidas,
  mensajeFaltasApoderado,
  type Marca,
} from '@/lib/domain/retencion'

const supabase = createClient()

const text  = '#0f172a'
const muted = '#64748b'
const ambar = '#b45309'

/** Cuánto historial se mira para contar la racha. */
const DIAS_DE_HISTORIAL = 90

export type AlumnoParaAlerta = {
  id: string
  nombre: string
  telefono?: string | null
}

export default function AlertaFaltas({
  clubId,
  alumnos,
}: {
  clubId: string | null | undefined
  alumnos: readonly AlumnoParaAlerta[]
}) {
  const [config, setConfig] = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [marcas, setMarcas] = useState<Record<string, Marca[]>>({})
  // El nombre del club va en el mensaje al apoderado: "Te escribo de
  // Spinhouse". El perfil no lo trae, así que se pide acá — solo cuando el
  // módulo está encendido y hay alumnos que mirar.
  const [nombreClub, setNombreClub] = useState<string | null>(null)

  // Los ids como string estable: sin esto el efecto se dispara en cada render,
  // porque el array de alumnos llega nuevo cada vez desde el padre.
  const ids = useMemo(
    () => alumnos.map(a => a.id).sort().join(','),
    [alumnos],
  )

  const cargar = useCallback(async () => {
    if (!clubId || !ids) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any

    const desde = new Date(Date.now() - DIAS_DE_HISTORIAL * 86_400_000)
      .toISOString().slice(0, 10)

    const [cfg, club, res] = await Promise.all([
      configDelClub(clubId),
      db.from('clubes').select('nombre').eq('id', clubId).single(),
      // A propósito SIN filtrar `estado = 'presente'`. La regla general del
      // proyecto es filtrarlo, y acá sería justo al revés: lo que se cuenta
      // son las faltas, y un 'presente' es lo que CORTA la racha. Sin esa fila
      // la racha nunca se cortaría y alertaría por todos.
      db.from('asistencia')
        .select('jugador_id, fecha, estado')
        .in('jugador_id', ids.split(','))
        .gte('fecha', desde)
        .order('fecha', { ascending: false }),
    ])

    if (res.error) {
      // Sin datos no se inventa una alerta: mejor no mostrar nada que decirle
      // a un profe que un alumno faltó cuando lo que falló fue la consulta.
      console.error('[alerta-faltas] no se pudo leer la asistencia', res.error)
      return
    }

    const porJugador: Record<string, Marca[]> = {}
    for (const r of (res.data ?? []) as any[]) {
      porJugador[r.jugador_id] = [...(porJugador[r.jugador_id] ?? []), { fecha: r.fecha, estado: r.estado }]
    }

    setConfig(() => cfg)
    // Si el nombre del club no se pudo leer, el mensaje cae en "la escuela" y
    // se manda igual. No vale la pena esconder la alerta por eso.
    setNombreClub(club.data?.nombre ?? null)
    setMarcas(porJugador)
  }, [clubId, ids])

  useEffect(() => { void cargar() }, [cargar])

  const enRiesgo = useMemo(() => alumnos
    .map(a => ({ ...a, faltas: faltasSeguidas(marcas[a.id] ?? []) }))
    .filter(a => debeAlertarPorFaltas(config, a.faltas))
    .sort((a, b) => b.faltas - a.faltas),
  [alumnos, marcas, config])

  if (enRiesgo.length === 0) return null

  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={16} color={ambar} />
        <span style={{ fontSize: 13, fontWeight: 700, color: ambar }}>
          {enRiesgo.length === 1 ? 'Un alumno lleva varias clases sin venir' : `${enRiesgo.length} alumnos llevan varias clases sin venir`}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enRiesgo.map(a => {
          const href = linkWhatsApp(a.telefono, mensajeFaltasApoderado({
            nombreAlumno: a.nombre, nombreClub,
          }))
          return (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, flexWrap: 'wrap',
              background: '#ffffff', border: '1px solid #fde68a', borderRadius: 10,
              padding: '10px 12px', minHeight: 44,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{a.nombre}</div>
                <div style={{ fontSize: 11.5, color: muted }}>
                  {a.faltas} clase{a.faltas === 1 ? '' : 's'} seguida{a.faltas === 1 ? '' : 's'} sin venir
                </div>
              </div>
              {href
                // Sin un celular chileno válido el botón no aparece: uno que
                // abre WhatsApp en un número que no existe es peor que ninguno.
                ? <WhatsAppBtn href={href}>Escribirle al apoderado</WhatsAppBtn>
                : <span style={{ fontSize: 11, color: muted }}>Sin teléfono cargado</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
