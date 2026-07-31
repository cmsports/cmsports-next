'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { cargarHistorialClub } from '@/lib/supabase/historial'
import { calendarioJugador, indexar, indicadores, type DatosHistorial } from '@/lib/domain/historialAsistencia'
import { descargarExcelAsistenciaPorBloque } from '@/lib/asistencia-bloque-excel'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'
const verde = '#16a34a'
const rojo  = '#dc2626'
const azul  = '#3b82f6'

type Jugador = { id: string; nombre: string; categoria: string | null; grupo: string | null; sede: string | null }

type Fila = {
  jugador: Jugador
  programados: number
  presentes: number
  ausentes: number
  pendientes: number
  porcentaje: number | null
  rachaAusentes: number
}

const th = { padding: '9px 12px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: muted,
  textTransform: 'uppercase' as const, letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const }
const td = { padding: '9px 12px', fontSize: 13, color: text, borderBottom: '1px solid #f1f5f9' }
const num = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

function color(pct: number | null) {
  if (pct === null) return muted
  return pct >= 75 ? verde : pct >= 50 ? '#d97706' : rojo
}

function restarMeses(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Tabla({ titulo, nota, filas: fs, extra }: {
  titulo: string; nota?: string; filas: Fila[]; extra?: (f: Fila) => React.ReactNode
}) {
  return (
  <div style={{ ...card, overflow: 'hidden' }}>
    <div style={{ padding: '13px 16px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{titulo}</div>
      {nota && <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>{nota}</div>}
    </div>
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
          {fs.map(f => (
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
          {fs.length === 0 && (
            <tr><td colSpan={extra ? 5 : 4} style={{ ...td, textAlign: 'center', color: hint }}>Nada por acá</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
  )
}

export default function PanelRankingAsistencia({ clubId }: { clubId: string }) {
  const [jugadores, setJugadores] = useState<Jugador[]>([])
  const [datos, setDatos]         = useState<DatosHistorial | null>(null)
  const [meses, setMeses]         = useState(3)
  const [cargando, setCargando]   = useState(true)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [descargando, setDescargando]         = useState(false)

  const hoy = fechaChile()
  const desde = restarMeses(hoy, meses)

  const cargar = useCallback(async () => {
    const [{ data: jugs }, datosClub] = await Promise.all([
      supabase.from('jugadores')
        .select('id,nombre,categoria,grupo,sede')
        .eq('club_id', clubId).eq('estado', 'activo')
        .or('es_externo.is.null,es_externo.eq.false')
        .order('nombre'),
      cargarHistorialClub(clubId, desde, hoy),
    ])
    setJugadores((jugs ?? []) as Jugador[])
    setDatos(datosClub)
    setCargando(false)
  }, [clubId, desde, hoy])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['asistencia', 'bloque_jugadores'], clubId, cargar, { conClub: ['asistencia'] })

  // El Excel se descarga con su propio período, elegido al momento de bajarlo:
  // no depende de qué rango esté mirando la pantalla ahora mismo.
  async function descargarExcel(mesesElegidos: number) {
    setSelectorAbierto(false)
    setDescargando(true)
    try {
      const hastaD = fechaChile()
      const desdeD = restarMeses(hastaD, mesesElegidos)
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

  if (cargando || !datos) {
    return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Calculando...</div>
  }

  // El mismo motor que usa el calendario individual, jugador por jugador.
  // Los índices se arman una vez y se comparten: son ciento tres llamadas
  // sobre exactamente los mismos datos.
  const indice = indexar(datos)
  const calendarios = jugadores.map(j => ({ jugador: j, dias: calendarioJugador(j.id, desde, hoy, datos, indice) }))
  const filas: Fila[] = calendarios.map(({ jugador: j, dias }) => {
    const ind = indicadores(dias)
    return {
      jugador: j,
      programados: ind.programados,
      presentes: ind.presentes,
      ausentes: ind.ausentes,
      pendientes: ind.pendientes,
      porcentaje: ind.porcentaje,
      rachaAusentes: ind.rachaAusentes,
    }
  }).filter(f => f.programados > 0)

  const conDatos = filas.filter(f => f.porcentaje !== null)
  const mejores  = [...conDatos].sort((a, b) => b.porcentaje! - a.porcentaje!).slice(0, 8)
  const peores   = [...conDatos].sort((a, b) => a.porcentaje! - b.porcentaje!).slice(0, 8)
  const enRiesgo = filas.filter(f => f.rachaAusentes >= 2).sort((a, b) => b.rachaAusentes - a.rachaAusentes)
  const pendientes = filas.filter(f => f.pendientes > 0).sort((a, b) => b.pendientes - a.pendientes).slice(0, 12)

  const totPresentes = filas.reduce((s, f) => s + f.presentes, 0)
  const totAusentes  = filas.reduce((s, f) => s + f.ausentes, 0)
  const totPend      = filas.reduce((s, f) => s + f.pendientes, 0)
  const totProg      = filas.reduce((s, f) => s + f.programados, 0)
  const promedioClub = totPresentes + totAusentes > 0
    ? Math.round((totPresentes / (totPresentes + totAusentes)) * 100) : null

  // Promedio por categoría y por grupo, sobre los mismos días.
  function agrupar(clave: (f: Fila) => string | null) {
    const m = new Map<string, { si: number; no: number; jugadores: number }>()
    for (const f of filas) {
      const k = clave(f) || '(sin asignar)'
      const acc = m.get(k) ?? { si: 0, no: 0, jugadores: 0 }
      acc.si += f.presentes; acc.no += f.ausentes; acc.jugadores++
      m.set(k, acc)
    }
    return [...m.entries()]
      .map(([k, v]) => ({ k, jugadores: v.jugadores, pct: v.si + v.no > 0 ? Math.round((v.si / (v.si + v.no)) * 100) : null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
  }

  const porCategoria = agrupar(f => f.jugador.categoria)
  const porSede      = agrupar(f => f.jugador.sede)

  // Promedio por grupo de entrenamiento, día por día: cada jornada se cuenta en
  // el bloque al que pertenecía ESE día (dia.bloques, ya resuelto por fecha en
  // calendarioJugador), no en el bloque actual del jugador. Así un cambio de
  // bloque a mitad del período no reescribe a qué grupo perteneció lo ya vivido.
  const porGrupo = (() => {
    const m = new Map<string, { si: number; no: number; jugadores: Set<string> }>()
    for (const { jugador: j, dias } of calendarios) {
      for (const d of dias) {
        if (d.estado !== 'presente' && d.estado !== 'ausente') continue
        for (const nombre of d.bloques) {
          const acc = m.get(nombre) ?? { si: 0, no: 0, jugadores: new Set<string>() }
          if (d.estado === 'presente') acc.si++; else acc.no++
          acc.jugadores.add(j.id)
          m.set(nombre, acc)
        }
      }
    }
    return [...m.entries()]
      .map(([k, v]) => ({ k, jugadores: v.jugadores.size, pct: v.si + v.no > 0 ? Math.round((v.si / (v.si + v.no)) * 100) : null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
  })()


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: muted }}>Período:</span>
        {[1, 3, 6, 12].map(n => (
          <button key={n} onClick={() => { setCargando(true); setMeses(n) }}
            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${meses === n ? '#4f46e5' : '#e2e8f0'}`,
              background: meses === n ? '#4f46e5' : '#fff',
              color: meses === n ? '#fff' : muted }}>
            {n === 1 ? '1 mes' : `${n} meses`}
          </button>
        ))}
        <span style={{ fontSize: 11, color: hint }}>{desde} al {hoy}</span>

        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button onClick={() => setSelectorAbierto(v => !v)} disabled={descargando}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 20,
              cursor: descargando ? 'not-allowed' : 'pointer', border: '1px solid #4f46e5', background: '#4f46e5', color: '#fff' }}>
            <Download size={13} />
            {descargando ? 'Generando...' : 'Descargar asistencia por bloque'}
          </button>
          {selectorAbierto && (
            <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 10, background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', padding: 10, minWidth: 190 }}>
              <div style={{ fontSize: 11, color: hint, fontWeight: 600, marginBottom: 6, padding: '0 4px' }}>¿De cuánto tiempo?</div>
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

      {/* Administración: el club de un vistazo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {([
          ['Asistencia del club', promedioClub === null ? '—' : `${promedioClub}%`, color(promedioClub)],
          ['Entrenamientos programados', String(totProg), text],
          ['Realizados y registrados', String(totPresentes + totAusentes), text],
          ['Sin registrar', String(totPend), totPend > 0 ? azul : muted],
        ] as const).map(([label, valor, c]) => (
          <div key={label} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
          </div>
        ))}
      </div>

      {totPend > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '11px 15px', fontSize: 13, color: '#1e40af' }}>
          Hay <strong>{totPend}</strong> entrenamientos sin registrar en el período. Quedan fuera del
          porcentaje: no son faltas, es lista que no se pasó.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Tabla titulo="Mejor asistencia" filas={mejores} />
        <Tabla titulo="Menor asistencia" nota="Con quiénes conviene hablar" filas={peores} />
      </div>

      <Tabla titulo="Faltas seguidas"
        nota="Los que vienen faltando de corrido, del que más lleva al que menos"
        filas={enRiesgo}
        extra={f => <span style={{ color: rojo, fontWeight: 700 }}>{f.rachaAusentes} seguidas</span>} />

      <Tabla titulo="Pendientes de registrar"
        nota="Días que les tocaba entrenar y nadie marcó nada"
        filas={pendientes}
        extra={f => <span style={{ color: azul, fontWeight: 700 }}>{f.pendientes} días</span>} />

      {/* Promedios por corte */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {([['Por grupo', porGrupo], ['Por categoría', porCategoria], ['Por sede', porSede]] as const).map(([titulo, filas]) => (
          <div key={titulo} style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>{titulo}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {filas.map(f => (
                  <tr key={f.k}>
                    <td style={{ ...td, fontWeight: 600 }}>{f.k}</td>
                    <td style={{ ...num, color: muted }}>{f.jugadores} jug.</td>
                    <td style={{ ...num, color: color(f.pct), fontWeight: 700 }}>{f.pct === null ? '—' : `${f.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
