'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Ingresa un email válido'); return }
    setEnviando(true)
    setError('')
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/crear-contrasena`,
    })
    setEnviando(false)
    setEnviado(true)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8', padding:20 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:64, height:64, background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:22, fontWeight:700, color: text }}>Recuperar contraseña</div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
          {enviado ? (
            <div style={{ textAlign:'center', padding:'10px 0' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📧</div>
              <div style={{ fontSize:14, color: text, fontWeight:600, marginBottom:6 }}>Revisa tu correo</div>
              <div style={{ fontSize:12, color: muted }}>Si el email existe, te llegará un link para crear una nueva contraseña.</div>
            </div>
          ) : (
            <>
              {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}
              <div style={{ marginBottom:18 }}>
                <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Email de tu cuenta</label>
                <input
                  style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
                  type="email" placeholder="tu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <button
                onClick={enviar}
                disabled={enviando}
                style={{ width:'100%', padding:12, background:'#4f46e5', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}
              >
                {enviando ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
