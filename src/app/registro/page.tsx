'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const supabase = createClient()

function RegistroForm() {
  const searchParams = useSearchParams()
  const clubId = searchParams.get('club')
  const codigo = searchParams.get('code')

  const [clubNombre, setClubNombre] = useState('')
  const [valido, setValido] = useState<boolean | null>(null)
  const [form, setForm] = useState({ nombre:'', rut:'', email:'', telefono:'' })
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const rutValido = /^\d{7,8}-[\dkK]$/.test(form.rut)
  const telValido = form.telefono === '' || /^\+56\d{9}$/.test(form.telefono)

  useEffect(() => {
    async function verificar() {
      if (!clubId || !codigo) { setValido(false); return }
      const { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('codigo', codigo).eq('activa', true).single()
      if (!inv) { setValido(false); return }
      setValido(true)
      const { data: club } = await supabase.from('clubes').select('nombre').eq('id', clubId).single()
      if (club) setClubNombre(club.nombre)
    }
    verificar()
  }, [clubId, codigo])

  async function enviar() {
    setTouched({ nombre: true, rut: true, telefono: true })
    if (!form.nombre || !form.rut) { setError('Nombre y RUT son obligatorios'); return }
    if (!rutValido) { setError('El RUT debe tener formato 12345678-9 (sin puntos, con guión)'); return }
    if (form.telefono && !telValido) { setError('El teléfono debe tener formato +56912345678'); return }
    setEnviando(true)
    setError('')
    const { error: err } = await supabase.from('solicitudes_jugador').insert({
      club_id: clubId, nombre: form.nombre, rut: form.rut,
      email: form.email || null, telefono: form.telefono || null
    })
    if (err) { setError('Error al enviar. Intenta de nuevo.'); setEnviando(false); return }
    setEnviado(true)
    setEnviando(false)
  }

  if (valido === null) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Verificando...</div>
    </div>
  )

  if (valido === false) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117', padding:20 }}>
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:20, padding:32, maxWidth:400, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
        <div style={{ fontSize:18, fontWeight:600, color:'#fff', marginBottom:8 }}>Link inválido</div>
        <div style={{ fontSize:13, color:'#6c7280' }}>Este link de invitación no es válido o ha expirado. Contacta al administrador del club.</div>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117', padding:20 }}>
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:20, padding:32, maxWidth:400, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
        <div style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:8 }}>¡Solicitud enviada!</div>
        <div style={{ fontSize:13, color:'#6c7280' }}>El administrador del club revisará tu solicitud y te contactará pronto.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:64, height:64, background:'linear-gradient(135deg,#6c63ff,#a78bfa)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:26, fontWeight:800, color:'#fff' }}>CmSports</div>
          <div style={{ fontSize:13, color:'#6c7280', marginTop:6 }}>{clubNombre}</div>
        </div>

        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24 }}>
          <div style={{ fontSize:16, fontWeight:600, color:'#fff', marginBottom:4 }}>Solicitud de ingreso</div>
          <div style={{ fontSize:13, color:'#6c7280', marginBottom:20 }}>Completa tus datos para unirte al club</div>

          {error && <div style={{ background:'#2d0a0a', border:'1px solid #f8717144', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#f87171', marginBottom:14 }}>{error}</div>}

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Nombre completo *</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="text" placeholder="Ej: Carlos Muñoz"
              value={form.nombre}
              onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
            />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>RUT *</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border: touched.rut && !rutValido && form.rut ? '1px solid #f87171' : '1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="text" placeholder="21716788-4"
              value={form.rut}
              onChange={e => setForm(prev => ({ ...prev, rut: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, rut: true }))}
            />
            <div style={{ fontSize:11, color: touched.rut && !rutValido && form.rut ? '#f87171' : '#4b5063', marginTop:4 }}>
              Sin puntos, con guión. Ej: 21716788-4
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Email</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="email" placeholder="tu@email.com"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color:'#8890a4', display:'block', marginBottom:5 }}>Teléfono</label>
            <input
              style={{ width:'100%', background:'#0a0c12', border: touched.telefono && !telValido ? '1px solid #f87171' : '1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
              type="tel" placeholder="+56975235780"
              value={form.telefono}
              onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, telefono: true }))}
            />
            <div style={{ fontSize:11, color: touched.telefono && !telValido ? '#f87171' : '#4b5063', marginTop:4 }}>
              Con código país. Ej: +56975235780
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={enviando}
            style={{ width:'100%', padding:12, background:'#6c63ff', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4 }}
          >
            {enviando ? 'Enviando...' : 'Enviar solicitud →'}
          </button>
          <div style={{ textAlign:'center', marginTop:14, fontSize:12, color:'#4b5063' }}>
            Tu solicitud será revisada por el administrador del club
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegistroPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}><div style={{ color:'#6c7280' }}>Cargando...</div></div>}>
      <RegistroForm />
    </Suspense>
  )
}
