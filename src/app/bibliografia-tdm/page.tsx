'use client'

import { useEffect, useRef, useState } from 'react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'

type Archivo = { name: string; url: string }

export default function BibliografiaTdmPage() {
  const { perfil } = usePerfil()
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [visor, setVisor] = useState<Archivo | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const esAdmin = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch('/api/bibliografia/list')
      const data = await res.json()
      setArchivos(Array.isArray(data) ? data : [])
    } catch {
      setArchivos([])
    }
    setCargando(false)
  }

  useEffect(() => { cargar() }, [])

  async function subir(files: FileList | null) {
    if (!files || files.length === 0) return
    setSubiendo(true)
    const formData = new FormData()
    for (const file of Array.from(files)) formData.append('files', file)
    await fetch('/api/bibliografia/upload', { method: 'POST', body: formData })
    await cargar()
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function eliminar(nombre: string) {
    setEliminando(nombre)
    await fetch('/api/bibliografia/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    setArchivos(prev => prev.filter(a => a.name !== nombre))
    if (visor?.name === nombre) setVisor(null)
    setEliminando(null)
  }

  return (
    <AppLayout perfil={perfil ?? null}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Bibliografía TDM</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Asociación Tenis de Mesa Buin</p>
          </div>
          {esAdmin && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => subir(e.target.files)}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={subiendo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: subiendo ? '#e2e8f0' : '#4f46e5',
                  color: subiendo ? '#94a3b8' : '#fff',
                  border: 'none', borderRadius: 9, padding: '10px 18px',
                  fontSize: 14, fontWeight: 600, cursor: subiendo ? 'default' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {subiendo ? '⏳ Subiendo...' : '+ Subir imágenes'}
              </button>
            </>
          )}
        </div>

        {/* Estado */}
        {cargando && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            Cargando materiales...
          </div>
        )}

        {!cargando && archivos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <p style={{ fontSize: 15, color: '#64748b' }}>Aún no hay materiales publicados.</p>
            {esAdmin && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                Usa el botón "Subir imágenes" para agregar el primer contenido.
              </p>
            )}
          </div>
        )}

        {/* Grilla */}
        {!cargando && archivos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}>
            {archivos.map(a => (
              <div
                key={a.name}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                  transition: 'transform 0.12s, box-shadow 0.12s',
                  position: 'relative',
                }}
                onClick={() => setVisor(a)}
              >
                <img
                  src={a.url}
                  alt={a.name}
                  style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                />
                {esAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); eliminar(a.name) }}
                    disabled={eliminando === a.name}
                    title="Eliminar"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(220,38,38,0.85)', color: '#fff',
                      border: 'none', borderRadius: 6, width: 28, height: 28,
                      fontSize: 14, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {eliminando === a.name ? '…' : '×'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Visor pantalla completa */}
      {visor && (
        <div
          onClick={() => setVisor(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, cursor: 'zoom-out',
          }}
        >
          <img
            src={visor.url}
            alt={visor.name}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setVisor(null)}
            style={{
              position: 'fixed', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: 'none', borderRadius: '50%', width: 40, height: 40,
              fontSize: 20, cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
    </AppLayout>
  )
}
