'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import {
  subirReferenciaAction, eliminarReferenciaAction, marcarReferenciaPredeterminadaAction,
  subirFotoGaleriaAction, eliminarFotoGaleriaAction,
  subirLogoAction, actualizarInfoClubAction,
} from '@/app/actions/redes-sociales'
import {
  Sparkles, ImageIcon, Images, Download, RefreshCw, Loader2, Upload, Trash2,
  Check, Shield, Plus, X, Star,
} from 'lucide-react'

const C = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  sky: '#4f46e5', skyL: '#ede9fe', skyD: '#3730a3',
  green: '#16a34a', greenL: '#f0fdf4',
  red: '#dc2626', redL: '#fef2f2',
}

const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const labelStyle = { fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6, display: 'block' } as const
const inputStyle = { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' } as const

function btn(variant: 'primary' | 'secondary' | 'danger' = 'primary', disabled = false) {
  const base = { borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as const
  if (disabled) return { ...base, background: '#c7d2fe', color: 'white' }
  if (variant === 'secondary') return { ...base, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }
  if (variant === 'danger') return { ...base, background: C.redL, color: C.red, border: '1px solid #fecaca' }
  return { ...base, background: C.sky, color: 'white' }
}

interface FlyerReferencia { id: string; url: string; nombre: string | null; predeterminada: boolean }
interface FotoGaleria { id: string; url: string; tipo: string }
interface Categoria { nombre: string; precio: string; hora: string }
interface Premio { lugar: string; monto: string }

const TIPOS_FOTO = [
  { value: 'jugador', label: 'Jugador' },
  { value: 'cancha', label: 'Cancha' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'otro', label: 'Otro' },
]

const TIPOS_EVENTO = ['Torneo', 'Torneo Relámpago', 'Interclubes', 'Clase']

function GridSelector<T extends { id: string; url: string }>({
  items, seleccionado, onSelect, vacio,
}: { items: T[]; seleccionado: string | null; onSelect: (id: string) => void; vacio: string }) {
  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: C.hint, padding: '20px 0', textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 8 }}>{vacio}</div>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          style={{
            position: 'relative', aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
            border: `2px solid ${seleccionado === item.id ? C.sky : C.border}`, padding: 0, background: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {seleccionado === item.id && (
            <div style={{ position: 'absolute', top: 4, right: 4, background: C.sky, color: 'white', borderRadius: '50%', padding: 2, display: 'flex' }}>
              <Check size={11} />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

export default function RedesSocialesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const referenciaInputRef = useRef<HTMLInputElement>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [clubNombre, setClubNombre] = useState('Mi Club')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [clubInfoCargado, setClubInfoCargado] = useState(false)

  const [tab, setTab] = useState<'crear' | 'referencias' | 'galeria'>('crear')

  const [referencias, setReferencias] = useState<FlyerReferencia[]>([])
  const [fotos, setFotos] = useState<FotoGaleria[]>([])
  const [cargandoDatos, setCargandoDatos] = useState(true)

  const [tipoEvento, setTipoEvento] = useState('Torneo')
  const [nombreEvento, setNombreEvento] = useState('')
  const [fecha, setFecha] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([{ nombre: 'Singles', precio: '', hora: '' }])
  const [premios, setPremios] = useState<Premio[]>([{ lugar: '1er lugar', monto: '' }, { lugar: '2do lugar', monto: '' }])
  const [notas, setNotas] = useState('')
  const [instrucciones, setInstrucciones] = useState('')

  const [referenciaSel, setReferenciaSel] = useState<string | null>(null)
  const [fotoSel, setFotoSel] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [subiendoReferencia, setSubiendoReferencia] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [tipoFotoNueva, setTipoFotoNueva] = useState('jugador')

  async function cargarDatos(club: string) {
    setCargandoDatos(true)
    const supabase = createClient()
    const [{ data: refs }, { data: fts }] = await Promise.all([
      supabase.from('flyer_referencias').select('id,url,nombre,predeterminada').eq('club_id', club).order('creado_en', { ascending: false }),
      supabase.from('fotos_galeria').select('id,url,tipo').eq('club_id', club).order('creado_en', { ascending: false }),
    ])
    setReferencias(refs || [])
    setFotos(fts || [])
    setCargandoDatos(false)
    const predeterminada = (refs || []).find(r => r.predeterminada)
    if (predeterminada) setReferenciaSel(prev => prev || predeterminada.id)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol === 'jugador') { router.push('/perfil'); return }
    if (perfil.club_id) {
      setClubId(perfil.club_id)
      const supabase = createClient()
      supabase.from('clubes').select('nombre,logo_url,direccion,telefono').eq('id', perfil.club_id).single()
        .then(({ data, error: clubError }) => {
          if (clubError) {
            setError('No se pudo cargar la información del club (revisa que las migraciones de la base de datos estén aplicadas): ' + clubError.message)
            return
          }
          if (data?.nombre) setClubNombre(data.nombre)
          if (data?.logo_url) setLogoUrl(data.logo_url)
          if (data?.direccion) setDireccion(data.direccion)
          if (data?.telefono) setTelefono(data.telefono)
          setClubInfoCargado(true)
        })
      cargarDatos(perfil.club_id)
    }
  }, [authLoading, perfil])

  async function guardarInfoClubSiCambio(nuevaDireccion: string, nuevoTelefono: string) {
    try {
      await actualizarInfoClubAction(nuevaDireccion, nuevoTelefono)
    } catch (e) {
      console.error('Error al guardar datos del club:', e)
    }
  }

  function actualizarCategoria(i: number, campo: keyof Categoria, valor: string) {
    setCategorias(prev => prev.map((c, idx) => idx === i ? { ...c, [campo]: valor } : c))
  }

  function agregarCategoria() {
    setCategorias(prev => [...prev, { nombre: '', precio: '', hora: '' }])
  }

  function quitarCategoria(i: number) {
    setCategorias(prev => prev.filter((_, idx) => idx !== i))
  }

  function actualizarPremio(i: number, campo: keyof Premio, valor: string) {
    setPremios(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p))
  }

  function agregarPremio() {
    setPremios(prev => [...prev, { lugar: '', monto: '' }])
  }

  function quitarPremio(i: number) {
    setPremios(prev => prev.filter((_, idx) => idx !== i))
  }

  async function onSubirReferencia(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo || !clubId) return
    setSubiendoReferencia(true)
    const fd = new FormData()
    fd.append('archivo', archivo)
    const res = await subirReferenciaAction(fd)
    if (res.error) setError(res.error)
    else await cargarDatos(clubId)
    setSubiendoReferencia(false)
    if (referenciaInputRef.current) referenciaInputRef.current.value = ''
  }

  async function onEliminarReferencia(id: string) {
    if (!clubId) return
    await eliminarReferenciaAction(id)
    if (referenciaSel === id) setReferenciaSel(null)
    await cargarDatos(clubId)
  }

  async function onMarcarPredeterminada(id: string) {
    if (!clubId) return
    await marcarReferenciaPredeterminadaAction(id)
    setReferenciaSel(id)
    await cargarDatos(clubId)
  }

  async function onSubirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo || !clubId) return
    setSubiendoFoto(true)
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('tipo', tipoFotoNueva)
    const res = await subirFotoGaleriaAction(fd)
    if (res.error) setError(res.error)
    else await cargarDatos(clubId)
    setSubiendoFoto(false)
    if (fotoInputRef.current) fotoInputRef.current.value = ''
  }

  async function onEliminarFoto(id: string) {
    if (!clubId) return
    await eliminarFotoGaleriaAction(id)
    if (fotoSel === id) setFotoSel(null)
    await cargarDatos(clubId)
  }

  async function onSubirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo || !clubId) return
    setSubiendoLogo(true)
    const fd = new FormData()
    fd.append('archivo', archivo)
    const res = await subirLogoAction(fd)
    if (res.error) setError(res.error)
    else {
      const supabase = createClient()
      const { data } = await supabase.from('clubes').select('logo_url').eq('id', clubId).single()
      if (data?.logo_url) setLogoUrl(data.logo_url)
    }
    setSubiendoLogo(false)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const listo = !!nombreEvento.trim() && !!referenciaSel && !!fotoSel && clubInfoCargado

  async function generar() {
    if (!listo) return
    setGenerando(true); setError(''); setResultado(null)
    try {
      const referenciaUrl = referencias.find(r => r.id === referenciaSel)?.url
      const fotoUrl = fotos.find(f => f.id === fotoSel)?.url
      const res = await fetch('/api/generar-flyer-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoEvento, nombreEvento, fecha, categorias, premios, notas, instrucciones,
          clubNombre, direccion, telefono, referenciaUrl, fotoUrl, logoUrl,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResultado(data.imagen)
    } catch (e: any) {
      setError(e.message || 'Error al generar. Intenta de nuevo.')
    } finally {
      setGenerando(false)
    }
  }

  function descargar() {
    if (!resultado) return
    const a = document.createElement('a')
    a.download = `flyer-${Date.now()}.png`
    a.href = resultado
    a.click()
  }

  if (authLoading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>Redes Sociales</h1>
          <p style={{ fontSize: 12, color: C.hint, margin: 0 }}>Genera flyers usando tus propios diseños y fotos como referencia</p>
        </div>

        <div style={{ display: 'flex', gap: 4, background: C.bg, borderRadius: 10, padding: 4, border: `1px solid ${C.border}`, marginBottom: 18, width: 'fit-content' }}>
          {([
            { key: 'crear', label: 'Crear', icon: Sparkles },
            { key: 'referencias', label: `Mis Referencias${referencias.length ? ` (${referencias.length})` : ''}`, icon: ImageIcon },
            { key: 'galeria', label: `Galería de Fotos${fotos.length ? ` (${fotos.length})` : ''}`, icon: Images },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, border: 'none',
                background: tab === t.key ? C.card : 'transparent',
                color: tab === t.key ? C.sky : C.muted,
                fontWeight: tab === t.key ? 700 : 500, fontSize: 13, cursor: 'pointer',
                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'crear' && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div style={cardStyle}>
                <label style={labelStyle}>Datos fijos del club</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : <Shield size={18} color={C.hint} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{clubNombre}</div>
                    <button onClick={() => logoInputRef.current?.click()} disabled={subiendoLogo} style={{ ...btn('secondary'), fontSize: 11, padding: '4px 8px', marginTop: 4 }}>
                      {subiendoLogo ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={11} />} {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                    </button>
                    <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSubirLogo} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, marginBottom: 3, display: 'block' }}>Dirección</label>
                    <input value={direccion} onChange={e => setDireccion(e.target.value)} onBlur={e => guardarInfoClubSiCambio(e.target.value, telefono)} placeholder="Nogales 264, San Bernardo" style={{ ...inputStyle, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, marginBottom: 3, display: 'block' }}>Teléfono</label>
                    <input value={telefono} onChange={e => setTelefono(e.target.value)} onBlur={e => guardarInfoClubSiCambio(direccion, e.target.value)} placeholder="+56 9 1234 5678" style={{ ...inputStyle, fontSize: 12 }} />
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Evento</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, marginBottom: 3, display: 'block' }}>Tipo</label>
                    <select value={tipoEvento} onChange={e => setTipoEvento(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {TIPOS_EVENTO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, marginBottom: 3, display: 'block' }}>Fecha</label>
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} />
                  </div>
                </div>
                <label style={{ fontSize: 11, color: C.muted, marginBottom: 3, display: 'block' }}>Nombre del evento</label>
                <input value={nombreEvento} onChange={e => setNombreEvento(e.target.value)} placeholder="Copa Verano" style={inputStyle} />
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Categorías</label>
                  <button onClick={agregarCategoria} style={{ ...btn('secondary'), fontSize: 11, padding: '4px 8px' }}>
                    <Plus size={11} /> Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {categorias.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, alignItems: 'center' }}>
                      <input value={c.nombre} onChange={e => actualizarCategoria(i, 'nombre', e.target.value)} placeholder="Singles" style={{ ...inputStyle, fontSize: 12 }} />
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.hint }}>$</span>
                        <input type="number" inputMode="numeric" value={c.precio} onChange={e => actualizarCategoria(i, 'precio', e.target.value)} placeholder="5000" style={{ ...inputStyle, fontSize: 12, paddingLeft: 18 }} />
                      </div>
                      <input type="time" value={c.hora} onChange={e => actualizarCategoria(i, 'hora', e.target.value)} style={{ ...inputStyle, fontSize: 12, cursor: 'pointer' }} />
                      <button onClick={() => quitarCategoria(i)} style={{ background: 'none', border: 'none', color: C.hint, cursor: 'pointer', padding: 4 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Premios <span style={{ fontWeight: 400, color: C.hint }}>(opcional)</span></label>
                  <button onClick={agregarPremio} style={{ ...btn('secondary'), fontSize: 11, padding: '4px 8px' }}>
                    <Plus size={11} /> Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {premios.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'center' }}>
                      <input value={p.lugar} onChange={e => actualizarPremio(i, 'lugar', e.target.value)} placeholder="1er lugar" style={{ ...inputStyle, fontSize: 12 }} />
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.hint }}>$</span>
                        <input type="number" inputMode="numeric" value={p.monto} onChange={e => actualizarPremio(i, 'monto', e.target.value)} placeholder="20000" style={{ ...inputStyle, fontSize: 12, paddingLeft: 18 }} />
                      </div>
                      <button onClick={() => quitarPremio(i)} style={{ background: 'none', border: 'none', color: C.hint, cursor: 'pointer', padding: 4 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <label style={{ ...labelStyle, marginBottom: 8 }}>Información adicional <span style={{ fontWeight: 400, color: C.hint }}>(opcional)</span></label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Transmisión en vivo por YouTube" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ ...cardStyle, border: `1px solid ${C.sky}`, background: C.skyL }}>
                <label style={{ ...labelStyle, color: C.skyD }}>Instrucciones para la IA <span style={{ fontWeight: 400, color: C.skyD, opacity: 0.7 }}>(opcional, prioridad alta)</span></label>
                <div style={{ fontSize: 11, color: C.skyD, opacity: 0.8, marginBottom: 8 }}>Esto no aparece escrito en el flyer — son instrucciones de diseño que la IA debe seguir por sobre todo lo demás.</div>
                <textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)} placeholder="Ej: pon el nombre del club arriba, usa letras más grandes, que la foto ocupe más espacio" rows={3} style={{ ...inputStyle, resize: 'vertical', background: 'white' }} />
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Diseño de referencia</label>
                {cargandoDatos ? <div style={{ fontSize: 12, color: C.hint }}>Cargando...</div> : (
                  <GridSelector items={referencias} seleccionado={referenciaSel} onSelect={setReferenciaSel} vacio="Sube tus flyers favoritos en 'Mis Referencias'" />
                )}
              </div>

              <div style={cardStyle}>
                <label style={labelStyle}>Foto a usar</label>
                {cargandoDatos ? <div style={{ fontSize: 12, color: C.hint }}>Cargando...</div> : (
                  <GridSelector items={fotos} seleccionado={fotoSel} onSelect={setFotoSel} vacio="Sube fotos en 'Galería de Fotos'" />
                )}
              </div>

              <button onClick={generar} disabled={!listo || generando} style={{ ...btn('primary', !listo || generando), width: '100%', justifyContent: 'center', padding: '12px' }}>
                {generando ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Generando flyer...</> : <><Sparkles size={15} /> Generar flyer</>}
              </button>

              {resultado && (
                <button onClick={generar} style={{ ...btn('secondary'), width: '100%', justifyContent: 'center' }}>
                  <RefreshCw size={13} /> Regenerar
                </button>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: C.redL, border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>
              )}
            </div>

            <div>
              {generando && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.skyL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={22} color={C.sky} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Creando tu flyer...</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Combinando tu referencia y tu foto</div>
                  </div>
                </div>
              )}
              {!generando && !resultado && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, border: `2px dashed ${C.border}`, borderRadius: 12 }}>
                  <ImageIcon size={40} color={C.hint} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: C.muted }}>Tu flyer aparecerá aquí</div>
                    <div style={{ fontSize: 13, color: C.hint, marginTop: 4 }}>Completa los datos, elige referencia y foto, y dale a Generar</div>
                  </div>
                </div>
              )}
              {!generando && resultado && (
                <div style={{ maxWidth: 480, margin: '0 auto' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultado} alt="Flyer generado" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.border}` }} />
                  <button onClick={descargar} style={{ ...btn('primary'), width: '100%', justifyContent: 'center', marginTop: 12 }}>
                    <Download size={14} /> Descargar PNG
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'referencias' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Tus flyers de referencia</div>
                <div style={{ fontSize: 12, color: C.muted }}>Sube los diseños (de Canva u otra herramienta) que más te gustan — la IA los usará como plantilla</div>
              </div>
              <button onClick={() => referenciaInputRef.current?.click()} disabled={subiendoReferencia} style={btn('primary')}>
                {subiendoReferencia ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />} Subir referencia
              </button>
              <input ref={referenciaInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSubirReferencia} />
            </div>
            {referencias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.hint, fontSize: 13 }}>Sin referencias aún — sube tu primer flyer para empezar</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {referencias.map(r => (
                  <div key={r.id} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', border: `2px solid ${r.predeterminada ? C.sky : C.border}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {r.predeterminada && (
                      <span style={{ position: 'absolute', bottom: 6, left: 6, background: C.sky, color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Star size={10} fill="white" /> Predeterminada
                      </span>
                    )}
                    {!r.predeterminada && (
                      <button onClick={() => onMarcarPredeterminada(r.id)} title="Usar como predeterminada" style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Star size={13} />
                      </button>
                    )}
                    <button onClick={() => onEliminarReferencia(r.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'galeria' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Galería de fotos del club</div>
                <div style={{ fontSize: 12, color: C.muted }}>Fotos reales de jugadores, canchas o equipo para usar en los flyers</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={tipoFotoNueva} onChange={e => setTipoFotoNueva(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '8px 10px' }}>
                  {TIPOS_FOTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => fotoInputRef.current?.click()} disabled={subiendoFoto} style={btn('primary')}>
                  {subiendoFoto ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />} Subir foto
                </button>
              </div>
              <input ref={fotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onSubirFoto} />
            </div>
            {fotos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.hint, fontSize: 13 }}>Sin fotos aún — sube fotos de jugadores, canchas o equipo</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                {fotos.map(f => (
                  <div key={f.id} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <span style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, textTransform: 'capitalize' }}>{f.tipo}</span>
                    <button onClick={() => onEliminarFoto(f.id)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </AppLayout>
  )
}
