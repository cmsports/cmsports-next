'use client'

// El tablero de mesas: qué ocupa cada mesa de la sede, hora por hora.
//
// Responde de un vistazo las dos preguntas que hoy no se pueden contestar sin
// abrir la planilla del club:
//
//   · "¿puedo abrir un grupo a las 19:00?"  → ¿queda alguna mesa en blanco?
//   · "¿por qué no?"                        → ¿qué la tiene tomada?
//
// Las filas NO son horas redondas: son los tramos que marcan los propios
// bloques y arriendos. Con filas de una hora, un bloque de 19:00 a 19:30 se
// vería ocupando hasta las 20:00 y el tablero mentiría justo donde importa.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cachedFetch } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { Plus, Table2, Trash2 } from 'lucide-react'
import { diaSemanaDeFecha, hhmm, minutosDelDia, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import {
  cupoDelBloque, mesasVigentes, seSolapan,
  type Mesa, type UsoDeMesa,
} from '@/lib/domain/mesas'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { configDelClub } from '@/lib/supabase/clubConfig'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type BloqueConMesas = {
  id: string
  nombre: string
  hora_inicio: string
  hora_fin: string
  cupo_maximo: number
  mesaIds: string[]
  inscritos: number
}

type Arriendo = {
  id: string
  mesa_id: string
  hora_inicio: string
  hora_fin: string
  arrendatario: string | null
}

/** Un color estable por bloque, para reconocerlo de un vistazo en la grilla. */
const COLORES = [
  { bg: '#ede9fe', fg: '#5b21b6' },
  { bg: '#ecfdf5', fg: '#065f46' },
  { bg: '#eff6ff', fg: '#1d4ed8' },
  { bg: '#fff7ed', fg: '#c2410c' },
  { bg: '#fef2f2', fg: '#b91c1c' },
  { bg: '#f0fdfa', fg: '#0f766e' },
]
function colorDe(nombre: string) {
  let suma = 0
  for (const c of nombre) suma += c.charCodeAt(0)
  return COLORES[suma % COLORES.length]
}

const COLOR_ARRIENDO = { bg: '#f1f5f9', fg: '#475569' }

/** Los tramos en que se parte el día, sacados de lo que de verdad hay. */
function tramosDelDia(usos: { inicio: string; fin: string }[]): { inicio: string; fin: string }[] {
  const cortes = [...new Set(usos.flatMap(u => [hhmm(u.inicio), hhmm(u.fin)]))]
    .sort((a, b) => minutosDelDia(a) - minutosDelDia(b))

  const out: { inicio: string; fin: string }[] = []
  for (let i = 0; i < cortes.length - 1; i++) out.push({ inicio: cortes[i], fin: cortes[i + 1] })
  return out
}

export default function PanelMesas({ clubId, sede }: { clubId: string; sede: string }) {
  const [mesas, setMesas]       = useState<Mesa[]>([])
  const [bloques, setBloques]   = useState<BloqueConMesas[]>([])
  const [arriendos, setArr]     = useState<Arriendo[]>([])
  const [config, setConfig]     = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [fecha, setFecha]       = useState(fechaChile())
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  // Alta de una mesa nueva.
  const [creando, setCreando]   = useState(false)
  const [numero, setNumero]     = useState('')
  const [guardando, setGuardando] = useState(false)

  const dia = diaSemanaDeFecha(fecha)

  const cargar = useCallback(async () => {
    if (!clubId) return
    setError('')
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any

      const [cfg, m, b, a] = await Promise.all([
        configDelClub(clubId),

        cachedFetch<Mesa[]>(`mesas:${clubId}:${sede}`, async () => {
          const { data, error } = await db.from('sede_mesas')
            .select('id, numero, vigente_desde, vigente_hasta')
            .eq('club_id', clubId).eq('sede', sede).order('numero')
          if (error) throw error
          return (data ?? []) as Mesa[]
        }, 60_000, ['sede_mesas']),

        // Los bloques de ese día, con las mesas que tienen asignadas y cuántos
        // inscritos VIGENTES hay. El filtro `vigente_hasta IS NULL` no es
        // opcional: sin él cuenta también a los que ya dejaron el grupo, y la
        // consulta no falla — solo da un número más alto que el real.
        (async () => {
          const { data, error } = await db.from('bloques_horario')
            .select('id, nombre, hora_inicio, hora_fin, cupo_maximo, activo, bloque_mesas(mesa_id), bloque_jugadores(id, vigente_hasta)')
            .eq('club_id', clubId).eq('sede', sede).eq('dia_semana', dia)
            .order('hora_inicio')
          if (error) throw error
          return (data ?? [])
            .filter((x: any) => x.activo !== false)
            .map((x: any): BloqueConMesas => ({
              id: x.id,
              nombre: x.nombre,
              hora_inicio: x.hora_inicio,
              hora_fin: x.hora_fin,
              cupo_maximo: x.cupo_maximo ?? 0,
              mesaIds: (x.bloque_mesas ?? []).map((bm: any) => bm.mesa_id),
              inscritos: (x.bloque_jugadores ?? []).filter((bj: any) => bj.vigente_hasta == null).length,
            }))
        })(),

        (async () => {
          const { data, error } = await db.from('mesa_arriendos')
            .select('id, mesa_id, hora_inicio, hora_fin, arrendatario')
            .eq('club_id', clubId).eq('fecha', fecha)
          if (error) throw error
          return (data ?? []) as Arriendo[]
        })(),
      ])

      setConfig(() => cfg)
      setMesas(m)
      setBloques(b)
      setArr(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las mesas.')
    } finally {
      setCargando(false)
    }
  }, [clubId, sede, dia, fecha])

  useEffect(() => { void cargar() }, [cargar])

  useEnVivo(
    ['sede_mesas', 'bloque_mesas', 'mesa_arriendos', 'bloques_horario', 'bloque_jugadores', 'club_config'],
    clubId,
    () => { void cargar() },
  )

  const visibles = useMemo(() => mesasVigentes(mesas, fecha), [mesas, fecha])

  // Todo lo que ocupa una mesa ese día, en un solo formato, para que la grilla
  // no tenga que distinguir entre una clase y un arriendo al pintar.
  const usos: (UsoDeMesa & { etiqueta: string; color: { bg: string; fg: string } })[] = useMemo(() => {
    const deClases = bloques.flatMap(b =>
      b.mesaIds.map(mesaId => ({
        mesa_id: mesaId,
        inicio: b.hora_inicio,
        fin: b.hora_fin,
        origen_id: b.id,
        etiqueta: b.nombre,
        color: colorDe(b.nombre),
      })),
    )
    const deArriendos = arriendos.map(a => ({
      mesa_id: a.mesa_id,
      inicio: a.hora_inicio,
      fin: a.hora_fin,
      origen_id: a.id,
      etiqueta: a.arrendatario ? `Arriendo · ${a.arrendatario}` : 'Arriendo',
      color: COLOR_ARRIENDO,
    }))
    return [...deClases, ...deArriendos]
  }, [bloques, arriendos])

  const tramos = useMemo(() => tramosDelDia(usos), [usos])

  async function crearMesa() {
    const n = parseInt(numero, 10)
    if (!Number.isInteger(n) || n <= 0) { setError('El número de mesa tiene que ser un entero mayor que cero.'); return }
    if (mesas.some(m => m.numero === n)) { setError(`Ya existe la mesa ${n} en esta sede.`); return }

    setGuardando(true)
    setError('')
    const { error: err } = await (supabase as any).from('sede_mesas')
      .insert({ club_id: clubId, sede, numero: n })

    setGuardando(false)
    if (err) { setError('No se pudo crear la mesa: ' + err.message); return }

    setNumero('')
    setCreando(false)
    await cargar()
  }

  async function darDeBaja(mesa: Mesa) {
    const enUso = usos.some(u => u.mesa_id === mesa.id)
    const aviso = enUso
      ? `La mesa ${mesa.numero} tiene clases o arriendos asignados. Al darla de baja, los bloques que la usaban pierden ese cupo.\n\n¿Seguro?`
      : `¿Dar de baja la mesa ${mesa.numero}?`
    if (!confirm(aviso)) return

    // Ayer, nunca hoy: cerrar con la fecha de hoy dejaría la mesa contando todo
    // el día de hoy. Es el mismo cuidado que con bloque_jugadores.
    const ayer = new Date(`${fechaChile()}T12:00:00`)
    ayer.setDate(ayer.getDate() - 1)
    const cierre = ayer.toISOString().slice(0, 10)

    setError('')
    const { error: err } = await (supabase as any).from('sede_mesas')
      .update({ vigente_hasta: cierre }).eq('id', mesa.id)

    if (err) { setError('No se pudo dar de baja la mesa: ' + err.message); return }
    await cargar()
  }

  if (cargando) return <p style={{ fontSize: 13, color: muted }}>Cargando mesas…</p>

  return (
    <div>
      {/* ── Cabecera: el día y el resumen ─────────────────────────────── */}
      <div style={{ ...card, padding: 16, marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: text }}>{sedeLabel(sede)}</div>
          <div style={{ fontSize: 12, color: hint, marginTop: 2 }}>
            {visibles.length === 0
              ? 'Sin mesas cargadas'
              : `${visibles.length} ${visibles.length === 1 ? 'mesa' : 'mesas'} · ${bloques.length} ${bloques.length === 1 ? 'bloque' : 'bloques'} ese día`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 11px', fontSize: 13, color: text }}
          />
          <button
            type="button" onClick={() => { setCreando(v => !v); setError('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3730a3', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={15} /> Agregar mesa
          </button>
        </div>
      </div>

      {creando && (
        <div style={{ ...card, padding: 16, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 11, color: muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Número de mesa
            </label>
            <input
              type="number" min={1} value={numero} onChange={e => setNumero(e.target.value)}
              placeholder="3" autoFocus
              style={{ width: 110, background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: text }}
            />
          </div>
          <button
            type="button" onClick={() => void crearMesa()} disabled={guardando}
            style={{ background: '#3730a3', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 15px', fontSize: 13, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.6 : 1 }}
          >
            {guardando ? 'Creando…' : 'Crear'}
          </button>
          <button
            type="button" onClick={() => { setCreando(false); setNumero(''); setError('') }}
            style={{ background: 'transparent', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 15px', fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      {/* ── El tablero ────────────────────────────────────────────────── */}
      {visibles.length === 0 ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <Table2 size={30} color={hint} style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Todavía no hay mesas cargadas en esta sede
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 420, lineHeight: 1.55 }}>
            Cargá una por cada mesa física de la sede. Después, al asignárselas a
            un bloque, su cupo se calcula solo: mesas × jugadores por mesa.
          </p>
        </div>
      ) : tramos.length === 0 ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Las {visibles.length} mesas están libres todo el día
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 420, lineHeight: 1.55 }}>
            No hay bloques ni arriendos ese día en esta sede.
          </p>
        </div>
      ) : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + visibles.length * 92 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1, padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Hora
                </th>
                {visibles.map(m => (
                  <th key={m.id} style={{ padding: '11px 8px', fontSize: 12, fontWeight: 600, color: text, borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #f1f5f9', minWidth: 92 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <span>Mesa {m.numero}</span>
                      <button
                        type="button" onClick={() => void darDeBaja(m)}
                        title={`Dar de baja la mesa ${m.numero}`}
                        aria-label={`Dar de baja la mesa ${m.numero}`}
                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: hint, display: 'flex' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tramos.map(tramo => (
                <tr key={`${tramo.inicio}-${tramo.fin}`}>
                  <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, padding: '10px 14px', fontSize: 12, color: muted, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                    {rangoHorario(tramo.inicio, tramo.fin)}
                  </td>
                  {visibles.map(m => {
                    const uso = usos.find(u => u.mesa_id === m.id && seSolapan(u, tramo))
                    return (
                      <td key={m.id} title={uso?.etiqueta}
                        style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 600, borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9',
                          background: uso ? uso.color.bg : 'transparent', color: uso ? uso.color.fg : hint }}
                      >
                        {uso ? uso.etiqueta : '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Los bloques del día y su cupo ─────────────────────────────── */}
      {bloques.length > 0 && (
        <div style={{ ...card, padding: 16, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 10 }}>
            Cupo de cada bloque
          </div>
          {config('cupos.modo') === 'numero' && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: hint, lineHeight: 1.55 }}>
              Este club cuenta el cupo con el número escrito en cada bloque. Para
              que salga de las mesas, hay que cambiar <code>cupos.modo</code> a{' '}
              <code>por_mesas</code> en la configuración del club.
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {bloques.map(b => {
              const cupo = cupoDelBloque({
                config, cupoMaximo: b.cupo_maximo, mesasAsignadas: b.mesaIds.length,
              })
              const lleno = cupo > 0 && b.inscritos >= cupo
              return (
                <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: '#f8fafc', borderRadius: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{b.nombre}</div>
                    <div style={{ fontSize: 11.5, color: hint, marginTop: 1 }}>
                      {rangoHorario(b.hora_inicio, b.hora_fin)}
                      {' · '}
                      {b.mesaIds.length === 0
                        ? 'sin mesas asignadas'
                        : `${b.mesaIds.length} ${b.mesaIds.length === 1 ? 'mesa' : 'mesas'}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: lleno ? '#b91c1c' : text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {b.inscritos} / {cupo}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
