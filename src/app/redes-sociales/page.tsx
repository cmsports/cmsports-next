'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import {
  subirReferenciaAction, eliminarReferenciaAction,
  subirFotoGaleriaAction, eliminarFotoGaleriaAction,
  subirLogoAction,
} from '@/app/actions/redes-sociales'
import { Button, Card, EmptyState } from '@/components/ui'
import { Sparkles, ImageIcon, Images, Download, RefreshCw, Loader2, Upload, Trash2, Check, Shield } from 'lucide-react'

interface FlyerReferencia { id: string; url: string; nombre: string | null }
interface FotoGaleria { id: string; url: string; tipo: string }

const TIPOS_FOTO = [
  { value: 'jugador', label: 'Jugador' },
  { value: 'cancha', label: 'Cancha' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'otro', label: 'Otro' },
]

function GridSelector<T extends { id: string; url: string }>({
  items, seleccionado, onSelect, vacio,
}: { items: T[]; seleccionado: string | null; onSelect: (id: string) => void; vacio: string }) {
  if (items.length === 0) {
    return <div className="text-xs text-[var(--text-muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-lg">{vacio}</div>
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className="relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer"
          style={{ borderColor: seleccionado === item.id ? 'var(--sky)' : 'var(--border)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" className="w-full h-full object-cover" />
          {seleccionado === item.id && (
            <div className="absolute top-1 right-1 bg-[var(--sky)] text-white rounded-full p-0.5">
              <Check className="size-3" />
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
  const [tab, setTab] = useState<'crear' | 'referencias' | 'galeria'>('crear')

  const [referencias, setReferencias] = useState<FlyerReferencia[]>([])
  const [fotos, setFotos] = useState<FotoGaleria[]>([])
  const [cargandoDatos, setCargandoDatos] = useState(true)

  const [prompt, setPrompt] = useState('')
  const [referenciaSel, setReferenciaSel] = useState<string | null>(null)
  const [fotoSel, setFotoSel] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [subiendoReferencia, setSubiendoReferencia] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [tipoFotoNueva, setTipoFotoNueva] = useState('jugador')

  const ejemplos = [
    '¡Ganamos el torneo regional! Campeones 2026',
    'Gran Torneo este sábado 10am, ¡inscríbete!',
    'Interclubes relámpago, domingo 29, Nogales 264',
    'Torneo a beneficio, cupos limitados',
  ]

  async function cargarDatos(club: string) {
    setCargandoDatos(true)
    const supabase = createClient()
    const [{ data: refs }, { data: fts }] = await Promise.all([
      supabase.from('flyer_referencias').select('id,url,nombre').eq('club_id', club).order('creado_en', { ascending: false }),
      supabase.from('fotos_galeria').select('id,url,tipo').eq('club_id', club).order('creado_en', { ascending: false }),
    ])
    setReferencias(refs || [])
    setFotos(fts || [])
    setCargandoDatos(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol === 'jugador') { router.push('/perfil'); return }
    if (perfil.club_id) {
      setClubId(perfil.club_id)
      const supabase = createClient()
      supabase.from('clubes').select('nombre,logo_url').eq('id', perfil.club_id).single()
        .then(({ data }) => {
          if (data?.nombre) setClubNombre(data.nombre)
          if (data?.logo_url) setLogoUrl(data.logo_url)
        })
      cargarDatos(perfil.club_id)
    }
  }, [authLoading, perfil])

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

  async function generar() {
    if (!prompt.trim() || !referenciaSel || !fotoSel) return
    setGenerando(true); setError(''); setResultado(null)
    try {
      const referenciaUrl = referencias.find(r => r.id === referenciaSel)?.url
      const fotoUrl = fotos.find(f => f.id === fotoSel)?.url
      const res = await fetch('/api/generar-flyer-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, clubNombre, referenciaUrl, fotoUrl, logoUrl }),
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
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--text)]">Redes Sociales</h1>
          <p className="text-sm text-[var(--text-muted)]">Genera flyers profesionales usando tus propios diseños y fotos como referencia</p>
        </div>

        <div className="flex gap-1 bg-[var(--bg-dark)] rounded-lg p-1 border border-[var(--border)] mb-5 w-fit">
          {([
            { key: 'crear', label: 'Crear', icon: Sparkles },
            { key: 'referencias', label: `Mis Referencias${referencias.length ? ` (${referencias.length})` : ''}`, icon: ImageIcon },
            { key: 'galeria', label: `Galería de Fotos${fotos.length ? ` (${fotos.length})` : ''}`, icon: Images },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors"
              style={{
                background: tab === t.key ? 'white' : 'transparent',
                color: tab === t.key ? 'var(--sky)' : 'var(--text-muted)',
                boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'crear' && (
          <div className="grid grid-cols-[360px_1fr] gap-6 items-start">
            <div className="flex flex-col gap-4">
              <Card>
                <label className="text-sm font-semibold text-[var(--text)] block mb-2">¿Qué quieres publicar?</label>
                <textarea
                  value={prompt} onChange={e => setPrompt(e.target.value)}
                  placeholder="Ej: Torneo épico de tenis de mesa, sábado 27 de junio a las 12pm, inscripción $5.000, premios 1er y 2do lugar"
                  rows={4}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm text-[var(--text)] resize-y outline-none focus:border-[var(--sky)]"
                />
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="text-xs text-[var(--text-muted)]">Ejemplos:</div>
                  {ejemplos.map(ej => (
                    <button key={ej} onClick={() => setPrompt(ej)} className="text-left px-2 py-1.5 bg-[var(--bg-dark)] border border-[var(--border)] rounded-md text-xs text-[var(--text-muted)] cursor-pointer hover:border-[var(--sky)]">
                      {ej}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <label className="text-sm font-semibold text-[var(--text)] block mb-2">Diseño de referencia</label>
                {cargandoDatos ? (
                  <div className="text-xs text-[var(--text-muted)]">Cargando...</div>
                ) : (
                  <GridSelector items={referencias} seleccionado={referenciaSel} onSelect={setReferenciaSel} vacio="Sube tus flyers favoritos en la pestaña 'Mis Referencias'" />
                )}
              </Card>

              <Card>
                <label className="text-sm font-semibold text-[var(--text)] block mb-2">Foto a usar</label>
                {cargandoDatos ? (
                  <div className="text-xs text-[var(--text-muted)]">Cargando...</div>
                ) : (
                  <GridSelector items={fotos} seleccionado={fotoSel} onSelect={setFotoSel} vacio="Sube fotos de jugadores o canchas en la pestaña 'Galería de Fotos'" />
                )}
              </Card>

              <Button onClick={generar} disabled={!prompt.trim() || !referenciaSel || !fotoSel || generando} loading={generando} size="lg">
                {generando ? 'Generando flyer...' : <><Sparkles className="size-4" /> Generar flyer</>}
              </Button>

              {resultado && (
                <Button onClick={generar} variant="secondary">
                  <RefreshCw className="size-3.5" /> Regenerar
                </Button>
              )}

              {error && (
                <div className="px-3 py-2.5 bg-[var(--red-light)] border border-red-200 rounded-lg text-sm text-[var(--red)]">{error}</div>
              )}
            </div>

            <div>
              {generando && (
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                  <Loader2 className="size-8 text-[var(--sky)] animate-spin" />
                  <div className="text-center">
                    <div className="text-sm font-semibold text-[var(--text)]">Creando tu flyer...</div>
                    <div className="text-xs text-[var(--text-muted)] mt-1">Combinando tu referencia y tu foto</div>
                  </div>
                </div>
              )}
              {!generando && !resultado && (
                <EmptyState icon={ImageIcon} title="Tu flyer aparecerá aquí" description="Escribe el prompt, elige referencia y foto, y haz click en Generar" />
              )}
              {!generando && resultado && (
                <div className="max-w-[480px] mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultado} alt="Flyer generado" className="w-full aspect-square object-cover rounded-xl border border-[var(--border)]" />
                  <Button onClick={descargar} className="w-full mt-3">
                    <Download className="size-4" /> Descargar PNG
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'referencias' && (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-14 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-dark)] flex items-center justify-center shrink-0">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo del club" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="size-6 text-[var(--text-muted)]" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text)]">Logo del club</div>
                    <div className="text-xs text-[var(--text-muted)]">Se incluye automáticamente en todos los flyers que generes</div>
                  </div>
                </div>
                <Button onClick={() => logoInputRef.current?.click()} loading={subiendoLogo} size="sm" variant="secondary">
                  <Upload className="size-3.5" /> {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={onSubirLogo} />
              </div>
            </Card>

            <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Tus flyers de referencia</div>
                <div className="text-xs text-[var(--text-muted)]">Sube los diseños (de Canva u otra herramienta) que más te gustan — la IA los usará como plantilla</div>
              </div>
              <Button onClick={() => referenciaInputRef.current?.click()} loading={subiendoReferencia} size="sm">
                <Upload className="size-3.5" /> Subir referencia
              </Button>
              <input ref={referenciaInputRef} type="file" accept="image/*" className="hidden" onChange={onSubirReferencia} />
            </div>
            {referencias.length === 0 ? (
              <EmptyState icon={ImageIcon} title="Sin referencias aún" description="Sube tu primer flyer de referencia para empezar a generar" />
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {referencias.map(r => (
                  <div key={r.id} className="relative group aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => onEliminarReferencia(r.id)} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            </Card>
          </div>
        )}

        {tab === 'galeria' && (
          <Card>
            <div className="flex items-center justify-between mb-4 gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Galería de fotos del club</div>
                <div className="text-xs text-[var(--text-muted)]">Fotos reales de jugadores, canchas o equipo para usar en los flyers</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={tipoFotoNueva}
                  onChange={e => setTipoFotoNueva(e.target.value)}
                  className="border border-[var(--border)] rounded-lg text-sm px-2 py-1.5 text-[var(--text)] outline-none"
                >
                  {TIPOS_FOTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <Button onClick={() => fotoInputRef.current?.click()} loading={subiendoFoto} size="sm">
                  <Upload className="size-3.5" /> Subir foto
                </Button>
              </div>
              <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={onSubirFoto} />
            </div>
            {fotos.length === 0 ? (
              <EmptyState icon={Images} title="Sin fotos aún" description="Sube fotos de jugadores, canchas o del equipo" />
            ) : (
              <div className="grid grid-cols-5 gap-3">
                {fotos.map(f => (
                  <div key={f.id} className="relative group aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize">{f.tipo}</span>
                    <button onClick={() => onEliminarFoto(f.id)} className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1.5 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
