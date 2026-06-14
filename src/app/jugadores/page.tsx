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
import { Plus, Download, UserPlus, Pencil, Lock, Unlock, Trash2, Eye, Users, Trophy } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const categorias = ['principiante', 'intermedio', 'avanzado']

export default function JugadoresPage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [jugadores, setJugadores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [clubId, setClubId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState({ nombre:'', rut:'', email:'', telefono:'', categoria:'principiante', sesiones_limite:'12' })
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState('')
  const [tabJug, setTabJug] = useState<'jugadores'|'ranking'>('jugadores')
  const [busquedaRanking, setBusquedaRanking] = useState('')
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
    cargarJugadores()
  }, [clubId])

  async function cargarJugadores() {
    const { data, error } = await supabase.from('jugadores').select('*').eq('club_id', clubId).neq('es_externo', true).order('elo', { ascending: false })
    if (error) { mostrarToast('Error al cargar jugadores'); return }
    setJugadores(data || [])
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre:'', rut:'', email:'', telefono:'', categoria:'principiante', sesiones_limite:'12' })
    setModalOpen(true)
  }

  function abrirEditar(j: any) {
    setEditando(j)
    setForm({ nombre:j.nombre||'', rut:j.rut||'', email:j.email||'', telefono:j.telefono||'', categoria:j.categoria||'principiante', sesiones_limite:String(j.sesiones_limite||12) })
    setModalOpen(true)
  }

  async function guardar() {
    if (!form.nombre.trim()) { mostrarToast('El nombre es obligatorio'); return }
    if (!clubId) { mostrarToast('Error: no hay club activo'); return }
    setGuardando(true)

    if (editando) {
      const { error } = await supabase.from('jugadores').update({
        nombre: form.nombre.trim(), rut: form.rut || null, email: form.email || null,
        telefono: form.telefono || null, categoria: form.categoria,
        sesiones_limite: parseInt(form.sesiones_limite) || 12
      }).eq('id', editando.id)
      if (error) { mostrarToast('Error al editar: ' + error.message); setGuardando(false); return }
      mostrarToast('Jugador actualizado')
    } else {
      const { error } = await supabase.from('jugadores').insert({
        club_id: clubId, nombre: form.nombre.trim(), rut: form.rut || null,
        email: form.email || null, telefono: form.telefono || null, categoria: form.categoria,
        sesiones_limite: parseInt(form.sesiones_limite) || 12, elo: 1200,
        sesiones_usadas: 0, estado: 'activo', es_externo: false
      })
      if (error) { mostrarToast('Error al crear: ' + error.message); setGuardando(false); return }
      mostrarToast('Jugador creado exitosamente')
    }

    setGuardando(false)
    setModalOpen(false)
    setForm({ nombre:'', rut:'', email:'', telefono:'', categoria:'principiante', sesiones_limite:'12' })
    await cargarJugadores()
  }

  async function toggleEstado(j: any) {
    const nuevoEstado = j.estado === 'activo' ? 'bloqueado' : 'activo'
    await supabase.from('jugadores').update({ estado: nuevoEstado }).eq('id', j.id)
    mostrarToast(`Jugador ${nuevoEstado === 'activo' ? 'activado' : 'bloqueado'}`)
    cargarJugadores()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este jugador? Esta acción no se puede deshacer.')) return
    await supabase.from('jugadores').delete().eq('id', id)
    mostrarToast('Jugador eliminado')
    cargarJugadores()
  }

  async function exportarExcel() {
    const { utils, writeFile } = await import('xlsx')
    const datos = filtrados.map(j => ({
      'Nombre': j.nombre, 'RUT': j.rut || '', 'Email': j.email || '',
      'Teléfono': j.telefono || '', 'Categoría': j.categoria,
      'ELO': j.elo, 'Sesiones usadas': j.sesiones_usadas,
      'Sesiones límite': j.sesiones_limite, 'Estado': j.estado
    }))
    const ws = utils.json_to_sheet(datos)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Jugadores')
    writeFile(wb, 'jugadores.xlsx')
  }

  const filtrados = jugadores.filter(j => j.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
  const esAdmin = perfil?.rol === 'admin'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <Skeleton width="200px" height="1.5rem" />
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2.5">
        <h1 className="text-[22px] font-bold text-[var(--text)]">Jugadores</h1>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={exportarExcel} size="sm">Excel</Button>
          {esAdmin && tabJug === 'jugadores' && (
            <Button icon={Plus} onClick={abrirNuevo}>Nuevo jugador</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[var(--bg-dark)] rounded-[10px] p-1 mb-4">
        {[{key:'jugadores',label:'Jugadores',icon:Users},{key:'ranking',label:'Ranking ELO',icon:Trophy}].map(t => (
          <div key={t.key} onClick={() => setTabJug(t.key as any)}
            className={`flex-1 py-2 text-center rounded-lg cursor-pointer text-sm font-medium transition-all ${tabJug===t.key ? 'bg-[var(--bg-card)] text-[var(--purple-light)]' : 'text-[var(--text-muted)]'}`}>
            {t.label}
          </div>
        ))}
      </div>

      {/* TAB RANKING */}
      {tabJug === 'ranking' && (
        <div>
          <div className="mb-3">
            <Input placeholder="Buscar jugador en el ranking..." value={busquedaRanking} onChange={e => setBusquedaRanking(e.target.value)} />
          </div>
          <Card noPadding>
            {jugadores.filter(j => !busquedaRanking || j.nombre.toLowerCase().includes(busquedaRanking.toLowerCase()))
              .sort((a,b) => b.elo - a.elo)
              .map((j, i) => {
                const cols = ['#f59e0b','#6c63ff','#059669','#0891b2','#7c3aed','#ec4899','#14b8a6','#f97316']
                const posicion = jugadores.sort((a,b) => b.elo-a.elo).findIndex(x => x.id === j.id) + 1
                return (
                  <div key={j.id} className="flex items-center gap-3.5 px-4 py-3 border-b border-[var(--border)]/50">
                    <div className={`w-8 text-center text-sm font-bold ${posicion===1?'text-[var(--yellow)]':posicion===2?'text-gray-400':posicion===3?'text-orange-400':'text-[var(--text-muted)]'}`}>
                      {posicion<=3 ? ['🥇','🥈','🥉'][posicion-1] : posicion}
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: `linear-gradient(135deg,${cols[i%cols.length]},${cols[i%cols.length]}88)` }}>
                      {j.nombre.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-[var(--text)] font-medium">{j.nombre}</div>
                      <div className="text-xs text-[var(--text-muted)]">{j.categoria}</div>
                    </div>
                    <div className="text-lg font-bold text-[var(--purple-light)] font-mono">{j.elo}</div>
                  </div>
                )
              })
            }
          </Card>
        </div>
      )}

      {/* TAB JUGADORES */}
      {tabJug === 'jugadores' && <>
        <Card className="mb-4 p-3">
          <Input placeholder="Buscar jugador..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </Card>

        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['#','Nombre','RUT','Categoría','Sesiones','ELO','Estado',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((j, i) => (
                  <tr key={j.id} className="border-b border-[var(--border)]/50">
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{String(i+1).padStart(3,'0')}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--text)] whitespace-nowrap">{j.nombre}</td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{j.rut || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={j.categoria === 'avanzado' ? 'info' : j.categoria === 'intermedio' ? 'info' : 'warning'}>
                        {j.categoria}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text)]">{j.sesiones_usadas}/{j.sesiones_limite}</td>
                    <td className="px-4 py-3 font-bold text-[var(--purple-light)] font-mono">{j.elo}</td>
                    <td className="px-4 py-3">
                      <Badge variant={j.estado === 'activo' ? 'success' : 'danger'}>{j.estado}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 whitespace-nowrap">
                        <Button variant="primary" size="sm" icon={Eye} onClick={() => router.push(`/jugadores/${j.id}`)}>Ver perfil</Button>
                        {esAdmin && <>
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => abrirEditar(j)} />
                          <Button variant="ghost" size="sm" icon={j.estado==='activo' ? Lock : Unlock} onClick={() => toggleEstado(j)} />
                          <Button variant="danger" size="sm" icon={Trash2} onClick={() => eliminar(j.id)} />
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length === 0 && (
            <EmptyState
              icon={Users}
              title={busqueda ? 'No se encontraron jugadores' : 'Sin jugadores registrados'}
            />
          )}
        </Card>
      </>}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar jugador' : 'Nuevo jugador'}>
        <div className="space-y-3.5">
          <Input label="Nombre completo *" placeholder="Ej: Carlos Muñoz" value={form.nombre} onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))} />
          <Input label="RUT" placeholder="12345678K" value={form.rut} onChange={e => setForm(prev => ({ ...prev, rut: e.target.value }))} />
          <Input label="Email" type="email" placeholder="tu@email.com" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} />
          <Input label="Teléfono" type="tel" placeholder="+56 9 1234 5678" value={form.telefono} onChange={e => setForm(prev => ({ ...prev, telefono: e.target.value }))} />
          <Input label="Sesiones por mes" type="number" placeholder="12" value={form.sesiones_limite} onChange={e => setForm(prev => ({ ...prev, sesiones_limite: e.target.value }))} />
          <Select label="Categoría" options={categorias.map(c => ({ value: c, label: c }))} value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))} />
          <div className="flex gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button onClick={guardar} loading={guardando} className="flex-1">
              {editando ? 'Guardar cambios' : 'Crear jugador'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[var(--bg-card)] border border-[var(--green)]/30 rounded-[10px] px-4 py-3 text-sm text-[var(--green)] z-[200]">
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
