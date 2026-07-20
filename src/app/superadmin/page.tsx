'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Building2, Plus, LogIn, Users, Wallet, ShieldCheck, Mail, Trash2 } from 'lucide-react'
import { usePerfilSuperadmin, useClubesSuperadmin } from './layout'
import { crearClub, actualizarModulosClub, eliminarClub } from '@/app/actions/superadmin'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { formatCLP } from '@/lib/domain/finanzas'
import { Settings } from 'lucide-react'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

const MODULOS_OPCIONALES = [
  { key: 'torneos', label: 'Torneos' },
  { key: 'liga', label: 'Liga' },
  { key: 'clases', label: 'Clases' },
  { key: 'calendario', label: 'Calendario' },
  { key: 'asistencia', label: 'Asistencia' },
  { key: 'mensualidades', label: 'Mensualidades' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'tienda', label: 'Tienda' },
] as const

const TODOS_MODULOS = MODULOS_OPCIONALES.map(m => m.key)

export default function SuperadminPage() {
  const perfil = usePerfilSuperadmin()
  const { refetchPerfil } = usePerfil()
  const { clubes, administradores, conteos, loading, recargar } = useClubesSuperadmin()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ nombre: '', ciudad: '', deporte: 'tenis de mesa', planMensual: '', adminNombre: '', adminEmail: '', passwordProvisoria: '' })
  const [modulosForm, setModulosForm] = useState<string[]>([...TODOS_MODULOS])
  const [guardando, setGuardando] = useState(false)
  const [gestionandoId, setGestionandoId] = useState<string | null>(null)
  const [editModulosClub, setEditModulosClub] = useState<{ id: string; nombre: string; modulos_habilitados: string[] | null } | null>(null)
  const [editModulos, setEditModulos] = useState<string[]>([])
  const [guardandoModulos, setGuardandoModulos] = useState(false)
  const [errorModulos, setErrorModulos] = useState('')
  const [errorCrear, setErrorCrear] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')
  const [clubAEliminar, setClubAEliminar] = useState<{ id: string; nombre: string } | null>(null)
  const [confirmacionEliminar, setConfirmacionEliminar] = useState('')
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')
  const router = useRouter()

  async function handleCrearClub() {
    if (!form.nombre.trim()) return
    setErrorCrear('')
    setMensajeExito('')
    setGuardando(true)
    const res = await crearClub({
      nombre: form.nombre,
      ciudad: form.ciudad,
      deporte: form.deporte,
      planMensual: Number(form.planMensual) || 0,
      modulos: modulosForm,
      adminNombre: form.adminNombre,
      adminEmail: form.adminEmail,
      passwordProvisoria: form.passwordProvisoria,
    })
    setGuardando(false)
    if (res?.error) { setErrorCrear(res.error); return }
    setModalOpen(false)
    setForm({ nombre: '', ciudad: '', deporte: 'tenis de mesa', planMensual: '', adminNombre: '', adminEmail: '', passwordProvisoria: '' })
    setModulosForm([...TODOS_MODULOS])
    setMensajeExito('Club y cuenta administradora creados correctamente.')
    await recargar()
  }

  async function handleGuardarModulos() {
    if (!editModulosClub) return
    setGuardandoModulos(true)
    setErrorModulos('')
    // ponytail: mensualidades requiere finanzas
    const mods = editModulos.includes('mensualidades') && !editModulos.includes('finanzas')
      ? [...editModulos, 'finanzas']
      : editModulos
    const res = await actualizarModulosClub({ clubId: editModulosClub.id, modulos: mods })
    setGuardandoModulos(false)
    if (res?.error) { setErrorModulos(res.error); return }
    window.dispatchEvent(new CustomEvent('cmsports:modulos-actualizados', { detail: { clubId: editModulosClub.id } }))
    setEditModulosClub(null)
    await recargar()
  }

  function toggleModulo(arr: string[], key: string): string[] {
    if (arr.includes(key)) {
      const sin = arr.filter(m => m !== key)
      if (key === 'finanzas') return sin.filter(m => m !== 'mensualidades')
      return sin
    }
    if (key === 'mensualidades') return [...arr, key, ...(arr.includes('finanzas') ? [] : ['finanzas'])]
    return [...arr, key]
  }

  async function gestionarClub(clubId: string) {
    if (!perfil?.id) return
    setGestionandoId(clubId)
    await supabase.from('perfiles').update({ club_id: clubId }).eq('id', perfil.id)
    await refetchPerfil()
    router.push('/dashboard')
  }

  async function handleEliminarClub() {
    if (!clubAEliminar || confirmacionEliminar !== clubAEliminar.nombre) return
    setEliminando(true)
    setErrorEliminar('')
    const res = await eliminarClub({ clubId: clubAEliminar.id, confirmacion: confirmacionEliminar })
    setEliminando(false)
    if (res?.error) { setErrorEliminar(res.error); return }
    setClubAEliminar(null)
    setConfirmacionEliminar('')
    setMensajeExito('Club, datos, archivos y cuentas asociadas eliminados.')
    await recargar()
  }

  if (loading) return (
    <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando...</div>
  )

  const totalJugadores = Object.values(conteos).reduce((a, b) => a + b, 0)
  const mrr = clubes.reduce((a, c) => a + (c.plan_mensual || 0), 0)
  const clubesAlDia = clubes.filter(c => c.estado_pago === 'pagado').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Clubes</h1>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Gestiona todos los clubes de CmSports</p>
        </div>
        <button onClick={() => setModalOpen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', background: '#4f46e5', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          <Plus size={15} /> Crear club nuevo
        </button>
      </div>

      {mensajeExito && (
        <div style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
          {mensajeExito}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Clubes activos', value: clubes.length, icon: Building2, color: '#4f46e5' },
          { label: 'Jugadores totales', value: totalJugadores, icon: Users, color: '#0891b2' },
          { label: 'MRR (ingreso mensual)', value: formatCLP(mrr), icon: Wallet, color: '#16a34a' },
          { label: 'Clubes al día', value: `${clubesAlDia}/${clubes.length}`, icon: ShieldCheck, color: '#d97706' },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <m.icon size={15} color={m.color} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {clubes.map(c => (
          <div key={c.id} style={{ ...card, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: '#ede9fe',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={18} color="#4f46e5" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.ciudad || 'Sin ciudad'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
              {conteos[c.id] ?? 0} jugador{(conteos[c.id] ?? 0) === 1 ? '' : 'es'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', marginBottom: 4, minWidth: 0 }}>
              <Mail size={12} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={administradores[c.id]?.email || 'Sin administrador asociado'}>
                {administradores[c.id]?.email || 'Sin administrador asociado'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              {c.plan_mensual > 0 ? `Plan: ${formatCLP(c.plan_mensual)}/mes` : 'Plan por definir'}
              <span style={{ color: c.estado_pago === 'pagado' ? '#16a34a' : c.estado_pago === 'atrasado' ? '#dc2626' : '#d97706' }}>
                {' · '}{c.estado_pago === 'pagado' ? 'Pago al día' : c.estado_pago === 'atrasado' ? 'Pago atrasado' : 'Pago pendiente'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => gestionarClub(c.id)} disabled={gestionandoId === c.id} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#1e293b', cursor: gestionandoId === c.id ? 'not-allowed' : 'pointer',
                opacity: gestionandoId === c.id ? 0.6 : 1,
              }}>
                <LogIn size={13} /> {gestionandoId === c.id ? 'Entrando...' : 'Gestionar'}
              </button>
              <button onClick={() => { setErrorModulos(''); setEditModulosClub(c); setEditModulos(c.modulos_habilitados || [...TODOS_MODULOS]) }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#4f46e5', cursor: 'pointer',
              }}>
                <Settings size={13} /> Módulos
              </button>
              <button aria-label={`Eliminar ${c.nombre}`} title="Eliminar club" onClick={() => { setClubAEliminar({ id: c.id, nombre: c.nombre }); setConfirmacionEliminar(''); setErrorEliminar('') }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px',
                background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 7, color: '#dc2626', cursor: 'pointer',
              }}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {clubAEliminar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 12 }} onClick={() => !eliminando && setClubAEliminar(null)}>
          <div style={{ ...card, padding: 20, width: 440, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Eliminar club definitivamente</h2>
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: 12 }}>
              Se borrarán todos los jugadores, profesores, torneos, pagos, archivos y cuentas de acceso asociadas. Esta acción no se puede deshacer.
            </p>
            <label style={{ display: 'block', fontSize: 12, color: '#334155', marginBottom: 5 }}>
              Escribe <strong>{clubAEliminar.nombre}</strong> para confirmar:
            </label>
            <input autoFocus value={confirmacionEliminar} onChange={e => setConfirmacionEliminar(e.target.value)} disabled={eliminando}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 13 }} />
            {errorEliminar && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{errorEliminar}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setClubAEliminar(null)} disabled={eliminando} style={{ padding: '8px 13px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleEliminarClub} disabled={eliminando || confirmacionEliminar !== clubAEliminar.nombre} style={{ padding: '8px 13px', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: eliminando || confirmacionEliminar !== clubAEliminar.nombre ? 0.5 : 1 }}>
                {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 12,
        }} onClick={() => setModalOpen(false)}>
          <div style={{ ...card, padding: 16, width: 520, maxWidth: '100%', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>Crear club nuevo</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="crear-club-grid">
              <input placeholder="Nombre del club" value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Ciudad" value={form.ciudad}
                onChange={e => setForm({ ...form, ciudad: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              <input placeholder="Deporte" value={form.deporte}
                onChange={e => setForm({ ...form, deporte: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 5 }}>Plan mensual (opcional)</div>
                <input placeholder="Déjalo vacío para definirlo después" type="number" min="0" value={form.planMensual}
                  onChange={e => setForm({ ...form, planMensual: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>El club se crea con pago pendiente. Puedes definir o editar el monto posteriormente en Finanzas.</div>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Administrador del club</div>
                <div className="crear-club-admin-grid">
                  <input placeholder="Nombre del administrador" value={form.adminNombre}
                    onChange={e => setForm({ ...form, adminNombre: e.target.value })}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
                  <input placeholder="Correo del administrador" type="email" value={form.adminEmail}
                    onChange={e => setForm({ ...form, adminEmail: e.target.value })}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
                  <input placeholder="Contraseña provisoria (mínimo 8 caracteres)" type="password" value={form.passwordProvisoria}
                    onChange={e => setForm({ ...form, passwordProvisoria: e.target.value })}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Módulos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {MODULOS_OPCIONALES.map(m => (
                    <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={modulosForm.includes(m.key)}
                        onChange={() => setModulosForm(toggleModulo(modulosForm, m.key))} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {errorCrear && (
              <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginTop: 12 }}>
                {errorCrear}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalOpen(false)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleCrearClub} disabled={guardando} style={{
                flex: 1, padding: '8px', background: '#4f46e5', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1,
              }}>{guardando ? 'Creando...' : 'Crear'}</button>
            </div>
            <style jsx>{`
              .crear-club-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
              .crear-club-grid input, .crear-club-admin-grid input { min-width: 0; }
              .crear-club-admin-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
              @media (max-width: 640px) {
                .crear-club-grid, .crear-club-admin-grid { grid-template-columns: 1fr; }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Modal editar módulos */}
      {editModulosClub && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setEditModulosClub(null)}>
          <div style={{ ...card, padding: 20, width: 360 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Módulos — {editModulosClub.nombre}</h2>
            <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>Dashboard y Jugadores siempre están activos</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {MODULOS_OPCIONALES.map(m => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1e293b', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editModulos.includes(m.key)}
                    onChange={() => setEditModulos(toggleModulo(editModulos, m.key))} />
                  {m.label}
                </label>
              ))}
            </div>
            {errorModulos && (
              <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 8, padding: '8px 10px', fontSize: 12, marginTop: 12 }}>
                {errorModulos}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditModulosClub(null)} style={{
                flex: 1, padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 7, fontSize: 12, color: '#64748b', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={handleGuardarModulos} disabled={guardandoModulos} style={{
                flex: 1, padding: '8px', background: '#4f46e5', border: 'none',
                borderRadius: 7, fontSize: 12, color: '#fff', cursor: 'pointer', opacity: guardandoModulos ? 0.6 : 1,
              }}>{guardandoModulos ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
