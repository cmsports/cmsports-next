'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { planVencido } from '@/lib/domain/suscripciones'
import { formatCLP } from '@/lib/domain/finanzas'
import { usePerfil } from '@/lib/auth/PerfilProvider'

type Aviso = { nombre: string; plan_mensual: number; proximo_vencimiento: string }

export function AvisoPagoPlan({ perfil }: { perfil: { rol?: string | null; club_id?: string | null } | null }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [cerrado, setCerrado] = useState(false)

  useEffect(() => {
    if (perfil?.rol !== 'admin' || !perfil.club_id) return
    let activo = true
    const supabase = createClient()
    supabase.from('clubes')
      .select('nombre,plan_mensual,estado_plan,proximo_vencimiento')
      .eq('id', perfil.club_id)
      .single()
      .then(({ data }) => {
        if (!activo || !data || !planVencido(data.estado_plan, data.proximo_vencimiento)) return
        setAviso({ nombre: data.nombre, plan_mensual: Number(data.plan_mensual || 0), proximo_vencimiento: data.proximo_vencimiento! })
      })
    return () => { activo = false }
  }, [perfil?.club_id, perfil?.rol])

  if (!aviso || cerrado) return null

  return <div role="dialog" aria-modal="true" aria-label="Pago mensual pendiente" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ position: 'relative', width: 'min(760px, 92vw)', minHeight: '56vh', maxHeight: '82vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 24px 70px rgba(15,23,42,.4)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '48px clamp(24px, 6vw, 64px)', borderTop: '10px solid #dc2626' }}>
      <button onClick={() => setCerrado(true)} aria-label="Cerrar aviso" style={{ position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={20} /></button>
      <div style={{ width: 82, height: 82, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', marginBottom: 22 }}><AlertTriangle size={42} /></div>
      <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Aviso importante</div>
      <h1 style={{ margin: 0, color: '#0f172a', fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.15 }}>Tu mensualidad de CmSports está pendiente</h1>
      <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.6, maxWidth: 570, margin: '18px 0 22px' }}>El plan activo de <strong>{aviso.nombre}</strong> llegó a su fecha de renovación. Puedes continuar usando la aplicación, pero recuerda realizar la transferencia y avisarnos para confirmar el pago.</p>
      <div style={{ width: '100%', maxWidth: 470, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginBottom: 26 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>Monto mensual</div><strong style={{ color: '#0f172a', fontSize: 18 }}>{formatCLP(aviso.plan_mensual)}</strong></div>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: '#c2410c', marginBottom: 5, display: 'flex', justifyContent: 'center', gap: 5 }}><CalendarDays size={14} /> Vencimiento</div><strong style={{ color: '#9a3412', fontSize: 18 }}>{new Date(`${aviso.proximo_vencimiento}T12:00:00`).toLocaleDateString('es-CL')}</strong></div>
      </div>
      <button onClick={() => setCerrado(true)} style={{ width: '100%', maxWidth: 470, padding: '13px 18px', background: '#4f46e5', color: '#fff', border: 0, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Entendido, continuar a la aplicación</button>
      <p style={{ margin: '14px 0 0', color: '#94a3b8', fontSize: 12 }}>Este recordatorio volverá a aparecer la próxima vez que abras CmSports hasta que el pago sea confirmado.</p>
    </div>
  </div>
}

export default function AvisoPagoPlanGlobal() {
  const { perfil } = usePerfil()
  return <AvisoPagoPlan perfil={perfil} />
}
