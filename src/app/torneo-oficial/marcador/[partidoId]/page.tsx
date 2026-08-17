'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { abrirMarcadorOficial } from '@/app/actions/torneo-oficial'
import { traducirErrorMarcadorTecnico } from '@/lib/torneo-oficial/marcador-tecnico'

/** Bridge: el partido oficial redirige al tablet técnico vinculado. */
export default function MarcadorOficialBridgePage() {
  const { partidoId } = useParams<{ partidoId: string }>()
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [errorMsg, setErrorMsg] = useState('')
  const [reintento, setReintento] = useState(0)

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
      try {
        const res = await abrirMarcadorOficial({ partidoId })
        if (cancelado) return
        if (res.error || !res.marcadorId) {
          setErrorMsg(traducirErrorMarcadorTecnico(res.error || 'No se pudo abrir el marcador'))
          return
        }
        const vuelta = encodeURIComponent(
          `/torneo-oficial/evento/${res.eventoId || ''}`,
        )
        window.location.assign(`/tecnico/marcador/${res.marcadorId}?vuelta=${vuelta}`)
      } catch (e) {
        if (cancelado) return
        setErrorMsg(traducirErrorMarcadorTecnico(e instanceof Error ? e.message : 'No se pudo abrir el marcador'))
      }
    })()

    return () => { cancelado = true }
  }, [authLoading, perfil, partidoId, router, reintento])

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 420, margin: '48px auto', padding: '16px 12px', textAlign: 'center' }}>
        {errorMsg ? (
          <>
            <p style={{ color: '#e11d48', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              No se abrió el marcador técnico
            </p>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setErrorMsg(''); setReintento(n => n + 1) }}
                style={btnRetry}
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                style={btnBack}
              >
                ← Volver
              </button>
            </div>
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

const btnRetry: CSSProperties = {
  background: '#eef2ff',
  color: '#3730a3',
  border: '1px solid #c7d2fe',
  borderRadius: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  fontWeight: 600,
}
