'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { cachedFetch } from '@/lib/query-cache'
import { esUuid } from '@/lib/domain/uuid'
import { card, muted, hint, TarjetaAlumno, type Votacion, type Opcion } from '@/components/VotacionAlumno'

// A donde lleva el QR de una votación. Quien llega sin sesión pasa por el login
// y vuelve acá (el proxy guarda la ruta en ?next=).
//
// Esta pantalla no decide quién puede votar: lo decide la base. RLS solo deja
// leer la votación a quien está en `votacion_votantes`, y `votar_atomico`
// vuelve a comprobarlo al enviar. Si la consulta vuelve vacía, no se puede
// distinguir "no existe" de "no estás habilitado", y tampoco debe poder.

// Los tipos generados todavía no conocen las tablas de la migración 303.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient() as any

type Estado = 'cargando' | 'listo' | 'no_disponible' | 'error'

export default function VotacionPorEnlacePage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const idValido = esUuid(id)
  const clubId = perfil?.club_id ?? null
  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'profesor' || perfil?.rol === 'superadmin'

  const [votacion, setVotacion] = useState<Votacion | null>(null)
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [miOpcion, setMiOpcion] = useState<string | undefined>(undefined)
  const [estado, setEstado] = useState<Estado>('cargando')
  const [toast, setToast] = useState('')

  const avisar = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    if (loading) return
    if (!perfil) router.replace(`/login?next=${encodeURIComponent(`/votaciones/${id}`)}`)
  }, [loading, perfil, router, id])

  // El staff administra desde la lista: acá no hay nada que votar.
  useEffect(() => {
    if (!loading && esStaff) router.replace('/votaciones')
  }, [loading, esStaff, router])

  const cargar = useCallback(async () => {
    if (!clubId || esStaff) return
    if (!idValido) { setEstado('no_disponible'); return }
    try {
      const { v, o } = await cachedFetch(`votaciones:enlace:${id}`, async () => {
        const [rv, ro] = await Promise.all([
          db.from('votaciones').select('id,titulo,descripcion,tipo,estado,votos_total,creado_en,cerrada_en').eq('id', id).maybeSingle(),
          db.from('votacion_opciones').select('id,votacion_id,jugador_id,texto,orden').eq('votacion_id', id).order('orden'),
        ])
        if (rv.error) throw rv.error
        if (ro.error) throw ro.error
        return { v: (rv.data ?? null) as Votacion | null, o: (ro.data ?? []) as Opcion[] }
      }, 60_000, ['votaciones', 'votacion_opciones'])

      if (!v) { setVotacion(null); setEstado('no_disponible'); return }
      setVotacion(v); setOpciones(o)

      // Cada alumno lee solo su voto (RLS). Los votos no están en realtime: se
      // vuelven a pedir en cada carga.
      const { data, error } = await db.from('votacion_votos').select('opcion_id').eq('votacion_id', id).maybeSingle()
      if (error) throw error
      setMiOpcion((data as { opcion_id: string } | null)?.opcion_id)
      setEstado('listo')
    } catch {
      setEstado('error')
    }
  }, [clubId, esStaff, id, idValido])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['votaciones', 'votacion_opciones'], clubId, () => { void cargar() }, { conClub: ['votaciones', 'votacion_opciones'] })

  if (loading || !perfil || esStaff) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/votaciones" style={{ fontSize: 12, color: muted, textDecoration: 'none' }}>← Todas mis votaciones</Link>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: '6px 0 0' }}>Votación</h1>
      </div>

      {estado === 'cargando' && <p style={{ color: hint, fontSize: 13 }}>Cargando…</p>}

      {estado === 'error' && (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>
          No se pudo cargar la votación. Revisa tu conexión e inténtalo de nuevo.
        </div>
      )}

      {estado === 'no_disponible' && (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: muted, fontSize: 13, lineHeight: 1.6 }}>
          <b>No estás habilitado para esta votación.</b>
          <br />
          Es posible que tu profesor la haya abierto solo para otro grupo, o que el enlace ya no exista.
          {!perfil.jugador_id && <><br />Tu cuenta no está asociada a un jugador, y solo los jugadores pueden votar.</>}
        </div>
      )}

      {estado === 'listo' && votacion && (
        <TarjetaAlumno v={votacion} opciones={opciones} miOpcion={miOpcion}
          miJugadorId={perfil.jugador_id ?? null} avisar={avisar} alCambiar={cargar} />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 18px', fontSize: 13, color: '#16a34a', zIndex: 200, boxShadow: '0 4px 12px rgba(15,23,42,0.12)' }}>
          {toast}
        </div>
      )}
    </AppLayout>
  )
}
