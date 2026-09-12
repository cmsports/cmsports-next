'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { programarLigaCompleta } from '@/app/actions/ligaJornadas'
import { FixtureDivision } from '@/components/liga/FixtureDivision'
import { useEnVivo } from '@/lib/useEnVivo'

// Pestaña "Programación" de una liga por jornadas (Spinhouse). Reemplaza al
// tablero de fechas del modo mesa_unica: acá no hay "programar fecha",
// "iniciar" ni "terminar". Hay jornadas —una por fin de semana— y un solo
// botón que arma todas las que faltan hasta que la división termine su
// todos contra todos. Los resultados se marcan en cada partido; la jornada
// se cierra sola cuando no le queda ninguno abierto.

const supabase = createClient()
const ink = '#0f172a', muted = '#64748b', hint = '#94a3b8', azul = '#2563eb'

type Jornada = { id: string; numero: number; fecha: string | null; estado: string }
const ESTADO: Record<string, string> = { programada: 'Programada', en_juego: 'En juego', finalizada: 'Terminada' }

export function ProgramacionJornadas({ ligaId, divisionId, nombres, clubId, fixtureKey, onCambio }: {
  ligaId: string
  divisionId: string
  nombres: Record<string, string>
  clubId: string | null
  fixtureKey: number
  onCambio?: () => void
}) {
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [sel, setSel] = useState<string | 'sin' | null>(null)
  const [cargando, setCargando] = useState(true)
  const [programando, setProgramando] = useState(false)
  const [fechaInicio, setFechaInicio] = useState('')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [version, setVersion] = useState(0)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('liga_fechas').select('id, numero, fecha, estado').eq('liga_id', ligaId).eq('es_ajuste', false).order('numero')
    const lista = (data ?? []) as Jornada[]
    setJornadas(lista)
    setSel(prev => {
      if (prev && (prev === 'sin' || lista.some(j => j.id === prev))) return prev
      // La primera jornada que no terminó, o la última.
      const abierta = lista.find(j => j.estado !== 'finalizada') ?? lista[lista.length - 1]
      return abierta?.id ?? 'sin'
    })
    setCargando(false)
  }, [ligaId])

  useEffect(() => { void cargar() }, [cargar, version])
  useEnVivo(['liga_fechas'], clubId, () => { void cargar() }, { filtro: `liga_id=eq.${ligaId}` })

  // Las jornadas proyectadas que todavía no tienen ningún resultado se
  // pueden rehacer; la primera que ya tiene uno (o la pegada de la hoja, si
  // es la 1) queda como está.
  const primeraRehacible = (() => {
    const abiertas = jornadas.filter(j => j.estado === 'programada')
    const desde = abiertas.length ? abiertas[0].numero : null
    return desde === null ? null : Math.max(desde, 2)
  })()

  async function programarTodo(rehacer = false) {
    setMensaje(null)
    if (!jornadas.length && !fechaInicio) { setMensaje({ tipo: 'error', texto: 'Pon la fecha del primer sábado.' }); return }
    const rehacerDesde = rehacer && primeraRehacible ? primeraRehacible : undefined
    if (!confirm(rehacerDesde
      ? `Se borran las jornadas desde la ${rehacerDesde} que no tengan ningún resultado y se vuelven a armar, un fin de semana cada una, hasta que todas las divisiones terminen. La Jornada 1 y las que ya tienen resultados no se tocan. ¿Seguir?`
      : jornadas.length
        ? `Se arman las jornadas que faltan a partir de la ${jornadas[jornadas.length - 1].numero + 1}, un fin de semana cada una, hasta que todas las divisiones terminen. Las jornadas que ya existen no se tocan. ¿Seguir?`
        : 'Se arma la liga completa desde esa fecha, una jornada por fin de semana. ¿Seguir?')) return
    setProgramando(true)
    const res = await programarLigaCompleta({ ligaId, fechaInicio: fechaInicio || undefined, rehacerDesde })
    setProgramando(false)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); return }
    const n = res.jornadas?.length ?? 0
    const ultima = res.jornadas?.[n - 1]
    setMensaje({ tipo: 'ok', texto: `Listo: ${n} jornada${n === 1 ? '' : 's'} nueva${n === 1 ? '' : 's'}${res.jornadasBorradas ? ` (${res.jornadasBorradas} rehecha${res.jornadasBorradas === 1 ? '' : 's'})` : ''}${ultima ? `, la última el ${ultima.fecha.slice(8, 10)}/${ultima.fecha.slice(5, 7)}` : ''}. Cada división repite el día y las mesas de su última jornada; para cambiar una, entra a "Jornadas".` })
    setVersion(v => v + 1)
    onCambio?.()
  }

  if (cargando) return <div style={{ fontSize: 12, color: hint, padding: '12px 0' }}>Cargando jornadas…</div>

  const chip = (activo: boolean, color = azul) => ({
    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const,
    border: activo ? `2px solid ${color}` : '1px solid #e2e8f0', background: activo ? '#eff6ff' : '#fff', color: activo ? color : muted,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: hint, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', marginRight: 4 }}>Jornadas</span>
          {jornadas.map(j => (
            <button key={j.id} onClick={() => setSel(j.id)} style={chip(sel === j.id, j.estado === 'finalizada' ? '#16a34a' : j.estado === 'en_juego' ? '#d97706' : azul)}>
              J{j.numero}{j.fecha ? ` · ${j.fecha.slice(8, 10)}/${j.fecha.slice(5, 7)}` : ''} <span style={{ fontWeight: 500, opacity: 0.7 }}>· {ESTADO[j.estado] ?? j.estado}</span>
            </button>
          ))}
          <button onClick={() => setSel('sin')} style={chip(sel === 'sin', '#7c3aed')}>Sin programar</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!jornadas.length && (
            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} title="Primer sábado"
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: ink }} />
          )}
          <button onClick={() => programarTodo(false)} disabled={programando}
            style={{ background: programando ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#4f46e5)', color: programando ? hint : 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: programando ? 'default' : 'pointer', boxShadow: programando ? 'none' : '0 4px 14px rgba(37,99,235,0.35)' }}>
            📅 {programando ? 'Programando…' : jornadas.length ? 'Programar lo que falta' : 'Programar toda la liga'}
          </button>
          {primeraRehacible !== null && jornadas.some(j => j.numero >= primeraRehacible) && (
            <button onClick={() => programarTodo(true)} disabled={programando} title="Borra las jornadas sin resultados y las vuelve a armar"
              style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: ink, background: '#fff', cursor: programando ? 'default' : 'pointer' }}>
              ↺ Rehacer desde J{primeraRehacible}
            </button>
          )}
          <a href={`/liga/${ligaId}/jornadas`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: ink, textDecoration: 'none', background: '#fff' }}>
            🗓 Jornadas y PDF ↗
          </a>
        </div>
      </div>

      <p style={{ fontSize: 12, color: hint, margin: '0 0 12px', lineHeight: 1.5 }}>
        Una jornada por fin de semana; cada división juega una tarde con sus mesas, 3 partidos por jugador, árbitros de la misma división.
        Marca el resultado en cada partido (o W.O. si alguien no llegó); la jornada se cierra sola cuando no queda ninguno abierto.
      </p>

      {mensaje && (
        <div style={{ background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, color: mensaje.tipo === 'ok' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          {mensaje.texto}
        </div>
      )}

      {sel && (
        <FixtureDivision
          key={`${divisionId}-${sel}-${version}-${fixtureKey}`}
          divisionId={divisionId}
          ligaId={ligaId}
          nombres={nombres}
          porJornadas
          soloFechaId={sel}
        />
      )}
    </div>
  )
}
