'use client'

// Altas y bajas del mes, en el dashboard del admin (§7.2 del plan maestro).
//
// La señal temprana de deserción: el club quiere reaccionar ANTES de que el
// alumno se vaya, y para eso el número tiene que estar donde entra todos los
// días, no en un informe que hay que ir a buscar.
//
// Las tres definiciones —qué es un alta, qué es una baja y qué es un
// reingreso— viven en `altasBajas.ts` con su porqué, porque la pregunta "¿qué
// es una baja?" tuvo tres respuestas posibles y elegir mal daba tres números
// distintos. Acá solo se dibuja lo que esa función calcula.
//
// ── Por qué cuelga de 'retencion' ──────────────────────────────────────────
//
// Es la misma pregunta que responde el panel de retención de Finanzas, en
// versión resumida. Un club que no encendió retención no pidió medir esto, y
// una tarjeta más en el dashboard de Buin es exactamente lo que el plan dice
// que no se hace.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { UserPlus } from 'lucide-react'
import { fechaChile } from '@/lib/domain/fechaChile'
import { altasYBajasDelMes, type Inscripcion } from '@/lib/domain/altasBajas'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const verde = '#16a34a'
const rojo  = '#dc2626'

/** El primer y el último día del mes en curso, en hora de Chile. */
function mesEnCurso(): { desde: string; hasta: string } {
  const hoy = fechaChile()                       // 'YYYY-MM-DD'
  const [anio, mes] = hoy.split('-').map(Number)
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const dd = String(ultimoDia).padStart(2, '0')
  return { desde: `${hoy.slice(0, 7)}-01`, hasta: `${hoy.slice(0, 7)}-${dd}` }
}

export default function TarjetaAltasBajas({ clubId }: { clubId: string | null | undefined }) {
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  const cargar = useCallback(async () => {
    if (!clubId) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any

    // A propósito SIN `.is('vigente_hasta', null)`: acá la tabla se usa cruda
    // y es correcto. Las inscripciones cerradas son justamente el dato —una
    // baja es una vigencia cerrada—, así que filtrarlas dejaría la tarjeta
    // mostrando siempre cero bajas. Es la excepción documentada de la regla,
    // igual que `PanelReportes` y el historial de asistencia.
    //
    // `bloque_jugadores` no tiene `club_id`: el club sale del bloque.
    const { data, error: err } = await db.from('bloque_jugadores')
      .select('jugador_id, vigente_desde, vigente_hasta, bloques_horario!inner(club_id)')
      .eq('bloques_horario.club_id', clubId)

    if (err) {
      console.error('[altas-bajas] no se pudo cargar', err)
      setError(true)
      setCargando(false)
      return
    }

    setError(false)
    setInscripciones((data ?? [])
      // `vigente_desde` es NOT NULL en la base, pero una fila sin fecha
      // rompería toda la comparación de strings en silencio: mejor descartarla.
      .filter((r: any) => r.vigente_desde)
      .map((r: any): Inscripcion => ({
        jugadorId: r.jugador_id,
        desde: r.vigente_desde,
        hasta: r.vigente_hasta,
      })))
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['bloque_jugadores'], clubId ?? '', () => { void cargar() })

  const r = useMemo(() => altasYBajasDelMes(inscripciones, mesEnCurso()), [inscripciones])

  if (cargando) return null

  const colorNeto = r.neto > 0 ? verde : r.neto < 0 ? rojo : muted

  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <UserPlus size={16} color={verde} />
      </div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>🔄 Altas y bajas del mes</div>

      <div style={{ fontSize: 24, fontWeight: 700, color: colorNeto, fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
        {error ? '—' : `${r.neto > 0 ? '+' : ''}${r.neto}`}
        <span style={{ fontSize: 12, fontWeight: 500, color: hint, marginLeft: 6 }}>neto</span>
      </div>

      <div style={{ display: 'flex', gap: 16, borderTop: '1px solid #e2e8f0', paddingTop: 10, fontVariantNumeric: 'tabular-nums' }}>
        {[
          { n: r.altas, label: 'entraron', color: verde },
          { n: r.reingresos, label: 'volvieron', color: '#0284c7' },
          { n: r.bajas, label: 'se fueron', color: rojo },
        ].map(c => (
          <div key={c.label}>
            <div style={{ fontSize: 17, fontWeight: 700, color: error ? muted : c.color }}>{error ? '—' : c.n}</div>
            <div style={{ fontSize: 10.5, color: muted }}>{c.label}</div>
          </div>
        ))}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 10.5, color: hint, lineHeight: 1.5 }}>
        Se fue = terminó el mes sin ningún grupo vigente. Cambiar de horario no
        cuenta como baja.{' '}
        <Link href="/finanzas?tab=retencion" style={{ color: '#4f46e5', textDecoration: 'none' }}>
          Ver retención →
        </Link>
      </p>
    </div>
  )
}
