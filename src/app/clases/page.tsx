'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Plus, Megaphone, Trash2, BookOpen } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ClasesPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [clases, setClases] = useState<any[]>([])
  const [profesores, setProfesores] = useState<any[]>([])
  const [reservas, setReservas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ fecha:'', profesorId:'', inicio:'', fin:'', contenido:'', grupo:'' })
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
    cargarClases()
  }, [clubId])

  async function cargarClases() {
    const [{ data: cl }, { data: pr }, { data: res }] = await Promise.all([
      supabase.from('clases').select('*').eq('club_id', clubId).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
      supabase.from('profesores').select('*').eq('club_id', clubId).eq('activo', true),
      supabase.from('reservas').select('clase_id,estado')
    ])
    setClases(cl || [])
    setProfesores(pr || [])
    setReservas(res || [])
  }

  async function guardarClase(publicar: boolean) {
    if (!form.fecha || !form.inicio || !form.contenido) return
    const diasMap: Record<number,string> = { 0:'domingo',1:'lunes',2:'martes',3:'miercoles',4:'jueves',5:'viernes',6:'sabado' }
    const diaSemana = diasMap[new Date(form.fecha+'T12:00:00').getDay()]
    await supabase.from('clases').insert({
      club_id: clubId, fecha: form.fecha, dia_semana: diaSemana,
      profesor_id: form.profesorId || null, hora_inicio: form.inicio,
      hora_fin: form.fin || null, contenido: form.contenido,
      grupo: form.grupo || null, publicada: publicar
    })
    setModalOpen(false)
    setForm({ fecha:'', profesorId:'', inicio:'', fin:'', contenido:'', grupo:'' })
    cargarClases()
  }

  async function publicarClase(id: string) {
    await supabase.from('clases').update({ publicada: true }).eq('id', id)
    cargarClases()
  }

  async function eliminarClase(id: string) {
    if (!confirm('¿Eliminar esta clase?')) return
    await supabase.from('clases').delete().eq('id', id)
    cargarClases()
  }

  const esProfesor = perfil?.rol === 'profesor'
  const esAdmin = perfil?.rol === 'admin'
  const puedeCrear = esProfesor || esAdmin

  const porFecha: Record<string, any[]> = {}
  clases.forEach(c => {
    const f = c.fecha || 'Sin fecha'
    if (!porFecha[f]) porFecha[f] = []
    porFecha[f].push(c)
  })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Skeleton width="200px" height="1.5rem" />
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-[22px] font-bold text-[var(--text)]">Programación de clases</h1>
        {puedeCrear && (
          <Button
            icon={Plus}
            onClick={() => { setModalOpen(true); setForm(f => ({ ...f, fecha: new Date().toISOString().slice(0,10) })) }}
          >
            Nueva clase
          </Button>
        )}
      </div>

      {Object.keys(porFecha).length === 0 ? (
        <Card>
          <EmptyState icon={BookOpen} title="Sin clases programadas" />
        </Card>
      ) : Object.entries(porFecha).map(([fecha, clasesF]) => {
        let fechaLabel = fecha
        try { if (fecha.includes('-')) fechaLabel = new Date(fecha+'T12:00:00').toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' }) } catch {}
        const todasPublicadas = clasesF.every(c => c.publicada)
        return (
          <Card key={fecha} noPadding className="mb-3 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex justify-between items-center">
              <div className="text-sm font-semibold text-[var(--text)] capitalize">{fechaLabel}</div>
              {puedeCrear && !todasPublicadas && (
                <Button variant="ghost" size="sm" icon={Megaphone} onClick={async () => {
                  await supabase.from('clases').update({ publicada: true }).eq('club_id', clubId!).eq('fecha', fecha).eq('publicada', false)
                  cargarClases()
                }}>
                  Publicar día
                </Button>
              )}
              {todasPublicadas && <Badge variant="success">Publicado</Badge>}
            </div>
            {clasesF.map(c => {
              const prof = profesores.find(p => p.id === c.profesor_id)
              const confirmados = reservas.filter(r => r.clase_id === c.id && r.estado === 'confirmado').length
              return (
                <div key={c.id} className={`flex items-center gap-3.5 px-5 py-3 border-b border-[var(--border)]/50 border-l-[3px] ${c.publicada ? 'border-l-[var(--green)]' : 'border-l-[var(--border)]'}`}>
                  <div className="bg-[#1e1b4b] text-[var(--purple-light)] px-3 py-2 rounded-lg text-xs font-semibold min-w-[90px] text-center shrink-0">
                    {c.hora_inicio?.slice(0,5) || '—'}<br />
                    <span className="text-[10px] text-[var(--text-muted)] font-normal">{c.hora_fin?.slice(0,5) || ''}</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[var(--text)]">{c.contenido}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {prof ? `${prof.nombre}` : ''}{c.grupo ? ` · ${c.grupo}` : ''}
                      {' · '}<span className="text-[var(--green)]">{confirmados} van</span>
                    </div>
                  </div>
                  {puedeCrear && (
                    <div className="flex gap-1.5">
                      {!c.publicada && (
                        <Button variant="ghost" size="sm" onClick={() => publicarClase(c.id)}>Publicar</Button>
                      )}
                      <Button variant="danger" size="sm" icon={Trash2} onClick={() => eliminarClase(c.id)} />
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        )
      })}

      {/* Modal nueva clase */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva clase">
        <div className="space-y-3.5">
          <Input label="Fecha" type="date" value={form.fecha} onChange={e => setForm(prev => ({ ...prev, fecha: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Hora inicio" type="time" value={form.inicio} onChange={e => setForm(prev => ({ ...prev, inicio: e.target.value }))} />
            <Input label="Hora fin" type="time" value={form.fin} onChange={e => setForm(prev => ({ ...prev, fin: e.target.value }))} />
          </div>
          <Input label="Tipo de entrenamiento" placeholder="Ej: Técnica de saque" value={form.contenido} onChange={e => setForm(prev => ({ ...prev, contenido: e.target.value }))} />
          <Input label="Descripción (opcional)" placeholder="Detalles del entrenamiento" value={form.grupo} onChange={e => setForm(prev => ({ ...prev, grupo: e.target.value }))} />
          <Select
            label="Profesor"
            placeholder="— Seleccionar —"
            options={profesores.map(p => ({ value: p.id, label: p.nombre }))}
            value={form.profesorId}
            onChange={e => setForm(prev => ({ ...prev, profesorId: e.target.value }))}
          />
          <div className="flex gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button variant="ghost" onClick={() => guardarClase(false)} className="flex-1">Borrador</Button>
            <Button onClick={() => guardarClase(true)} className="flex-1">Publicar</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
