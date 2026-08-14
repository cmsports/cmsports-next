'use client'

import { useEffect, useState } from 'react'
import { UserRound, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { actualizarPerfilPersonalAction } from '@/app/actions/club'
import { formatRut } from '@/lib/rut'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'
import { fechaNacimientoInput } from '@/lib/domain/nombreJugador'
import { fechaChile } from '@/lib/domain/fechaChile'
import type { Perfil } from '@/types'

const CAMPOS_JUGADOR = 'nombre,email,telefono,rut,nombres,apellido1,apellido2,apellido3,fecha_nacimiento,direccion,comuna,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,talla_polera,talla_short'

type Formulario = {
  nombre: string
  email: string
  telefono: string
  rut: string
  especialidad: string
  nombres: string
  apellido1: string
  apellido2: string
  apellido3: string
  fecha_nacimiento: string
  direccion: string
  comuna: string
  contacto_emergencia_nombre: string
  contacto_emergencia_telefono: string
  indicaciones_medicas: string
  talla_polera: string
  talla_short: string
}

const vacio: Formulario = {
  nombre: '', email: '', telefono: '', rut: '', especialidad: '',
  nombres: '', apellido1: '', apellido2: '', apellido3: '',
  fecha_nacimiento: '', direccion: '', comuna: '',
  contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
  indicaciones_medicas: '', talla_polera: '', talla_short: '',
}

function edadDesde(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const [y, m, d] = fecha.split('-').map(Number)
  const [hy, hm, hd] = fechaChile().split('-').map(Number)
  let edad = hy - y
  if (hm < m || (hm === m && hd < d)) edad--
  return edad
}

export default function PerfilPersonalConfig({ perfil, refetchPerfil }: { perfil: Perfil; refetchPerfil: () => Promise<void> }) {
  const [form, setForm] = useState<Formulario>({ ...vacio, nombre: perfil.nombre || '', email: perfil.email || '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      if (perfil.rol === 'jugador' && perfil.jugador_id) {
        const { data } = await supabase.from('jugadores').select(CAMPOS_JUGADOR).eq('id', perfil.jugador_id).single()
        if (data) {
          setForm(f => ({
            ...f,
            nombre: data.nombre || f.nombre,
            email: data.email || f.email,
            telefono: data.telefono || '',
            rut: data.rut || '',
            nombres: data.nombres || (!data.apellido1 ? data.nombre || '' : ''),
            apellido1: data.apellido1 || '',
            apellido2: data.apellido2 || '',
            apellido3: data.apellido3 || '',
            fecha_nacimiento: fechaNacimientoInput(data.fecha_nacimiento),
            direccion: data.direccion || '',
            comuna: data.comuna || '',
            contacto_emergencia_nombre: data.contacto_emergencia_nombre || '',
            contacto_emergencia_telefono: data.contacto_emergencia_telefono || '',
            indicaciones_medicas: data.indicaciones_medicas || '',
            talla_polera: data.talla_polera || '',
            talla_short: data.talla_short || '',
          }))
        }
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

  const set = (campo: keyof Formulario, valor: string) => setForm(f => ({ ...f, [campo]: valor }))
  const esJugador = perfil.rol === 'jugador'
  const edad = edadDesde(form.fecha_nacimiento)

  const input = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }
  const label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#0f172a' } as const
  const seccion = { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.4px', margin: '18px 0 10px', paddingTop: 14, borderTop: '1px solid #f1f5f9' }

  return <div style={{ maxWidth: 760, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><UserRound size={16} color="#4f46e5" /><strong style={{ fontSize: 14 }}>Mis datos</strong></div>
    <p style={{ fontSize: 12, color: '#64748b', margin: '-8px 0 14px' }}>
      {esJugador
        ? 'Los mismos datos del ingreso al club. La foto se cambia con el administrador.'
        : 'Nombre y correo de acceso.'}
    </p>

    {!esJugador && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={label}>Nombre</label><input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={input} /></div>
        <div><label style={label}>Correo de acceso</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={input} /></div>
        {perfil.rol === 'profesor' && <div><label style={label}>Especialidad</label><input value={form.especialidad} onChange={e => set('especialidad', e.target.value)} style={input} /></div>}
      </div>
    )}

    {esJugador && (
      <>
        <div style={seccion}>Datos personales</div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Nombres</label>
          <input value={form.nombres} onChange={e => set('nombres', e.target.value)} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Apellido paterno</label><input value={form.apellido1} onChange={e => set('apellido1', e.target.value)} style={input} /></div>
          <div><label style={label}>Apellido materno</label><input value={form.apellido2} onChange={e => set('apellido2', e.target.value)} style={input} placeholder='Si no tienes, "no"' /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={label}>Tercer apellido</label>
          <input value={form.apellido3} onChange={e => set('apellido3', e.target.value)} style={input} placeholder='Si no tienes, "no"' />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={label}>RUT</label>
            <input value={form.rut} onChange={e => set('rut', formatRut(e.target.value))} style={input} />
          </div>
          <div>
            <label style={label}>Fecha de nacimiento</label>
            <input type="date" value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} style={input} />
            {edad !== null && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{edad} años</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Correo de acceso</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={input} /></div>
          <div><label style={label}>Teléfono</label><input value={form.telefono} onChange={e => set('telefono', e.target.value)} style={input} placeholder="+56912345678" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Dirección</label><input value={form.direccion} onChange={e => set('direccion', e.target.value)} style={input} /></div>
          <div><label style={label}>Comuna</label><input value={form.comuna} onChange={e => set('comuna', e.target.value)} style={input} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label}>Talla polera</label>
            <select value={form.talla_polera} onChange={e => set('talla_polera', e.target.value)} style={input}>
              <option value="">No especificada</option>
              {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Talla short</label>
            <select value={form.talla_short} onChange={e => set('talla_short', e.target.value)} style={input}>
              <option value="">No especificada</option>
              {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={seccion}>Contacto de emergencia</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={label}>Nombre</label><input value={form.contacto_emergencia_nombre} onChange={e => set('contacto_emergencia_nombre', e.target.value)} style={input} /></div>
          <div><label style={label}>Teléfono</label><input value={form.contacto_emergencia_telefono} onChange={e => set('contacto_emergencia_telefono', e.target.value)} style={input} placeholder="+56912345678" /></div>
        </div>
        <div>
          <label style={label}>Indicaciones médicas</label>
          <textarea value={form.indicaciones_medicas} onChange={e => set('indicaciones_medicas', e.target.value)} style={{ ...input, resize: 'vertical', minHeight: 72 }} placeholder='Alergias, condiciones, medicamentos… Si no aplica, "no"' />
        </div>
      </>
    )}

    {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>{error}</div>}
    {exito && <div style={{ color: '#16a34a', fontSize: 12, marginTop: 10 }}>Datos actualizados correctamente.</div>}
    <button onClick={guardar} disabled={guardando} style={{ marginTop: 12, background: exito ? '#f0fdf4' : '#4f46e5', color: exito ? '#16a34a' : '#fff', border: 0, borderRadius: 8, padding: '9px 15px', fontWeight: 600, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center' }}>
      {guardando ? <Loader2 size={14} /> : exito ? <Check size={14} /> : null}{guardando ? 'Guardando...' : 'Guardar mis datos'}
    </button>
  </div>
}
