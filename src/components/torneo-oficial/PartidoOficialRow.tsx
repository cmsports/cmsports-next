'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { formatearSets, type SetMarcador } from '@/lib/domain/oficial-ittf'
import { btnOutlineIndigo, btnPrimaryIndigo, modalOverlay, torneoUi } from '@/lib/torneos/ui-tokens'

type Partido = {
  id: string
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
  mesa: number | null
}

export default function PartidoOficialRow(props: {
  partido: Partido
  nombreA: string
  nombreB: string
  esBye: boolean
  ganadorNombre: string | null
  puedeCorregir: boolean
  guardando: boolean
  onGuardar: (opts?: { walkover?: boolean; ganadorId?: string; setsTexto?: string }) => Promise<{ error?: string } | void>
  onCorregir: (ganadorId: string, setsTexto?: string) => Promise<{ error?: string } | void>
}) {
  const router = useRouter()
  const { partido: p, esBye, guardando } = props
  const cerrado = Boolean(p.ganador_id)
  const [modalOpen, setModalOpen] = useState(false)
  const [setsTexto, setSetsTexto] = useState('')
  const [modoCorregir, setModoCorregir] = useState(false)

  function abrirModal(corregir = false) {
    setModoCorregir(corregir)
    setSetsTexto(corregir && p.sets.length ? formatearSets(p.sets) : '')
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setSetsTexto('')
    setModoCorregir(false)
  }

  return (
    <>
      <div style={fila}>
        <span style={{
          flex: 1, textAlign: 'right', fontSize: 12,
          color: p.ganador_id === p.inscrito_a_id ? torneoUi.success : torneoUi.text,
          fontWeight: p.ganador_id === p.inscrito_a_id ? 600 : 400,
        }}>
          {props.nombreA}
        </span>
        <span style={{ color: torneoUi.hint, fontSize: 10, padding: '0 4px' }}>vs</span>
        <span style={{
          flex: 1, fontSize: 12,
          color: p.ganador_id === p.inscrito_b_id ? torneoUi.success : torneoUi.text,
          fontWeight: p.ganador_id === p.inscrito_b_id ? 600 : 400,
        }}>
          {props.nombreB}
        </span>

        {p.mesa ? (
          <span style={{ fontSize: 10, color: torneoUi.muted, minWidth: 28 }}>M{p.mesa}</span>
        ) : <span style={{ minWidth: 28 }} />}

        {cerrado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 120, justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 10, color: torneoUi.success }}>
              ✓ {formatearSets(p.sets)}{p.es_walkover ? ' W.O.' : ''}
            </span>
            {props.puedeCorregir && !esBye && (
              <button type="button" onClick={() => abrirModal(true)} style={btnIcon} title="Corregir">✏️</button>
            )}
          </div>
        ) : esBye ? (
          <span style={{ fontSize: 10, color: torneoUi.muted, minWidth: 120, textAlign: 'right' }}>BYE</span>
        ) : (
          <div style={{ display: 'flex', gap: 4, minWidth: 120, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => router.push(`/torneo-oficial/marcador/${p.id}`)} style={btnMarcador}>
              Marcador
            </button>
            <button type="button" onClick={() => abrirModal(false)} style={btnSets} title="Ingresar sets manualmente">
              Sets
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div style={modalOverlay} onClick={cerrarModal}>
          <div
            style={modalCard}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: torneoUi.text }}>
                {modoCorregir ? 'Corregir resultado' : 'Registrar sets'}
              </div>
              <button type="button" onClick={cerrarModal} style={btnCerrar}>✕</button>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 12, color: torneoUi.muted }}>
              {props.nombreA} vs {props.nombreB}
            </p>

            <label style={labelStyle}>Sets (ej: 11-6; 11-8; 11-4)</label>
            <input
              value={setsTexto}
              onChange={e => setSetsTexto(e.target.value)}
              placeholder="11-6; 11-8; 11-4"
              style={inputStyle}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {modoCorregir ? (
                <>
                  {p.inscrito_a_id && (
                    <button type="button" disabled={guardando}
                      onClick={async () => {
                        const res = await props.onCorregir(p.inscrito_a_id!, setsTexto)
                        if (!res?.error) cerrarModal()
                      }}
                      style={{ ...btnPrimaryIndigo, opacity: guardando ? 0.6 : 1 }}>
                      Gana A
                    </button>
                  )}
                  {p.inscrito_b_id && (
                    <button type="button" disabled={guardando}
                      onClick={async () => {
                        const res = await props.onCorregir(p.inscrito_b_id!, setsTexto)
                        if (!res?.error) cerrarModal()
                      }}
                      style={{ ...btnPrimaryIndigo, opacity: guardando ? 0.6 : 1 }}>
                      Gana B
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" disabled={guardando || !setsTexto.trim()}
                    onClick={async () => {
                      const res = await props.onGuardar({ setsTexto })
                      if (!res?.error) cerrarModal()
                    }}
                    style={{ ...btnPrimaryIndigo, opacity: guardando || !setsTexto.trim() ? 0.6 : 1 }}>
                    {guardando ? 'Guardando…' : 'Guardar sets'}
                  </button>
                  {p.inscrito_a_id && p.inscrito_b_id && (
                    <>
                      <button type="button" disabled={guardando}
                        onClick={async () => {
                          const res = await props.onGuardar({ walkover: true, ganadorId: p.inscrito_a_id! })
                          if (!res?.error) cerrarModal()
                        }}
                        style={btnWo}>W.O. A</button>
                      <button type="button" disabled={guardando}
                        onClick={async () => {
                          const res = await props.onGuardar({ walkover: true, ganadorId: p.inscrito_b_id! })
                          if (!res?.error) cerrarModal()
                        }}
                        style={btnWo}>W.O. B</button>
                    </>
                  )}
                </>
              )}
              <button type="button" onClick={cerrarModal} style={btnOutlineIndigo}>Cancelar</button>
            </div>

            {!modoCorregir && (
              <button type="button"
                onClick={() => { cerrarModal(); router.push(`/torneo-oficial/marcador/${p.id}`) }}
                style={{ ...btnOutlineIndigo, width: '100%', marginTop: 10 }}>
                Abrir marcador en vivo
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const fila: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #f1f5f9',
}

const btnMarcador: CSSProperties = {
  background: torneoUi.accentLight,
  color: '#3730a3',
  border: 'none',
  borderRadius: 4,
  padding: '3px 8px',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSets: CSSProperties = {
  background: '#f1f5f9',
  color: torneoUi.muted,
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 10,
  cursor: 'pointer',
}

const btnIcon: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: torneoUi.hint,
  fontSize: 10,
  cursor: 'pointer',
  padding: '2px 4px',
}

const btnWo: CSSProperties = {
  background: '#fef3c7',
  color: '#92400e',
  border: '1px solid #fcd34d',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

const modalCard: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: 20,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 8px 32px rgba(15,23,42,0.14)',
}

const btnCerrar: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: torneoUi.muted,
  cursor: 'pointer',
  fontSize: 18,
}

const labelStyle: CSSProperties = { display: 'block', fontSize: 11, color: torneoUi.muted, marginBottom: 4 }
const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
}
