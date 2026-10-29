'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { boton, text, muted, hint } from '@/components/VotacionAlumno'

const QRCodeCanvas = dynamic(() => import('qrcode.react').then(m => ({ default: m.QRCodeCanvas })), { ssr: false })

// El QR de una votación. Apunta a /votaciones/[id]: quien lo escanea inicia
// sesión si hace falta (el login lo devuelve ahí) y solo puede votar si la
// base lo tiene en la lista de habilitados. El QR no da permiso a nadie: es
// solo un atajo al enlace.
export default function QrVotacion({ votacionId, titulo, abierta, alCerrar }: {
  votacionId: string; titulo: string; abierta: boolean; alCerrar: () => void
}) {
  // Solo se monta tras un clic, así que `window` ya existe.
  const url = `${window.location.origin}/votaciones/${votacionId}`
  const caja = useRef<HTMLDivElement>(null)
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el enlace igual está a la vista para copiarlo a mano.
    }
  }

  function descargar() {
    const canvas = caja.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `qr-votacion-${titulo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'votacion'}.png`
    a.click()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
      onClick={alCerrar}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 380, textAlign: 'center', display: 'grid', gap: 12 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: text, margin: 0 }}>{titulo}</h2>
        <p style={{ fontSize: 12, color: muted, margin: 0 }}>
          Quien lo escanee entra a esta votación. Si no tiene la sesión iniciada, la app le pide entrar primero.
          Solo vota quien esté habilitado en la lista.
        </p>

        {!abierta && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#b45309' }}>
            La votación está cerrada: el QR abre, pero nadie puede votar.
          </div>
        )}

        <div ref={caja} style={{ display: 'inline-block', justifySelf: 'center', padding: 14, background: '#fff', border: '2px solid #0f172a', borderRadius: 14 }}>
          <QRCodeCanvas value={url} size={240} level="M" />
        </div>

        <div style={{ fontSize: 11, color: hint, wordBreak: 'break-all', fontFamily: 'monospace' }}>{url}</div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={copiar} style={boton('#eef2ff', '#3730a3', '1px solid #c7d2fe')}>{copiado ? '¡Copiado!' : 'Copiar enlace'}</button>
          <button onClick={descargar} style={boton('#fff', text, '1px solid #e2e8f0')}>Descargar imagen</button>
          <button onClick={alCerrar} style={boton('transparent', muted, '1px solid #e2e8f0')}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
