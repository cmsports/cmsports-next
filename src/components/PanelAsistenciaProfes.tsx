'use client'

// Los profesores marcan que estuvieron, y el club cuenta las horas trabajadas.
//
// Ojo con no confundirlo con el reporte de Cupos/bloques → Reportes: ese suma
// las horas que a cada profesor le TOCABA dictar, sacadas del horario. Este
// suma las que marcó. Cuando alguien falta o cubre a un compañero, los dos
// números se separan, y esa diferencia es justo lo que Spinhouse quería ver.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Check } from 'lucide-react'
import { diaSemanaDeFecha, hhmm, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { horas } from '@/lib/domain/reportesMes'
import { resumenHorasProfes, type MarcaProfesor } from '@/lib/domain/horasProfesor'

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
}

type Marca = {
  id: string
  profesor_id: string
  bloque_id: string
  fecha: string
  hora: string
}

type Profesor = { id: string; nombre: string }

/** El primero y el último día de un mes 'YYYY-MM'. */
function rangoDelMes(mes: string): [string, string] {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, '0')}`]
}

export default function PanelAsistenciaProfes({
  clubId, esAdmin,
}: { clubId: string; esAdmin: boolean }) {
  const hoy = fechaChile()

  const [vista, setVista]       = useState<'dia' | 'mes'>('dia')
  const [fecha, setFecha]       = useState(hoy)
  const [mes, setMes]           = useState(hoy.slice(0, 7))

  const [bloques, setBloques]   = useState<Bloque[]>([])
  const [profesores, setProfes] = useState<Profesor[]>([])
  const [asignados, setAsign]   = useState<Map<string, string[]>>(new Map())
  const [marcasDia, setMarcasDia] = useState<Marca[]>([])
  const [marcasMes, setMarcasMes] = useState<MarcaProfesor[]>([])
  const [suspendidos, setSusp]  = useState<Set<string>>(new Set())
  const [yoSoy, setYoSoy]       = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError]       = useState('')

  const cargar = useCallback(async () => {
    const [desdeMes, hastaMes] = rangoDelMes(mes)
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any
    const [bloquesRes, profesRes, asignRes, diaRes, mesRes, excRes, yoRes] = await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin')
        .eq('club_id', clubId).eq('activo', true)
        .lte('vigente_desde', fecha)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`),
      db.from('profesores').select('id,nombre').eq('club_id', clubId).eq('activo', true).order('nombre'),
      db.from('bloque_profesores').select('bloque_id,profesor_id').is('vigente_hasta', null),
      db.from('asistencia_profesores')
        .select('id,profesor_id,bloque_id,fecha,hora')
        .eq('club_id', clubId).eq('fecha', fecha),
      // Para las horas del mes hace falta la duración de cada bloque, así que
      // la marca viene con su bloque colgado.
      db.from('asistencia_profesores')
        .select('profesor_id,fecha,bloques_horario(hora_inicio,hora_fin)')
        .eq('club_id', clubId).gte('fecha', desdeMes).lte('fecha', hastaMes),
      db.from('bloque_excepciones').select('bloque_id').eq('fecha', fecha),
      db.rpc('get_my_profesor_id'),
    ])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    setBloques((bloquesRes.data ?? []) as Bloque[])
    setProfes((profesRes.data ?? []) as Profesor[])

    const porBloque = new Map<string, string[]>()
    for (const r of (asignRes.data ?? []) as { bloque_id: string; profesor_id: string }[]) {
      porBloque.set(r.bloque_id, [...(porBloque.get(r.bloque_id) ?? []), r.profesor_id])
    }
    setAsign(porBloque)

    setMarcasDia((diaRes.data ?? []) as Marca[])
    setMarcasMes(((mesRes.data ?? []) as {
      profesor_id: string; fecha: string
      bloques_horario: { hora_inicio: string; hora_fin: string } | null
    }[])
      .filter(m => !!m.bloques_horario)
      .map(m => ({
        profesor_id: m.profesor_id,
        fecha: m.fecha,
        hora_inicio: m.bloques_horario!.hora_inicio,
        hora_fin: m.bloques_horario!.hora_fin,
      })))

    setSusp(new Set(((excRes.data ?? []) as { bloque_id: string }[]).map(e => e.bloque_id)))
    setYoSoy((yoRes.data as string | null) ?? null)
    setCargando(false)
  }, [clubId, fecha, mes])

  useEffect(() => { void cargar() }, [cargar])
  // Dos profes en el mismo bloque, cada uno con su teléfono: el primero tiene
  // que ver que el segundo ya marcó.
  useEnVivo(['asistencia_profesores', 'bloque_profesores'], clubId, cargar,
    { conClub: ['asistencia_profesores'] })

  const nombreDe = useMemo(() => new Map(profesores.map(p => [p.id, p.nombre])), [profesores])

  const bloquesDelDia = useMemo(() => {
    const dia = diaSemanaDeFecha(fecha)
    return bloques
      .filter(b => b.dia_semana === dia && !suspendidos.has(b.id))
      .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))
  }, [bloques, fecha, suspendidos])

  const marcaDe = useMemo(
    () => new Map(marcasDia.map(m => [`${m.bloque_id}|${m.profesor_id}`, m])),
    [marcasDia],
  )

  const resumen = useMemo(() => resumenHorasProfes(marcasMes), [marcasMes])

  // Quién puede tocar la marca de quién: el admin la de cualquiera, el profesor
  // solo la suya. Es lo mismo que impone la RLS; acá es para no ofrecer un
  // botón que va a fallar.
  const puedeTocar = (profesorId: string) => esAdmin || profesorId === yoSoy

  async function alternar(bloque: Bloque, profesorId: string) {
    const clave = `${bloque.id}|${profesorId}`
    const ya = marcaDe.get(clave)
    setGuardando(clave); setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error: err } = ya
      ? await db.from('asistencia_profesores').delete().eq('id', ya.id)
      : await db.from('asistencia_profesores').insert({
          club_id: clubId, profesor_id: profesorId, bloque_id: bloque.id, fecha,
        })

    setGuardando(null)
    if (err) {
      // El caso que más va a pasar: la ficha del profesor y su cuenta tienen
      // correos distintos, así que get_my_profesor_id() devuelve NULL y la RLS
      // no lo deja escribir. El mensaje crudo de Postgres no ayuda a nadie.
      setError(err.code === '42501' || /row-level security/i.test(err.message ?? '')
        ? 'No podés marcar esta asistencia. Si sos el profesor, pedile al admin que revise que el correo de tu ficha sea el mismo con el que entrás.'
        : err.message)
      return
    }
    await cargar()
  }

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>

  return (
    <>
      <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 10, padding: 4, marginBottom: 14 }}>
        {([['dia', 'Marcar el día'], ['mes', 'Horas del mes']] as const).map(([key, label]) => (
          <div key={key} onClick={() => setVista(key)}
            style={{ flex: 1, padding: 9, textAlign: 'center', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
              background: vista === key ? '#fff' : 'transparent', color: vista === key ? '#3730a3' : muted,
              boxShadow: vista === key ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}>
            {label}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {vista === 'dia' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: muted }}>Día</label>
            {/* Sin `max`, se podía elegir mañana y el botón fallaba recién al
                apretarlo: la RLS rechaza toda marca con fecha futura. */}
            <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)}
              style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: text }} />
            {fecha !== hoy && (
              <button onClick={() => setFecha(hoy)}
                style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: muted, cursor: 'pointer' }}>
                Hoy
              </button>
            )}
          </div>

          {!esAdmin && !yoSoy && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>
              No pude enlazar tu cuenta con tu ficha de profesor. Pedile al admin que revise que el correo de la ficha
              sea el mismo con el que entrás a la plataforma.
            </div>
          )}

          {bloquesDelDia.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
              Ese día no se dicta ningún bloque.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {bloquesDelDia.map(b => {
                // Los asignados primero: son los que se espera que marquen. El
                // admin ve además al resto, para el día que uno cubre a otro.
                const suyos = asignados.get(b.id) ?? []
                const otros = esAdmin ? profesores.map(p => p.id).filter(id => !suyos.includes(id)) : []
                const listados = [...suyos, ...otros]

                return (
                  <div key={b.id} style={{ ...card, padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{b.nombre}</div>
                    <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 10 }}>
                      {rangoHorario(b.hora_inicio, b.hora_fin)} · 📍 {sedeLabel(b.sede)}
                    </div>

                    {listados.length === 0 ? (
                      <div style={{ fontSize: 12, color: hint }}>Este bloque no tiene profesor asignado.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {listados.map(profesorId => {
                          const clave    = `${b.id}|${profesorId}`
                          const marca    = marcaDe.get(clave)
                          const editable = puedeTocar(profesorId)
                          const esAsignado = suyos.includes(profesorId)

                          return (
                            <button key={profesorId}
                              onClick={() => editable && void alternar(b, profesorId)}
                              disabled={!editable || guardando === clave}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                                padding: '9px 12px', borderRadius: 10, fontSize: 13,
                                background: marca ? '#f0fdf4' : '#f8fafc',
                                border: `1px solid ${marca ? '#bbf7d0' : '#e2e8f0'}`,
                                color: text,
                                cursor: !editable ? 'default' : guardando === clave ? 'wait' : 'pointer',
                                opacity: editable ? 1 : 0.7,
                              }}>
                              <span style={{
                                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: marca ? '#16a34a' : '#fff',
                                border: `1px solid ${marca ? '#16a34a' : '#cbd5e1'}`,
                              }}>
                                {marca && <Check size={13} color="#fff" strokeWidth={3} />}
                              </span>

                              <span style={{ flex: 1 }}>
                                {nombreDe.get(profesorId) ?? 'Profesor'}
                                {profesorId === yoSoy && (
                                  <span style={{ fontSize: 11, color: '#4f46e5', fontWeight: 700 }}> · vos</span>
                                )}
                                {!esAsignado && (
                                  <span style={{ fontSize: 11, color: hint }}> · no asignado</span>
                                )}
                              </span>

                              {marca && (
                                <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                                  {hhmm(marca.hora)}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: muted }}>Mes</label>
            <input type="month" value={mes} max={hoy.slice(0, 7)} onChange={e => setMes(e.target.value)}
              style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: text }} />
          </div>

          <p style={{ fontSize: 12, color: hint, margin: '0 0 12px', lineHeight: 1.5 }}>
            Horas efectivamente marcadas. No es lo mismo que el reporte de Cupos/bloques → Reportes, que suma las horas
            que a cada uno le tocaba dictar según el horario.
          </p>

          {resumen.length === 0 ? (
            <div style={{ ...card, padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>
              Nadie marcó asistencia este mes.
            </div>
          ) : (
            <div style={{ ...card, overflow: 'hidden' }}>
              {resumen.map((r, i) => (
                <div key={r.profesorId} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>
                      {nombreDe.get(r.profesorId) ?? 'Profesor'}
                    </div>
                    <div style={{ fontSize: 11, color: hint, marginTop: 2 }}>
                      {r.clases} {r.clases === 1 ? 'clase' : 'clases'}
                    </div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#4f46e5', fontVariantNumeric: 'tabular-nums' }}>
                    {horas(r.minutos)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
