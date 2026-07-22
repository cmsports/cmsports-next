'use client'

import { useState, useEffect, useRef } from 'react'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { Upload, ImageIcon } from 'lucide-react'
import { subirImagenCentralPago } from '../actions/central-pago'
import WhatsAppBtn from '@/components/WhatsAppBtn'

export default function CentralDePagoPage() {
  const { perfil, loading } = usePerfil()
  const [imagenUrl, setImagenUrl] = useState<string | null>(null)
  const [imagenExiste, setImagenExiste] = useState<boolean | null>(null)
  const [telefono, setTelefono] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'

  useEffect(() => {
    if (!perfil?.club_id) return
    const supabase = createClient()

    supabase.from('clubes').select('telefono').eq('id', perfil.club_id).single()
      .then(({ data }) => setTelefono(data?.telefono || ''))

    const { data } = supabase.storage.from('galeria-fotos').getPublicUrl(`central-pago/${perfil.club_id}`)
    setImagenUrl(`${data.publicUrl}?t=${Date.now()}`)
  }, [perfil?.club_id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      const res = await subirImagenCentralPago({ base64 })
      if (res.error) { alert('Error: ' + res.error); setSubiendo(false); return }
      setImagenUrl(res.url!)
      setImagenExiste(true)
      setSubiendo(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const mensajeWA = encodeURIComponent(
    `Hola! Soy ${perfil?.nombre || 'un socio'}. Adjunto comprobante de pago.`
  )
  const linkWA = telefono
    ? `https://wa.me/${telefono.replace(/[^0-9]/g, '')}?text=${mensajeWA}`
    : null

  if (loading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Central de Pago</h1>
          {esAdmin && (
            <>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={subiendo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '7px 14px',
                  fontSize: 13, color: '#64748b', cursor: 'pointer',
                  opacity: subiendo ? 0.6 : 1,
                }}
              >
                <Upload size={14} />
                {subiendo ? 'Subiendo…' : imagenExiste ? 'Cambiar imagen' : 'Subir imagen'}
              </button>
            </>
          )}
        </div>

        {/* Imagen de pago */}
        {imagenUrl && (
          <img
            src={imagenUrl}
            alt="Datos de transferencia"
            onLoad={() => setImagenExiste(true)}
            onError={() => setImagenExiste(false)}
            style={{
              width: '100%',
              borderRadius: 16,
              display: imagenExiste === false ? 'none' : 'block',
              marginBottom: 20,
              boxShadow: '0 4px 20px rgba(15,23,42,0.10)',
            }}
          />
        )}

        {/* Estado vacío */}
        {imagenExiste === false && (
          <div style={{
            background: '#f8fafc', border: '2px dashed #e2e8f0', borderRadius: 16,
            padding: 60, textAlign: 'center', color: '#94a3b8', marginBottom: 20,
          }}>
            <ImageIcon size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14 }}>
              {esAdmin
                ? 'Sube la imagen con los datos de transferencia'
                : 'Próximamente'}
            </p>
          </div>
        )}

        {/* Skeleton mientras carga */}
        {imagenExiste === null && (
          <div style={{
            background: '#f1f5f9', borderRadius: 16,
            height: 480, marginBottom: 20,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        )}

        {/* Botón WhatsApp */}
        {linkWA && imagenExiste !== false && (
          <WhatsAppBtn href={linkWA} style={{ padding: '15px 20px', fontSize: 15 }}>
            Enviar comprobante por WhatsApp
          </WhatsAppBtn>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </AppLayout>
  )
}
