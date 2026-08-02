'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, X } from 'lucide-react'
import { subirVoucher, eliminarVoucher } from '@/app/actions/vouchers'

// Las tres marcas que auspician a la Asociación. El logo vive en /public/sponsors
// y los descuentos son los vouchers de la tabla `vouchers` con esa `marca`.
export const MARCAS = [
  { key: 'foxhara', label: 'Foxhara Sport', src: '/sponsors/foxhara.png', bg: '#ffffff' },
  { key: 'aurora',  label: 'Aurora',        src: '/sponsors/aurora.png',  bg: '#111111' },
  { key: 'hidrata', label: 'Hidrata',       src: '/sponsors/hidrata.png', bg: '#111111' },
] as const

type Voucher = { id: string; nombre: string; imagen_url: string; activo: boolean; marca: string | null }
type Marca = typeof MARCAS[number]

export default function MarcasAuspiciadores({ clubId, esStaff, borderColor }: {
  clubId: string | null
  esStaff: boolean
  borderColor: string
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [abierta, setAbierta]   = useState<Marca | null>(null)
  const [zoom, setZoom]         = useState<Voucher | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!clubId) return
    let activo = true
    createClient().from('vouchers').select('id,nombre,imagen_url,activo,marca')
      .eq('club_id', clubId)
      .order('creado_en', { ascending: false })
      .then(({ data }) => { if (activo) setVouchers((data as Voucher[]) || []) })
    return () => { activo = false }
  }, [clubId])

  const deMarca = (key: string) =>
    vouchers.filter(v => v.marca === key && (esStaff || v.activo))

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !abierta) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const base64 = ev.target?.result as string
      setSubiendo(true)
      const res = await subirVoucher({ nombre: abierta.label, base64, marca: abierta.key })
      setSubiendo(false)
      if (res.error) { alert('Error: ' + res.error); return }
      if (res.voucher) setVouchers(prev => [res.voucher as Voucher, ...prev])
    }
    reader.readAsDataURL(file)
  }

  async function borrar(v: Voucher) {
    if (!confirm('¿Eliminar este descuento?')) return
    await eliminarVoucher({ id: v.id })
    setVouchers(prev => prev.filter(x => x.id !== v.id))
  }

  const descuentos = abierta ? deMarca(abierta.key) : []

  return (
    <>
      {/* Logos — al tocarlos se abren los descuentos de esa marca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' }}>
        {MARCAS.map(m => {
          const cantidad = deMarca(m.key).length
          return (
            <button
              key={m.key}
              onClick={() => setAbierta(m)}
              title={cantidad > 0 ? `Ver descuentos de ${m.label}` : `${m.label} — sin descuentos cargados`}
              style={{
                position: 'relative',
                width: 110, height: 44,
                background: m.bg,
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                overflow: 'hidden', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 6px rgba(15,23,42,0.08)',
                flexShrink: 0, cursor: 'pointer',
              }}
            >
              <img
                src={m.src}
                alt={m.label}
                style={{ maxWidth: '90%', maxHeight: '80%', objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {cantidad > 0 && (
                <span style={{
                  position: 'absolute', top: 3, right: 4,
                  background: '#16a34a', color: '#fff',
                  fontSize: 9, fontWeight: 700,
                  borderRadius: 20, padding: '1px 5px', lineHeight: 1.5,
                }}>
                  {cantidad}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Descuentos de la marca */}
      {abierta && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setAbierta(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}
        >
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, height: 34, background: abierta.bg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={abierta.src} alt={abierta.label} style={{ maxWidth: '88%', maxHeight: '80%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{abierta.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Descuentos para socios</div>
                </div>
              </div>
              <button onClick={() => setAbierta(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {esStaff && (
              <>
                <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onArchivo} />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={subiendo}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: subiendo ? '#e2e8f0' : '#4f46e5', color: subiendo ? '#94a3b8' : '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: subiendo ? 'default' : 'pointer', marginBottom: 16 }}
                >
                  <Plus size={15} /> {subiendo ? 'Subiendo…' : `Subir descuento de ${abierta.label}`}
                </button>
              </>
            )}

            {descuentos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎟️</div>
                <p style={{ fontSize: 14, margin: 0 }}>
                  {esStaff ? 'Sube el primer descuento de esta marca.' : 'Aún no hay descuentos disponibles.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                {descuentos.map(v => (
                  <div key={v.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', position: 'relative', opacity: v.activo ? 1 : 0.5, background: '#f4f7fa' }}>
                    <img
                      src={v.imagen_url}
                      alt={v.nombre}
                      onClick={() => setZoom(v)}
                      style={{ width: '100%', aspectRatio: '3/4', objectFit: 'contain', cursor: 'zoom-in', display: 'block' }}
                    />
                    {esStaff && (
                      <button
                        onClick={() => borrar(v)}
                        title="Eliminar"
                        style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,0.94)', border: '1px solid #fecaca', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Imagen del descuento en grande */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 460, width: '100%' }}>
            <button
              onClick={() => setZoom(null)}
              style={{ position: 'absolute', top: -12, right: -12, background: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 1 }}
            >
              <X size={16} />
            </button>
            <img src={zoom.imagen_url} alt={zoom.nombre} style={{ width: '100%', borderRadius: 16 }} />
          </div>
        </div>
      )}
    </>
  )
}
