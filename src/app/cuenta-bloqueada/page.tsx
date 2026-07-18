'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { verificarBloqueoPerfil } from '@/app/actions/jugadores'

const supabase = createClient()

export default function CuentaBloqueadaPage() {
  const { perfil } = usePerfil()
  const [clubNombre, setClubNombre] = useState('')
  const [clubTelefono, setClubTelefono] = useState('')
  const [verificando, setVerificando] = useState(false)

  useEffect(() => {
    if (!perfil?.club_id) return
    supabase.from('clubes').select('nombre,telefono').eq('id', perfil.club_id).single()
      .then(({ data }) => {
        if (data?.nombre) setClubNombre(data.nombre)
        if (data?.telefono) setClubTelefono(data.telefono)
      })
  }, [perfil?.club_id])

  // Chequeo automático cada 8 segundos — si el club desbloquea, el jugador entra al instante
  useEffect(() => {
    const intervalo = setInterval(async () => {
      const bloqueado = await verificarBloqueoPerfil()
      if (!bloqueado) window.location.replace('/perfil')
    }, 8000)
    return () => clearInterval(intervalo)
  }, [])

  async function verificarAhora() {
    setVerificando(true)
    const bloqueado = await verificarBloqueoPerfil()
    if (!bloqueado) {
      window.location.replace('/perfil')
    } else {
      setVerificando(false)
    }
  }

  async function cerrarSesion() {
    await supabase.auth.signOut({ scope: 'local' })
    window.location.href = '/login'
  }

  const mensajeWA = encodeURIComponent(
    `Hola! Soy ${perfil?.nombre || 'un jugador'} 👋. Mi cuenta en ${clubNombre || 'el club'} aparece bloqueada y no puedo acceder a la plataforma. ¿Me pueden ayudar a regularizar mi situación? Gracias.`
  )
  const linkWA = clubTelefono
    ? `https://wa.me/${clubTelefono.replace(/[^0-9]/g, '')}?text=${mensajeWA}`
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        background: '#ffffff', border: '2px solid #fecaca', borderRadius: 20,
        padding: 40, maxWidth: 420, width: '100%', textAlign: 'center',
        boxShadow: '0 8px 32px rgba(220,38,38,0.12)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#dc2626', margin: '0 0 10px' }}>
          Cuenta bloqueada
        </h1>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 8px' }}>
          Tu acceso fue suspendido por falta de pago.
        </p>
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 28px' }}>
          Para reactivar tu cuenta, comunícate con{clubNombre ? ` ${clubNombre}` : ' tu club'}.
        </p>
        {linkWA && (
          <a
            href={linkWA}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#16a34a', color: '#ffffff', textDecoration: 'none',
              padding: '13px 20px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              marginBottom: 12,
            }}
          >
            💬 Hablar con el club por WhatsApp
          </a>
        )}
        {!linkWA && clubNombre && (
          <div style={{
            background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10,
            padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#92400e',
          }}>
            Contacta a {clubNombre} para regularizar tu situación.
          </div>
        )}
        <button
          onClick={verificarAhora}
          disabled={verificando}
          style={{
            width: '100%', padding: '11px 20px', marginBottom: 8,
            background: verificando ? '#f1f5f9' : '#1e40af', color: verificando ? '#94a3b8' : '#ffffff',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: verificando ? 'default' : 'pointer',
          }}
        >
          {verificando ? '⏳ Verificando...' : '🔄 Ya pagué, verificar acceso'}
        </button>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 12px' }}>
          Se verifica automáticamente cada 8 segundos
        </p>
        <button
          onClick={cerrarSesion}
          style={{
            width: '100%', padding: '11px 20px',
            background: 'transparent', border: '1px solid #e2e8f0',
            borderRadius: 10, color: '#64748b', fontSize: 14, cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
