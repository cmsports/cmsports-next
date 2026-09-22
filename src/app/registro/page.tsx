'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { formatRut, rutValido } from '@/lib/rut'
import { Suspense } from 'react'
import { registrarSolicitud } from '@/app/actions/auth'
import { TALLAS_UNIFORME } from '@/lib/domain/tallas'
import { NIVELES, MANOS, nivelLabel, manoLabel } from '@/lib/domain/perfilDeportivo'
import ThemeToggle from '@/components/ThemeToggle'

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

// La solicitud tiene que llegar completa y utilizable: el club no persigue
// datos después. Estos campos exigen un valor real —no se acepta "no"—
// porque sin ellos no se puede federar ni contactar a nadie en una urgencia.
const CAMPOS_OBLIGATORIOS = [
  { key: 'nombres',                      label: 'Nombres' },
  { key: 'apellido1',                    label: 'Apellido paterno' },
  { key: 'rut',                          label: 'RUT' },
  { key: 'email',                        label: 'Email' },
  { key: 'fecha_nacimiento',             label: 'Fecha de nacimiento' },
  { key: 'direccion',                    label: 'Dirección' },
  { key: 'comuna',                       label: 'Comuna' },
  { key: 'contacto_emergencia_nombre',   label: 'Contacto de emergencia' },
  { key: 'contacto_emergencia_telefono', label: 'Teléfono de emergencia' },
] as const

// Acá sí se acepta "no": hay gente con un solo apellido y niños sin celular.
const CAMPOS_ACEPTAN_NO = [
  { key: 'apellido2',            label: 'Apellido materno' },
  { key: 'apellido3',            label: 'Tercer apellido' },
  { key: 'telefono',             label: 'Teléfono' },
  { key: 'indicaciones_medicas', label: 'Indicaciones médicas' },
] as const

const PALABRAS_VACIAS = ['no', 'n/a', 'na', 'ninguno', 'ninguna', 'sin', '-', '.', 'x']

function pareceRelleno(valor: string): boolean {
  return PALABRAS_VACIAS.includes(valor.trim().toLowerCase())
}

// Rango razonable: nadie se inscribe con 2 años ni con 105.
function edadDesde(fecha: string): number | null {
  if (!fecha) return null
  const nac = new Date(fecha)
  if (Number.isNaN(nac.getTime())) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad
}

function RegistroForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const clubIdParam = searchParams.get('club')
  const codigo = searchParams.get('code')

  const [clubNombre, setClubNombre] = useState('')
  const [resolvedClubId, setResolvedClubId] = useState<string | null>(null)
  const [valido, setValido] = useState<boolean | null>(null)
  const [form, setForm] = useState({
    nombres: '', apellido1: '', apellido2: '', apellido3: '',
    rut: '', email: '', telefono: '',
    fecha_nacimiento: '', direccion: '', comuna: '',
    contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
    indicaciones_medicas: '',
    talla_polera: '', talla_short: '',
    // Perfil deportivo: solo se muestran si el club tiene el módulo, y
    // NINGUNO es obligatorio. Quien se inscribe puede no saber todavía con qué
    // goma juega, y eso no puede ser motivo para no poder entrar al club.
    nivel: '', licencia_fechiteme: '', mano_habil: '', estilo_juego: '', material: '',
  })
  const [perfilDeportivo, setPerfilDeportivo] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const rutOk = rutValido(form.rut)
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  // El teléfono propio puede no existir (niños); el de emergencia es obligatorio.
  const telValido = pareceRelleno(form.telefono) || /^\+56\d{9}$/.test(form.telefono)
  const telEmergValido = /^\+56\d{9}$/.test(form.contacto_emergencia_telefono)
  const edad = edadDesde(form.fecha_nacimiento)
  const edadValida = edad !== null && edad >= 3 && edad <= 100
  const nombreCompleto = [form.nombres, form.apellido1, form.apellido2, form.apellido3]
    .map(v => v.trim())
    .filter(v => v && v.toLowerCase() !== 'no')
    .join(' ')

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
      // El club_id del navegador no sirve para preguntar por los módulos: esta
      // página es pública y `clubes` no se lee sin sesión. Viene en la
      // respuesta del RPC (migración 280).
      setPerfilDeportivo(match.perfil_deportivo === true)
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

    const vacios = CAMPOS_OBLIGATORIOS.filter(c => !form[c.key].trim())
    if (vacios.length > 0) {
      setError(`Falta completar: ${vacios.map(c => c.label).join(', ')}.`)
      return
    }
    // Estos no admiten "no": sin ellos la inscripción no sirve.
    const conRelleno = CAMPOS_OBLIGATORIOS.filter(c => pareceRelleno(form[c.key]))
    if (conRelleno.length > 0) {
      setError(`Estos datos son obligatorios y deben ser reales: ${conRelleno.map(c => c.label).join(', ')}.`)
      return
    }
    const sinCompletar = CAMPOS_ACEPTAN_NO.filter(c => !form[c.key].trim())
    if (sinCompletar.length > 0) {
      setError(`Falta completar: ${sinCompletar.map(c => c.label).join(', ')}. Si no tienes el dato, escribe "no".`)
      return
    }
    if (!rutOk) { setError('El RUT no es válido. Revisa el número y el dígito verificador.'); return }
    if (!emailValido) { setError('El email no es válido'); return }
    if (!edadValida) { setError('Revisa la fecha de nacimiento: la edad debe estar entre 3 y 100 años'); return }
    if (!telValido) { setError('El teléfono debe tener formato +56912345678, o escribe "no" si no tienes'); return }
    if (!telEmergValido) { setError('El teléfono de emergencia es obligatorio y debe tener formato +56912345678'); return }
    if (form.nombres.trim().length < 2 || form.apellido1.trim().length < 2) {
      setError('Nombres y apellido paterno deben tener al menos 2 letras'); return
    }
    if (form.direccion.trim().length < 5) { setError('Escribe la dirección completa (calle y número)'); return }
    setEnviando(true)
    setError('')
    const result = await registrarSolicitud({
      club_id: resolvedClubId!, nombre: nombreCompleto, rut: form.rut,
      email: form.email, telefono: form.telefono, codigo: codigo!,
      nombres: form.nombres.trim(),
      apellido1: form.apellido1.trim(),
      apellido2: form.apellido2.trim(),
      apellido3: form.apellido3.trim(),
      fecha_nacimiento: form.fecha_nacimiento || undefined,
      direccion: form.direccion || undefined,
      comuna: form.comuna || undefined,
      contacto_emergencia_nombre: form.contacto_emergencia_nombre || undefined,
      contacto_emergencia_telefono: form.contacto_emergencia_telefono || undefined,
      indicaciones_medicas: form.indicaciones_medicas || undefined,
      talla_polera: form.talla_polera || undefined,
      talla_short: form.talla_short || undefined,
      // Si el club no tiene el módulo, los cinco van vacíos y la función los
      // guarda como NULL. No hace falta condicionar el envío.
      nivel: form.nivel || undefined,
      licencia_fechiteme: form.licencia_fechiteme || undefined,
      mano_habil: form.mano_habil || undefined,
      estilo_juego: form.estilo_juego || undefined,
      material: form.material || undefined,
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
        {/* El RPC devuelve vacío por dos motivos distintos —código inválido y
            cuota agotada— y no los distingue a propósito, para no confirmarle a
            nadie que un código existe. El texto cubre los dos: antes decía solo
            "no es válido o ha expirado" y quien caía en la cuota entendía que
            el link estaba muerto y no volvía a intentar. */}
        <div style={{ fontSize: 13, color: muted }}>
          Este link no es válido, ya expiró, o hay mucha gente inscribiéndose al mismo tiempo.
          Espera unos minutos y vuelve a abrirlo. Si sigue igual, contacta al administrador del club.
        </div>
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

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1d4ed8', marginBottom: 16, lineHeight: 1.5 }}>
            Todos los campos son obligatorios. Solo en <strong>apellido materno</strong>, <strong>tercer apellido</strong>,
            <strong> teléfono</strong> e <strong>indicaciones médicas</strong> puedes escribir <strong>no</strong> si no aplica.
          </div>

          {/* ── Datos personales ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nombres *</label>
            <input style={inputStyle} type="text" placeholder="Ej: Carlos Andrés"
              value={form.nombres} onChange={e => set('nombres', e.target.value)} onBlur={() => blur('nombres')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Apellido paterno *</label>
              <input style={inputStyle} type="text" placeholder="Ej: Muñoz"
                value={form.apellido1} onChange={e => set('apellido1', e.target.value)} onBlur={() => blur('apellido1')} />
            </div>
            <div>
              <label style={labelStyle}>Apellido materno *</label>
              <input style={inputStyle} type="text" placeholder="Ej: Rojas"
                value={form.apellido2} onChange={e => set('apellido2', e.target.value)} onBlur={() => blur('apellido2')} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tercer apellido *</label>
            <input style={inputStyle} type="text" placeholder='Si no tienes, escribe "no"'
              value={form.apellido3} onChange={e => set('apellido3', e.target.value)} onBlur={() => blur('apellido3')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>RUT *</label>
              <input style={touched.rut && !rutOk && form.rut ? inputErr : inputStyle}
                type="text" placeholder="12345678-9"
                value={form.rut} onChange={e => set('rut', formatRut(e.target.value))} onBlur={() => blur('rut')} />
              <div style={touched.rut && !rutOk && form.rut ? hintErrStyle : hintStyle}>
                {touched.rut && !rutOk && form.rut ? 'RUT inválido — revisa el dígito verificador' : 'Sin puntos, con guión'}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Fecha de nacimiento *</label>
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
            <label style={labelStyle}>Teléfono *</label>
            <input style={touched.telefono && !telValido ? inputErr : inputStyle}
              type="tel" placeholder='+56912345678 o "no"'
              value={form.telefono} onChange={e => set('telefono', e.target.value)} onBlur={() => blur('telefono')} />
            <div style={touched.telefono && !telValido ? hintErrStyle : hintStyle}>Con código país. Ej: +56912345678. Si no tienes, escribe &quot;no&quot;</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Dirección *</label>
              <input style={inputStyle} type="text" placeholder="Calle 123"
                value={form.direccion} onChange={e => set('direccion', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Comuna *</label>
              <input style={inputStyle} type="text" placeholder="Buín"
                value={form.comuna} onChange={e => set('comuna', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Talla polera</label>
              <select style={inputStyle} value={form.talla_polera} onChange={e => set('talla_polera', e.target.value)}>
                <option value="">No especificada</option>
                {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Talla short</label>
              <select style={inputStyle} value={form.talla_short} onChange={e => set('talla_short', e.target.value)}>
                <option value="">No especificada</option>
                {TALLAS_UNIFORME.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* ── Perfil deportivo — solo los clubes con el módulo (254) ──
              Ninguno es obligatorio y se dice en pantalla: quien recién entra
              puede no saber su nivel ni con qué goma juega, y eso no puede
              frenarle la inscripción. El entrenador los completa después desde
              la ficha. */}
          {perfilDeportivo && (
            <>
              <div style={section}>Perfil deportivo</div>
              <div style={{ ...hintStyle, marginTop: -6, marginBottom: 12 }}>
                Todo esto es opcional — si no lo sabes, déjalo en blanco y lo vemos en el club.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Nivel</label>
                  <select style={inputStyle} value={form.nivel} onChange={e => set('nivel', e.target.value)}>
                    <option value="">No especificado</option>
                    {NIVELES.map(n => <option key={n} value={n}>{nivelLabel(n)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Mano hábil</label>
                  <select style={inputStyle} value={form.mano_habil} onChange={e => set('mano_habil', e.target.value)}>
                    <option value="">No especificada</option>
                    {MANOS.map(m => <option key={m} value={m}>{manoLabel(m)}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Estilo de juego</label>
                <input style={inputStyle} type="text" placeholder="Ej: ofensivo de derecha, penholder, defensivo"
                  value={form.estilo_juego} onChange={e => set('estilo_juego', e.target.value)} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Material</label>
                <input style={inputStyle} type="text" placeholder="Madera y gomas. Ej: Viscaria con Tenergy 05 y pupo largo"
                  value={form.material} onChange={e => set('material', e.target.value)} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Licencia FECHITEME</label>
                <input style={inputStyle} type="text" placeholder="Número de licencia, si tienes"
                  value={form.licencia_fechiteme} onChange={e => set('licencia_fechiteme', e.target.value)} />
              </div>
            </>
          )}

          {/* ── Contacto de emergencia ── */}
          <div style={section}>Contacto de emergencia</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} type="text" placeholder="Nombre del contacto"
                value={form.contacto_emergencia_nombre} onChange={e => set('contacto_emergencia_nombre', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono *</label>
              <input style={touched.contacto_emergencia_telefono && !telEmergValido ? inputErr : inputStyle}
                type="tel" placeholder="+56912345678"
                value={form.contacto_emergencia_telefono}
                onChange={e => set('contacto_emergencia_telefono', e.target.value)}
                onBlur={() => blur('contacto_emergencia_telefono')} />
              <div style={touched.contacto_emergencia_telefono && !telEmergValido ? hintErrStyle : hintStyle}>
                Obligatorio — es el contacto ante una urgencia
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Indicaciones médicas *</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
              placeholder='Alergias, condiciones, medicamentos... Si no tienes, escribe "no"'
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
    <>
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50 }}>
        <ThemeToggle style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', borderRadius: 8 }} />
      </div>
      <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}><div style={{ color: '#94a3b8' }}>Cargando...</div></div>}>
        <RegistroForm />
      </Suspense>
    </>
  )
}
