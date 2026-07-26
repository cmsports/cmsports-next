'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { Pencil, Trash2, Plus, X } from 'lucide-react'
import { crearProductoTienda, editarProductoTienda, eliminarProductoTienda } from '@/app/actions/tienda-buin'

const WA = '56968342721'

type Producto = {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string
  color: string | null
  stock: number
  precio: number | null
  imagen_url: string | null
}

const CATS_CON_COLOR = ['gomas', 'vestimenta']

const CATS = [
  { key: 'todos',      label: 'Todos' },
  { key: 'maderos',    label: 'Maderos' },
  { key: 'gomas',      label: 'Gomas' },
  { key: 'pelotas',    label: 'Pelotas' },
  { key: 'accesorios', label: 'Accesorios' },
  { key: 'vestimenta', label: 'Vestimenta' },
  { key: 'otros',      label: 'Otros deportivos' },
] as const

type CatKey = typeof CATS[number]['key']

const FORM_VACIO = {
  nombre: '', descripcion: '', categoria: 'maderos' as string,
  color: '', stock: '1', precio: '',
  base64: null as string | null,
  preview: null as string | null,
}

const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

const msgWA = (nombre: string, precio: number | null) =>
  `Hola Rodrigo! Quiero consultar disponibilidad de: ${nombre}${precio ? ` — ${fmt(precio)}` : ''}`

const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#f4f7fa', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none',
}
const labelStyle: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4,
}

