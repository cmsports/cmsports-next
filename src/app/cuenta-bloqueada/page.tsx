'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { verificarBloqueoPerfil } from '@/app/actions/jugadores'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const supabase = createClient()

export default function CuentaBloqueadaPage() {
  const { perfil } = usePerfil()
  const [clubNombre, setClubNombre] = useState('')
  const [clubTelefono, setClubTelefono] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [mostrarDatos, setMostrarDatos] = useState(false)
  const [imagenPago, setImagenPago] = useState<string | null>(null)
  const [imagenExiste, setImagenExiste] = useState(true)

  useEffect(() => {
    if (!perfil?.club_id) return
    supabase.from('clubes').select('nombre,telefono').eq('id', perfil.club_id).single()
      .then(({ data }) => {
        if (data?.nombre) setClubNombre(data.nombre)
        if (data?.telefono) setClubTelefono(data.telefono)
      })
    // ponytail: misma imagen que administra Central de Pago, por club.
    // Nada de datos bancarios en el código: cada club sube los suyos.
    const { data } = supabase.storage.from('galeria-fotos').getPublicUrl(`central-pago/${perfil.club_id}`)
    setImagenPago(`${data.publicUrl}?t=${Date.now()}`)
  }, [perfil?.club_id])

  // Chequeo inmediato al cargar + cada 8 segundos
  useEffect(() => {
    const verificar = async () => {
      const bloqueado = await verificarBloqueoPerfil()
      if (!bloqueado) window.location.replace('/perfil')
    }
    verificar()
    const intervalo = setInterval(verificar, 8000)
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

  const nombreJugador = perfil?.nombre || 'un jugador'
  const numeroWA = clubTelefono.replace(/[^0-9]/g, '')

  const mensajeWA = encodeURIComponent(
    `Hola! Soy ${nombreJugador} 👋. Mi cuenta en ${clubNombre || 'el club'} aparece bloqueada y no puedo acceder a la plataforma. ¿Me pueden ayudar a regularizar mi situación? Gracias.`
  )
  const linkWA = numeroWA ? `https://wa.me/${numeroWA}?text=${mensajeWA}` : null

  const mensajeComprobante = encodeURIComponent(
    `Hola! Soy ${nombreJugador} del ${clubNombre || 'club'}. Te envío mi comprobante de pago de la mensualidad. 📎`
  )
  const linkWAComprobante = numeroWA ? `https://wa.me/${numeroWA}?text=${mensajeComprobante}` : null

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
        <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>
          Para reactivar tu cuenta, comunícate con{clubNombre ? ` ${clubNombre}` : ' tu club'}.
        </p>
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
          padding: '10px 14px', margin: '0 0 16px', fontSize: 13, color: '#92400e', lineHeight: 1.5,
        }}>
          Recuerda que la mensualidad se paga dentro de los <strong>primeros 15 días</strong> del mes.
        </div>

        {imagenPago && imagenExiste && (
          <>
            <button
              onClick={() => setMostrarDatos(v => !v)}
              style={{
                width: '100%', padding: '12px 18px', marginBottom: mostrarDatos ? 0 : 12,
                background: mostrarDatos ? '#f8fafc' : '#1e293b',
                color: mostrarDatos ? '#334155' : '#ffffff',
                border: mostrarDatos ? '1px solid #e2e8f0' : 'none',
                borderRadius: mostrarDatos ? '10px 10px 0 0' : 10,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              🏦 {mostrarDatos ? 'Ocultar datos de transferencia' : 'Ver datos para transferencia'}
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenPago}
              alt="Datos de transferencia"
              onError={() => setImagenExiste(false)}
              style={{
                display: mostrarDatos ? 'block' : 'none',
                width: '100%', borderRadius: '0 0 10px 10px',
                border: '1px solid #e2e8f0', borderTop: 'none', marginBottom: 12,
              }}
            />
          </>
        )}

        {linkWAComprobante && (
          <WhatsAppBtn href={linkWAComprobante} style={{ marginBottom: 8 }}>
            Enviar comprobante por WhatsApp
          </WhatsAppBtn>
        )}
        {linkWA && (
          <WhatsAppBtn href={linkWA} style={{ marginBottom: 12 }}>
            Consultar con el club
          </WhatsAppBtn>
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
