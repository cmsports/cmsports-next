'use client'

/**
 * Panorama de asistencia.
 *
 * Antes respondía "¿cómo venimos hace tres meses?" con promedios de todo el
 * trimestre. El club no funciona así: se opera por día y por semana, y un
 * promedio trimestral esconde justo lo accionable —que el grupo del martes se
 * cayó, que hoy faltó media lista, que alguien no aparece hace dos semanas—.
 * Ahora arranca en la semana en curso y lo macro queda comprimido abajo.
 *
 * Los cálculos viven en `domain/panoramaAsistencia`; acá solo se dibuja.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cargarHistorialClub } from '@/lib/supabase/historial'
import { calendarioJugador, indexar, indicadores, type DatosHistorial } from '@/lib/domain/historialAsistencia'
import {
  lunesDeLaSemana, viernesDeLaSemana, sumarDias, sumarSemanas,
  conteoDelRango, resumenPorDia, resumenPorSemana, resumenPorGrupo,
  diferencia, ordenarPorRiesgo, ordenarPorMerito,
  type CalendarioDeJugador, type FilaJugador,
} from '@/lib/domain/panoramaAsistencia'
import { descargarExcelAsistenciaPorBloque } from '@/lib/asistencia-bloque-excel'
import { linkWhatsApp } from '@/lib/whatsapp'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const verde = '#16a34a'
const rojo  = '#dc2626'
const azul  = '#3b82f6'

type Jugador = { id: string; nombre: string; categoria: string | null; grupo: string | null; sede: string | null; telefono: string | null }

type Fila = FilaJugador & {
  jugadorCompleto: Jugador
  programados: number
  pendientes: number
  rachaAusentes: number
  ultimaAsistencia: string | null
}

const th = { padding: '9px 12px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: muted,
  textTransform: 'uppercase' as const, letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const }
const td = { padding: '9px 12px', fontSize: 13, color: text, borderBottom: '1px solid #f1f5f9' }
const num = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

function color(pct: number | null) {
  if (pct === null) return muted
  return pct >= 75 ? verde : pct >= 50 ? '#d97706' : rojo
}

const DIA_LARGO: Record<string, string> = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes' }

/** "3 ago" — para etiquetas cortas donde el año sobra. */
function fechaCorta(iso: string) {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

function diasDesde(iso: string, hoy: string): number {
  return Math.round((new Date(`${hoy}T12:00:00`).getTime() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000)
}

function Seccion({ titulo, nota, children, plegable = false }: {
  titulo: string; nota?: string; children: React.ReactNode; plegable?: boolean
}) {
  const [abierto, setAbierto] = useState(!plegable)
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div onClick={plegable ? () => setAbierto(v => !v) : undefined}
        style={{ padding: '13px 16px', borderBottom: abierto ? '1px solid #e2e8f0' : 'none',
          display: 'flex', alignItems: 'center', gap: 8, cursor: plegable ? 'pointer' : 'default' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{titulo}</div>
          {nota && <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{nota}</div>}
        </div>
        {plegable && (
          <ChevronDown size={16} color={hint}
            style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform var(--rapido, 150ms)' }} />
        )}
      </div>
      {abierto && children}
    </div>
  )
}

function TablaJugadores({ filas, extra }: { filas: Fila[]; extra?: (f: Fila) => React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Jugador</th>
            <th style={{ ...th, textAlign: 'right' }}>Asistió</th>
            <th style={{ ...th, textAlign: 'right' }}>Faltó</th>
            <th style={{ ...th, textAlign: 'right' }}>%</th>
            {extra && <th style={{ ...th, textAlign: 'right' }}>&nbsp;</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.jugador.id}>
              <td style={{ ...td, fontWeight: 600 }}>{f.jugador.nombre}</td>
              <td style={num}>{f.presentes}</td>
              <td style={num}>{f.ausentes}</td>
              <td style={{ ...num, color: color(f.porcentaje), fontWeight: 700 }}>
                {f.porcentaje === null ? '—' : `${f.porcentaje}%`}
              </td>
              {extra && <td style={num}>{extra(f)}</td>}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr><td colSpan={extra ? 5 : 4} style={{ ...td, textAlign: 'center', color: hint }}>Nada por acá</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

type Rango = 'semana' | 'mes' | 'trimestre'

export default function PanelRankingAsistencia({ clubId }: { clubId: string }) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [datos, setDatos]         = useState<DatosHistorial | null>(null)
  const [rango, setRango]         = useState<Rango>('semana')
  /** Cuántos períodos hacia atrás desde el actual. 0 = el de ahora. */
  const [atras, setAtras]         = useState(0)
  const [cargando, setCargando]   = useState(true)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [descargando, setDescargando]         = useState(false)
  const [diaAbierto, setDiaAbierto]           = useState<string | null>(null)

  const hoy = fechaChile()

  // El rango que se está mirando. La semana va de lunes a viernes porque es la
  // semana laboral del club; el finde no tiene bloques.
  const { desde, hasta, desdeAnterior, hastaAnterior, etiqueta } = useMemo(() => {
    if (rango === 'semana') {
      const lunes = sumarSemanas(lunesDeLaSemana(hoy), -atras)
      const prev  = sumarSemanas(lunes, -1)
      return {
        desde: lunes, hasta: viernesDeLaSemana(lunes),
        desdeAnterior: prev, hastaAnterior: viernesDeLaSemana(prev),
        etiqueta: atras === 0 ? 'Esta semana' : atras === 1 ? 'Semana pasada' : `${fechaCorta(lunes)} — ${fechaCorta(viernesDeLaSemana(lunes))}`,
      }
    }
    const meses = rango === 'mes' ? 1 : 3
    const fin = new Date(`${hoy}T12:00:00`); fin.setMonth(fin.getMonth() - meses * atras)
    const ini = new Date(fin); ini.setMonth(ini.getMonth() - meses)
    const prevFin = new Date(ini); const prevIni = new Date(ini); prevIni.setMonth(prevIni.getMonth() - meses)
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      desde: iso(ini), hasta: iso(fin),
      desdeAnterior: iso(prevIni), hastaAnterior: iso(prevFin),
      etiqueta: atras === 0 ? (rango === 'mes' ? 'Último mes' : 'Últimos 3 meses') : `${fechaCorta(iso(ini))} — ${fechaCorta(iso(fin))}`,
    }
  }, [rango, atras, hoy])

  // Se carga desde el período anterior para poder comparar, y desde ocho
  // semanas atrás para la tendencia — lo que sea más viejo.
  const desdeCarga = useMemo(() => {
    const ochoSemanas = sumarSemanas(lunesDeLaSemana(hoy), -7)
    return [desdeAnterior, ochoSemanas].sort()[0]
  }, [desdeAnterior, hoy])

  const cargar = useCallback(async () => {
    const [{ data: jugs }, datosClub] = await Promise.all([
      supabase.from('jugadores')
        .select('id,nombre,categoria,grupo,sede,telefono')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre'),
      cargarHistorialClub(clubId, desdeCarga, hasta > hoy ? hasta : hoy),
    ])
    setJugadores((jugs ?? []) as Jugador[])
    setDatos(datosClub)
    setCargando(false)
  }, [clubId, desdeCarga, hasta, hoy])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['asistencia', 'bloque_jugadores'], clubId, cargar, { conClub: ['asistencia'] })

  async function descargarExcel(mesesElegidos: number) {
    setSelectorAbierto(false)
    setDescargando(true)
    try {
      const hastaD = fechaChile()
      const d = new Date(`${hastaD}T12:00:00`); d.setMonth(d.getMonth() - mesesElegidos)
      const desdeD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const [{ data: club }, { data: jugs }, datosClub] = await Promise.all([
        supabase.from('clubes').select('nombre').eq('id', clubId).single(),
        supabase.from('jugadores')
          .select('id,nombre,categoria,grupo,sede')
          .eq('club_id', clubId).eq('estado', 'activo')
          .or('es_externo.is.null,es_externo.eq.false')
          .order('nombre'),
        cargarHistorialClub(clubId, desdeD, hastaD),
      ])
      await descargarExcelAsistenciaPorBloque({
        clubNombre: club?.nombre ?? '',
        desde: desdeD, hasta: hastaD, meses: mesesElegidos,
        datos: datosClub, jugadores: (jugs ?? []) as Jugador[],
      })
    } finally {
      setDescargando(false)
    }
  }

  // El PDF sale del período que estás mirando, no de "todo": recibe los mismos
  // `calendarios` que pinta la pantalla y el mismo `desde`/`hasta`. Un PDF que
  // ignora el filtro de arriba no es el que pediste.
  //
  // Los calendarios llegan por parámetro porque se calculan más abajo, después
  // del guard de carga.
  async function descargarPdf(modo: 'masivo' | 'individual', cals: CalendarioDeJugador[]) {
    setSelectorAbierto(false)
    setDescargando(true)
    try {
      const { data: club } = await supabase.from('clubes').select('nombre').eq('id', clubId).single()
      const meta = { clubNombre: club?.nombre ?? '', periodo: etiqueta, desde, hasta }
      const pdf = await import('@/lib/panorama-asistencia-pdf')
      if (modo === 'masivo') await pdf.exportarPanoramaPdf(cals, meta)
      else await pdf.exportarPanoramaIndividualPdf(cals, meta)
    } finally {
      setDescargando(false)
    }
  }

  if (cargando || !datos) {
    return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Calculando...</div>
  }

  // Un solo índice compartido: son cien y pico de llamadas sobre los mismos datos.
  const indice = indexar(datos)
  const calendarios: (CalendarioDeJugador & { completo: Jugador })[] = jugadores.map(j => ({
    jugador: { id: j.id, nombre: j.nombre },
    completo: j,
    dias: calendarioJugador(j.id, desdeCarga, hasta > hoy ? hasta : hoy, datos, indice),
  }))

  const delPeriodo = calendarios.map(c => ({
    ...c,
    dias: c.dias.filter(d => d.fecha >= desde && d.fecha <= hasta),
  }))

  const conteo    = conteoDelRango(calendarios, desde, hasta)
  const conteoPre = conteoDelRango(calendarios, desdeAnterior, hastaAnterior)
  const delta     = diferencia(conteo, conteoPre)

  const dias    = resumenPorDia(calendarios, desde, rango === 'semana' ? hasta : hasta)
  const semanas = resumenPorSemana(calendarios, sumarSemanas(lunesDeLaSemana(hoy), -7), hoy)
  const grupos  = resumenPorGrupo(calendarios, desde, hasta)
  const gruposPre = new Map(resumenPorGrupo(calendarios, desdeAnterior, hastaAnterior).map(g => [g.nombre, g]))

  const filas: Fila[] = delPeriodo.map(({ jugador, completo, dias: ds }) => {
    const ind = indicadores(ds)
    return {
      jugador, jugadorCompleto: completo,
      presentes: ind.presentes, ausentes: ind.ausentes,
      porcentaje: ind.porcentaje, programados: ind.programados,
      pendientes: ind.pendientes, rachaAusentes: ind.rachaAusentes,
      ultimaAsistencia: ind.ultimaAsistencia,
    }
  }).filter(f => f.programados > 0)

  // La racha y la última asistencia se miran sobre TODO lo cargado, no sobre
  // el período elegido: alguien que no viene hace tres semanas tiene que
  // aparecer aunque se esté mirando solo esta semana.
  const alertas = calendarios.map(({ jugador, completo, dias: ds }) => {
    const ind = indicadores(ds)
    return { jugador, completo, racha: ind.rachaAusentes, ultima: ind.ultimaAsistencia }
  }).filter(a => a.racha >= 2).sort((a, b) => b.racha - a.racha)

  const sinRegistrar = dias.filter(d => d.pendientes > 0 && d.fecha < hoy)

  const flecha = delta === null ? null : delta > 0 ? '↑' : delta < 0 ? '↓' : '='
  const colorDelta = delta === null ? hint : delta > 0 ? verde : delta < 0 ? rojo : muted

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Selector de período ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3 }}>
          {(['semana', 'mes', 'trimestre'] as const).map(r => (
            <div key={r} onClick={() => { setRango(r); setAtras(0); setDiaAbierto(null) }}
              style={{ padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: rango === r ? '#fff' : 'transparent', color: rango === r ? '#3730a3' : muted,
                textTransform: 'capitalize' }}>
              {r}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => { setAtras(a => a + 1); setDiaAbierto(null) }} title="Período anterior"
            style={{ padding: 5, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex' }}>
            <ChevronLeft size={15} color={muted} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: text, minWidth: 130, textAlign: 'center' }}>{etiqueta}</span>
          <button onClick={() => { setAtras(a => Math.max(0, a - 1)); setDiaAbierto(null) }} disabled={atras === 0} title="Período siguiente"
            style={{ padding: 5, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
              cursor: atras === 0 ? 'default' : 'pointer', opacity: atras === 0 ? 0.4 : 1, display: 'flex' }}>
            <ChevronRight size={15} color={muted} />
          </button>
        </div>

        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button onClick={() => setSelectorAbierto(v => !v)} disabled={descargando}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20,
              cursor: descargando ? 'not-allowed' : 'pointer', border: '1px solid #4f46e5', background: '#4f46e5', color: '#fff' }}>
            <Download size={13} />
            {descargando ? 'Generando...' : 'Descargar'}
          </button>
          {selectorAbierto && (
            <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 10, background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', padding: 10, minWidth: 232 }}>

              {/* Los dos PDF salen de lo que estás viendo ahora mismo, por eso
                  van arriba y dicen el período: es la diferencia con el Excel,
                  que pide un rango propio. */}
              <div style={{ fontSize: 11, color: hint, fontWeight: 600, marginBottom: 6, padding: '0 4px' }}>
                PDF · {etiqueta.toLowerCase()}
              </div>
              {([
                ['masivo', 'Resumen del club', 'Una hoja: días, grupos y ranking'],
                ['individual', 'Uno por jugador', 'Una hoja cada uno, para el apoderado'],
              ] as const).map(([modo, titulo, sub]) => (
                <div key={modo} onClick={() => void descargarPdf(modo, calendarios)}
                  style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: 13, color: text, fontWeight: 600 }}>{titulo}</div>
                  <div style={{ fontSize: 10.5, color: hint, marginTop: 1 }}>{sub}</div>
                </div>
              ))}

              <div style={{ borderTop: '1px solid #e2e8f0', margin: '8px 0 6px' }} />
              <div style={{ fontSize: 11, color: hint, fontWeight: 600, marginBottom: 6, padding: '0 4px' }}>
                Excel por bloque · ¿de cuánto tiempo?
              </div>
              {[1, 2, 3, 6, 12].map(n => (
                <div key={n} onClick={() => void descargarExcel(n)}
                  style={{ padding: '7px 8px', fontSize: 13, color: text, borderRadius: 8, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {n === 1 ? 'Último mes' : `Últimos ${n} meses`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── El número y su comparación ── */}
      <div style={{ ...card, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Asistencia · {etiqueta.toLowerCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: color(conteo.porcentaje), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {conteo.porcentaje === null ? '—' : `${conteo.porcentaje}%`}
            </span>
            {flecha && (
              <span style={{ fontSize: 14, fontWeight: 700, color: colorDelta }}>
                {flecha} {Math.abs(delta!)} pts
                <span style={{ fontSize: 11, fontWeight: 500, color: hint }}> vs período anterior</span>
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 22, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {([['Vinieron', conteo.presentes, verde], ['Faltaron', conteo.ausentes, rojo],
             ['Sin registrar', conteo.pendientes, conteo.pendientes > 0 ? azul : hint]] as const).map(([l, v, c]) => (
            <div key={l}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <div style={{ fontSize: 10, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── La tira de días: solo tiene sentido en la vista semanal ── */}
      {rango === 'semana' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {dias.filter(d => d.dia !== 'sab' && d.dia !== 'dom').map(d => {
            const esHoy = d.fecha === hoy
            const futuro = d.fecha > hoy
            const vacio = d.programados === 0
            const abierto = diaAbierto === d.fecha
            return (
              <div key={d.fecha}
                onClick={() => !vacio && setDiaAbierto(abierto ? null : d.fecha)}
                style={{ ...card, padding: '12px 10px', cursor: vacio ? 'default' : 'pointer',
                  opacity: futuro || vacio ? 0.55 : 1,
                  border: abierto ? '2px solid #4f46e5' : esHoy ? '2px solid #c7d2fe' : '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, color: esHoy ? '#4f46e5' : muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {DIA_LARGO[d.dia] ?? d.dia}{esHoy ? ' · hoy' : ''}
                </div>
                <div style={{ fontSize: 10, color: hint, marginBottom: 6 }}>{fechaCorta(d.fecha)}</div>
                {vacio ? (
                  <div style={{ fontSize: 12, color: hint }}>Sin clases</div>
                ) : (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 800, color: color(d.porcentaje), fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                      {d.porcentaje === null ? '—' : `${d.porcentaje}%`}
                    </div>
                    <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
                      {d.presentes} vino{d.presentes === 1 ? '' : 'n'} · {d.ausentes} faltó{d.ausentes === 1 ? '' : 'n'}
                    </div>
                    {d.pendientes > 0 && (
                      <div style={{ fontSize: 10, color: azul, marginTop: 2, fontWeight: 600 }}>{d.pendientes} sin registrar</div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Detalle del día que se abrió */}
      {diaAbierto && (
        <Seccion titulo={`${DIA_LARGO[dias.find(d => d.fecha === diaAbierto)?.dia ?? ''] ?? ''} ${fechaCorta(diaAbierto)}`}
          nota="Quiénes faltaron ese día, por grupo">
          <div style={{ padding: '12px 16px' }}>
            {(() => {
              const faltaron = calendarios
                .map(c => ({ c, d: c.dias.find(x => x.fecha === diaAbierto && x.estado === 'ausente') }))
                .filter(x => x.d)
              if (!faltaron.length) return <div style={{ fontSize: 13, color: verde, fontWeight: 600 }}>✅ No faltó nadie</div>
              const porGrupo = new Map<string, string[]>()
              for (const { c, d } of faltaron) {
                for (const g of d!.bloques) porGrupo.set(g, [...(porGrupo.get(g) ?? []), c.jugador.nombre])
              }
              return [...porGrupo.entries()].map(([grupo, nombres]) => (
                <div key={grupo} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{grupo} <span style={{ color: rojo }}>({nombres.length})</span></div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{nombres.join(' · ')}</div>
                </div>
              ))
            })()}
          </div>
        </Seccion>
      )}

      {/* ── Lo accionable ── */}
      {alertas.length > 0 && (
        <Seccion titulo={`🔴 Dejaron de venir (${alertas.length})`}
          nota="Faltas seguidas, del que más lleva al que menos. Mirado sobre todo el historial, no solo este período.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {alertas.map(a => (
                  <tr key={a.jugador.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{a.jugador.nombre}</td>
                    <td style={{ ...td, color: rojo, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.racha} faltas seguidas</td>
                    <td style={{ ...td, color: muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {a.ultima ? `vino hace ${diasDesde(a.ultima, hoy)} días` : 'nunca vino'}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {a.completo.telefono && (
                        <WhatsAppBtn variant="compact" href={linkWhatsApp(a.completo.telefono,
                          `Hola ${a.jugador.nombre.split(' ')[0]}! 👋 Te echamos de menos en los entrenamientos. ¿Todo bien? Cualquier cosa nos avisás.`) ?? ''} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {sinRegistrar.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '11px 15px', fontSize: 13, color: '#1e40af' }}>
          🔵 Falta pasar lista de <strong>{sinRegistrar.length}</strong> día{sinRegistrar.length === 1 ? '' : 's'}:{' '}
          {sinRegistrar.map(d => fechaCorta(d.fecha)).join(', ')}. No son faltas — es lista que no se pasó, y por eso
          queda fuera del porcentaje.
        </div>
      )}

      {/* ── Por grupo, con su tendencia ── */}
      <Seccion titulo="Por grupo" nota="Cómo viene cada uno, comparado con el período anterior">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {grupos.map(g => {
              const pre = gruposPre.get(g.nombre)
              const d = pre ? diferencia(g, pre) : null
              return (
                <tr key={g.nombre}>
                  <td style={{ ...td, fontWeight: 600 }}>{g.nombre}</td>
                  <td style={{ ...num, color: muted, fontSize: 12 }}>{g.jugadores} jug.</td>
                  <td style={{ ...num, color: muted, fontSize: 12 }}>{g.presentes}/{g.presentes + g.ausentes}</td>
                  <td style={{ ...num, color: color(g.porcentaje), fontWeight: 700 }}>
                    {g.porcentaje === null ? '—' : `${g.porcentaje}%`}
                  </td>
                  <td style={{ ...num, fontSize: 12, fontWeight: 700, color: d === null ? hint : d > 0 ? verde : d < 0 ? rojo : muted, whiteSpace: 'nowrap' }}>
                    {d === null ? '—' : d === 0 ? '=' : `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}`}
                  </td>
                </tr>
              )
            })}
            {grupos.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'center', color: hint }}>Sin entrenamientos en este período</td></tr>
            )}
          </tbody>
        </table>
      </Seccion>

      {/* ── Lo macro, comprimido ── */}
      <Seccion titulo="Últimas 8 semanas" nota="La tendencia del club, semana a semana">
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
          {semanas.map(s => (
            <div key={s.inicio} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: color(s.porcentaje), fontVariantNumeric: 'tabular-nums' }}>
                {s.porcentaje === null ? '' : `${s.porcentaje}%`}
              </div>
              <div title={`Semana del ${fechaCorta(s.inicio)}`}
                style={{ width: '100%', height: Math.max(3, (s.porcentaje ?? 0) * 0.6),
                  background: s.porcentaje === null ? '#e2e8f0' : color(s.porcentaje),
                  borderRadius: '4px 4px 0 0', opacity: s.porcentaje === null ? 0.5 : 0.85 }} />
              <div style={{ fontSize: 9, color: hint, whiteSpace: 'nowrap' }}>{fechaCorta(s.inicio)}</div>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ── Rankings: siguen estando, pero ya no ocupan la pantalla ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Seccion titulo="Menor asistencia" plegable
          nota="Todo el club, de peor a mejor. A igual porcentaje va primero el que más faltó.">
          <TablaJugadores filas={ordenarPorRiesgo(filas) as Fila[]} />
        </Seccion>
        <Seccion titulo="Mejor asistencia" plegable nota="Todo el club, de mejor a peor.">
          <TablaJugadores filas={ordenarPorMerito(filas) as Fila[]} />
        </Seccion>
      </div>
    </div>
  )
}
