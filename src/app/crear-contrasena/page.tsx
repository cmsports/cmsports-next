'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'

export default function CrearContrasenaPage() {
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [sesionLista, setSesionLista] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let activo = true

    async function prepararSesion() {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')

      // Compatibilidad con links emitidos antes de usar /auth/callback.
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (activo) setError('El link de recuperación no es válido o ha expirado. Solicita uno nuevo.')
          return
        }
        window.history.replaceState({}, '', '/crear-contrasena')
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!activo) return
      if (!session) {
        setError('El link de recuperación no es válido o ha expirado. Solicita uno nuevo.')
        return
      }
      setSesionLista(true)
    }

    void prepararSesion()
    return () => { activo = false }
  }, [])

  async function guardar() {
    if (!sesionLista) { setError('El link de recuperación no es válido o ha expirado. Solicita uno nuevo.'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirmar) { setError('Las contraseñas no coinciden'); return }
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setGuardando(false)
    if (err) { setError('No se pudo guardar la contraseña. El link puede haber expirado.'); return }
    const { data: { session } } = await supabase.auth.getSession()
    const { data: p } = await supabase.from('perfiles').select('rol').eq('id', session?.user.id).single()
    if (p?.rol === 'superadmin') router.push('/superadmin')
    else if (p?.rol === 'admin') router.push('/dashboard')
    else if (p?.rol === 'profesor') router.push('/dashboard-profesor')
    else router.push('/perfil')
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8', padding:20 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:64, height:64, background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:22, fontWeight:700, color: text }}>Crea tu contraseña</div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
          {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nueva contraseña</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="password" placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div style={{ marginBottom:18 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Confirmar contraseña</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="password" placeholder="Repite la contraseña"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
            />
          </div>

          <button
            onClick={guardar}
            disabled={guardando || !sesionLista}
            style={{ width:'100%', padding:12, background:'#4f46e5', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}
          >
            {guardando ? 'Guardando...' : !sesionLista ? 'Verificando link...' : 'Guardar y entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
