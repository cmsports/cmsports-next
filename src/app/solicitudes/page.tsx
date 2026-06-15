'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient()

export default function SolicitudesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [linkInvitacion, setLinkInvitacion] = useState('')
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const router = useRouter()

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
    cargarSolicitudes()
  }, [clubId])

  async function cargarSolicitudes() {
    // Obtener o crear link de invitación
    let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
    if (!inv?.length) {
      await supabase.from('invitaciones').insert({ club_id: clubId })
      const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      inv = newInv
    }
    const codigo = inv?.[0]?.codigo || ''
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cmsports-next.vercel.app'
    setLinkInvitacion(`${origin}/registro?club=${clubId}&code=${codigo}`)

    // Cargar solicitudes
    const { data } = await supabase.from('solicitudes_jugador').select('*').eq('club_id', clubId).order('creado_en', { ascending: false })
    setSolicitudes(data || [])
  }

  async function aprobar(s: any) {
    await supabase.from('jugadores').insert({
      club_id: clubId, nombre: s.nombre, rut: s.rut || null,
      email: s.email || null, telefono: s.telefono || null,
      categoria: 'principiante', sesiones_limite: 12,
      elo: 1200, sesiones_usadas: 0, estado: 'activo', es_externo: false
    })
    await supabase.from('solicitudes_jugador').update({ estado: 'aprobado' }).eq('id', s.id)
    cargarSolicitudes()
  }

  async function rechazar(id: string) {
    if (!confirm('¿Rechazar esta solicitud?')) return
    await supabase.from('solicitudes_jugador').update({ estado: 'rechazado' }).eq('id', id)
    cargarSolicitudes()
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkInvitacion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const estadoColor: Record<string, string> = {
    pendiente: '#fbbf24', aprobado: '#34d399', rechazado: '#f87171'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:20 }}>Solicitudes de jugadores</h1>

      {/* Link de invitación */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:12 }}>Link de invitación</div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#a78bfa', wordBreak:'break-all' }}>
            {linkInvitacion}
          </div>
          <button
            onClick={copiarLink}
            style={{ background: copiado ? '#34d39922' : '#1e1b4b', color: copiado ? '#34d399' : '#a78bfa', border:'1px solid #1e2030', borderRadius:8, padding:'10px 16px', fontSize:12, cursor:'pointer', fontWeight:600, whiteSpace:'nowrap' }}
          >
            {copiado ? '✓ Copiado' : '📋 Copiar'}
          </button>
        </div>
        <div style={{ fontSize:12, color:'#6c7280', marginTop:8 }}>Comparte este link con los jugadores que quieran unirse al club</div>
      </div>

      {/* Solicitudes */}
      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1e2030', fontSize:13, fontWeight:600, color:'#fff' }}>
          Solicitudes pendientes
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1e2030' }}>
              {['Nombre','RUT','Email','Teléfono','Fecha','Estado','Acciones'].map(h => (
                <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map(s => (
              <tr key={s.id} style={{ borderBottom:'1px solid #1e2030' }}>
                <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0' }}>{s.nombre}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.rut || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.email || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{s.telefono || '—'}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{new Date(s.creado_en).toLocaleDateString('es-CL')}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ background: estadoColor[s.estado] + '22', color: estadoColor[s.estado], padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                    {s.estado}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  {s.estado === 'pendiente' && (
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => aprobar(s)} style={{ background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer', fontWeight:600 }}>✓ Aprobar</button>
                      <button onClick={() => rechazar(s.id)} style={{ background:'#f8717122', color:'#f87171', border:'1px solid #f8717144', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {solicitudes.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>No hay solicitudes aún</div>
        )}
      </div>
    </AppLayout>
  )
}
