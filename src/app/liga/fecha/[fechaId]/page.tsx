'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { TableroFecha } from '@/components/liga/TableroFecha'

const supabase = createClient()
const muted = '#64748b'
const hint = '#94a3b8'

// Vista operativa del juez: todos los partidos de todas las divisiones de
// una fecha. Es el mismo tablero embebido en la pestaña "Programación" de
// cada división, aquí sin filtrar — para que el juez vea todo a la vez.
export default function FechaProgramacionPage() {
  const params = useParams<{ fechaId: string }>()
  const fechaId = params.fechaId
  const { perfil } = usePerfil()
  const router = useRouter()

  const [liga, setLiga] = useState<{ id: string; nombre: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('liga_fechas').select('liga_id, ligas(nombre)').eq('id', fechaId).single().then(({ data }) => {
      if (data) {
        const ligaRel = Array.isArray(data.ligas) ? data.ligas[0] : data.ligas
        setLiga({ id: data.liga_id, nombre: ligaRel?.nombre ?? '' })
      }
      setLoading(false)
    })
  }, [fechaId])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {liga && (
        <button onClick={() => router.push(`/liga/${liga.id}`)} style={{ background:'transparent', border:'none', color: muted, fontSize:12, cursor:'pointer', padding:0, marginBottom:8 }}>
          ← Volver a {liga.nombre || 'la liga'}
        </button>
      )}
      <TableroFecha fechaId={fechaId} />
    </AppLayout>
  )
}
