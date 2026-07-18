'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'

export default function LibroProfePage() {
  const { perfil, loading } = usePerfil()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'

  useEffect(() => {
    if (loading) return
    if (perfil?.rol === 'jugador') { router.replace('/perfil'); return }
    fetch('/api/libro-profe/url')
      .then(r => r.json())
      .then(d => setPdfUrl(d.url ?? null))
      .catch(() => setPdfUrl(null))
      .finally(() => setCargando(false))
  }, [perfil, loading, router])

  async function subirPdf(file: File | null) {
    if (!file) return
    setSubiendo(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/libro-profe/upload', { method: 'POST', body: formData })
    const json = await res.json()
    if (!res.ok || json.error) {
      setError(json.error ?? 'Error al subir')
    } else {
      setPdfUrl(json.url + '?t=' + Date.now())
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (loading || perfil?.rol === 'jugador') return null

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Libro del profe</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Material pedagógico — Asociación Buin</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#f1f5f9', color: '#0f172a',
                  border: '1px solid #e2e8f0', borderRadius: 9,
                  padding: '9px 16px', fontSize: 13, fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                ↓ Descargar PDF
              </a>
            )}
            {esAdmin && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => subirPdf(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={subiendo}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: subiendo ? '#e2e8f0' : '#4f46e5',
                    color: subiendo ? '#94a3b8' : '#fff',
                    border: 'none', borderRadius: 9, padding: '9px 16px',
                    fontSize: 13, fontWeight: 600, cursor: subiendo ? 'default' : 'pointer',
                  }}
                >
                  {subiendo ? '⏳ Subiendo...' : pdfUrl ? '↑ Reemplazar PDF' : '↑ Subir PDF'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
            padding: '10px 14px', fontSize: 13, color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        {/* Contenido */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', fontSize: 14 }}>
            Cargando...
          </div>
        ) : pdfUrl ? (
          <>
            {/* Visor desktop */}
            <iframe
              src={pdfUrl}
              style={{
                width: '100%',
                height: 'calc(100vh - 200px)',
                minHeight: 600,
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                display: 'block',
              }}
              title="Libro del profe"
            />
            {/* Fallback móvil */}
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
              Si el PDF no se ve correctamente,{' '}
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5' }}>
                ábrelo aquí
              </a>.
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📖</div>
            <p style={{ fontSize: 15, color: '#64748b' }}>Aún no hay ningún libro subido.</p>
            {esAdmin && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                Usa el botón "Subir PDF" para agregar el libro.
              </p>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
