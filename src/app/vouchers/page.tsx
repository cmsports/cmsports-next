'use client'

import { useState, useEffect, useRef } from 'react'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, X, Eye, EyeOff } from 'lucide-react'
import { subirVoucher, eliminarVoucher, toggleVoucher } from '../actions/vouchers'

interface Voucher {
  id: string
  nombre: string
  imagen_url: string
  activo: boolean
}

export default function VouchersPage() {
  const { perfil, loading } = usePerfil()
  const [vouchers, setVouchers]   = useState<Voucher[]>([])
  const [cargando, setCargando]   = useState(true)
  const [modalImg, setModalImg]   = useState<Voucher | null>(null)
  const [subiendo, setSubiendo]   = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [modalSubir, setModalSubir]   = useState(false)
  const [base64Nuevo, setBase64Nuevo] = useState<string | null>(null)
  const [previewNuevo, setPreviewNuevo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'superadmin' || perfil?.rol === 'profesor'

  useEffect(() => {
    if (!perfil?.club_id) return
    const supabase = createClient()
    supabase.from('vouchers').select('id,nombre,imagen_url,activo')
      .eq('club_id', perfil.club_id)
      .order('creado_en', { ascending: false })
      .then(({ data }) => {
        setVouchers((data as Voucher[]) || [])
        setCargando(false)
      })
  }, [perfil?.club_id])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setBase64Nuevo(b64)
      setPreviewNuevo(b64)
      setModalSubir(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSubir() {
    if (!base64Nuevo || !nombreNuevo.trim()) return
    setSubiendo(true)
    const res = await subirVoucher({ nombre: nombreNuevo, base64: base64Nuevo })
    if (res.error) { alert('Error: ' + res.error); setSubiendo(false); return }
    setVouchers(prev => [res.voucher!, ...prev])
    setModalSubir(false)
    setNombreNuevo('')
    setBase64Nuevo(null)
    setPreviewNuevo(null)
    setSubiendo(false)
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar este voucher?')) return
    await eliminarVoucher({ id })
    setVouchers(prev => prev.filter(v => v.id !== id))
  }

  async function handleToggle(v: Voucher) {
    await toggleVoucher({ id: v.id, activo: !v.activo })
    setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, activo: !x.activo } : x))
  }

  const visibles = esStaff ? vouchers : vouchers.filter(v => v.activo)

  if (loading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Descuentos exclusivos socios</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Beneficios exclusivos para socios del club</p>
          </div>
          {esStaff && (
            <>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
              <button
                onClick={() => inputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: '#4f46e5', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '10px 18px',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={16} /> Subir voucher
              </button>
            </>
          )}
        </div>

        {/* Grid de vouchers */}
        {cargando ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: '#f1f5f9', borderRadius: 14, height: 260, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
            <p style={{ fontSize: 15, margin: 0 }}>{esStaff ? 'Sube el primer voucher con el botón de arriba' : 'No hay vouchers disponibles aún'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {visibles.map(v => (
              <div key={v.id} style={{
                background: '#ffffff', borderRadius: 14,
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                opacity: v.activo ? 1 : 0.5,
                transition: 'opacity .2s',
              }}>
                {/* Imagen clickeable → abre modal */}
                <img
                  src={v.imagen_url}
                  alt={v.nombre}
                  onClick={() => setModalImg(v)}
                  style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: esStaff ? 8 : 0 }}>
                    {v.nombre}
                  </div>
                  {esStaff && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleToggle(v)}
                        title={v.activo ? 'Ocultar' : 'Mostrar'}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 8px', fontSize: 11, color: '#64748b', cursor: 'pointer' }}
                      >
                        {v.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                        {v.activo ? 'Ocultar' : 'Mostrar'}
                      </button>
                      <button
                        onClick={() => handleEliminar(v.id)}
                        title="Eliminar"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '5px 8px', color: '#dc2626', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal ver voucher (jugadores) */}
      {modalImg && (
        <div
          onClick={() => setModalImg(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 420, width: '100%' }}>
            <button
              onClick={() => setModalImg(null)}
              style={{ position: 'absolute', top: -12, right: -12, background: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 1 }}
            >
              <X size={16} />
            </button>
            <img src={modalImg.imagen_url} alt={modalImg.nombre} style={{ width: '100%', borderRadius: 16 }} />
            <div style={{ marginTop: 12, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: 600 }}>
              {modalImg.nombre}
            </div>
          </div>
        </div>
      )}

      {/* Modal subir voucher (staff) */}
      {modalSubir && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Nuevo voucher</h2>

            {previewNuevo && (
              <img src={previewNuevo} alt="preview" style={{ width: '100%', borderRadius: 10, marginBottom: 14, maxHeight: 280, objectFit: 'contain', background: '#f8fafc' }} />
            )}

            <label style={{ fontSize: 13, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Nombre del voucher (ej: Foxhara, Hidrata, Aurora)
            </label>
            <input
              type="text"
              value={nombreNuevo}
              onChange={e => setNombreNuevo(e.target.value)}
              placeholder="Foxhara"
              autoFocus
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16, boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSubir}
                disabled={subiendo || !nombreNuevo.trim()}
                style={{
                  flex: 1, padding: '11px', background: '#4f46e5', border: 'none',
                  borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: subiendo || !nombreNuevo.trim() ? 'default' : 'pointer',
                  opacity: subiendo || !nombreNuevo.trim() ? 0.6 : 1,
                }}
              >
                {subiendo ? 'Subiendo…' : 'Guardar'}
              </button>
              <button
                onClick={() => { setModalSubir(false); setNombreNuevo(''); setBase64Nuevo(null); setPreviewNuevo(null) }}
                style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, color: '#64748b', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </AppLayout>
  )
}
