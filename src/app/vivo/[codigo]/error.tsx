'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

let ultimoReintentoAutomatico = 0

export default function ErrorTorneoVivo({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: 'torneo-vivo' } })
    const ahora = Date.now()
    if (ahora - ultimoReintentoAutomatico < 15_000) return
    ultimoReintentoAutomatico = ahora
    const timer = setTimeout(reset, 400)
    return () => clearTimeout(timer)
  }, [error, reset])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#a9bac8', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, padding: 28, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.12)' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🏓</div>
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: 19 }}>Actualizando el torneo…</h1>
        <p style={{ margin: '8px 0 18px', color: '#64748b', fontSize: 13 }}>La vista se recuperará sin perder tu jugador seleccionado.</p>
        <button onClick={reset} style={{ width: '100%', padding: 12, border: 0, borderRadius: 10, background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Reintentar ahora
        </button>
      </div>
    </div>
  )
}
