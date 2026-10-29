'use client'

import { useState } from 'react'
import { votar } from '@/app/actions/votaciones'

// Lo que comparten /votaciones (lista) y /votaciones/[id] (el enlace del QR).
// Vive acá y no en un page.tsx porque Next no deja exportar otra cosa desde ahí.

export const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
export const text  = '#0f172a'
export const muted = '#64748b'
export const hint  = '#94a3b8'

export type Votacion = {
  id: string; titulo: string; descripcion: string | null; tipo: 'jugadores' | 'opciones'
  estado: 'abierta' | 'cerrada'; votos_total: number; creado_en: string; cerrada_en: string | null
}
export type Opcion = { id: string; votacion_id: string; jugador_id: string | null; texto: string; orden: number }

export const boton = (fondo: string, color = '#fff', borde = 'none') => ({
  background: fondo, color, border: borde, borderRadius: 8, padding: '8px 14px',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}) as const

export function Etiqueta({ v }: { v: Votacion }) {
  const abierta = v.estado === 'abierta'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: abierta ? '#ecfdf5' : '#f1f5f9', color: abierta ? '#059669' : muted }}>
      {abierta ? 'Abierta' : 'Cerrada'}
    </span>
  )
}

// ── Vista del alumno ────────────────────────────────────────────────────────
export function TarjetaAlumno({ v, opciones, miOpcion, miJugadorId, avisar, alCambiar }: {
  v: Votacion; opciones: Opcion[]; miOpcion: string | undefined; miJugadorId: string | null
  avisar: (m: string) => void; alCambiar: () => Promise<void>
}) {
  const [elegida, setElegida] = useState('')
  const [enviando, setEnviando] = useState(false)
  // No se ofrece votar por uno mismo: el servidor igual lo rechaza.
  const elegibles = opciones.filter(o => !miJugadorId || o.jugador_id !== miJugadorId)
  const votada = miOpcion ? opciones.find(o => o.id === miOpcion) : undefined

  async function enviar() {
    if (!elegida) return
    if (!confirm('Tu voto es definitivo: no podrás cambiarlo. ¿Votar?')) return
    setEnviando(true)
    const res = await votar({ votacionId: v.id, opcionId: elegida })
    setEnviando(false)
    if ('error' in res && res.error) { avisar(String(res.error)); return }
    avisar('Voto registrado. ¡Gracias!')
    await alCambiar()
  }

  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: text, margin: 0 }}>{v.titulo}</h2>
        <Etiqueta v={v} />
      </div>
      {v.descripcion && <p style={{ fontSize: 13, color: muted, margin: '6px 0 0' }}>{v.descripcion}</p>}

      {votada ? (
        <p style={{ fontSize: 13, color: '#059669', margin: '12px 0 0' }}>✓ Ya votaste por <b>{votada.texto}</b></p>
      ) : miOpcion ? (
        <p style={{ fontSize: 13, color: '#059669', margin: '12px 0 0' }}>✓ Ya votaste</p>
      ) : v.estado === 'cerrada' ? (
        <p style={{ fontSize: 13, color: muted, margin: '12px 0 0' }}>Esta votación ya se cerró.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {elegibles.map(o => (
              <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${elegida === o.id ? '#a5b4fc' : '#e2e8f0'}`, background: elegida === o.id ? '#eef2ff' : '#fff', fontSize: 14, color: text }}>
                <input type="radio" name={`voto-${v.id}`} checked={elegida === o.id} onChange={() => setElegida(o.id)} />
                {o.texto}
              </label>
            ))}
          </div>
          <button onClick={enviar} disabled={!elegida || enviando}
            style={{ ...boton(!elegida || enviando ? '#cbd5e1' : '#4f46e5'), marginTop: 12, cursor: !elegida || enviando ? 'not-allowed' : 'pointer' }}>
            {enviando ? 'Enviando…' : 'Votar'}
          </button>
        </>
      )}
    </div>
  )
}
