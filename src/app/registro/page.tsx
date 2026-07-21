'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { formatRut } from '@/lib/rut'
import { Suspense } from 'react'
import { registrarSolicitud } from '@/app/actions/auth'

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const inputStyle = {
  width: '100%', background: '#f4f7fa', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none',
  boxSizing: 'border-box' as const,
}
const inputErr = { ...inputStyle, border: '1px solid #dc2626' }
const labelStyle = { fontSize: 12, color: muted, display: 'block' as const, marginBottom: 5 }
const hintStyle = { fontSize: 11, color: hint, marginTop: 4 }
const hintErrStyle = { fontSize: 11, color: '#dc2626', marginTop: 4 }
const section = { fontSize: 12, fontWeight: 700 as const, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '20px 0 12px', paddingTop: 16, borderTop: '1px solid #f1f5f9' }

function RegistroForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const clubIdParam = searchParams.get('club')
  const codigo = searchParams.get('code')

  const [clubNombre, setClubNombre] = useState('')
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(null)
  const [valido, setValido] = useState<boolean | null>(null)
  const [form, setForm] = useState({
    nombre: '', rut: '', email: '', telefono: '',
    fecha_nacimiento: '', direccion: '', comuna: '',
    contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
    indicaciones_medicas: '',
  })
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const rutValido = /^\d{7,8}-[\dkK]$/.test(form.rut)
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const telValido = form.telefono === '' || /^\+56\d{9}$/.test(form.telefono)
  const telEmergValido = form.contacto_emergencia_telefono === '' || /^\+56\d{9}$/.test(form.contacto_emergencia_telefono)

  useEffect(() => {
    async function verificar() {
      if (!codigo) { setValido(false); return }
      const { data: inv } = await supabase.rpc('validar_invitacion', {
        p_codigo: codigo,
        p_club_id: clubIdParam,
      })
      const match = inv?.[0]
      if (!match) { setValido(false); return }
      setResolvedClubId(match.club_id)
      setValido(true)
      if (match.club_nombre) setClubNombre(match.club_nombre)
    }
    verificar()
  }, [clubIdParam, codigo])

  function set(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function blur(k: string) {
    setTouched(t => ({ ...t, [k]: true }))
  }

  async function enviar() {
    const allTouched: Record<string, boolean> = {}
    Object.keys(form).forEach(k => { allTouched[k] = true })
    setTouched(allTouched)
    if (!form.nombre || !form.rut || !form.email) { setError('Nombre, RUT y email son obligatorios'); return }
    if (!rutValido) { setError('El RUT debe tener formato 12345678-9 (sin puntos, con guión)'); return }
    if (!emailValido) { setError('El email no es válido'); return }
    if (form.telefono && !telValido) { setError('El teléfono debe tener formato +56912345678'); return }
    if (form.contacto_emergencia_telefono && !telEmergValido) { setError('El teléfono de emergencia debe tener formato +56912345678'); return }
    setEnviando(true)
    setError('')
    const result = await registrarSolicitud({
      club_id: resolvedClubId!, nombre: form.nombre, rut: form.rut,
      email: form.email, telefono: form.telefono, codigo: codigo!,
      fecha_nacimiento: form.fecha_nacimiento || undefined,
      direccion: form.direccion || undefined,
      comuna: form.comuna || undefined,
      contacto_emergencia_nombre: form.contacto_emergencia_nombre || undefined,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono || undefined,
      indicaciones_medicas: form.indicaciones_medicas || undefined,
    })
    if (result.error) { setError(result.error); setEnviando(false); return }
    setEnviado(true)
    setEnviando(false)
  }

  if (valido === null) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Verificando...</div>
    </div>
  )

  if (valido === false) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8', padding: 20 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: text, marginBottom: 8 }}>Link inválido</div>
        <div style={{ fontSize: 13, color: muted }}>Este link de invitación no es válido o ha expirado. Contacta al administrador del club.</div>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8', padding: 20 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: text, marginBottom: 8 }}>¡Solicitud enviada!</div>
        <div style={{ fontSize: 13, color: muted }}>El administrador del club revisará tu solicitud y te contactará pronto.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#a9bac8', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: 'white', margin: '0 auto 12px' }}>CM</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: text }}>CmSports</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{clubNombre}</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: text, marginBottom: 4 }}>Solicitud de ingreso</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>Completa tus datos para unirte al club</div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* ── Datos personales ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nombre completo *</label>
            <input style={inputStyle} type="text" placeholder="Ej: Carlos Muñoz"
              value={form.nombre} onChange={e => set('nombre', e.target.value)} onBlur={() => blur('nombre')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>RUT *</label>
              <input style={touched.rut && !rutValido && form.rut ? inputErr : inputStyle}
                type="text" placeholder="12345678-9"
                value={form.rut} onChange={e => set('rut', formatRut(e.target.value))} onBlur={() => blur('rut')} />
              <div style={touched.rut && !rutValido && form.rut ? hintErrStyle : hintStyle}>Sin puntos, con guión</div>
            </div>
            <div>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input style={inputStyle} type="date"
                value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email *</label>
            <input style={touched.email && !emailValido && form.email ? inputErr : inputStyle}
              type="email" placeholder="tu@email.com"
              value={form.email} onChange={e => set('email', e.target.value)} onBlur={() => blur('email')} />
            <div style={hintStyle}>Recibirás un correo para crear tu contraseña cuando el club apruebe la solicitud</div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Teléfono</label>
            <input style={touched.telefono && !telValido ? inputErr : inputStyle}
              type="tel" placeholder="+56912345678"
              value={form.telefono} onChange={e => set('telefono', e.target.value)} onBlur={() => blur('telefono')} />
            <div style={touched.telefono && !telValido ? hintErrStyle : hintStyle}>Con código país. Ej: +56912345678</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} type="text" placeholder="Calle 123"
                value={form.direccion} onChange={e => set('direccion', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Comuna</label>
              <input style={inputStyle} type="text" placeholder="Buín"
                value={form.comuna} onChange={e => set('comuna', e.target.value)} />
            </div>
          </div>

          {/* ── Contacto de emergencia ── */}
          <div style={section}>Contacto de emergencia</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nombre</label>
              <input style={inputStyle} type="text" placeholder="Nombre del contacto"
                value={form.contacto_emergencia_nombre} onChange={e => set('contacto_emergencia_nombre', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input style={touched.contacto_emergencia_telefono && !telEmergValido ? inputErr : inputStyle}
                type="tel" placeholder="+56912345678"
                value={form.contacto_emergencia_telefono}
                onChange={e => set('contacto_emergencia_telefono', e.target.value)}
                onBlur={() => blur('contacto_emergencia_telefono')} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Indicaciones médicas</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              placeholder="Alergias, condiciones, medicamentos... (opcional)"
              value={form.indicaciones_medicas} onChange={e => set('indicaciones_medicas', e.target.value)} />
          </div>

          <button
            onClick={enviar}
            disabled={enviando}
            style={{ width: '100%', padding: 13, background: '#f43f5e', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            {enviando ? 'Enviando...' : 'Enviar solicitud →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: hint }}>
            Tu solicitud será revisada por el administrador del club
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegistroPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}><div style={{ color: '#94a3b8' }}>Cargando...</div></div>}>
      <RegistroForm />
    </Suspense>
  )
}
