'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { abrirMarcadorOficial } from '@/app/actions/torneo-oficial'

/** Bridge: el marcador liviano oficial redirige al tablet técnico vinculado. */
export default function MarcadorOficialBridgePage() {
  const { partidoId } = useParams<{ partidoId: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (authLoading) return
    if (!perfil) {
      router.replace('/login')
      return
    }
    if (!partidoId) {
      setErrorMsg('Partido no encontrado')
      return
    }

    let cancelado = false
    ;(async () => {
      const res = await abrirMarcadorOficial({ partidoId })
      if (cancelado) return
      if (res.error || !res.marcadorId) {
        setErrorMsg(res.error || 'No se pudo abrir el marcador')
        return
      }
      const vuelta = encodeURIComponent(
        `/torneo-oficial/evento/${res.eventoId || ''}`,
      )
      router.replace(`/tecnico/marcador/${res.marcadorId}?vuelta=${vuelta}`)
    })()

    return () => { cancelado = true }
  }, [authLoading, perfil, partidoId, router])

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 420, margin: '48px auto', padding: '16px 12px', textAlign: 'center' }}>
        {errorMsg ? (
          <>
            <p style={{ color: '#e11d48', fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
            <button
              type="button"
              onClick={() => router.push('/torneo-oficial')}
              style={btnBack}
            >
              ← Volver a torneo oficial
            </button>
          </>
        ) : (
          <p style={{ color: '#64748b', fontSize: 14 }}>Abriendo marcador en vivo…</p>
        )}
      </div>
    </AppLayout>
  )
}

const btnBack: CSSProperties = {
  background: 'transparent',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '6px 12px',
  cursor: 'pointer',
}
