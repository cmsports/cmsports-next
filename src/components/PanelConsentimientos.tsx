'use client'

// Autorización de uso de imagen, en la ficha del alumno.
//
// ── Por qué muestra una historia y no un checkbox ──────────────────────────
//
// Porque la pregunta que hay que poder contestar no es "¿puedo publicar hoy?"
// sino "esta foto se publicó en marzo, ¿había permiso EN MARZO?". Un checkbox
// contesta la primera y borra la segunda. La lista de firmas contesta las dos,
// y es lo que se le muestra a alguien que reclama.
//
// El registro es de solo agregar: revocar no edita la fila anterior, agrega
// una. La base lo hace cumplir —la migración 259 no le dejó política de UPDATE
// ni de DELETE a nadie salvo el superadmin—, así que esta pantalla no tiene un
// botón de editar y no es un olvido.
//
// ── Los tres estados, y por qué "sin registro" no es "no" ──────────────────
//
// Un alumno sin ninguna firma no autorizó ni negó: nadie le preguntó todavía.
// Pintarlo de rojo como si hubiera dicho que no esconde el trabajo pendiente,
// que es justo lo que el club necesita ver antes de diciembre. Va en gris y
// dice lo que hay que hacer.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { ShieldCheck, Check } from 'lucide-react'
import { fechaChile } from '@/lib/domain/fechaChile'
import { registrarConsentimiento } from '@/app/actions/jugadores'
import { estadoEn, firmaVigenteEn, type Consentimiento } from '@/lib/domain/consentimientos'

const supabase = createClient()

const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const cardStyle = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
  boxShadow: '0 4px 16px rgba(15,23,42,0.18)', marginBottom: 16,
} as const

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: text,
  fontFamily: 'inherit', outline: 'none',
}

const SEMAFORO = {
  autorizado:   { bg: '#dcfce7', color: '#15803d', label: 'Autorizado' },
  revocado:     { bg: '#fee2e2', color: '#b91c1c', label: 'Retirado' },
  sin_registro: { bg: '#f1f5f9', color: '#64748b', label: 'Sin registro' },
} as const

type Fila = Consentimiento & {
  id: string
  firmado_por: string
  registrado_por_nombre: string | null
  nota: string | null
}

