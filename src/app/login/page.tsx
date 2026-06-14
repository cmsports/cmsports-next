'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
 const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  async function handleLogin() {
    try {
      setLoading(true)
      setError('')

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        return
      }

      window.location.href = '/dashboard'
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ width:'100%', maxWidth:400, padding:24 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:64, height:64, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#fff' }}>CmSports</div>
          <div style={{ fontSize:13, color:'#6c7280', marginTop:6 }}>Club Unión San Bernardo</div>
        </div>
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24 }}>
          {error && <div style={{ background:'#2d0a0a', border:'1px solid #f8717144', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#f87171', marginBottom:14 }}>{error}</div>}
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Email</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="email" placeholder="tu@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Contraseña</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ width:'100%', padding:12, background:'#6c63ff', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar →'}
          </button>
        </div>
      </div>
    </div>
  )
}