'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { Card, CardHeader, Button, Input, Badge, EmptyState } from '@/components/ui'
import { crearLiga } from '@/app/actions/liga'
import { Swords, Plus } from 'lucide-react'

const supabase = createClient()

interface Liga {
  id: string
  nombre: string
  estado: string
  creado_en: string
}

export default function LigaPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [ligas, setLigas] = useState<Liga[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.club_id) cargar(perfil.club_id)
    else setLoading(false)
  }, [authLoading, perfil])

  async function cargar(clubId: string) {
    const { data } = await supabase.from('ligas').select('id, nombre, estado, creado_en').eq('club_id', clubId).order('creado_en', { ascending: false })
    setLigas(data || [])
    setLoading(false)
  }

  async function handleCrear() {
    if (!nombre.trim()) return
    setCreando(true)
    setError('')
    const res = await crearLiga({ nombre })
    setCreando(false)
    if (res.error) { setError(res.error); return }
    setNombre('')
    if (res.ligaId) router.push(`/liga/${res.ligaId}`)
  }

  if (loading) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Cargando…</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Swords className="size-5 text-[var(--text)]" />
          <h1 className="text-xl font-semibold text-[var(--text)]">Liga de Mesa</h1>
        </div>

        <Card>
          <CardHeader title="Nueva liga" subtitle="Crea una temporada de liga presencial por divisiones" />
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input placeholder="Ej: Liga Invierno 2026" value={nombre} onChange={e => setNombre(e.target.value)} />
            </div>
            <Button onClick={handleCrear} loading={creando} icon={Plus}>Crear liga</Button>
          </div>
          {error && <p className="text-xs text-[var(--red)] mt-2">{error}</p>}
        </Card>

        {ligas.length === 0 ? (
          <EmptyState title="Sin ligas todavía" description="Crea tu primera liga para empezar a armar divisiones y fixture" />
        ) : (
          <div className="grid gap-3">
            {ligas.map(liga => (
              <Card key={liga.id} className="cursor-pointer hover:border-[var(--sky)] transition-colors" onClick={() => router.push(`/liga/${liga.id}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-[var(--text)]">{liga.nombre}</div>
                    <div className="text-xs text-[var(--text-muted)]">Creada el {new Date(liga.creado_en).toLocaleDateString('es-CL')}</div>
                  </div>
                  <Badge variant={liga.estado === 'en_curso' ? 'success' : liga.estado === 'finalizada' ? 'default' : 'info'}>
                    {liga.estado === 'planificacion' ? 'Planificación' : liga.estado === 'en_curso' ? 'En curso' : 'Finalizada'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
