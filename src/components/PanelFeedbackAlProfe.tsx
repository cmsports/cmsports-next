'use client'

// El alumno le escribe al profesor. Con su nombre, o anónimo.
//
// Solo aparecen los profes que efectivamente le hacen clases: salen de sus
// bloques. Elegir de la lista completa del club invitaría a opinar de alguien
// con quien nunca entrenó.
//
// Lo anónimo es anónimo de verdad: el `jugador_id` viaja igual —es lo que le
// permite a él releer y borrar lo suyo— pero nadie del staff lo ve, porque la
// pantalla del profe lee por `feedback_de_profesores()`, que devuelve el autor
// en NULL. Ver la migración 228.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Trash2 } from 'lucide-react'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Profesor = { id: string; nombre: string }
type Mio = {
  id: string
  profesor_id: string
  fecha: string
  comentario: string
  anonimo: boolean
}

const MAX = 1000

export default function PanelFeedbackAlProfe({
  clubId, jugadorId,
}: { clubId: string; jugadorId: string }) {
  const [profesores, setProfes] = useState<Profesor[]>([])
  const [mios, setMios]         = useState<Mio[]>([])
  const [cargando, setCargando] = useState(true)

  const [profesorId, setProfesorId] = useState('')
  const [comentario, setComentario] = useState('')
  const [anonimo, setAnonimo]       = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const [listo, setListo]           = useState(false)

  const cargar = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const db = supabase as any
    const { data: misBloques } = await db.from('bloque_jugadores')
      .select('bloque_id').eq('jugador_id', jugadorId).is('vigente_hasta', null)

    const ids = ((misBloques ?? []) as { bloque_id: string }[]).map(b => b.bloque_id)

    const [profRel, profs, feedbacks] = await Promise.all([
      ids.length > 0
        ? db.from('bloque_profesores').select('profesor_id').in('bloque_id', ids).is('vigente_hasta', null)
        : Promise.resolve({ data: [] }),
      db.from('profesores').select('id,nombre').eq('club_id', clubId).eq('activo', true).order('nombre'),
      db.from('feedback_profesores')
        .select('id,profesor_id,fecha,comentario,anonimo')
        .eq('jugador_id', jugadorId).order('fecha', { ascending: false }),
    ])
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const mios = new Set(((profRel.data ?? []) as { profesor_id: string }[]).map(r => r.profesor_id))
    setProfes(((profs.data ?? []) as Profesor[]).filter(p => mios.has(p.id)))
    setMios((feedbacks.data ?? []) as Mio[])
    setCargando(false)
  }, [clubId, jugadorId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['feedback_profesores', 'bloque_jugadores'], clubId, cargar,
    { conClub: ['feedback_profesores'] })

  const nombreDe = useMemo(() => new Map(profesores.map(p => [p.id, p.nombre])), [profesores])

  async function enviar() {
    const texto = comentario.trim()
    if (!profesorId) { setError('Elegí a qué profesor le querés escribir'); return }
    if (!texto) { setError('Escribí tu comentario'); return }

    setGuardando(true); setError(''); setListo(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('feedback_profesores').insert({
      club_id: clubId, profesor_id: profesorId, jugador_id: jugadorId,
      anonimo, comentario: texto,
    })
    setGuardando(false)

    if (err) {
      // 23505 = ya le escribió hoy. El mensaje crudo no le dice nada a nadie.
      setError(err.code === '23505'
        ? 'Ya le dejaste un comentario a ese profesor hoy. Si querés cambiarlo, borrá el anterior.'
        : err.message)
      return
    }

    setComentario(''); setAnonimo(false); setProfesorId('')
    setListo(true)
    await cargar()
  }

  async function borrar(id: string) {
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('feedback_profesores').delete().eq('id', id)
    if (err) { setError(err.message); return }
    await cargar()
  }

  if (cargando) {
    return <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
  }

  if (profesores.length === 0) {
    return (
      <div style={{ ...card, padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🗓️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 4 }}>
          Todavía no tenés profesor asignado
        </div>
        <div style={{ fontSize: 12, color: muted }}>
          Cuando te agreguen a un grupo vas a poder dejarle tu comentario.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Dejale tu comentario al profe</div>
        <p style={{ fontSize: 12, color: hint, margin: '4px 0 14px', lineHeight: 1.5 }}>
          Cómo te sentís con las clases, qué te sirve, qué cambiarías. Lo lee el profesor.
        </p>

        <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 6 }}>Profesor</label>
        <select value={profesorId} onChange={e => { setProfesorId(e.target.value); setListo(false) }}
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: text, marginBottom: 12 }}>
          <option value="">Elegí un profesor...</option>
          {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 6 }}>Tu comentario</label>
        <textarea value={comentario} rows={4} maxLength={MAX}
          onChange={e => { setComentario(e.target.value); setListo(false) }}
          placeholder="Ej: me gustaría trabajar más el revés en los entrenamientos."
          style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: text, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ fontSize: 11, color: hint, textAlign: 'right', marginTop: 3 }}>
          {comentario.length}/{MAX}
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={anonimo} onChange={e => setAnonimo(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: text }}>
            Enviarlo de forma anónima
            <span style={{ display: 'block', fontSize: 11, color: hint, marginTop: 2, lineHeight: 1.5 }}>
              El profe va a leer tu comentario pero no va a saber que es tuyo. Vos lo seguís viendo acá abajo.
            </span>
          </span>
        </label>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {listo && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginTop: 12 }}>
            ¡Listo! Tu comentario le llegó al profe.
          </div>
        )}

        <button onClick={() => void enviar()} disabled={guardando}
          style={{ width: '100%', marginTop: 14, padding: '12px 16px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#fff', background: guardando ? '#94a3b8' : '#4f46e5', cursor: guardando ? 'wait' : 'pointer' }}>
          {guardando ? 'Enviando...' : 'Enviar comentario'}
        </button>
      </div>

      {mios.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: text, margin: '0 0 8px' }}>Lo que le escribiste</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mios.map(f => (
              <div key={f.id} style={{ ...card, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                    {nombreDe.get(f.profesor_id) ?? 'Profesor'}
                  </span>
                  <span style={{ fontSize: 11, color: hint }}>{f.fecha}</span>
                  {f.anonimo && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: muted }}>
                      anónimo
                    </span>
                  )}
                  <button onClick={() => void borrar(f.id)} title="Borrar"
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', padding: 2 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.comentario}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p style={{ fontSize: 11, color: hint, textAlign: 'center', margin: 0 }}>
        Hoy es {fechaChile()}. Podés dejarle un comentario por día a cada profesor.
      </p>
    </div>
  )
}
