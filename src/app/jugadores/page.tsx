'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function JugadoresPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.club_id) {
        const { data: j } = await supabase.from('jugadores').select('*').eq('club_id', p.club_id).order('elo', { ascending: false })
        setJugadores(j || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const esAdmin = perfil?.rol === 'admin'
  const esProfesor = perfil?.rol === 'profesor'

  const badgeCategoria: Record<string, string> = {
    principiante: '#fbbf24',
    intermedio: '#60a5fa',
    avanzado: '#a78bfa'
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#fff' }}>Jugadores</h1>
        {esAdmin && (
          <button style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Nuevo jugador
          </button>
        )}
      </div>

      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, padding:16, marginBottom:16 }}>
        <input
          style={{ width:'100%', background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:14, outline:'none' }}
          placeholder="Buscar jugador..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:12, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1e2030' }}>
              {['#','Nombre','RUT','Categoría','Sesiones','ELO','Estado',''].map(h => (
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, color:'#6c7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((j, i) => (
              <tr key={j.id} style={{ borderBottom:'1px solid #1e2030' }}>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{String(i+1).padStart(3,'0')}</td>
                <td style={{ padding:'12px 16px', fontWeight:600, color:'#c8cfe0' }}>{j.nombre}</td>
                <td style={{ padding:'12px 16px', fontSize:12, color:'#6c7280' }}>{j.rut || '—'}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ background: badgeCategoria[j.categoria] + '22', color: badgeCategoria[j.categoria], padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                    {j.categoria}
                  </span>
                </td>
                <td style={{ padding:'12px 16px', fontSize:13, color:'#c8cfe0' }}>{j.sesiones_usadas}/{j.sesiones_limite}</td>
                <td style={{ padding:'12px 16px', fontWeight:700, color:'#a78bfa', fontFamily:'monospace' }}>{j.elo}</td>
                <td style={{ padding:'12px 16px' }}>
                  <span style={{ background: j.estado === 'activo' ? '#34d39922' : '#f8717122', color: j.estado === 'activo' ? '#34d399' : '#f87171', padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                    {j.estado}
                  </span>
                </td>
                <td style={{ padding:'12px 16px' }}>
                  <button
                    onClick={() => router.push(`/jugadores/${j.id}`)}
                    style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}
                  >
                    Ver perfil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div style={{ padding:40, textAlign:'center', color:'#6c7280', fontSize:13 }}>
            {busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
