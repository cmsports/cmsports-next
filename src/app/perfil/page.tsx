'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { User } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PerfilPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugador, setJugador] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.jugador_id) {
        const { data: j } = await supabase.from('jugadores').select('*').eq('id', p.jugador_id).single()
        setJugador(j)
        const { data: a } = await supabase.from('asistencia').select('*').eq('jugador_id', p.jugador_id).order('fecha', { ascending: false }).limit(10)
        setAsistencias(a || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Skeleton width="200px" height="1.5rem" />
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <Card className="text-center py-10">
        <EmptyState
          icon={User}
          title="Perfil no vinculado"
          description="Contacta al administrador del club"
        />
      </Card>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1e1b4b] to-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--purple-light)] flex items-center justify-center text-[22px] font-extrabold text-white shrink-0">
            {iniciales}
          </div>
          <div>
            <div className="text-[22px] font-bold text-[var(--text)] mb-1">{jugador.nombre}</div>
            <div className="text-sm text-[var(--text-muted)]">{jugador.categoria}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="ELO" value={jugador.elo} className="bg-[#1e1b4b] border-0" />
          <StatCard label="Sesiones" value={`${jugador.sesiones_usadas}/${jugador.sesiones_limite}`} className="bg-[#1e1b4b] border-0" />
        </div>
      </div>

      {/* Últimas asistencias */}
      <Card noPadding>
        <CardHeader title="Últimas asistencias" />
        <div className="px-5 pb-5">
          {asistencias.length === 0 ? (
            <EmptyState title="Sin asistencias registradas" />
          ) : asistencias.map(a => (
            <div key={a.id} className="flex justify-between py-3 border-b border-[var(--border)]/50 last:border-0">
              <span className="text-sm text-[var(--text)]">{a.fecha}</span>
              <span className="text-sm text-[var(--text-muted)]">{a.hora?.slice(0,5)}</span>
            </div>
          ))}
        </div>
      </Card>
    </AppLayout>
  )
}
