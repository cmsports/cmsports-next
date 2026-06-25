'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'

const supabase = createClient()

const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Estado = 'idle' | 'loading' | 'ok' | 'error' | 'yaRegistrado' | 'bloqueado'

export default function AsistenciaPublicaPage() {
  const params = useParams()
  const clubId = params.clubId as string

  const [club, setClub] = useState<any>(null)
  const [rut, setRut] = useState('')
  const [estado, setEstado] = useState<Estado>('idle')
  const [mensaje, setMensaje] = useState('')
  const [jugadorNombre, setJugadorNombre] = useState('')
  const [horaRegistro, setHoraRegistro] = useState('')
  const [mounted, setMounted] = useState(false)

  const hoy = new Date().toISOString().slice(0, 10)
  const STORAGE_KEY = `cmsports_asistencia_${clubId}_${hoy}`

  useEffect(() => {
    setMounted(true)

    const registroHoy = localStorage.getItem(STORAGE_KEY)
    if (registroHoy) {
      try {
        const data = JSON.parse(registroHoy)
        setJugadorNombre(data.nombre)
        setHoraRegistro(data.hora)
        setEstado('bloqueado')
      } catch {
        setEstado('bloqueado')
      }
    }

    async function cargarClub() {
      const { data } = await supabase.from('clubes').select('nombre').eq('id', clubId).single()
      setClub(data)
    }
    if (clubId) cargarClub()
  }, [clubId])

  function formatRut(value: string) {
    const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
    if (clean.length <= 1) return clean
    const dv = clean.slice(-1)
    const num = clean.slice(0, -1)
    const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${formatted}-${dv}`
  }

  async function registrar() {
    if (!rut || rut.length < 5) { setEstado('error'); setMensaje('Ingresa tu RUT completo'); return }

    const registroHoy = localStorage.getItem(STORAGE_KEY)
    if (registroHoy) {
      try {
        const data = JSON.parse(registroHoy)
        setJugadorNombre(data.nombre)
        setHoraRegistro(data.hora)
      } catch {}
      setEstado('bloqueado')
      return
    }

    setEstado('loading')

    const rutSinFormato = rut.replace(/\./g, '').replace('-', '').toLowerCase()
    const rutNumeros = rutSinFormato.slice(0, -1)
    const { data: jugadores } = await supabase.from('jugadores')
      .select('id,nombre,sesiones_usadas,sesiones_limite,estado,rut')
      .eq('club_id', clubId)

    const jugador = jugadores?.find(j => {
      if (!j.rut) return false
      const jRut = j.rut.replace(/\./g, '').replace('-', '').toLowerCase()
      return jRut === rutSinFormato || jRut.slice(0, -1) === rutNumeros
    })

    if (!jugador) {
      setEstado('error')
      setMensaje('RUT no encontrado. Consulta al encargado del club.')
      return
    }

    if (jugador.estado !== 'activo') {
      setEstado('error')
      setMensaje('Tu cuenta está bloqueada. Consulta al encargado.')
      return
    }

    const { data: asistHoy } = await supabase.from('asistencia')
      .select('id').eq('jugador_id', jugador.id).eq('fecha', hoy).maybeSingle()

    if (asistHoy) {
      const hora = new Date().toTimeString().slice(0, 5)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nombre: jugador.nombre, hora }))
      setJugadorNombre(jugador.nombre)
      setHoraRegistro(hora)
      setEstado('bloqueado')
      return
    }

    if (jugador.sesiones_usadas >= jugador.sesiones_limite && jugador.sesiones_limite > 0) {
      setEstado('error')
      setMensaje('No tienes sesiones disponibles este mes. Contacta al encargado.')
      return
    }

    const hora = new Date().toTimeString().slice(0, 5)
    await supabase.from('asistencia').insert({
      club_id: clubId, jugador_id: jugador.id, fecha: hoy, hora
    })
    if (jugador.sesiones_limite > 0) {
      await supabase.from('jugadores').update({ sesiones_usadas: jugador.sesiones_usadas + 1 }).eq('id', jugador.id)
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nombre: jugador.nombre, hora, jugadorId: jugador.id }))

    setJugadorNombre(jugador.nombre)
    setHoraRegistro(hora)
    setEstado('ok')
  }

  if (!mounted) return null

  return (
    <div style={{ minHeight:'100vh', background:'#a9bac8', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:400 }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:72, height:72, background:'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:26, color:'white', margin:'0 auto 16px' }}>CM</div>
          <div style={{ fontSize:22, fontWeight:800, color: text }}>Registro de asistencia</div>
          <div style={{ fontSize:14, color: muted, marginTop:6 }}>{club?.nombre || '...'}</div>
          <div style={{ fontSize:12, color: hint, marginTop:4 }}>
            {new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>

        {/* Bloqueado */}
        {estado === 'bloqueado' && (
          <div style={{ background:'#ede9fe', border:'1px solid #c4b5fd', borderRadius:20, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
            <div style={{ fontSize:20, fontWeight:700, color:'#3730a3', marginBottom:8 }}>Ya registraste hoy</div>
            {jugadorNombre && <div style={{ fontSize:16, color: text, marginBottom:8 }}>{jugadorNombre}</div>}
            {horaRegistro && <div style={{ fontSize:13, color: muted, marginBottom:16 }}>Hora de ingreso: {horaRegistro}</div>}
            <div style={{ fontSize:12, color: muted, lineHeight:1.6 }}>
              Solo se permite un registro por día por dispositivo. Si hay un problema, avisa al encargado.
            </div>
          </div>
        )}

        {/* OK */}
        {estado === 'ok' && (
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:32, textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#16a34a', marginBottom:8 }}>¡Asistencia registrada!</div>
            <div style={{ fontSize:18, color: text, marginBottom:6 }}>{jugadorNombre}</div>
            <div style={{ fontSize:14, color: muted, marginBottom:16 }}>Hora: {horaRegistro}</div>
            <div style={{ fontSize:13, color:'#16a34a' }}>Que tengas un buen entrenamiento 🏓</div>
          </div>
        )}

        {/* Formulario */}
        {(estado === 'idle' || estado === 'loading' || estado === 'error') && (
          <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:20, padding:28, boxShadow:'0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:14, color: muted, marginBottom:20, textAlign:'center' }}>
              Ingresa tu RUT para registrar tu asistencia
            </div>

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
                onKeyDown={e => e.key === 'Enter' && registrar()}
                maxLength={12}
                autoFocus
                inputMode="numeric"
              />
            </div>

            <button
              onClick={registrar}
              disabled={estado === 'loading'}
              style={{ width:'100%', padding:18, background: estado === 'loading' ? '#94a3b8' : '#f43f5e', color:'white', border:'none', borderRadius:12, fontSize:17, fontWeight:700, cursor: estado === 'loading' ? 'not-allowed' : 'pointer', transition:'all 0.15s' }}
            >
              {estado === 'loading' ? 'Verificando...' : 'Registrar asistencia →'}
            </button>

            <div style={{ textAlign:'center', marginTop:16, fontSize:12, color: hint }}>
              ¿Problemas? Avisa al encargado del club
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
