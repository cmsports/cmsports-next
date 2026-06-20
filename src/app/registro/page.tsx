'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import { Suspense } from 'react'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

function RegistroForm() {
  const searchParams = useSearchParams()
  const clubIdParam = searchParams.get('club')
  const codigo = searchParams.get('code')

  const [clubNombre, setClubNombre] = useState('')
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(null)
  const [valido, setValido] = useState<boolean | null>(null)
  const [form, setForm] = useState({ nombre:'', rut:'', email:'', telefono:'' })
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const rutValido = /^\d{7,8}-[\dkK]$/.test(form.rut)
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const telValido = form.telefono === '' || /^\+56\d{9}$/.test(form.telefono)

  useEffect(() => {
    async function verificar() {
      if (!codigo) { setValido(false); return }
      let clubId = clubIdParam
      if (!clubId) {
        const { data: inv } = await supabase.from('invitaciones').select('club_id').eq('codigo', codigo).eq('activa', true).single()
        if (!inv) { setValido(false); return }
        clubId = inv.club_id
      } else {
        const { data: inv } = await supabase.from('invitaciones').select('id').eq('club_id', clubId).eq('codigo', codigo).eq('activa', true).single()
        if (!inv) { setValido(false); return }
      }
      setResolvedClubId(clubId)
      setValido(true)
      const { data: club } = await supabase.from('clubes').select('nombre').eq('id', clubId).single()
      if (club) setClubNombre(club.nombre)
    }
    verificar()
  }, [clubIdParam, codigo])

  async function enviar() {
    setTouched({ nombre: true, rut: true, email: true, telefono: true })
    if (!form.nombre || !form.rut || !form.email) { setError('Nombre, RUT y email son obligatorios'); return }
    if (!rutValido) { setError('El RUT debe tener formato 12345678-9 (sin puntos, con guión)'); return }
    if (!emailValido) { setError('El email no es válido'); return }
    if (form.telefono && !telValido) { setError('El teléfono debe tener formato +56912345678'); return }
    setEnviando(true)
    setError('')
    const { error: err } = await supabase.from('solicitudes_jugador').insert({
      club_id: resolvedClubId, nombre: form.nombre, rut: form.rut,
      email: form.email, telefono: form.telefono || null
    })
    if (err) { setError('Error al enviar. Intenta de nuevo.'); setEnviando(false); return }
    setEnviado(true)
    setEnviando(false)
  }

  if (valido === null) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Verificando...</div>
    </div>
  )

  if (valido === false) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8', padding:20 }}>
      <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:20, padding:32, maxWidth:400, width:'100%', textAlign:'center', boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>❌</div>
        <div style={{ fontSize:18, fontWeight:600, color: text, marginBottom:8 }}>Link inválido</div>
        <div style={{ fontSize:13, color: muted }}>Este link de invitación no es válido o ha expirado. Contacta al administrador del club.</div>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8', padding:20 }}>
      <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:20, padding:32, maxWidth:400, width:'100%', textAlign:'center', boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
        <div style={{ fontSize:20, fontWeight:700, color: text, marginBottom:8 }}>¡Solicitud enviada!</div>
        <div style={{ fontSize:13, color: muted }}>El administrador del club revisará tu solicitud y te contactará pronto.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:64, height:64, background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:26, fontWeight:800, color: text }}>CmSports</div>
          <div style={{ fontSize:13, color: muted, marginTop:6 }}>{clubNombre}</div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, padding:24, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ fontSize:16, fontWeight:600, color: text, marginBottom:4 }}>Solicitud de ingreso</div>
          <div style={{ fontSize:13, color: muted, marginBottom:20 }}>Completa tus datos para unirte al club</div>

          {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Nombre completo *</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="text" placeholder="Ej: Carlos Muñoz"
              value={form.nombre}
              onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
            />
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>RUT *</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border: touched.rut && !rutValido && form.rut ? '1px solid #dc2626' : '1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="text" placeholder="21716788-4"
              value={form.rut}
              onChange={e => setForm(prev => ({ ...prev, rut: formatRut(e.target.value) }))}
              onBlur={() => setTouched(t => ({ ...t, rut: true }))}
            />
            <div style={{ fontSize:11, color: touched.rut && !rutValido && form.rut ? '#dc2626' : hint, marginTop:4 }}>
              Sin puntos, con guión. Ej: 21716788-4
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Email *</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border: touched.email && !emailValido && form.email ? '1px solid #dc2626' : '1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="email" placeholder="tu@email.com"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, email: true }))}
            />
            <div style={{ fontSize:11, color: hint, marginTop:4 }}>
              Te mandaremos aquí el link para crear tu contraseña
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, color: muted, display:'block', marginBottom:5 }}>Teléfono</label>
            <input
              style={{ width:'100%', background:'#f4f7fa', border: touched.telefono && !telValido ? '1px solid #dc2626' : '1px solid #e2e8f0', borderRadius:8, padding:'10px 12px', color: text, fontSize:14, outline:'none' }}
              type="tel" placeholder="+56975235780"
              value={form.telefono}
              onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))}
              onBlur={() => setTouched(t => ({ ...t, telefono: true }))}
            />
            <div style={{ fontSize:11, color: touched.telefono && !telValido ? '#dc2626' : hint, marginTop:4 }}>
              Con código país. Ej: +56975235780
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={enviando}
            style={{ width:'100%', padding:12, background:'#f43f5e', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4 }}
          >
            {enviando ? 'Enviando...' : 'Enviar solicitud →'}
          </button>
          <div style={{ textAlign:'center', marginTop:14, fontSize:12, color: hint }}>
            Tu solicitud será revisada por el administrador del club
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegistroPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}><div style={{ color:'#94a3b8' }}>Cargando...</div></div>}>
      <RegistroForm />
    </Suspense>
  )
}