export default function TiendaBuinPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [productos, setProductos]       = useState<Producto[]>([])
  const [cargando, setCargando]         = useState(false)
  const [filtro, setFiltro]             = useState<CatKey>('todos')
  const [modal, setModal]               = useState<null | 'nuevo' | Producto>(null)
  const [form, setForm]                 = useState(FORM_VACIO)
  const [guardando, setGuardando]       = useState(false)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [errorForm, setErrorForm]       = useState('')
  const imgRef = useRef<HTMLInputElement>(null)

  const esStaff = perfil?.rol === 'admin' || perfil?.rol === 'superadmin' || perfil?.rol === 'profesor'

  async function cargar(clubId: string) {
    setCargando(true)
    try {
      const { data } = await createClient()
        .from('tienda_buin_productos')
        .select('id,nombre,descripcion,categoria,color,stock,precio,imagen_url')
        .eq('club_id', clubId)
        .order('categoria').order('nombre')
      setProductos((data as Producto[]) || [])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (perfil?.club_id) cargar(perfil.club_id)
  }, [authLoading, perfil?.club_id])

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setErrorForm('')
    setModal('nuevo')
  }

  function abrirEditar(p: Producto) {
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      categoria: p.categoria,
      color: p.color || '',
      stock: String(p.stock),
      precio: p.precio ? String(p.precio) : '',
      base64: null,
      preview: p.imagen_url,
    })
    setErrorForm('')
    setModal(p)
  }

  function onImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target?.result as string
      setForm(f => ({ ...f, base64: b64, preview: b64 }))
    }
    reader.readAsDataURL(file)
    if (imgRef.current) imgRef.current.value = ''
  }

  async function guardar() {
    if (!form.nombre.trim()) { setErrorForm('El nombre es obligatorio'); return }
    const stockNum = parseInt(form.stock)
    if (isNaN(stockNum) || stockNum < 0) { setErrorForm('Stock inválido'); return }
    setGuardando(true)
    setErrorForm('')

    const precio = form.precio ? parseInt(form.precio) : null
    const res = modal === 'nuevo'
      ? await crearProductoTienda({ nombre: form.nombre, descripcion: form.descripcion, categoria: form.categoria, color: form.color, stock: stockNum, precio, base64: form.base64 })
      : await editarProductoTienda({ id: (modal as Producto).id, nombre: form.nombre, descripcion: form.descripcion, categoria: form.categoria, color: form.color, stock: stockNum, precio, base64: form.base64 })

    setGuardando(false)
    if (res?.error) { setErrorForm(String(res.error)); return }
    setModal(null)
    if (perfil?.club_id) cargar(perfil.club_id)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    setEliminandoId(id)
    await eliminarProductoTienda({ id })
    setEliminandoId(null)
    if (perfil?.club_id) cargar(perfil.club_id)
  }

  const filtrados = filtro === 'todos' ? productos : productos.filter(p => p.categoria === filtro)
  const catLabel = CATS.find(c => c.key === filtro)?.label ?? ''

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: '#94a3b8', fontSize: 14 }}>Cargando...</div>
    </div>
  )

  if (!perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: '#152a4a', borderRadius: 12, padding: '18px 20px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>CATÁLOGO TENIS DE MESA</div>
            <div style={{ color: '#94b8d8', fontSize: 11, fontWeight: 600, letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' }}>
              {productos.length} producto{productos.length !== 1 ? 's' : ''} disponibles
            </div>
          </div>
          {esStaff && (
            <button
              onClick={abrirNuevo}
              style={{ background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <Plus size={15} /> Agregar
            </button>
          )}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {CATS.map(c => (
            <button
              key={c.key}
              onClick={() => setFiltro(c.key)}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: filtro === c.key ? '#c8102e' : '#e2e8f0', color: filtro === c.key ? '#fff' : '#334155', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.4 }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Cargando */}
        {cargando && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>Cargando catálogo...</div>
        )}

        {/* Sin productos */}
        {!cargando && filtrados.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
            {esStaff
              ? <>Sin productos en <strong>{catLabel}</strong>. Usa <strong>+ Agregar</strong> para crear uno.</>
              : `Sin productos disponibles en ${catLabel}.`}
          </div>
        )}

        {/* Grid productos */}
        {!cargando && filtrados.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            {filtrados.map(p => (
              <div
                key={p.id}
                style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}
              >
                {/* Botones staff */}
                {esStaff && (
                  <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4, zIndex: 2 }}>
                    <button
                      onClick={() => abrirEditar(p)}
                      title="Editar"
                      style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #e2e8f0', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                    >
                      <Pencil size={13} color="#334155" />
                    </button>
                    <button
                      onClick={() => eliminar(p.id)}
                      disabled={eliminandoId === p.id}
                      title="Eliminar"
                      style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #fecaca', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: eliminandoId === p.id ? 'wait' : 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', opacity: eliminandoId === p.id ? 0.5 : 1 }}
                    >
                      <Trash2 size={13} color="#dc2626" />
                    </button>
                  </div>
                )}

                {/* Imagen */}
                <div style={{ background: '#f4f6f8', aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 12 }}>
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt={p.nombre} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                    : <div style={{ fontSize: 40, color: '#cbd5e1' }}>🏓</div>
                  }
                </div>

                {/* Info */}
                <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a2a4a', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.3 }}>
                    {p.nombre}
                  </div>
                  {p.descripcion && (
                    <div style={{ fontSize: 10, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                      {p.descripcion}
                    </div>
                  )}

                  {/* Color badge */}
                  {p.color && CATS_CON_COLOR.includes(p.categoria) && (
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 20 }}>
                        🎨 {p.color}
                      </span>
                    </div>
                  )}

                  {/* Stock badge */}
                  <div style={{ textAlign: 'center' }}>
                    {p.stock === 0
                      ? <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 800, padding: '2px 10px', borderRadius: 20, letterSpacing: 0.5 }}>AGOTADO</span>
                      : <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{p.stock} disponible{p.stock !== 1 ? 's' : ''}</span>
                    }
                  </div>

                  {/* Precio + WhatsApp */}
                  {p.stock > 0 ? (
                    <WhatsAppBtn
                      href={`https://wa.me/${WA}?text=${encodeURIComponent(msgWA(p.nombre, p.precio))}`}
                      style={{ flexDirection: 'column', gap: 2, borderRadius: 6, padding: '8px 10px' }}
                    >
                      {p.precio && <span style={{ fontWeight: 800, fontSize: 15 }}>{fmt(p.precio)}</span>}
                      <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.9 }}>Consultar al profe</span>
                    </WhatsAppBtn>
                  ) : p.precio ? (
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{fmt(p.precio)}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ background: '#152a4a', borderRadius: 12, padding: '16px 20px', textAlign: 'center', color: '#fff', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#94b8d8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Coordinar compra con profesor</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5, marginBottom: 2 }}>RODRIGO SALAZAR</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#5ba3d9', marginBottom: 10 }}>+56 9 6834 2721</div>
          <WhatsAppBtn href={`https://wa.me/${WA}`} style={{ borderRadius: 8, fontSize: 13, padding: '10px 20px' }}>
            Coordinar por WhatsApp
          </WhatsAppBtn>
        </div>

      </div>

      {/* Modal crear / editar */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(15,23,42,0.22)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {modal === 'nuevo' ? 'Agregar producto' : 'Editar producto'}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Zona imagen */}
            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImagen} />
            <div
              onClick={() => imgRef.current?.click()}
              style={{ background: '#f4f6f8', border: '2px dashed #cbd5e1', borderRadius: 10, aspectRatio: '2/1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 16, overflow: 'hidden', position: 'relative' }}
            >
              {form.preview
                ? <img src={form.preview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="preview" />
                : <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>📷</div>
                    <div style={{ fontSize: 12 }}>Toca para agregar imagen</div>
                  </div>
              }
              {form.preview && (
                <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, borderRadius: 4, padding: '2px 8px' }}>
                  Toca para cambiar
                </div>
              )}
            </div>

            {/* Nombre */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nombre *</label>
              <input
                style={inputStyle}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="ej: ANDRO RASANTER R50"
              />
            </div>

            {/* Descripción */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Descripción</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical' }}
                rows={2}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Características del producto..."
              />
            </div>

            {/* Color (solo para gomas y vestimenta) */}
            {CATS_CON_COLOR.includes(form.categoria) && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Color / Talle</label>
                <input
                  style={inputStyle}
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="ej: Rojo · Negro · S / M / L"
                />
              </div>
            )}

            {/* Categoría + Stock */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select
                  style={{ ...inputStyle }}
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                >
                  {CATS.filter(c => c.key !== 'todos').map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Stock disponible</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>

            {/* Precio */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Precio (opcional)</label>
              <input
                style={inputStyle}
                type="number"
                min={0}
                placeholder="ej: 25000"
                value={form.precio}
                onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
              />
            </div>

            {errorForm && (
              <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>
                {errorForm}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setModal(null)}
                style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                style={{ flex: 1, padding: 10, background: guardando ? '#e2e8f0' : '#152a4a', border: 'none', borderRadius: 8, color: guardando ? '#94a3b8' : '#fff', fontSize: 13, fontWeight: 700, cursor: guardando ? 'default' : 'pointer' }}
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
