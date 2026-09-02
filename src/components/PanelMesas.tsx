'use client'

// Las mesas de la sede: cuántas hay y cuántas usa cada bloque.
//
// Responde de un vistazo las dos preguntas que hoy no se pueden contestar sin
// abrir la planilla del club:
//
//   · "¿puedo abrir un grupo a las 19:00?"  → ¿cuántas mesas quedan libres?
//   · "¿por qué no?"                        → ¿quién las está usando?
//
// Es un número, no una lista de mesas concretas. El club sabe que tiene doce y
// que Adultos usa cinco; asignar "la 3, la 7 y la 9" a cada bloque de cada día
// es media hora de clicks para un dato que se resuelve hablando en la sala.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Check, Table2 } from 'lucide-react'
import { diaSemanaDeFecha, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  cupoDelBloque, mesasEnUso, mesasLibres, puedeUsarMesas, seSolapan, tramosDelDia,
  type UsoDeMesas,
} from '@/lib/domain/mesas'
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
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
  mesas: number | null
  inscritos: number
}

type Arriendo = {
  id: string
  hora_inicio: string
  hora_fin: string
  mesas: number
  arrendatario: string | null
}

export default function PanelMesas({ clubId, sede }: { clubId: string; sede: string }) {
  const [total, setTotal]       = useState(0)
  const [bloques, setBloques]   = useState<Bloque[]>([])
  const [arriendos, setArr]     = useState<Arriendo[]>([])
  const [config, setConfig]     = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [fecha, setFecha]       = useState(fechaChile())
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')
  const [guardado, setGuardado] = useState<string | null>(null)

  const dia = diaSemanaDeFecha(fecha)

  const cargar = useCallback(async () => {
    if (!clubId) return
    setError('')
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any

      const [cfg, sedeFila, bloquesRes, arriendosRes] = await Promise.all([
        configDelClub(clubId),

        db.from('sede_mesas').select('cantidad')
          .eq('club_id', clubId).eq('sede', sede).maybeSingle(),

        // Los bloques de ese día, con cuántos inscritos VIGENTES hay. El filtro
        // `vigente_hasta IS NULL` no es opcional: sin él cuenta también a los
        // que ya dejaron el grupo, y la consulta no falla — solo da un número
        // más alto que el real.
        db.from('bloques_horario')
          .select('id, nombre, hora_inicio, hora_fin, cupo_maximo, mesas, activo, bloque_jugadores(id, vigente_hasta)')
          .eq('club_id', clubId).eq('sede', sede).eq('dia_semana', dia)
          .order('hora_inicio'),

        db.from('mesa_arriendos')
          .select('id, hora_inicio, hora_fin, mesas, arrendatario')
          .eq('club_id', clubId).eq('sede', sede).eq('fecha', fecha),
      ])

      if (sedeFila.error) throw new Error(sedeFila.error.message)
      if (bloquesRes.error) throw new Error(bloquesRes.error.message)
      if (arriendosRes.error) throw new Error(arriendosRes.error.message)

      setConfig(() => cfg)
      setTotal(sedeFila.data?.cantidad ?? 0)
      setBloques((bloquesRes.data ?? [])
        .filter((b: any) => b.activo !== false)
        .map((b: any): Bloque => ({
          id: b.id,
          nombre: b.nombre,
          hora_inicio: b.hora_inicio,
          hora_fin: b.hora_fin,
          cupo_maximo: b.cupo_maximo ?? 0,
          mesas: b.mesas,
          inscritos: (b.bloque_jugadores ?? []).filter((j: any) => j.vigente_hasta == null).length,
        })))
      setArr((arriendosRes.data ?? []) as Arriendo[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las mesas.')
    } finally {
      setCargando(false)
    }
  }, [clubId, sede, dia, fecha])

  useEffect(() => { void cargar() }, [cargar])

  useEnVivo(
    ['sede_mesas', 'mesa_arriendos', 'bloques_horario', 'bloque_jugadores', 'club_config'],
    clubId,
    () => { void cargar() },
  )

  /** Todo lo que ocupa mesas ese día, en un solo formato. */
  const usos: UsoDeMesas[] = useMemo(() => [
    ...bloques
      .filter(b => (b.mesas ?? 0) > 0)
      .map(b => ({ id: b.id, etiqueta: b.nombre, inicio: b.hora_inicio, fin: b.hora_fin, mesas: b.mesas! })),
    ...arriendos.map(a => ({
      id: a.id,
      etiqueta: a.arrendatario ? `Arriendo · ${a.arrendatario}` : 'Arriendo',
      inicio: a.hora_inicio, fin: a.hora_fin, mesas: a.mesas,
    })),
  ], [bloques, arriendos])

  const tramos = useMemo(() => tramosDelDia(usos.length ? usos : bloques.map(b => ({
    inicio: b.hora_inicio, fin: b.hora_fin,
  }))), [usos, bloques])

  async function guardarTotal(valor: string) {
    const n = parseInt(valor, 10)
    if (!Number.isInteger(n) || n < 0 || n > 200) {
      setError('La cantidad de mesas tiene que ser un entero entre 0 y 200.')
      return
    }
    setError('')
    const { error: err } = await (supabase as any).from('sede_mesas')
      .upsert({ club_id: clubId, sede, cantidad: n, actualizado_en: new Date().toISOString() },
              { onConflict: 'club_id,sede' })

    if (err) { setError('No se pudo guardar la cantidad de mesas: ' + err.message); return }
    setGuardado('total')
    setTimeout(() => setGuardado(g => (g === 'total' ? null : g)), 2000)
    await cargar()
  }

  async function guardarMesasDeBloque(bloque: Bloque, valor: string) {
    const crudo = valor.trim()
    // Vacío significa "no declaro mesas para este bloque", que no es lo mismo
    // que cero: su cupo vuelve a salir del número escrito a mano.
    const n = crudo === '' ? null : parseInt(crudo, 10)

    if (n !== null) {
      const veredicto = puedeUsarMesas({
        total, usos,
        franja: { inicio: bloque.hora_inicio, fin: bloque.hora_fin },
        mesas: n, excluirId: bloque.id,
      })
      if (!veredicto.ok) { setError(veredicto.motivo); return }
    }

    setError('')
    const { error: err } = await (supabase as any).from('bloques_horario')
      .update({ mesas: n }).eq('id', bloque.id)

    if (err) { setError('No se pudo guardar: ' + err.message); return }
    setGuardado(bloque.id)
    setTimeout(() => setGuardado(g => (g === bloque.id ? null : g)), 2000)
    await cargar()
  }

  if (cargando) return <p style={{ fontSize: 13, color: muted }}>Cargando mesas…</p>

  const porMesas = config('cupos.modo') === 'por_mesas'

  return (
    <div>
      {/* ── Cuántas mesas tiene la sede ───────────────────────────────── */}
      <div style={{ ...card, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 240, flex: 1 }}>
            <label htmlFor="total-mesas" style={{ fontSize: 14, fontWeight: 600, color: text, display: 'block' }}>
              Mesas en {sedeLabel(sede)}
            </label>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
              Cámbialo cuando quieras: de acá sale cuántas quedan libres a cada hora.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="total-mesas" type="number" min={0} max={200}
              defaultValue={String(total)} key={`total:${total}`}
              onBlur={e => { if (e.target.value !== String(total)) void guardarTotal(e.target.value) }}
              style={{ width: 90, background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 15, fontWeight: 600, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
            />
            {guardado === 'total' && <Check size={16} color="#10714e" />}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {total === 0 ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <Table2 size={30} color={hint} style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Todavía no está cargada la cantidad de mesas
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 420, lineHeight: 1.55 }}>
            Poné arriba cuántas mesas tiene la sede. Después, al decir cuántas usa
            cada bloque, su cupo se calcula solo.
          </p>
        </div>
      ) : (
        <>
          {/* ── Cuántas quedan libres, hora por hora ──────────────────── */}
          <div style={{ ...card, padding: 18, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 3 }}>
              Ocupación del {new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <input
                type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, color: text }}
              />
            </div>

            {tramos.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: muted }}>
                No hay nada programado ese día: las {total} mesas están libres.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {tramos.map(t => {
                  const usadas = mesasEnUso(usos, t)
                  const libres = mesasLibres({ total, usos, franja: t })
                  const quienes = usos.filter(u => seSolapan(u, t) && u.mesas > 0)
                  const pct = total > 0 ? Math.min(100, (usadas / total) * 100) : 0
                  const lleno = libres === 0 && usadas > 0

                  return (
                    <div key={`${t.inicio}-${t.fin}`} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: text, fontVariantNumeric: 'tabular-nums' }}>
                          {rangoHorario(t.inicio, t.fin)}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: lleno ? '#b91c1c' : muted, fontVariantNumeric: 'tabular-nums' }}>
                          {libres} {libres === 1 ? 'libre' : 'libres'} de {total}
                        </span>
                      </div>

                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', margin: '7px 0 6px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: lleno ? '#b91c1c' : '#3730a3' }} />
                      </div>

                      <div style={{ fontSize: 11.5, color: hint }}>
                        {quienes.length === 0
                          ? 'Sin nada asignado'
                          : quienes.map(q => `${q.etiqueta} (${q.mesas})`).join(' · ')}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Cuántas usa cada bloque, y el cupo que sale de eso ────── */}
          {bloques.length > 0 && (
            <div style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 3 }}>
                Mesas por bloque
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
                {porMesas
                  ? `El cupo se calcula: mesas × ${config('cupos.por_mesa_grupal')} jugadores por mesa. Dejalo vacío para que ese bloque use su cupo escrito a mano.`
                  : 'Este club cuenta el cupo con el número escrito en cada bloque. Para que salga de las mesas, cambiá "Cómo se calcula el cupo" en Configuración.'}
              </p>

              <div style={{ display: 'grid', gap: 8 }}>
                {bloques.map(b => {
                  const cupo = cupoDelBloque({
                    config, cupoMaximo: b.cupo_maximo, mesas: b.mesas,
                  })
                  const lleno = cupo > 0 && b.inscritos >= cupo
                  return (
                    <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ minWidth: 150, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{b.nombre}</div>
                        <div style={{ fontSize: 11.5, color: hint, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {rangoHorario(b.hora_inicio, b.hora_fin)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label htmlFor={`mesas-${b.id}`} style={{ fontSize: 11.5, color: muted }}>Mesas</label>
                        <input
                          id={`mesas-${b.id}`} type="number" min={0} max={total}
                          placeholder="—"
                          defaultValue={b.mesas == null ? '' : String(b.mesas)}
                          key={`${b.id}:${b.mesas}`}
                          onBlur={e => {
                            const actual = b.mesas == null ? '' : String(b.mesas)
                            if (e.target.value.trim() !== actual) void guardarMesasDeBloque(b, e.target.value)
                          }}
                          style={{ width: 68, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        />
                        {guardado === b.id && <Check size={15} color="#10714e" />}
                        <span style={{ fontSize: 13, fontWeight: 700, color: lleno ? '#b91c1c' : text, fontVariantNumeric: 'tabular-nums', minWidth: 58, textAlign: 'right' }}>
                          {b.inscritos} / {cupo}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
