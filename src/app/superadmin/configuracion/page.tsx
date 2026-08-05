'use client'

import { useEffect, useState } from 'react'
import { Building2, Mail, KeyRound, Save, UserCog } from 'lucide-react'
import CampoContrasena from '@/components/CampoContrasena'
import { createClient } from '@/lib/supabase/client'
import { cambiarPasswordPropia } from '@/app/actions/credenciales'
import { cambiarEmailPropio, guardarConfiguracionEmpresa } from '@/app/actions/configuracionEmpresa'
import { usePerfilSuperadmin } from '../layout'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const input = { width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }
const boton = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }

// Campos de la ficha de empresa, en el orden en que aparecen en una escritura
// de constitución: así se copian de corrido sin ir saltando por el formulario.
// Nombre de fantasía y correo de contacto no están acá: se editan arriba, en
// "Datos principales", porque son los mismos campos de la tabla y duplicarlos
// dejaría dos inputs peleando por el mismo dato.
const CAMPOS_EMPRESA = [
  { key: 'razon_social', label: 'Razón social' },
  { key: 'rut', label: 'RUT de la empresa' },
  { key: 'giro', label: 'Giro' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'comuna', label: 'Comuna' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'representante_nombre', label: 'Representante legal' },
  { key: 'representante_rut', label: 'RUT del representante legal' },
] as const

const CAMPOS_TODOS = ['razon_social', 'nombre_fantasia', 'rut', 'giro', 'domicilio', 'comuna', 'ciudad', 'email_contacto', 'telefono', 'representante_nombre', 'representante_rut'] as const

type FormEmpresa = Record<(typeof CAMPOS_TODOS)[number], string>

const VACIO: FormEmpresa = Object.fromEntries(CAMPOS_TODOS.map(k => [k, ''])) as FormEmpresa

function Seccion({ icon: Icon, titulo, descripcion, children }: {
  icon: typeof Building2; titulo: string; descripcion: string; children: React.ReactNode
}) {
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Icon size={16} color="#4f46e5" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{titulo}</h2>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>{descripcion}</p>
      {children}
    </div>
  )
}

