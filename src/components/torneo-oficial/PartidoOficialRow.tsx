'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { abrirMarcadorOficial } from '@/app/actions/torneo-oficial'
import {
  etiquetaCierreOficial,
  formatearSets,
  type AlcanceSancionOficial,
  type SetMarcador,
  type TipoCierreOficial,
} from '@/lib/domain/oficial-ittf'
import { btnOutlineIndigo, btnPrimaryIndigo, modalOverlay, torneoUi } from '@/lib/torneos/ui-tokens'

type Partido = {
  id: string
  inscrito_a_id: string | null
  inscrito_b_id: string | null
  ganador_id: string | null
  sets: SetMarcador[]
  es_walkover: boolean
  tipo_cierre?: TipoCierreOficial | null
  motivo_cierre?: string | null
  mesa: number | null
}

export type GuardarResultadoOpts = {
  walkover?: boolean
  tipoCierre?: TipoCierreOficial
  ganadorId?: string
  setsTexto?: string
  motivoCierre?: string
  alcanceSancion?: AlcanceSancionOficial
}

export default function PartidoOficialRow(props: {
  partido: Partido
  eventoId: string
  nombreA: string
  nombreB: string
  esBye: boolean
  ganadorNombre: string | null
  puedeCorregir: boolean
  guardando: boolean
  sancionesResumen?: string
  onGuardar: (opts?: GuardarResultadoOpts) => Promise<{ error?: string } | void>
  onCorregir: (ganadorId: string, setsTexto?: string) => Promise<{ error?: string } | void>
}) {
  const router = useRouter()
  const { partido: p, esBye, guardando } = props
  const cerrado = Boolean(p.ganador_id)
  const [modalOpen, setModalOpen] = useState(false)
  const [setsTexto, setSetsTexto] = useState('')
  const [modoCorregir, setModoCorregir] = useState(false)
  const [modoCierre, setModoCierre] = useState<TipoCierreOficial>('jugado')
  const [ganadorWo, setGanadorWo] = useState<'a' | 'b'>('a')
  const [motivo, setMotivo] = useState('')
  const [alcance, setAlcance] = useState<AlcanceSancionOficial>('partido')
  const [abriendoMarcador, setAbriendoMarcador] = useState(false)
  const [errorMarcador, setErrorMarcador] = useState('')

  const etiqueta = etiquetaCierreOficial(p.tipo_cierre, p.es_walkover)

  function abrirModal(corregir = false) {
    setModoCorregir(corregir)
    setSetsTexto(corregir && p.sets.length ? formatearSets(p.sets) : (p.sets.length ? formatearSets(p.sets) : ''))
    setModoCierre('jugado')
    setMotivo('')
    setAlcance('partido')
    setGanadorWo('a')
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setSetsTexto('')
    setModoCorregir(false)
  }

  async function irAlMarcador() {
    if (abriendoMarcador) return
    setErrorMarcador('')
    setAbriendoMarcador(true)
    const res = await abrirMarcadorOficial({ partidoId: p.id })
    setAbriendoMarcador(false)
    if (res.error || !res.marcadorId) {
      setErrorMarcador(res.error || 'No se pudo abrir el marcador')
      return
    }
    const eventoId = res.eventoId || props.eventoId
    const vuelta = encodeURIComponent(`/torneo-oficial/evento/${eventoId}`)
    router.push(`/tecnico/marcador/${res.marcadorId}?vuelta=${vuelta}`)
  }

  async function guardarCierre() {
    if (modoCierre === 'jugado') {
      return props.onGuardar({ setsTexto, tipoCierre: 'jugado' })
    }
    const ganadorId = ganadorWo === 'a' ? p.inscrito_a_id! : p.inscrito_b_id!
    return props.onGuardar({
      tipoCierre: modoCierre,
      walkover: modoCierre === 'walkover',
      ganadorId,
      setsTexto: modoCierre === 'retiro' ? setsTexto : undefined,
      motivoCierre: motivo,
      alcanceSancion: alcance,
    })
  }

  return (
    <>
      <div style={fila}>
        <span style={{
          flex: '1 1 80px', minWidth: 0, textAlign: 'right', fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: p.ganador_id === p.inscrito_a_id ? torneoUi.success : torneoUi.text,
          fontWeight: p.ganador_id === p.inscrito_a_id ? 600 : 400,
        }}>
          {props.nombreA}
        </span>
        <span style={{ color: torneoUi.hint, fontSize: 10, padding: '0 4px', flexShrink: 0 }}>vs</span>
        <span style={{
          flex: '1 1 80px', minWidth: 0, fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: p.ganador_id === p.inscrito_b_id ? torneoUi.success : torneoUi.text,
          fontWeight: p.ganador_id === p.inscrito_b_id ? 600 : 400,
        }}>
          {props.nombreB}
        </span>

        {p.mesa ? (
          <span style={{ fontSize: 10, color: torneoUi.muted, flexShrink: 0 }}>M{p.mesa}</span>
        ) : null}

        {cerrado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>
            <span style={{ fontSize: 10, color: torneoUi.success }} title={p.motivo_cierre || undefined}>
              ✓ {formatearSets(p.sets)}{etiqueta ? ` ${etiqueta}` : ''}
            </span>
            {props.puedeCorregir && !esBye && (
              <button type="button" onClick={() => abrirModal(true)} style={btnIcon} title="Corregir">✏️</button>
            )}
          </div>
        ) : esBye ? (
          <span style={{ fontSize: 10, color: torneoUi.muted, flexShrink: 0, marginLeft: 'auto' }}>BYE</span>
        ) : props.puedeCorregir ? (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>
            <button type="button" onClick={() => void irAlMarcador()} disabled={abriendoMarcador} style={btnMarcador} title="Marcador en vivo (tablet técnico)">
              {abriendoMarcador ? '…' : '🎯 En vivo'}
            </button>
            <button type="button" onClick={() => abrirModal(false)} style={btnSets} title="Cargar sets a mano">
              Sets
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: torneoUi.hint, flexShrink: 0, marginLeft: 'auto' }}>Pendiente</span>
        )}
      </div>

      {props.sancionesResumen && (
        <p style={{ margin: '0 0 4px', fontSize: 10, color: '#b45309', textAlign: 'right' }}>
          {props.sancionesResumen}
        </p>
      )}

      {errorMarcador && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#e11d48', textAlign: 'right' }}>{errorMarcador}</p>
      )}

      {modalOpen && (
        <div style={modalOverlay} onClick={cerrarModal}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: torneoUi.text }}>
                {modoCorregir ? 'Corregir resultado' : 'Cerrar partido'}
              </div>
              <button type="button" onClick={cerrarModal} style={btnCerrar}>✕</button>
            </div>

            <p style={{ margin: '0 0 8px', fontSize: 12, color: torneoUi.muted }}>
              {props.nombreA} vs {props.nombreB}
            </p>

            {!modoCorregir && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {([
                  ['jugado', 'Jugado'],
                  ['walkover', 'W.O.'],
                  ['retiro', 'Retiro'],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setModoCierre(v)}
                    style={{
                      ...btnChip,
                      background: modoCierre === v ? torneoUi.accentLight : '#f8fafc',
                      color: modoCierre === v ? '#3730a3' : torneoUi.muted,
                      borderColor: modoCierre === v ? '#a5b4fc' : '#e2e8f0',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {(modoCorregir || modoCierre === 'jugado' || modoCierre === 'retiro') && (
              <>
                <label style={labelStyle}>
                  {modoCierre === 'retiro' ? 'Sets parciales (se completan con 11-0)' : 'Sets (ej: 11-6; 11-8; 11-4)'}
                </label>
                <input
                  value={setsTexto}
                  onChange={e => setSetsTexto(e.target.value)}
                  placeholder="11-6; 11-8; 11-4"
                  style={inputStyle}
                  autoFocus={modoCierre === 'jugado' || modoCorregir}
                />
              </>
            )}

            {!modoCorregir && (modoCierre === 'walkover' || modoCierre === 'retiro') && (
              <>
                <label style={{ ...labelStyle, marginTop: 10 }}>Gana</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setGanadorWo('a')} style={{
                    ...btnChip, flex: 1,
                    background: ganadorWo === 'a' ? '#f0fdf4' : '#f8fafc',
                    borderColor: ganadorWo === 'a' ? '#86efac' : '#e2e8f0',
                  }}>{props.nombreA}</button>
                  <button type="button" onClick={() => setGanadorWo('b')} style={{
                    ...btnChip, flex: 1,
                    background: ganadorWo === 'b' ? '#f0fdf4' : '#f8fafc',
                    borderColor: ganadorWo === 'b' ? '#86efac' : '#e2e8f0',
                  }}>{props.nombreB}</button>
                </div>
                <label style={labelStyle}>Motivo</label>
                <input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="No presentación, lesión, descalificación…"
                  style={inputStyle}
                />
                <label style={{ ...labelStyle, marginTop: 10 }}>Alcance</label>
                <select
                  value={alcance}
                  onChange={e => setAlcance(e.target.value as AlcanceSancionOficial)}
                  style={inputStyle}
                >
                  <option value="partido">Solo este partido</option>
                  <option value="evento">Todo el evento</option>
                  <option value="campeonato">Todo el campeonato</option>
                </select>
              </>
            )}

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
                <button
                  type="button"
                  disabled={guardando || (modoCierre === 'jugado' && !setsTexto.trim()) || ((modoCierre === 'walkover' || modoCierre === 'retiro') && !motivo.trim())}
                  onClick={async () => {
                    const res = await guardarCierre()
                    if (!res?.error) cerrarModal()
                  }}
                  style={{
                    ...btnPrimaryIndigo,
                    opacity: guardando || (modoCierre === 'jugado' && !setsTexto.trim()) || ((modoCierre === 'walkover' || modoCierre === 'retiro') && !motivo.trim()) ? 0.6 : 1,
                  }}
                >
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              )}
              <button type="button" onClick={cerrarModal} style={btnOutlineIndigo}>Cancelar</button>
            </div>

            {!modoCorregir && (
              <button type="button"
                disabled={abriendoMarcador}
                onClick={() => { cerrarModal(); void irAlMarcador() }}
                style={{ ...btnOutlineIndigo, width: '100%', marginTop: 10, opacity: abriendoMarcador ? 0.6 : 1 }}>
                {abriendoMarcador ? 'Abriendo marcador…' : 'Abrir marcador en vivo'}
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
  flexWrap: 'wrap',
  gap: 6,
  padding: '6px 0',
  borderBottom: '1px solid #f1f5f9',
  minWidth: 0,
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

const btnChip: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  background: '#f8fafc',
}

const modalCard: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 16,
  padding: 20,
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 8px 32px rgba(15,23,42,0.14)',
  maxHeight: '90vh',
  overflowY: 'auto',
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
