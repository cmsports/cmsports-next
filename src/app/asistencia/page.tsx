'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AsistenciaPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const router = useRouter()

  const hoy = new Date().toISOString().slice(0,10)
  const hora = new Date().toTimeString().slice(0,5)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      setClubId(p?.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!clubId) return
    cargarDatos()
  }, [clubId])

  async function cargarDatos() {
    const [{ data: j }, { data: a }] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', clubId).eq('estado', 'activo').order('nombre'),
      supabase.from('asistencia').select('*').eq('club_id', clubId).eq('fecha', hoy).order('hora', { ascending: false })
    ])
    setJugadores(j || [])
    setAsistencias(a || [])
  }

  async function registrarAsistencia(jugador: any) {
    // Verificar si ya registró hoy
    const yaRegistro = asistencias.find(a => a.jugador_id === jugador.id)
    if (yaRegistro) { alert(`${jugador.nombre} ya registró asistencia hoy`); return }

    // Verificar sesiones disponibles
    if (jugador.sesiones_usadas >= jugador.sesiones_limite) {
      alert(`${jugador.nombre} no tiene sesiones disponibles este mes`); return
    }

    setRegistrando(jugador.id)
    await supabase.from('asistencia').insert({
      club_id: clubId, jugador_id: jugador.id, fecha: hoy, hora: hora
    })
    await supabase.from('jugadores').update({ sesiones_usadas: jugador.sesiones_usadas + 1 }).eq('id', jugador.id)
    await cargarDatos()
    setRegistrando(null)
    setBusqueda('')
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const registradosHoy = new Set(asistencias.map(a => a.jugador_id))

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>QR Asistencia</h1>
        <p style={{ fontSize:13, color:'#6c7280' }}>Hoy {hoy} · {asistencias.length} registros</p>
      </div>

      {/* Buscador */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Registro manual</div>
        <input
          style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none', marginBottom:10 }}
          placeholder="Buscar jugador para registrar..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
        {busqueda && (
          <div style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, overflow:'hidden' }}>
            {filtrados.slice(0,5).map(j => {
              const yaRegistro = registradosHoy.has(j.id)
              return (
                <div
                  key={j.id}
                  onClick={() => !yaRegistro && registrarAsistencia(j)}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'12px 16px', borderBottom:'1px solid #1e2030',
                    cursor: yaRegistro ? 'default' : 'pointer',
                    opacity: yaRegistro ? 0.6 : 1
                  }}
                >
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#c8cfe0' }}>{j.nombre}</div>
                    <div style={{ fontSize:11, color:'#6c7280' }}>{j.sesiones_usadas}/{j.sesiones_limite} sesiones · {j.categoria}</div>
                  </div>
                  {yaRegistro
                    ? <span style={{ background:'#34d39922', color:'#34d399', padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Ya registrado</span>
                    : registrando === j.id
                    ? <span style={{ color:'#6c7280', fontSize:12 }}>Registrando...</span>
                    : <button style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:600 }}>✓ Registrar</button>
                  }
                </div>
              )
            })}
            {filtrados.length === 0 && <div style={{ padding:16, color:'#6c7280', fontSize:13, textAlign:'center' }}>Sin resultados</div>}
          </div>
        )}
      </div>

      {/* Asistencias de hoy */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Asistencias de hoy ({asistencias.length})
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>Sin asistencias registradas hoy</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2030' }}>
                {['Jugador','Hora'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {asistencias.map(a => {
                const jug = jugadores.find(j => j.id === a.jugador_id)
                return (
                  <tr key={a.id} style={{ borderBottom:'1px solid #1e2030' }}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0' }}>{jug?.nombre || '—'}</td>
                    <td style={{ padding:'12px 16px', fontSize:13, color:'#6c7280' }}>{a.hora?.slice(0,5)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  )
}