function Aviso({ error, exito }: { error: string; exito: string }) {
  if (!error && !exito) return null
  const estilo = error
    ? { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
    : { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }
  return <div style={{ ...estilo, borderRadius: 8, padding: '8px 10px', fontSize: 12, marginTop: 12 }}>{error || exito}</div>
}

export default function ConfiguracionSuperadminPage() {
  const perfil = usePerfilSuperadmin()

  const [nuevoEmail, setNuevoEmail] = useState('')
  const [passwordConfirma, setPasswordConfirma] = useState('')
  const [guardandoEmail, setGuardandoEmail] = useState(false)
  const [msgEmail, setMsgEmail] = useState({ error: '', exito: '' })

  const [nuevaPassword, setNuevaPassword] = useState('')
  const [repitePassword, setRepitePassword] = useState('')
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [msgPassword, setMsgPassword] = useState({ error: '', exito: '' })

  const [empresa, setEmpresa] = useState<FormEmpresa>(VACIO)
  const [cargandoEmpresa, setCargandoEmpresa] = useState(true)
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false)
  const [msgEmpresa, setMsgEmpresa] = useState({ error: '', exito: '' })

  useEffect(() => {
    async function cargar() {
      // Lectura directa: la RLS de la migración 123 ya limita la tabla al
      // superadmin, no hace falta una Action solo para leer.
      const { data } = await supabase.from('configuracion_empresa').select('*').maybeSingle()
      if (data) {
        setEmpresa(Object.fromEntries(CAMPOS_TODOS.map(k => [k, data[k] ?? ''])) as FormEmpresa)
      }
      setCargandoEmpresa(false)
    }
    void cargar()
  }, [])

  async function handleCambiarEmail() {
    setMsgEmail({ error: '', exito: '' })
    setGuardandoEmail(true)
    const res = await cambiarEmailPropio({ nuevoEmail, passwordActual: passwordConfirma })
    setGuardandoEmail(false)
    if (res?.error) { setMsgEmail({ error: res.error, exito: '' }); return }
    setNuevoEmail('')
    setPasswordConfirma('')
    setMsgEmail({ error: '', exito: 'Correo actualizado. Úsalo desde el próximo inicio de sesión.' })
  }

  async function handleCambiarPassword() {
    setMsgPassword({ error: '', exito: '' })
    if (nuevaPassword !== repitePassword) {
      setMsgPassword({ error: 'Las contraseñas no coinciden', exito: '' })
      return
    }
    setGuardandoPassword(true)
    const res = await cambiarPasswordPropia(nuevaPassword)
    setGuardandoPassword(false)
    if (res?.error) { setMsgPassword({ error: res.error, exito: '' }); return }
    setNuevaPassword('')
    setRepitePassword('')
    setMsgPassword({ error: '', exito: 'Contraseña actualizada.' })
  }

  async function handleGuardarEmpresa() {
    setMsgEmpresa({ error: '', exito: '' })
    setGuardandoEmpresa(true)
    const res = await guardarConfiguracionEmpresa(empresa)
    setGuardandoEmpresa(false)
    if (res?.error) { setMsgEmpresa({ error: res.error, exito: '' }); return }
    setMsgEmpresa({ error: '', exito: 'Datos guardados.' })
  }

  function setCampo(key: keyof FormEmpresa, valor: string) {
    setEmpresa(prev => ({ ...prev, [key]: valor }))
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Configuración</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Tu cuenta y los datos de la empresa que opera CmSports</p>
      </div>

      <Seccion icon={UserCog} titulo="Mi cuenta" descripcion={perfil?.email ? `Sesión iniciada como ${perfil.email}` : 'Credenciales de acceso del superadmin'}>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={13} /> Cambiar correo de acceso
          </label>
          <input type="email" placeholder="Correo nuevo" value={nuevoEmail} autoComplete="email"
            onChange={e => setNuevoEmail(e.target.value)} style={input} />
          <CampoContrasena placeholder="Tu contraseña actual (para confirmar)" value={passwordConfirma}
            onChange={setPasswordConfirma} autoComplete="current-password" style={input} />
          <div>
            <button onClick={handleCambiarEmail} disabled={guardandoEmail || !nuevoEmail || !passwordConfirma}
              style={{ ...boton, opacity: guardandoEmail || !nuevoEmail || !passwordConfirma ? 0.5 : 1 }}>
              <Save size={14} /> {guardandoEmail ? 'Guardando...' : 'Cambiar correo'}
            </button>
          </div>
          <Aviso {...msgEmail} />
        </div>

        <div style={{ display: 'grid', gap: 8, marginTop: 18, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
          <label style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
            <KeyRound size={13} /> Cambiar contraseña
          </label>
          <CampoContrasena placeholder="Contraseña nueva (mínimo 6 caracteres)" value={nuevaPassword}
            onChange={setNuevaPassword} autoComplete="new-password" style={input} />
          <CampoContrasena placeholder="Repite la contraseña nueva" value={repitePassword}
            onChange={setRepitePassword} autoComplete="new-password" style={input} />
          <div>
            <button onClick={handleCambiarPassword} disabled={guardandoPassword || !nuevaPassword}
              style={{ ...boton, opacity: guardandoPassword || !nuevaPassword ? 0.5 : 1 }}>
              <Save size={14} /> {guardandoPassword ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </div>
          <Aviso {...msgPassword} />
        </div>
      </Seccion>

      {/* Sin botón propio: estos dos campos viven en la misma fila que los
          datos de empresa, así que un segundo botón guardaría exactamente lo
          mismo y solo abriría la duda de cuál hay que apretar. */}
      <Seccion icon={Building2} titulo="Datos principales" descripcion="Cómo se presenta la plataforma a los clubes. Se guardan con el botón de más abajo.">
        {cargandoEmpresa ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Cargando...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Nombre visible</label>
              <input value={empresa.nombre_fantasia} onChange={e => setCampo('nombre_fantasia', e.target.value)} style={input} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>Correo de contacto</label>
              <input type="email" value={empresa.email_contacto} onChange={e => setCampo('email_contacto', e.target.value)} style={input} />
            </div>
          </div>
        )}
      </Seccion>

      <Seccion icon={Building2} titulo="Datos de empresa" descripcion="Se usan en contratos y documentos de cobro. Cópialos de la escritura de constitución.">
        {cargandoEmpresa ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Cargando...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {CAMPOS_EMPRESA.map(c => (
                <div key={c.key}>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</label>
                  <input value={empresa[c.key]} onChange={e => setCampo(c.key, e.target.value)} style={input} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button onClick={handleGuardarEmpresa} disabled={guardandoEmpresa}
                style={{ ...boton, opacity: guardandoEmpresa ? 0.5 : 1 }}>
                <Save size={14} /> {guardandoEmpresa ? 'Guardando...' : 'Guardar datos de empresa'}
              </button>
            </div>
            <Aviso {...msgEmpresa} />
          </>
        )}
      </Seccion>
    </div>
  )
}