export default function PanelConsentimientos({ jugadorId, clubId, puedeEditar }: {
  jugadorId: string
  clubId: string | null | undefined
  puedeEditar: boolean
}) {
  const [filas, setFilas]         = useState<Fila[]>([])
  const [error, setError]         = useState('')
  const [abierto, setAbierto]     = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado]   = useState(false)

  // El formulario. La fecha arranca en hoy pero se puede mover hacia atrás: el
  // apoderado trae el papel firmado la semana pasada y se carga hoy.
  const [otorgado, setOtorgado]     = useState(true)
  const [fecha, setFecha]           = useState(() => fechaChile())
  const [firmadoPor, setFirmadoPor] = useState<'jugador' | 'apoderado'>('apoderado')
  const [nota, setNota]             = useState('')

  const cargar = useCallback(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const { data, error: err } = await (supabase as any)
      .from('jugador_consentimientos')
      .select('id, tipo, otorgado, fecha, creado_en, firmado_por, registrado_por_nombre, nota')
      .eq('jugador_id', jugadorId)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false })

    // Una lectura que falla devuelve `data` en null, que acá se vería igual que
    // "no tiene ninguna firma" — o sea, verde cambiado por gris sin que nadie se
    // entere. En un registro legal esa confusión es la peor de todas.
    if (err) { setError('No se pudo cargar el registro: ' + err.message); return }

    setError('')
    setFilas((data ?? []).map((r: any): Fila => ({
      id: r.id,
      tipo: r.tipo,
      otorgado: r.otorgado,
      fecha: r.fecha,
      creadoEn: r.creado_en,
      firmado_por: r.firmado_por,
      registrado_por_nombre: r.registrado_por_nombre,
      nota: r.nota,
    })))
  }, [jugadorId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['jugador_consentimientos'], clubId ?? '', () => { void cargar() })

  const hoy = fechaChile()
  const estado = useMemo(() => estadoEn(filas, 'uso_imagen', hoy), [filas, hoy])
  const vigente = useMemo(() => firmaVigenteEn(filas, 'uso_imagen', hoy), [filas, hoy])
  const s = SEMAFORO[estado]

  async function registrar() {
    if (guardando) return              // el doble clic no inserta dos filas
    setGuardando(true)
    setError('')

    const res = await registrarConsentimiento({
      jugadorId, tipo: 'uso_imagen', otorgado, fecha, firmadoPor: firmadoPor, nota,
    })
    setGuardando(false)

    if (res?.error) { setError(String(res.error)); return }

    setAbierto(false)
    setNota('')
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    await cargar()
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px 10px', flexWrap: 'wrap' }}>
        <ShieldCheck size={15} color="#4f46e5" />
        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Uso de imagen</span>
        <span style={{ background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '2px 9px' }}>
          {s.label}
        </span>
        {guardado && <Check size={15} color="#16a34a" />}
        {puedeEditar && !abierto && (
          <button onClick={() => { setOtorgado(estado !== 'autorizado'); setFecha(fechaChile()); setAbierto(true) }} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#4f46e5', fontSize: 12.5, cursor: 'pointer', padding: 0,
          }}>
            Registrar
          </button>
        )}
      </div>

      <div style={{ padding: '0 20px 16px' }}>
        {estado === 'sin_registro' ? (
          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
            Todavía no hay constancia. <strong style={{ color: muted }}>Sin registro no es una negativa</strong>:
            significa que falta pedirla. Hace falta antes de publicar fotos donde salga.
          </p>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 11.5, color: hint, lineHeight: 1.55 }}>
            {estado === 'autorizado' ? 'Autorizó' : 'Retiró la autorización'} el{' '}
            {vigente && new Date(`${vigente.fecha}T12:00:00`).toLocaleDateString('es-CL')}
            {vigente?.firmado_por === 'apoderado' && ' · firmó el apoderado'}
          </p>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {abierto && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ v: true, l: 'Autoriza' }, { v: false, l: 'Retira la autorización' }].map(o => (
                <button key={o.l} onClick={() => setOtorgado(o.v)} style={{
                  background: otorgado === o.v ? '#4f46e5' : '#fff',
                  color: otorgado === o.v ? '#fff' : muted,
                  border: `1px solid ${otorgado === o.v ? '#4f46e5' : '#e2e8f0'}`,
                  borderRadius: 8, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', minHeight: 38,
                }}>
                  {o.l}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, marginBottom: 5 }}>
              Fecha de la firma
            </label>
            {/* `max` en hoy: una firma futura dejaría el registro diciendo que
                hoy no hay permiso mientras la fila ya está cargada. El servidor
                lo vuelve a comprobar — esto es comodidad, no la garantía. */}
            <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} style={inputStyle} />

            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, margin: '12px 0 5px' }}>
              Quién firmó
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['apoderado', 'El apoderado'], ['jugador', 'El propio alumno']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setFirmadoPor(v)} style={{
                  background: firmadoPor === v ? '#eef2ff' : '#fff',
                  color: firmadoPor === v ? '#4338ca' : muted,
                  border: `1px solid ${firmadoPor === v ? '#c7d2fe' : '#e2e8f0'}`,
                  borderRadius: 8, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', minHeight: 38,
                }}>
                  {l}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: muted, margin: '12px 0 5px' }}>
              Dónde quedó el respaldo
            </label>
            <input
              value={nota} onChange={e => setNota(e.target.value)} style={inputStyle}
              placeholder="Papel firmado en carpeta · correo del 3/9 · etc."
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={registrar} disabled={guardando} style={{
                background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 18px', fontSize: 13, fontWeight: 500,
                cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.6 : 1,
              }}>
                {guardando ? 'Registrando…' : 'Registrar'}
              </button>
              <button onClick={() => setAbierto(false)} disabled={guardando} style={{
                background: 'transparent', color: muted, border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer',
              }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* La historia. Nada de esto se puede editar ni borrar, y por eso vale. */}
        {filas.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Historial
            </div>
            {filas.map(f => (
              <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12, color: muted, padding: '4px 0' }}>
                <span style={{ color: f.otorgado ? '#15803d' : '#b91c1c', fontWeight: 700, minWidth: 66 }}>
                  {f.otorgado ? 'Autoriza' : 'Retira'}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-CL')}
                </span>
                <span style={{ fontSize: 11, color: hint }}>
                  {f.firmado_por === 'apoderado' ? 'apoderado' : 'alumno'}
                  {f.nota && ` · ${f.nota}`}
                  {f.registrado_por_nombre && ` · cargó ${f.registrado_por_nombre}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
