'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Users, Trophy, AlertTriangle, TrendingUp, DollarSign, TrendingDown, Link2, Inbox, Calendar, Copy, Check } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [kpis, setKpis] = useState<any>({})
  const [ultimasAsist, setUltimasAsist] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ddOpen, setDdOpen] = useState<string | null>(null)
  const [ddData, setDdData] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      if (p?.rol === 'jugador') { router.push('/perfil'); return }
      if (p?.rol === 'profesor') { router.push('/dashboard-profesor'); return }
      if (p?.club_id) await cargarDatos(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarDatos(cid: string) {
    const mesActual = new Date().getMonth() + 1
    const anioActual = new Date().getFullYear()
    const mesInicio = `${anioActual}-${String(mesActual).padStart(2,'0')}-01`

    const [
      { data: jugsData },
      { data: torneos },
      { data: mensualidades },
      { data: movimientos },
      { data: solicitudesData },
    ] = await Promise.all([
      supabase.from('jugadores').select('*').eq('club_id', cid).neq('es_externo', true),
      supabase.from('torneos').select('*').eq('club_id', cid).eq('estado', 'en_curso'),
      supabase.from('mensualidades').select('*').eq('club_id', cid).eq('mes', mesActual).eq('anio', anioActual),
      supabase.from('movimientos').select('*').eq('club_id', cid).gte('fecha', mesInicio),
      supabase.from('solicitudes_jugador').select('*').eq('club_id', cid).eq('estado', 'pendiente'),
    ])

    const activos = (jugsData || []).filter(j => j.estado === 'activo')
    const morosos = (mensualidades || []).filter(m => m.estado === 'pendiente' || m.estado === 'atrasado')
    const gastos = (movimientos || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0) || 0
    const ingresos = (movimientos || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0) || 0
    const coa = activos.length > 0 ? Math.round(gastos / activos.length) : 0
    const tm = activos.length > 0 ? Math.round((morosos.length / activos.length) * 100) : 0

    setKpis({ activos: activos.length, tm, coa, ingresos, gastos, torneos: torneos?.length || 0, morosos, jugadores: activos, mensualidadBase: 25000 })
    setJugadores(activos)
    setSolicitudes(solicitudesData || [])

    const { data: asistMes } = await supabase.from('asistencia').select('*,jugadores(nombre)').eq('club_id', cid).gte('fecha', mesInicio).order('fecha', { ascending: false }).limit(5)
    setUltimasAsist(asistMes || [])
  }

  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Skeleton width="200px" height="1.5rem" />
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <h1 className="text-[22px] font-bold text-[var(--text)] mb-5">Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3.5 mb-4">
        <StatCard label="Jugadores activos" value={kpis.activos || 0} icon={Users} />
        <StatCard label="Torneos activos" value={kpis.torneos || 0} icon={Trophy} />
        <div onClick={() => { setDdOpen('morosidad'); setDdData(kpis.morosos || []) }} className="cursor-pointer">
          <StatCard
            label="Tasa de morosidad"
            value={`${kpis.tm || 0}%`}
            icon={AlertTriangle}
          />
        </div>
        <StatCard label="Ingresos este mes" value={fmt(kpis.ingresos || 0)} icon={TrendingUp} />
      </div>

      {/* Link inscripción + Solicitudes */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader title="Link de inscripción" subtitle="Comparte este link para que los jugadores soliciten unirse al club" />
          <LinkInvitacion clubId={perfil?.club_id} />
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-3">
            <CardHeader title="Solicitudes pendientes" />
            {solicitudes.length > 0 && <Badge variant="info">{solicitudes.length} nuevas</Badge>}
          </div>
          {solicitudes.length === 0 ? (
            <EmptyState icon={Inbox} title="Sin solicitudes pendientes" />
          ) : (
            <>
              {solicitudes.slice(0,3).map(sol => (
                <div key={sol.id} className="flex items-center gap-2.5 py-2 border-b border-[var(--border)]/50">
                  <div className="flex-1">
                    <div className="text-sm text-[var(--text)] font-medium">{sol.nombre}</div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(sol.creado_en).toLocaleDateString('es-CL')}</div>
                  </div>
                  <a href="/solicitudes">
                    <Button variant="ghost" size="sm">Ver →</Button>
                  </a>
                </div>
              ))}
              {solicitudes.length > 0 && (
                <a href="/solicitudes" className="block mt-2.5">
                  <Button variant="secondary" size="sm" className="w-full">Ver todas en Solicitudes →</Button>
                </a>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Últimas asistencias + COA/Gastos */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader title="Últimas asistencias" />
          {ultimasAsist.length === 0 ? (
            <EmptyState icon={Calendar} title="Sin asistencias" />
          ) : ultimasAsist.map(a => (
            <div key={a.id} className="flex justify-between py-1.5 border-b border-[var(--border)]/50 text-sm">
              <span className="text-[var(--text)]">{(a as any).jugadores?.nombre || '—'}</span>
              <span className="text-[var(--text-muted)] text-xs">{a.fecha}</span>
            </div>
          ))}
        </Card>
        <div className="grid grid-rows-2 gap-3.5">
          <StatCard
            label="COA — Costo por alumno"
            value={fmt(kpis.coa || 0)}
            icon={DollarSign}
          />
          <StatCard
            label="Gastos este mes"
            value={fmt(kpis.gastos || 0)}
            icon={TrendingDown}
          />
        </div>
      </div>

      {/* Modal morosidad */}
      <Modal open={!!ddOpen} onClose={() => setDdOpen(null)} title="Deudores">
        {ddData.length === 0 ? (
          <p className="text-[var(--green)] text-center py-5">Sin deudores</p>
        ) : ddData.map((item: any) => (
          <div key={item.id} className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
            <div>
              <div className="text-sm text-[var(--text)] font-medium">
                {kpis.jugadores?.find((j:any) => j.id === item.jugador_id)?.nombre || '—'}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5">
                <Badge variant={item.estado === 'atrasado' ? 'danger' : 'warning'}>{item.estado}</Badge>
              </div>
            </div>
            {kpis.jugadores?.find((j:any) => j.id === item.jugador_id)?.telefono && (
              <a href={`https://wa.me/${kpis.jugadores.find((j:any) => j.id === item.jugador_id).telefono.replace(/[^0-9]/g,'')}`} target="_blank">
                <Button variant="ghost" size="sm">WA</Button>
              </a>
            )}
          </div>
        ))}
      </Modal>
    </AppLayout>
  )
}

function LinkInvitacion({ clubId }: { clubId: string }) {
  const [link, setLink] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!clubId) return
    async function cargar() {
      let { data: inv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
      if (!inv?.length) {
        await supabase.from('invitaciones').insert({ club_id: clubId })
        const { data: newInv } = await supabase.from('invitaciones').select('*').eq('club_id', clubId).eq('activa', true).limit(1)
        inv = newInv
      }
      const codigo = inv?.[0]?.codigo || ''
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cmsports-next.vercel.app'
      setLink(`${origin}/registro?club=${clubId}&code=${codigo}`)
    }
    cargar()
  }, [clubId])

  function copiar() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div>
      <div className="bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-xs text-[var(--purple-light)] break-all mb-2">
        {link || 'Cargando...'}
      </div>
      <Button
        onClick={copiar}
        variant={copiado ? 'secondary' : 'primary'}
        icon={copiado ? Check : Copy}
        className="w-full"
        size="sm"
      >
        {copiado ? 'Copiado!' : 'Copiar link'}
      </Button>
    </div>
  )
}
