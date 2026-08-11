'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import CabezasSerieEditor, { type CabezaSerieJugador } from '@/components/torneos/CabezasSerieEditor'
import { btnPrimaryIndigo, modalOverlay, torneoUi } from '@/lib/torneos/ui-tokens'

type Inscrito = {
  id: string
  nombre: string
  asociacion: string | null
  cabeza_numero: number | null
}

export default function InscripcionOficialModal(props: {
  open: boolean
  onClose: () => void
  inscritos: Inscrito[]
  eventoNombre: string
  inscribiendo: boolean
  formando: boolean
  onInscribir: (nombre: string, asociacion?: string) => Promise<{ error?: string }>
  onFormarGrupos: () => Promise<{ error?: string }>
  onGuardarCabezas: (jugadorIds: string[]) => Promise<{ error?: string | null }>
}) {
  const [nombre, setNombre] = useState('')
  const [asociacion, setAsociacion] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [cabezas, setCabezas] = useState<CabezaSerieJugador[]>([])
  const [cabezasDirty, setCabezasDirty] = useState(false)

  const candidatos = useMemo(
    () => props.inscritos.map(i => ({
      id: i.id,
      nombre: i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre,
    })),
    [props.inscritos],
  )

  const cabezasDesdeDb = useMemo(
    () => props.inscritos
      .filter(i => i.cabeza_numero != null)
      .sort((a, b) => (a.cabeza_numero ?? 0) - (b.cabeza_numero ?? 0))
      .map(i => ({
        id: i.id,
        nombre: i.asociacion ? `${i.nombre} (${i.asociacion})` : i.nombre,
      })),
    [props.inscritos],
  )

  const cabezasActuales = cabezasDirty ? cabezas : cabezasDesdeDb
  const numGruposEstimados = Math.max(1, Math.ceil(props.inscritos.length / 4))
  const numCabezas = cabezasActuales.length

  const inscritosOrdenados = useMemo(
    () => [...props.inscritos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [props.inscritos],
  )

  if (!props.open) return null

  async function handleInscribir() {
    setErrorMsg('')
    const res = await props.onInscribir(nombre.trim(), asociacion.trim() || undefined)
    if (res.error) { setErrorMsg(res.error); return }
    setNombre('')
    setAsociacion('')
  }

  async function handleFormarGrupos() {
    setErrorMsg('')
    if (cabezasActuales.length) {
      const resCab = await props.onGuardarCabezas(cabezasActuales.map(c => c.id))
      if (resCab?.error) { setErrorMsg(resCab.error); return }
      setCabezasDirty(false)
    }
    const res = await props.onFormarGrupos()
    if (res.error) { setErrorMsg(res.error); return }
    props.onClose()
  }

  return (
    <div style={modalOverlay} onClick={props.onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: torneoUi.text }}>🪑 Mesa de inscripción</div>
            <div style={{ fontSize: 12, color: torneoUi.muted, marginTop: 2 }}>{props.eventoNombre}</div>
          </div>
          <button type="button" onClick={props.onClose} style={btnCerrar}>✕</button>
        </div>

        {/* Stats en vivo — sin recaudado/RUT (oficial no cobra en mesa) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Inscritos', value: props.inscritos.length, color: torneoUi.text },
            { label: 'Grupos estimados', value: numGruposEstimados, color: '#3730a3' },
            { label: 'Cabezas', value: numCabezas, color: numCabezas ? '#d97706' : torneoUi.hint },
          ].map(s => (
            <div key={s.label} style={{ background: '#f4f7fa', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: torneoUi.muted }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{
          background: torneoUi.accentLight, borderRadius: 8, padding: '6px 10px',
          marginBottom: 10, fontSize: 11, color: '#5b21b6', fontWeight: 600,
        }}>
          Torneo oficial — nombre y asociación (sin pago ni RUT)
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', color: torneoUi.danger, padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre del jugador"
            style={{ ...inputStyle, flex: '2 1 160px' }}
            onKeyDown={e => e.key === 'Enter' && void handleInscribir()}
          />
          <input
            value={asociacion}
            onChange={e => setAsociacion(e.target.value)}
            placeholder="Asociación (opc.)"
            style={{ ...inputStyle, flex: '1 1 120px' }}
            onKeyDown={e => e.key === 'Enter' && void handleInscribir()}
          />
          <button type="button" onClick={() => void handleInscribir()}
            disabled={props.inscribiendo || !nombre.trim()}
            style={{
              ...btnInscribir,
              opacity: props.inscribiendo || !nombre.trim() ? 0.6 : 1,
              flex: '0 0 auto',
            }}>
            {props.inscribiendo ? '…' : '+ Inscribir'}
          </button>
        </div>

        {/* Lista viva numerada */}
        {inscritosOrdenados.length > 0 && (
          <div style={{
            background: '#f4f7fa', borderRadius: 10, overflow: 'hidden',
            marginBottom: 16, maxHeight: 220, overflowY: 'auto',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{
              padding: '8px 14px', fontSize: 11, color: torneoUi.muted,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>Jugadores inscritos</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: torneoUi.text }}>
                {inscritosOrdenados.length}
              </span>
            </div>
            {inscritosOrdenados.map((i, idx) => (
              <div key={i.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderBottom: '1px solid #e2e8f0', background: '#fff',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#3730a3',
                  background: torneoUi.accentLight, width: 22, height: 22,
                  borderRadius: 6, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: torneoUi.text, fontWeight: 500 }}>
                    {i.nombre}
                    {i.asociacion && (
                      <span style={{
                        marginLeft: 6, background: '#eef2ff', color: '#4338ca',
                        fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8,
                      }}>
                        {i.asociacion}
                      </span>
                    )}
                  </div>
                </div>
                {i.cabeza_numero != null && (
                  <span style={{
                    fontSize: 10, color: '#92400e', background: '#fffbeb',
                    border: '1px solid #fde68a', padding: '2px 6px', borderRadius: 8, fontWeight: 700,
                  }}>
                    CS{i.cabeza_numero}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {candidatos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <CabezasSerieEditor
              cabezas={cabezasActuales}
              candidatos={candidatos}
              onChange={(nuevas) => { setCabezas(nuevas); setCabezasDirty(true) }}
              onGuardar={async (ids) => {
                const res = await props.onGuardarCabezas(ids)
                if (!res?.error) setCabezasDirty(false)
                return res
              }}
            />
            {cabezasDirty && (
              <div role="status" style={{ marginTop: 6, color: '#92400e', fontSize: 11 }}>
                Los cambios de cabezas se guardarán al cerrar la inscripción.
              </div>
            )}
          </div>
        )}

        <button type="button" onClick={() => void handleFormarGrupos()}
          disabled={props.formando || props.inscritos.length < 4}
          style={{
            width: '100%',
            padding: 12,
            background: props.inscritos.length >= 4 && !props.formando ? '#f0fdf4' : '#f4f7fa',
            color: props.inscritos.length >= 4 && !props.formando ? torneoUi.success : torneoUi.hint,
            border: `1px solid ${props.inscritos.length >= 4 && !props.formando ? '#bbf7d0' : '#e2e8f0'}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: props.inscritos.length >= 4 && !props.formando ? 'pointer' : 'not-allowed',
          }}>
          {props.formando
            ? 'Formando grupos…'
            : props.inscritos.length < 4
              ? `Mínimo 4 jugadores (faltan ${4 - props.inscritos.length})`
              : `✓ ${cabezasDirty ? 'Guardar cabezas y cerrar' : 'Cerrar inscripción'} · generar ${numGruposEstimados} grupos`}
        </button>
      </div>
    </div>
  )
}

const modalCard: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(15,23,42,0.14)',
}

const btnCerrar: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: torneoUi.muted,
  cursor: 'pointer',
  fontSize: 20,
}

const inputStyle: CSSProperties = {
  background: '#f4f7fa',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  minWidth: 0,
}

const btnInscribir: CSSProperties = {
  ...btnPrimaryIndigo,
  background: '#f43f5e',
  padding: '10px 14px',
  whiteSpace: 'nowrap',
}
