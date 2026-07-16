'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { crearProfesor, cambiarEstadoProfesor } from '@/app/actions/profesores'

type Profesor = { id: string; nombre: string; email: string | null; especialidad: string | null; activo: boolean | null }

export default function GestionProfesores({ clubId }: { clubId: string }) {
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [form, setForm] = useState({ nombre: '', email: '', especialidad: '', password: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    const supabase = createClient()
    const { data } = await supabase.from('profesores').select('id,nombre,email,especialidad,activo').eq('club_id', clubId).order('nombre')
    setProfesores(data || [])
  }

  useEffect(() => { cargar() }, [clubId])

  async function crear() {
    setGuardando(true); setError(''); setMensaje('')
    const res = await crearProfesor(form)
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setForm({ nombre: '', email: '', especialidad: '', password: '' })
    setMensaje('Profesor y cuenta de acceso creados correctamente.')
    await cargar()
  }

  async function cambiarEstado(profesor: Profesor) {
    setError(''); setMensaje('')
    const res = await cambiarEstadoProfesor({ profesorId: profesor.id, activo: !profesor.activo })
    if (res.error) { setError(res.error); return }
    await cargar()
  }

  const input = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', maxWidth: 760, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <UserPlus size={16} color="#4f46e5" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Profesores</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={input} />
        <input type="email" placeholder="Correo de acceso" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
        <input placeholder="Especialidad (opcional)" value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} style={input} />
        <input type="password" placeholder="Contraseña inicial (mínimo 6)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={input} />
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
      {mensaje && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 10 }}>{mensaje}</div>}
      <button onClick={crear} disabled={guardando} style={{ marginTop: 12, background: '#4f46e5', color: '#fff', border: 0, borderRadius: 8, padding: '9px 15px', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
        {guardando && <Loader2 size={14} />} Crear profesor
      </button>

      {profesores.length > 0 && <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 18, paddingTop: 8 }}>
        {profesores.map(profesor => <div key={profesor.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{profesor.nombre}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{profesor.email}{profesor.especialidad ? ` · ${profesor.especialidad}` : ''}</div>
          </div>
          <button onClick={() => cambiarEstado(profesor)} style={{ border: `1px solid ${profesor.activo ? '#fecaca' : '#bbf7d0'}`, background: profesor.activo ? '#fef2f2' : '#f0fdf4', color: profesor.activo ? '#dc2626' : '#16a34a', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 11 }}>
            {profesor.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>)}
      </div>}
    </div>
  )
}
