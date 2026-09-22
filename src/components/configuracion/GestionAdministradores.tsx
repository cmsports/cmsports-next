'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { crearAdministrador, listarAdministradores } from '@/app/actions/administradores'
import CampoContrasena from '@/components/CampoContrasena'

type Administrador = { id: string; nombre: string | null; email: string | null }

export default function GestionAdministradores() {
  const [administradores, setAdministradores] = useState<Administrador[]>([])
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    const res = await listarAdministradores()
    setAdministradores(res.administradores)
  }

  useEffect(() => { cargar() }, [])

  async function crear() {
    setError(''); setMensaje('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.email.trim()) { setError('El correo es obligatorio'); return }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setGuardando(true)
    const res = await crearAdministrador({
      ...form, email: form.email.replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase(),
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setForm({ nombre: '', email: '', password: '' })
    setMensaje('Administrador creado. Ya puede entrar con ese correo.')
    setTimeout(() => setMensaje(''), 5000)
    await cargar()
  }

  const input = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', maxWidth: 760, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ShieldCheck size={16} color="#0f766e" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Administradores</span>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
        Entra con los mismos permisos que vos: ve finanzas, mensualidades y puede
        crear otros administradores. Dáselo solo a quien maneje el club.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input name="admin-nombre" autoComplete="off" placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={input} />
        <input name="admin-email" type="email" autoComplete="off" placeholder="Correo de acceso" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
        <CampoContrasena autoComplete="new-password" placeholder="Contraseña inicial (mínimo 6)" value={form.password} onChange={v => setForm({ ...form, password: v })} style={input} />
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
      {mensaje && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 10 }}>{mensaje}</div>}
      <button onClick={crear} disabled={guardando} style={{ marginTop: 12, background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 15px', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
        {guardando && <Loader2 size={14} />} Crear administrador
      </button>

      {administradores.length > 0 && <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 18, paddingTop: 8 }}>
        {administradores.map(a => (
          <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{a.nombre || 'Sin nombre'}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{a.email}</div>
          </div>
        ))}
      </div>}
    </div>
  )
}
