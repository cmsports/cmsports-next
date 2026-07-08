'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Landing pública tipo Kahoot: se ingresa el código del torneo y entra a verlo.
// Sin cuenta, sin sesión. La ruta /vivo ya es pública (no está en proxy.ts).
export default function VivoLandingPage() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')

  function entrar() {
    const c = codigo.trim().toUpperCase()
    if (c.length < 4) return
    router.push(`/vivo/${c}`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#a9bac8', padding: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, boxShadow: '0 8px 30px rgba(15,23,42,0.2)', padding: 32, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎾</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Torneo en vivo</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 6, marginBottom: 22 }}>Ingresa el código del torneo para ver los partidos</p>

        <input
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && entrar()}
          placeholder="EJ: N2FCH4"
          maxLength={16}
          autoFocus
          style={{ width: '100%', textAlign: 'center', letterSpacing: 3, fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', background: '#f4f7fa', border: '2px solid #e2e8f0', borderRadius: 12, padding: '14px 10px', outline: 'none', boxSizing: 'border-box' }}
        />

        <button
          onClick={entrar}
          disabled={codigo.trim().length < 4}
          style={{ width: '100%', marginTop: 16, background: codigo.trim().length < 4 ? '#cbd5e1' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: codigo.trim().length < 4 ? 'not-allowed' : 'pointer' }}
        >
          Ver torneo →
        </button>
      </div>
    </div>
  )
}
