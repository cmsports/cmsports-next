'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleLogin() {
    try {
      setLoading(true)
      setError('')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); return }
      window.location.href = '/dashboard'
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f1f5f9',
    }}>
      {/* Panel izquierdo — decorativo */}
      <div style={{
        flex: 1,
        background: '#4f46e5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
      }} className="login-panel">
        {/* Círculos decorativos */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -40, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', top: '40%', right: 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(249,115,22,0.4)' }} />

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 360 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 16,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <img src="/logo.png" alt="CmSports" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>CmSports</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            Plataforma de gestión deportiva para clubes
          </p>

          <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: '🏓', text: 'Gestión de jugadores y categorías' },
              { icon: '🏆', text: 'Torneos y ranking ELO automatizado' },
              { icon: '📊', text: 'Finanzas y mensualidades en tiempo real' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        width: 440,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
      }} className="login-form-panel">
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Bienvenido</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>Ingresa tus credenciales para continuar</p>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 13, color: '#dc2626', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                style={{
                  width: '100%', background: '#f8fafc',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '10px 12px 10px 36px',
                  color: '#0f172a', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#4f46e5')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                style={{
                  width: '100%', background: '#f8fafc',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '10px 12px 10px 36px',
                  color: '#0f172a', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                onFocus={e => (e.target.style.borderColor = '#4f46e5')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -12 }}>
            <a href="/recuperar-contrasena" style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'none' }}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', padding: '11px',
              background: loading ? '#e2e8f0' : '#f43f5e',
              color: loading ? '#94a3b8' : 'white',
              border: 'none', borderRadius: 9,
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s',
            }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Ingresando...</>
              : <><span>Ingresar</span><ArrowRight size={16} /></>
            }
          </button>

          <p style={{ marginTop: 24, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
            ¿Problemas para ingresar? Contacta al administrador del club.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .login-panel { display: none !important; }
          .login-form-panel { width: 100% !important; padding: 32px 24px !important; }
        }
      `}</style>
    </div>
  )
}
