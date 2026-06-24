'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { RankingDivision } from '@/components/liga/RankingDivision'

const supabase = createClient()
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

export default function RankingDivisionPage() {
  const params = useParams<{ divisionId: string }>()
  const divisionId = params.divisionId
  const { perfil } = usePerfil()
  const router = useRouter()

  const [division, setDivision] = useState<{ nombre: string; ligaId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('liga_divisiones').select('nombre, liga_id').eq('id', divisionId).single().then(({ data }) => {
      if (data) setDivision({ nombre: data.nombre, ligaId: data.liga_id })
      setLoading(false)
    })
  }, [divisionId])

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )
  if (!division) return <AppLayout perfil={perfil}><div style={{ padding:24, color: muted, fontSize:13 }}>División no encontrada</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <button onClick={() => router.push(`/liga/${division.ligaId}`)} style={{ background:'transparent', border:'none', color: muted, fontSize:12, cursor:'pointer', padding:0, marginBottom:8 }}>
        ← Volver a la liga
      </button>
      <h1 style={{ fontSize:20, fontWeight:600, color: text, marginBottom:16 }}>🏆 Ranking — {division.nombre}</h1>
      <RankingDivision divisionId={divisionId} nombreDivision={division.nombre} />
    </AppLayout>
  )
}
