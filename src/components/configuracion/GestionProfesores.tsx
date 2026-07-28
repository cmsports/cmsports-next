'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { crearProfesor, cambiarEstadoProfesor, crearAccesoProfesor } from '@/app/actions/profesores'
import CampoContrasena from '@/components/CampoContrasena'

type Profesor = { id: string; nombre: string; email: string | null; especialidad: string | null; activo: boolean | null }

export default function GestionProfesores({ clubId }: { clubId: string }) {
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [form, setForm] = useState({ nombre: '', email: '', especialidad: '', password: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  // Qué profesor sin cuenta se está conectando, y con qué credenciales.
  const [abierto, setAbierto] = useState<string | null>(null)
  const [acceso, setAcceso] = useState({ email: '', password: '' })

  async function cargar() {
    const supabase = createClient()
    const { data } = await supabase.from('profesores').select('id,nombre,email,especialidad,activo').eq('club_id', clubId).order('nombre')
    setProfesores(data || [])
  }

  useEffect(() => { cargar() }, [clubId])

  async function crear() {
    setError(''); setMensaje('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.email.trim()) { setError('El correo es obligatorio'); return }
    if (form.password.length < 6) { setError('La contrase\u00F1a debe tener al menos 6 caracteres'); return }
    setGuardando(true)
    const res = await crearProfesor({ ...form, email: form.email.replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase() })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setForm({ nombre: '', email: '', especialidad: '', password: '' })
    setMensaje('Profesor y cuenta de acceso creados correctamente.')
    setTimeout(() => setMensaje(''), 4000)
    await cargar()
  }

  // Los profesores cargados a mano no tienen correo, así que no pueden entrar.
  // Esto les crea la cuenta y la engancha a la ficha que ya está, con sus
  // bloques: crear uno nuevo dejaría dos fichas iguales y los bloques colgando
  // de la que nadie usa.
  async function darAcceso(profesor: Profesor) {
    setError(''); setMensaje('')
    if (!acceso.email.trim()) { setError('Escribí el correo de acceso'); return }
    if (acceso.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setGuardando(true)
    const res = await crearAccesoProfesor({
      profesorId: profesor.id, email: acceso.email, password: acceso.password,
    })
    setGuardando(false)
    if (res.error) { setError(res.error); return }
    setAbierto(null)
    setAcceso({ email: '', password: '' })
    setMensaje(`${profesor.nombre} ya puede entrar con ese correo.`)
    setTimeout(() => setMensaje(''), 6000)
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
        <input name="profesor-nombre" autoComplete="off" placeholder="Nombre completo" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={input} />
        <input name="profesor-email" type="email" autoComplete="off" placeholder="Correo de acceso" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
        <input name="profesor-especialidad" autoComplete="off" placeholder="Especialidad (opcional)" value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} style={input} />
        <CampoContrasena placeholder="Contraseña inicial (mínimo 6)" value={form.password} onChange={v => setForm({ ...form, password: v })} style={input} />
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
      {mensaje && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 10 }}>{mensaje}</div>}
      <button onClick={crear} disabled={guardando} style={{ marginTop: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 15px', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
        {guardando && <Loader2 size={14} />} Crear profesor
      </button>

      {profesores.length > 0 && <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 18, paddingTop: 8 }}>
        {profesores.map(profesor => <div key={profesor.id} style={{ padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{profesor.nombre}</div>
              <div style={{ fontSize: 11, color: profesor.email ? '#64748b' : '#c2410c' }}>
                {profesor.email || 'Sin cuenta — no puede entrar'}
                {profesor.especialidad ? ` · ${profesor.especialidad}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!profesor.email && (
                <button onClick={() => { setError(''); setMensaje(''); setAcceso({ email: '', password: '' }); setAbierto(abierto === profesor.id ? null : profesor.id) }}
                  style={{ border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  {abierto === profesor.id ? 'Cancelar' : 'Dar acceso'}
                </button>
              )}
              <button onClick={() => cambiarEstado(profesor)} style={{ border: `1px solid ${profesor.activo ? '#fecaca' : '#bbf7d0'}`, background: profesor.activo ? '#fef2f2' : '#f0fdf4', color: profesor.activo ? '#dc2626' : '#16a34a', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 11 }}>
                {profesor.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>

          {abierto === profesor.id && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: 12, marginTop: 9 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 9 }}>
                Se le crea la cuenta y se engancha a esta misma ficha, con sus grupos.
                Entra como profesor: pasa lista y registra clases extra, pero no ve finanzas
                ni les pone precio.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="email" autoComplete="off" placeholder="Correo de acceso"
                  value={acceso.email} onChange={e => setAcceso({ ...acceso, email: e.target.value })} style={input} />
                <CampoContrasena autoComplete="new-password" placeholder="Contraseña inicial (mínimo 6)"
                  value={acceso.password} onChange={v => setAcceso({ ...acceso, password: v })} style={input} />
              </div>
              <button onClick={() => darAcceso(profesor)} disabled={guardando}
                style={{ marginTop: 9, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
                {guardando && <Loader2 size={13} />} Crear acceso para {profesor.nombre}
              </button>
            </div>
          )}
        </div>)}
      </div>}
    </div>
  )
}
