'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DIAS, diaLabel, rangoHorario, minutosDelDia, type BloqueHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { vigenteEn, type Vigencia } from '@/lib/domain/vigencia'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Bloque = BloqueHorario & { profesorIds: string[] }
type Profesor = { id: string; nombre: string }
type Inscripcion = { bloque_id: string; jugador_id: string } & Vigencia

/** Fechas (YYYY-MM-DD) de lunes a viernes entre dos días, inclusive. */
function diasHabiles(desde: string, hasta: string): { fecha: string; dia: string }[] {
  const out: { fecha: string; dia: string }[] = []
  const d = new Date(desde + 'T12:00:00')
  const fin = new Date(hasta + 'T12:00:00')
  while (d <= fin) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) {
      out.push({
        fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        dia: ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][dow],
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

function restarDias(fecha: string, n: number): string {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Barra({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', minWidth: 70 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

const th = { padding: '9px 12px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: muted,
  textTransform: 'uppercase' as const, letterSpacing: '0.4px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' as const }
const td = { padding: '10px 12px', fontSize: 13, color: text, borderBottom: '1px solid #f1f5f9' }
const num = { ...td, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const }

export default function PanelReportes({ clubId }: { clubId: string }) {
  const [bloques, setBloques]       = useState<Bloque[]>([])
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [inscritos, setInscritos]   = useState<Record<string, Inscripcion[]>>({})
  const [asistPorFecha, setAsist]   = useState<Record<string, Set<string>>>({})
  const [semanas, setSemanas]       = useState(4)
  const [cargando, setCargando]     = useState(true)

  const hoy = fechaChile()
  const desde = restarDias(hoy, semanas * 7 - 1)

  const cargar = useCallback(async () => {
    const [{ data: bl }, { data: prof }, { data: rel }, { data: relProf }, { data: asis }] = await Promise.all([
      supabase.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,cupo_maximo,cupo_libres,activo')
        .eq('club_id', clubId).eq('activo', true).order('hora_inicio'),
      supabase.from('profesores').select('id,nombre').eq('club_id', clubId).eq('activo', true).order('nombre'),
      // Con vigencia: un reporte de hace dos meses tiene que contar a quien
      // estaba en el grupo entonces, no a quien está hoy.
      supabase.from('bloque_jugadores').select('bloque_id,jugador_id,vigente_desde,vigente_hasta'),
      supabase.from('bloque_profesores').select('bloque_id,profesor_id').is('vigente_hasta', null),
      supabase.from('asistencia').select('jugador_id,fecha')
        .eq('club_id', clubId).gte('fecha', desde).lte('fecha', hoy),
    ])

    const porBloque: Record<string, Inscripcion[]> = {}
    for (const r of (rel ?? []) as Inscripcion[]) {
      porBloque[r.bloque_id] = [...(porBloque[r.bloque_id] ?? []), r]
    }

    const profDe = new Map<string, string[]>()
    for (const r of relProf ?? []) profDe.set(r.bloque_id, [...(profDe.get(r.bloque_id) ?? []), r.profesor_id])

    const porFecha: Record<string, Set<string>> = {}
    for (const a of asis ?? []) {
      if (!porFecha[a.fecha]) porFecha[a.fecha] = new Set()
      porFecha[a.fecha].add(a.jugador_id)
    }

    setBloques(((bl ?? []) as BloqueHorario[]).map(b => ({ ...b, profesorIds: profDe.get(b.id) ?? [] })))
    setProfesores((prof ?? []) as Profesor[])
    setInscritos(porBloque)
    setAsist(porFecha)
    setCargando(false)
  }, [clubId, desde, hoy])

  useEffect(() => { void cargar() }, [cargar])

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Calculando...</div>

  const fechas = diasHabiles(desde, hoy)

  // Por cada bloque: cuánta gente tiene, cuánto cabe, y de las veces que se
  // dictó en el período, cuántas asistencias hubo de su propia gente.
  const filas = bloques.map(b => {
    const historia = inscritos[b.id] ?? []
    const fechasDelBloque = fechas.filter(f => f.dia === b.dia_semana)

    // Se recorre fecha por fecha, no se multiplica: un mes con cinco lunes
    // tiene cinco sesiones y otro cuatro, y quien entró a mitad de mes solo
    // debe las que le tocaban desde que entró.
    let esperadas = 0
    let presentes = 0
    for (const f of fechasDelBloque) {
      const delDia = asistPorFecha[f.fecha]
      for (const i of historia) {
        if (!vigenteEn(i, f.fecha)) continue
        esperadas++
        if (delDia?.has(i.jugador_id)) presentes++
      }
    }

    const hoyDentro = historia.filter(i => vigenteEn(i, hoy)).length
    return {
      b,
      inscritos: hoyDentro,
      ocupacion: b.cupo_maximo > 0 ? Math.round((hoyDentro / b.cupo_maximo) * 100) : 0,
      sesiones: fechasDelBloque.length,
      presentes,
      esperadas,
      asistencia: esperadas > 0 ? Math.round((presentes / esperadas) * 100) : null,
    }
  })

  const totalInscritos = filas.reduce((s, f) => s + f.inscritos, 0)
  const totalPresentes = filas.reduce((s, f) => s + f.presentes, 0)
  const totalEsperadas = filas.reduce((s, f) => s + f.esperadas, 0)
  const promedio = totalEsperadas > 0 ? Math.round((totalPresentes / totalEsperadas) * 100) : null

  // Por profesor: cuántos bloques toma, cuántas horas suma y a cuánta gente ve.
  const porProfesor = profesores.map(p => {
    const suyos = bloques.filter(b => b.profesorIds.includes(p.id))
    const minutos = suyos.reduce((s, b) => s + (minutosDelDia(b.hora_fin) - minutosDelDia(b.hora_inicio)), 0)
    const alumnos = new Set<string>()
    for (const b of suyos) for (const i of inscritos[b.id] ?? []) if (vigenteEn(i, hoy)) alumnos.add(i.jugador_id)
    const sedes = [...new Set(suyos.map(b => b.sede))]
    return { p, bloques: suyos.length, horas: minutos / 60, alumnos: alumnos.size, sedes }
  }).sort((a, b) => b.horas - a.horas)

  const colorOcup = (pct: number) => pct > 100 ? '#dc2626' : pct >= 100 ? '#d97706' : '#16a34a'
  const colorAsis = (pct: number) => pct >= 75 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: muted }}>Período:</span>
        {[2, 4, 8, 12].map(n => (
          <button key={n} onClick={() => { setCargando(true); setSemanas(n) }}
            style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${semanas === n ? '#4f46e5' : '#e2e8f0'}`,
              background: semanas === n ? '#4f46e5' : '#fff',
              color: semanas === n ? '#fff' : muted }}>
            {n} semanas
          </button>
        ))}
        <span style={{ fontSize: 11, color: hint }}>{desde} al {hoy}</span>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {([
          ['Grupos activos', String(bloques.length), text],
          ['Inscripciones', String(totalInscritos), text],
          ['Asistencias registradas', String(totalPresentes), text],
          ['Asistencia promedio', promedio === null ? '—' : `${promedio}%`, promedio === null ? muted : colorAsis(promedio)],
        ] as const).map(([label, valor, color]) => (
          <div key={label} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
          </div>
        ))}
      </div>

      {/* Ocupación y asistencia por grupo */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text }}>Ocupación por grupo</div>
          <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>
            Cuánta gente tiene cada grupo sobre su cupo. La asistencia vive en Asistencia → Panorama,
            que sale del historial: acá se duplicaría el cálculo.
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Grupo</th>
                <th style={th}>Sede</th>
                <th style={th}>Día</th>
                <th style={{ ...th, textAlign: 'right' }}>Inscritos</th>
                <th style={th}>Ocupación</th>
                <th style={{ ...th, textAlign: 'right' }}>Clases</th>
              </tr>
            </thead>
            <tbody>
              {DIAS.flatMap(d => filas.filter(f => f.b.dia_semana === d.value)).map(f => (
                <tr key={f.b.id}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {f.b.nombre}
                    <div style={{ fontSize: 11, color: muted, fontWeight: 400 }}>{rangoHorario(f.b.hora_inicio, f.b.hora_fin)}</div>
                  </td>
                  <td style={{ ...td, color: muted }}>{sedeLabel(f.b.sede)}</td>
                  <td style={{ ...td, color: muted }}>{diaLabel(f.b.dia_semana)}</td>
                  <td style={num}>{f.inscritos} <span style={{ color: hint }}>/ {f.b.cupo_maximo}</span></td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Barra pct={f.ocupacion} color={colorOcup(f.ocupacion)} />
                      <span style={{ fontSize: 12, color: colorOcup(f.ocupacion), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.ocupacion}%</span>
                    </div>
                  </td>
                  <td style={num}>{f.sesiones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Carga por profesor */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
          Carga por profesor
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Profesor</th>
                <th style={{ ...th, textAlign: 'right' }}>Grupos</th>
                <th style={{ ...th, textAlign: 'right' }}>Horas / semana</th>
                <th style={{ ...th, textAlign: 'right' }}>Alumnos</th>
                <th style={th}>Sedes</th>
              </tr>
            </thead>
            <tbody>
              {porProfesor.map(p => (
                <tr key={p.p.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.p.nombre}</td>
                  <td style={num}>{p.bloques}</td>
                  <td style={num}>{p.horas % 1 === 0 ? p.horas : p.horas.toFixed(1)}</td>
                  <td style={num}>{p.alumnos}</td>
                  <td style={{ ...td, color: muted }}>{p.sedes.map(sedeLabel).join(' · ') || '—'}</td>
                </tr>
              ))}
              {porProfesor.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: hint }}>Sin profesores cargados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: hint, lineHeight: 1.6 }}>
        Un jugador que entrena dos veces el mismo día cuenta una sola asistencia, así que
        su porcentaje aparece más bajo de lo real en esos dos grupos.
        La asistencia se toma de lo registrado, y solo desde que se empezó a pasar lista.
      </div>
    </div>
  )
}
