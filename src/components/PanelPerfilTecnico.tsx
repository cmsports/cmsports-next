'use client'

// Observaciones del entrenador y objetivos del alumno, en la ficha.
//
// ── Esto NO lo ve el alumno ────────────────────────────────────────────────
//
// Vive en `jugador_perfil_tecnico`, que tiene una sola política: staff del
// club. El alumno no aparece en ninguna, así que para él la tabla devuelve 0
// filas — no es que la pantalla se lo esconda, es que la base no se lo manda.
// La migración 256 cuenta por qué no son dos columnas en `jugadores`: la RLS
// filtra filas y no columnas, y ahí el alumno se llevaría el dato al pedir su
// propia ficha.
//
// Igual el componente se monta solo para staff. Eso es cortesía, no seguridad:
// la garantía está en la base.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { ClipboardList, Check } from 'lucide-react'
import { guardarPerfilTecnico } from '@/app/actions/jugadores'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const cardStyle = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
  boxShadow: '0 4px 16px rgba(15,23,42,0.18)', marginBottom: 16,
} as const

const areaStyle = {
  width: '100%', boxSizing: 'border-box' as const, minHeight: 84,
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '10px 12px', fontSize: 13, color: text, lineHeight: 1.55,
  fontFamily: 'inherit', resize: 'vertical' as const, outline: 'none',
}

type Ficha = { observaciones: string | null; objetivos: string | null; actualizado_por_nombre: string | null; actualizado_en: string | null }

export default function PanelPerfilTecnico({ jugadorId, clubId, puedeEditar }: {
  jugadorId: string
  clubId: string | null | undefined
  puedeEditar: boolean
}) {
  const [ficha, setFicha]         = useState<Ficha | null>(null)
  const [editando, setEditando]   = useState(false)
  const [obs, setObs]             = useState('')
  const [obj, setObj]             = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)
  const [error, setError]         = useState('')

  const cargar = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data, error: err } = await (supabase as any)
      .from('jugador_perfil_tecnico')
      .select('observaciones, objetivos, actualizado_por_nombre, actualizado_en')
      .eq('jugador_id', jugadorId)
      .maybeSingle()

    // Una lectura que falla devuelve `{ error }` con `data` en null, que se ve
    // igual que "todavía no le escribieron nada". Sin esta rama, un problema de
    // permisos se vería como una ficha vacía y nadie lo notaría.
    if (err) { setError('No se pudo cargar: ' + err.message); return }

    setError('')
    setFicha(data ?? null)
  }, [jugadorId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['jugador_perfil_tecnico'], clubId ?? '', () => { void cargar() })

  function abrir() {
    setObs(ficha?.observaciones ?? '')
    setObj(ficha?.objetivos ?? '')
    setError('')
    setEditando(true)
  }

  async function guardar() {
    if (guardando) return          // el doble clic no guarda dos veces
    setGuardando(true)
    setError('')

    const res = await guardarPerfilTecnico({ jugadorId, observaciones: obs, objetivos: obj })
    setGuardando(false)

    if (res?.error) { setError(String(res.error)); return }

    setEditando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    await cargar()
  }

  const vacio = !ficha?.observaciones && !ficha?.objetivos

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 10px' }}>
        <ClipboardList size={15} color="#4f46e5" />
        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Notas técnicas</span>
        <span style={{ fontSize: 10.5, color: hint, background: '#f1f5f9', borderRadius: 20, padding: '2px 8px' }}>
          solo staff
        </span>
        {guardado && <Check size={15} color="#16a34a" />}
        {puedeEditar && !editando && (
          <button onClick={abrir} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#4f46e5', fontSize: 12.5, cursor: 'pointer', padding: 0,
          }}>
            Editar
          </button>
        )}
      </div>

      <div style={{ padding: '0 20px 16px' }}>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
          El alumno no ve esto. Es para el trabajo del entrenador.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {editando ? (
          <>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, marginBottom: 5 }}>
              Observaciones del entrenador
            </label>
            <textarea
              value={obs} onChange={e => setObs(e.target.value)} style={areaStyle}
              placeholder="Qué está trabajando, qué le cuesta, cómo responde en competencia…"
            />

            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, margin: '12px 0 5px' }}>
              Objetivos del alumno
            </label>
            <textarea
              value={obj} onChange={e => setObj(e.target.value)} style={areaStyle}
              placeholder="A qué apunta este semestre."
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {/* Deshabilitado mientras guarda: sin esto, dos clics rápidos
                  mandan dos upserts y el segundo pisa al primero. */}
              <button onClick={guardar} disabled={guardando} style={{
                background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 18px', fontSize: 13, fontWeight: 500,
                cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.6 : 1,
              }}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => setEditando(false)} disabled={guardando} style={{
                background: 'transparent', color: muted, border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer',
              }}>
                Cancelar
              </button>
            </div>
          </>
        ) : vacio ? (
          <div style={{ fontSize: 12.5, color: hint }}>
            {puedeEditar ? 'Todavía sin notas — Editar' : 'Todavía sin notas'}
          </div>
        ) : (
          <>
            {ficha?.observaciones && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Observaciones
                </div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {ficha.observaciones}
                </div>
              </div>
            )}

            {ficha?.objetivos && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Objetivos
                </div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {ficha.objetivos}
                </div>
              </div>
            )}

            {ficha?.actualizado_por_nombre && (
              <div style={{ fontSize: 11, color: hint, marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                Última edición: {ficha.actualizado_por_nombre}
                {ficha.actualizado_en && ` · ${new Date(ficha.actualizado_en).toLocaleDateString('es-CL')}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
