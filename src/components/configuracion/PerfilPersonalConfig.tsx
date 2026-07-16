'use client'

import { useEffect, useState } from 'react'
import { UserRound, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarPerfilPersonalAction } from '@/app/actions/club'
import type { Perfil } from '@/types'

export default function PerfilPersonalConfig({ perfil, refetchPerfil }: { perfil: Perfil; refetchPerfil: () => Promise<void> }) {
  const [form, setForm] = useState({ nombre: perfil.nombre || '', email: perfil.email || '', telefono: '', rut: '', especialidad: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      if (perfil.rol === 'jugador' && perfil.jugador_id) {
        const { data } = await supabase.from('jugadores').select('nombre,email,telefono,rut').eq('id', perfil.jugador_id).single()
        if (data) setForm(f => ({ ...f, nombre: data.nombre || f.nombre, email: data.email || f.email, telefono: data.telefono || '', rut: data.rut || '' }))
      }
      if (perfil.rol === 'profesor' && perfil.club_id && perfil.email) {
        const { data } = await supabase.from('profesores').select('nombre,email,especialidad').eq('club_id', perfil.club_id).eq('email', perfil.email).maybeSingle()
        if (data) setForm(f => ({ ...f, nombre: data.nombre || f.nombre, email: data.email || f.email, especialidad: data.especialidad || '' }))
      }
    }
    cargar()
  }, [perfil])

  async function guardar() {
    setGuardando(true); setError(''); setExito(false)
    const res = await actualizarPerfilPersonalAction(form)
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    await refetchPerfil()
    setExito(true)
  }

  const input = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }
  const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#0f172a' } as const

  return <div style={{ maxWidth: 760, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><UserRound size={16} color="#4f46e5" /><strong style={{ fontSize: 14 }}>Mis datos</strong></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div><label style={label}>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={input} /></div>
      <div><label style={label}>Correo de acceso</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} /></div>
      {perfil.rol === 'jugador' && <><div><label style={label}>RUT</label><input value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} style={input} /></div><div><label style={label}>Teléfono</label><input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} style={input} /></div></>}
      {perfil.rol === 'profesor' && <div><label style={label}>Especialidad</label><input value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} style={input} /></div>}
    </div>
    {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
    {exito && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 10 }}>Datos actualizados correctamente.</div>}
    <button onClick={guardar} disabled={guardando} style={{ marginTop: 12, background: exito ? '#f0fdf4' : '#4f46e5', color: exito ? '#16a34a' : '#fff', border: 0, borderRadius: 8, padding: '9px 15px', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
      {guardando ? <Loader2 size={14} /> : exito ? <Check size={14} /> : null}{guardando ? 'Guardando...' : 'Guardar mis datos'}
    </button>
  </div>
}
