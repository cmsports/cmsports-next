'use client'

// Ocupación por bloque horario, en el dashboard del admin.
//
// Responde de un vistazo la pregunta que hoy obliga a abrir /horario y contar a
// mano: **¿qué grupo hay que cerrar y cuál hay que dividir?** El color no
// adorna: dice qué hacer con cada bloque (§7.2 del plan maestro).
//
// ── Por qué no se muestra en todos los clubes ──────────────────────────────
//
// Cuelga del módulo 'mesas', que hoy solo tiene Spinhouse: Buin lleva sus cupos
// a mano y ya los ve en /horario → Cupos, así que resumirlos otra vez en su
// dashboard sería ruido. Verificado en la base el 2026-09-02:
// `modulos_habilitados` de Buin no incluye 'mesas'.
//
// El cupo de cada bloque sale de `cupoDelBloque`, que respeta `cupos.modo`: con
// el default 'numero' devuelve el número escrito a mano y con 'por_mesas' lo
// deriva de la sala. La tarjeta sirve en los dos casos y no necesita saber en
// cuál está.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { LayoutGrid } from 'lucide-react'
import { DIAS, hhmm, rangoHorario } from '@/lib/domain/horario'
import { fechaChile } from '@/lib/domain/fechaChile'
import { soloVigentes } from '@/lib/supabase/vigentes'
import { cupoDelBloque, mesasDelBloque, type UsoDeMesas } from '@/lib/domain/mesas'
import { nivelOcupacion, porcentajeOcupacion, OCUPACION } from '@/lib/domain/ocupacion'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { configDelClub } from '@/lib/supabase/clubConfig'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Bloque = {
  id: string
  nombre: string
  sede: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
  mesas: number | null
  inscritos: number
}

export default function TarjetaOcupacion({ clubId }: { clubId: string | null | undefined }) {
  const [bloques, setBloques]   = useState<Bloque[]>([])
  const [mesasSede, setMesas]   = useState<Record<string, number>>({})
  const [config, setConfig]     = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!clubId) return
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any

    const [cfg, bloquesRes, sedesRes] = await Promise.all([
      configDelClub(clubId),

      // `bloque_jugadores` guarda también las inscripciones cerradas: sin
      // `vigente_hasta IS NULL` cuenta a los que ya dejaron el grupo, y no
      // falla — solo devuelve un número más alto que el real.
      soloVigentes(
        db.from('bloques_horario')
          .select('id, nombre, sede, dia_semana, hora_inicio, hora_fin, cupo_maximo, mesas, bloque_jugadores(id, vigente_hasta)')
          .eq('club_id', clubId).eq('activo', true),
        fechaChile(),
      ).order('hora_inicio'),

      db.from('sede_mesas').select('sede, cantidad').eq('club_id', clubId),
    ])

    // Una lectura que falla devuelve `{ error }` y `data` en null: sin esto la
    // tarjeta diría "sin bloques" cuando lo que pasó es que no se pudo leer.
    if (bloquesRes.error || sedesRes.error) {
      console.error('[ocupacion] no se pudo cargar', bloquesRes.error ?? sedesRes.error)
      setCargando(false)
      return
    }

    setConfig(() => cfg)
    setMesas(Object.fromEntries((sedesRes.data ?? []).map((s: any) => [s.sede, s.cantidad ?? 0])))
    setBloques((bloquesRes.data ?? []).map((b: any): Bloque => ({
      id: b.id,
      nombre: b.nombre,
      sede: b.sede,
      dia_semana: b.dia_semana,
      hora_inicio: b.hora_inicio,
      hora_fin: b.hora_fin,
      cupo_maximo: b.cupo_maximo ?? 0,
      mesas: b.mesas,
      inscritos: (b.bloque_jugadores ?? []).filter((j: any) => j.vigente_hasta == null).length,
    })))
    setCargando(false)
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['bloques_horario', 'bloque_jugadores', 'sede_mesas', 'club_config'], clubId ?? '', () => { void cargar() })

  /**
   * El cupo de cada bloque, ya resuelto.
   *
   * Las mesas que ocupa cada uno salen de su gente inscrita, igual que en el
   * panel de mesas, y lo que compite por la sala son los bloques del mismo día
   * y la misma sede.
   *
   * ponytail: no mira `mesa_arriendos`. Un arriendo es de una fecha concreta y
   * esta tarjeta resume la semana entera; traerlos exigiría una consulta por
   * día y el número que devolvería igual sería el de "esta semana", no el de
   * todas. Para el día exacto está /horario → Mesas, que sí los cuenta.
   */
  const filas = useMemo(() => {
    const usosPorSala = new Map<string, UsoDeMesas[]>()
    for (const b of bloques) {
      const sala = `${b.sede}|${b.dia_semana}`
      const uso = {
        id: b.id, etiqueta: b.nombre,
        inicio: b.hora_inicio, fin: b.hora_fin,
        mesas: mesasDelBloque({ config, inscritos: b.inscritos, declaradas: b.mesas }),
      }
      usosPorSala.set(sala, [...(usosPorSala.get(sala) ?? []), uso])
    }

    return bloques.map(b => {
      const cupo = cupoDelBloque({
        config,
        cupoMaximo: b.cupo_maximo,
        inscritos: b.inscritos,
        declaradas: b.mesas,
        totalSede: mesasSede[b.sede],
        usos: usosPorSala.get(`${b.sede}|${b.dia_semana}`) ?? [],
        franja: { inicio: b.hora_inicio, fin: b.hora_fin },
        bloqueId: b.id,
      })
      return { ...b, cupo, pct: porcentajeOcupacion(b.inscritos, cupo), nivel: nivelOcupacion(b.inscritos, cupo) }
    })
  }, [bloques, mesasSede, config])

  if (cargando) return null

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <LayoutGrid size={15} color="#4f46e5" />
        <span style={{ fontSize: 13, fontWeight: 600, color: text }}>📊 Ocupación por bloque</span>
        <Link href="/horario" style={{ marginLeft: 'auto', fontSize: 11.5, color: '#4f46e5', textDecoration: 'none' }}>
          Ver horario →
        </Link>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
        Cuánta gente hay en cada grupo contra lo que entra en él. El color dice
        qué conviene hacer con cada uno.
      </p>

      {filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: muted }}>Todavía no hay bloques cargados.</p>
      ) : DIAS.filter(d => filas.some(f => f.dia_semana === d.value)).map(d => (
        <div key={d.value} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {d.label}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {filas
              .filter(f => f.dia_semana === d.value)
              .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))
              .map(f => {
                const { color, fondo, que } = OCUPACION[f.nivel]
                return (
                  <div key={f.id} style={{ padding: '9px 12px', background: fondo, borderRadius: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: text }}>
                        {f.nombre}{' '}
                        <span style={{ fontWeight: 400, color: hint, fontVariantNumeric: 'tabular-nums' }}>
                          {rangoHorario(f.hora_inicio, f.hora_fin)}
                        </span>
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                        {f.pct === null
                          ? `${f.inscritos} inscritos`
                          : `${f.inscritos} de ${f.cupo} · ${f.pct}%`}
                      </span>
                    </div>

                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', margin: '6px 0 5px' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, f.pct ?? 0)}%`, background: color }} />
                    </div>

                    <div style={{ fontSize: 11, color, fontWeight: 500 }}>{que}</div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
