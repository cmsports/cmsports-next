'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const mensajeGenerico = 'No fue posible registrar la asistencia. Consulta al encargado.'

type Estado = 'idle' | 'loading' | 'ok' | 'error' | 'yaRegistrado' | 'bloqueado'
type ClubAutorizado = { club_nombre: string; kiosco_nombre: string }

export default function AsistenciaPublicaPage() {
  const params = useParams()
  const clubId = params.clubId as string
  const [club, setClub] = useState<ClubAutorizado | null>(null)
  const [token, setToken] = useState('')
  const [rut, setRut] = useState('')
  const [estado, setEstado] = useState<Estado>('idle')
  const [mensaje, setMensaje] = useState('')
  const [jugadorNombre, setJugadorNombre] = useState('')
  const [horaRegistro, setHoraRegistro] = useState('')
  const [comprobando, setComprobando] = useState(true)

  useEffect(() => {
    let activo = true

    async function enlazar() {
      const storageKey = `cmsports_kiosco_token_${clubId}`
      const paramsEnlace = new URLSearchParams(window.location.hash.slice(1))
      const tokenEnlace = paramsEnlace.get('autorizar') || ''

      if (paramsEnlace.has('autorizar')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }

      let secreto = tokenEnlace
      if (/^cmsk_[0-9a-f]{64}$/.test(tokenEnlace)) {
        localStorage.setItem(storageKey, tokenEnlace)
      } else {
        secreto = localStorage.getItem(storageKey) || ''
      }

      if (!secreto || !clubId) {
        if (activo) { setEstado('bloqueado'); setComprobando(false) }
        return
      }

      const { data, error } = await supabase.rpc('autorizar_kiosco_asistencia', {
        p_club_id: clubId,
        p_token: secreto,
      })
      const autorizado = (data as ClubAutorizado[] | null)?.[0]
      if (!activo) return

      if (error || !autorizado) {
        setEstado('bloqueado')
        setComprobando(false)
        return
      }

      setToken(secreto)
      setClub(autorizado)
      setEstado('idle')
      setComprobando(false)
    }

    void enlazar()
    return () => { activo = false }
  }, [clubId])

  function formatRut(value: string) {
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
    if (clean.length <= 1) return clean
    const dv = clean.slice(-1)
    const num = clean.slice(0, -1)
    return `${num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
  }

  async function registrar() {
    if (!token || !club) { setEstado('bloqueado'); return }
    if (!rut || rut.length < 5) { setEstado('error'); setMensaje('Ingresa tu RUT completo'); return }

    setEstado('loading')
    const { data, error } = await supabase.rpc('registrar_asistencia_rut', {
      p_club_id: clubId,
      p_rut: rut,
      p_token: token,
    })

    const resultado = (data as Array<{
      jugador_nombre: string
      hora_registro: string
      ya_registrada: boolean
    }> | null)?.[0]

    if (error || !resultado) {
      setEstado('error')
      setMensaje(mensajeGenerico)
      return
    }

    setJugadorNombre(resultado.jugador_nombre)
    setHoraRegistro(resultado.hora_registro?.slice(0, 5) || '')
    setEstado(resultado.ya_registrada ? 'yaRegistrado' : 'ok')
  }

  if (comprobando) return (
    <div style={{ minHeight: '100vh', background: '#a9bac8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted }}>
      Verificando dispositivo…
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#a9bac8', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:72, height:72, background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:26, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:22, fontWeight:800, color: text }}>Registro de asistencia</div>
          <div style={{ fontSize:14, color: muted, marginTop:6 }}>{club?.club_nombre || 'CmSports'}</div>
          {club?.kiosco_nombre && <div style={{ fontSize:11, color: hint, marginTop:3 }}>{club.kiosco_nombre}</div>}
          <div style={{ fontSize:12, color: hint, marginTop:4 }}>
            {new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>

        {estado === 'bloqueado' && (
          <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:20, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#9a3412', marginBottom:8 }}>Dispositivo no autorizado</div>
            <div style={{ fontSize:13, color: muted, lineHeight:1.6 }}>
              El administrador debe abrir en este dispositivo un enlace de autorización generado desde Configuración.
            </div>
          </div>
        )}

        {estado === 'yaRegistrado' && (
          <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:20, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#3730a3', marginBottom:8 }}>Ya registraste hoy</div>
            {jugadorNombre && <div style={{ fontSize:16, color: text, marginBottom:8 }}>{jugadorNombre}</div>}
            {horaRegistro && <div style={{ fontSize:13, color: muted, marginBottom:16 }}>Hora de ingreso: {horaRegistro}</div>}
            <div style={{ fontSize:12, color: muted, lineHeight:1.6 }}>Si hay un problema, avisa al encargado.</div>
          </div>
        )}

        {estado === 'ok' && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#16a34a', marginBottom:8 }}>¡Asistencia registrada!</div>
            <div style={{ fontSize:18, color: text, marginBottom:6 }}>{jugadorNombre}</div>
            <div style={{ fontSize:14, color: muted, marginBottom:16 }}>Hora: {horaRegistro}</div>
            <div style={{ fontSize:13, color:'#16a34a' }}>Que tengas un buen entrenamiento 🏓</div>
          </div>
        )}

        {(estado === 'idle' || estado === 'loading' || estado === 'error') && club && (
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:20, padding:28, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:14, color: muted, marginBottom:20, textAlign:'center' }}>Ingresa tu RUT para registrar tu asistencia</div>

            {estado === 'error' && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#dc2626', marginBottom:16, textAlign:'center' }}>
                {mensaje}
              </div>
            )}

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, color: muted, display:'block', marginBottom:8 }}>RUT</label>
              <input
                style={{ width:'100%', background:'#f4f7fa', border:'2px solid #e2e8f0', borderRadius:12, padding:'16px', color: text, fontSize:22, outline:'none', textAlign:'center', letterSpacing:2, fontFamily:'monospace' }}
                placeholder="12.345.678-9"
                value={rut}
                onChange={e => setRut(formatRut(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && void registrar()}
                maxLength={12}
                autoFocus
                inputMode="text"
                autoComplete="off"
              />
            </div>

            <button onClick={() => void registrar()} disabled={estado === 'loading'} style={{ width:'100%', padding:18, background: estado === 'loading' ? '#94a3b8' : '#f43f5e', color:'white', border:'none', borderRadius:12, fontSize:17, fontWeight:700, cursor: estado === 'loading' ? 'not-allowed' : 'pointer' }}>
              {estado === 'loading' ? 'Verificando...' : 'Registrar asistencia →'}
            </button>
            <div style={{ textAlign:'center', marginTop:16, fontSize:12, color: hint }}>¿Problemas? Avisa al encargado del club</div>
          </div>
        )}
      </div>
    </div>
  )
}
