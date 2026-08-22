'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/app/layout-app'
import PanelFeedback from '@/components/PanelFeedback'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

type Feedback = {
  id: string
  autor_nombre: string
  fecha: string
  hora: string | null
  comentario: string
}

export default function FeedbacksPage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)

  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'profesor' || perfil?.rol === 'superadmin'

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.replace('/login'); return }
  }, [loading, perfil, router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loading || esStaff || !perfil?.jugador_id) { setCargandoLista(false); return }
    let vivo = true
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from('feedback_jugadores')
        .select('id,autor_nombre,fecha,hora,comentario')
        .eq('jugador_id', perfil.jugador_id)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })
      if (vivo) { setFeedbacks((data ?? []) as Feedback[]); setCargandoLista(false) }
    })()
    return () => { vivo = false }
  }, [loading, esStaff, perfil?.jugador_id])

  if (loading || !perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>
          {esStaff ? 'Feedbacks' : 'Mis feedbacks'}
        </h1>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
          {esStaff
            ? 'Historial de comentarios por alumno.'
            : 'Lo que tu profesor ha escrito sobre tu entrenamiento.'}
        </p>
      </div>

      {esStaff && perfil.club_id && (
        <PanelFeedback
          clubId={perfil.club_id}
          userId={perfil.id}
          puedeTodo={perfil.rol === 'admin' || perfil.rol === 'superadmin'}
        />
      )}

      {!esStaff && (
        cargandoLista ? (
          <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
        ) : feedbacks.length === 0 ? (
          <div style={{ ...card, padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>
            Todavía no tienes feedback de tu profesor.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feedbacks.map(f => (
              <div key={f.id} style={{ ...card, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: muted, fontWeight: 600 }}>
                    {f.fecha}{f.hora ? ` · ${f.hora.slice(0, 5)}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: hint }}>{f.autor_nombre}</div>
                </div>
                <div style={{ fontSize: 13, color: text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{f.comentario}</div>
              </div>
            ))}
          </div>
        )
      )}
    </AppLayout>
  )
}
