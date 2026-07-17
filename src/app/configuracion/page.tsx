'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { actualizarClubAction } from '@/app/actions/club'
import { subirLogoAction, actualizarInfoClubAction } from '@/app/actions/redes-sociales'
import { Building2, Upload, Loader2, Check, Lock } from 'lucide-react'
import GestionProfesores from '@/components/configuracion/GestionProfesores'
import GestionKioscos from '@/components/configuracion/GestionKioscos'
import PerfilPersonalConfig from '@/components/configuracion/PerfilPersonalConfig'

const C = {
  card: '#ffffff', border: '#e2e8f0',
  text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  sky: '#4f46e5', skyL: '#ede9fe', skyD: '#3730a3',
  green: '#16a34a', greenL: '#f0fdf4',
}

const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const labelStyle = { fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6, display: 'block' } as const
const inputStyle = { width: '100%', padding: '9px 11px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' } as const

export default function ConfiguracionPage() {
  const { perfil, loading: authLoading, refetchPerfil } = usePerfil()
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [deporte, setDeporte] = useState('')
  const [mensualidadBase, setMensualidadBase] = useState('25000')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [clubCargadoId, setClubCargadoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [pwActual, setPwActual] = useState('')
  const [pwNueva, setPwNueva] = useState('')
  const [pwConfirmar, setPwConfirmar] = useState('')
  const [cambiandoPw, setCambiandoPw] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwExito, setPwExito] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol !== 'admin' || !perfil.club_id) return

    let activo = true
    const supabase = createClient()
    supabase.from('clubes').select('nombre,ciudad,deporte,mensualidad_base,direccion,telefono,logo_url')
      .eq('id', perfil.club_id).single().then(({ data }) => {
        if (!activo) return
        if (data) {
          setNombre(data.nombre || '')
          setCiudad(data.ciudad || '')
          setDeporte(data.deporte || '')
          setMensualidadBase(String(data.mensualidad_base ?? 25000))
          setDireccion(data.direccion || '')
          setTelefono(data.telefono || '')
          setLogoUrl(data.logo_url || null)
        }
        setClubCargadoId(perfil.club_id)
      })
    return () => { activo = false }
  }, [authLoading, perfil, router])

  async function guardar() {
    setGuardando(true)
    setErrorMsg('')
    setGuardado(false)

    const [resClub, resInfo] = await Promise.all([
      actualizarClubAction({ nombre, ciudad, deporte, mensualidadBase: Number(mensualidadBase) || 0 }),
      actualizarInfoClubAction(direccion, telefono),
    ])

    if (resClub?.error) setErrorMsg(resClub.error)
    else if (resInfo?.error) setErrorMsg(resInfo.error)
    else {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    }
    setGuardando(false)
  }

  async function onSubirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendoLogo(true)
    const fd = new FormData()
    fd.append('archivo', archivo)
    const res = await subirLogoAction(fd)
    if (!res?.error && perfil?.club_id) {
      const supabase = createClient()
      const { data } = await supabase.from('clubes').select('logo_url').eq('id', perfil.club_id).single()
      if (data?.logo_url) setLogoUrl(data.logo_url)
    }
    setSubiendoLogo(false)
  }

  async function cambiarPassword() {
    setPwError('')
    setPwExito(false)
    if (!pwActual) { setPwError('Ingresa tu contraseña actual'); return }
    if (pwNueva.length < 6) { setPwError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (pwNueva !== pwConfirmar) { setPwError('Las contraseñas no coinciden'); return }

    setCambiandoPw(true)
    const supabase = createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: perfil!.email!,
      password: pwActual,
    })
    if (signInError) {
      setPwError('La contraseña actual es incorrecta')
      setCambiandoPw(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: pwNueva })
    setCambiandoPw(false)
    if (updateError) {
      setPwError(updateError.message)
      return
    }

    setPwExito(true)
    setPwActual('')
    setPwNueva('')
    setPwConfirmar('')
    setTimeout(() => setPwExito(false), 3000)
  }

  const loading = authLoading || (
    perfil?.rol === 'admin' && !!perfil.club_id && clubCargadoId !== perfil.club_id
  )

  if (loading) return (
    <AppLayout perfil={perfil}>
      <div style={{ color: C.hint, fontSize: 14 }}>Cargando...</div>
    </AppLayout>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 2 }}>Configuración</h1>
        <p style={{ fontSize: 12, color: C.hint }}>Administra tus datos y seguridad{perfil?.rol === 'admin' ? ', además de la configuración del club' : ''}</p>
      </div>

      {perfil && <PerfilPersonalConfig perfil={perfil} refetchPerfil={refetchPerfil} />}

      {perfil?.rol === 'admin' && <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16, maxWidth: 760, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Building2 size={16} color={C.sky} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Datos del club</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nombre del club</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} placeholder="Club Unión San Bernardo" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Ciudad</label>
              <input value={ciudad} onChange={e => setCiudad(e.target.value)} style={inputStyle} placeholder="San Bernardo" />
            </div>
            <div>
              <label style={labelStyle}>Deporte</label>
              <input value={deporte} onChange={e => setDeporte(e.target.value)} style={inputStyle} placeholder="Tenis de mesa" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input value={direccion} onChange={e => setDireccion(e.target.value)} style={inputStyle} placeholder="Nogales 264" />
            </div>
            <div>
              <label style={labelStyle}>Teléfono</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value)} style={inputStyle} placeholder="+56 9 1234 5678" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Mensualidad base</label>
            <input
              type="number" min={0} value={mensualidadBase}
              onChange={e => setMensualidadBase(e.target.value)}
              style={{ ...inputStyle, maxWidth: 180 }}
            />
            <p style={{ fontSize: 11, color: C.hint, marginTop: 4 }}>
              Monto por defecto usado para generar mensualidades y calcular el dashboard de tu club.
            </p>
          </div>

          {errorMsg && (
            <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              {errorMsg}
            </div>
          )}

          <button onClick={guardar} disabled={guardando} style={{
            background: guardado ? C.greenL : C.sky, color: guardado ? C.green : 'white',
            border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600,
            cursor: guardando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {guardando ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : guardado ? <Check size={14} /> : null}
            {guardando ? 'Guardando...' : guardado ? 'Guardado' : 'Guardar cambios'}
          </button>
        </div>

        <div style={cardStyle}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14, display: 'block' }}>Logo</span>
          <div style={{
            width: '100%', height: 120, borderRadius: 10, background: C.skyL, marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {logoUrl
              ? <Image src={logoUrl} alt="Logo del club" width={640} height={120} unoptimized style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <Building2 size={28} color={C.skyD} />}
          </div>
          <button onClick={() => logoInputRef.current?.click()} disabled={subiendoLogo} style={{
            width: '100%', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 8, padding: '8px', fontSize: 12, cursor: subiendoLogo ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {subiendoLogo ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
            {logoUrl ? 'Cambiar logo' : 'Subir logo'}
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSubirLogo} />
        </div>
      </div>

      {perfil.club_id && <GestionProfesores clubId={perfil.club_id} />}
      {perfil.club_id && <GestionKioscos />}
      </>}

      {/* ── Cambiar contraseña ── */}
      <div style={{ maxWidth: 760, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Lock size={16} color={C.sky} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Cambiar contraseña</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Contraseña actual</label>
            <input type="password" value={pwActual} onChange={e => setPwActual(e.target.value)} style={inputStyle} placeholder="Tu contraseña actual" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Nueva contraseña</label>
              <input type="password" value={pwNueva} onChange={e => setPwNueva(e.target.value)} style={inputStyle} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label style={labelStyle}>Confirmar nueva contraseña</label>
              <input type="password" value={pwConfirmar} onChange={e => setPwConfirmar(e.target.value)} style={inputStyle} placeholder="Repetir nueva contraseña" />
            </div>
          </div>

          {pwError && (
            <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              {pwError}
            </div>
          )}
          {pwExito && (
            <div style={{ background: C.greenL, color: C.green, borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
              Contraseña actualizada correctamente
            </div>
          )}

          <button onClick={cambiarPassword} disabled={cambiandoPw} style={{
            background: C.sky, color: 'white',
            border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600,
            cursor: cambiandoPw ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {cambiandoPw ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Lock size={14} />}
            {cambiandoPw ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </AppLayout>
  )
}
