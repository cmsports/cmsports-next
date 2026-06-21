'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, Upload, ImageIcon, Download, RefreshCw, Loader2, X } from 'lucide-react'

interface Variante {
  titulo: string
  subtitulo: string
  descripcion: string
  hashtags: string
  layout: 'hero' | 'split' | 'minimal'
  colorAcento: string
  colorTexto: string
  tono: string
}

interface ClubContexto {
  nombre: string
  deporte: string
  colores: string[]
}

const CANVAS_SIZE = 1080

const C = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  text: '#0f172a', muted: '#64748b', hint: '#94a3b8',
  primary: '#4f46e5', primaryL: '#ede9fe',
}

// ── Cargar fuentes en canvas ────────────────────────────────────────────────
async function cargarFuentes() {
  try {
    const fuentes = [
      new FontFace('Inter', 'url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKZAZ9hiA.woff2)', { weight: '400' }),
      new FontFace('Inter', 'url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI13AZ9hiA.woff2)', { weight: '700' }),
      new FontFace('Inter', 'url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2)', { weight: '900' }),
    ]
    await Promise.all(fuentes.map(async f => { await f.load(); document.fonts.add(f) }))
  } catch (_) {}
}

// ── Utilidades ──────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' ')
  let line = ''
  let cy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy)
      line = word
      cy += lineHeight
    } else { line = test }
  }
  ctx.fillText(line, x, cy)
  return cy
}

function darken(hex: string, amount = 40): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

// ── Renderizadores ──────────────────────────────────────────────────────────
async function renderHero(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE
  const acento = v.colorAcento || '#e11d48'

  // Fondo oscuro base
  ctx.fillStyle = '#080c14'
  ctx.fillRect(0, 0, S, S)

  // Foto de fondo
  if (foto) {
    const ratio = Math.max(S / foto.width, S / foto.height)
    const fw = foto.width * ratio, fh = foto.height * ratio
    ctx.drawImage(foto, (S - fw) / 2, (S - fh) / 2, fw, fh)
  }

  // Overlay degradado fuerte de abajo
  const grad = ctx.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, 'rgba(8,12,20,0.15)')
  grad.addColorStop(0.4, 'rgba(8,12,20,0.55)')
  grad.addColorStop(1, 'rgba(8,12,20,0.97)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)

  // Círculo decorativo top-right
  const rg = ctx.createRadialGradient(S * 0.88, S * 0.1, 0, S * 0.88, S * 0.1, S * 0.38)
  rg.addColorStop(0, hexToRgba(acento, 0.35))
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, S, S)

  // Barra lateral izquierda
  ctx.fillStyle = acento
  ctx.fillRect(0, 0, 10, S)

  // Nombre del club — arriba
  ctx.font = `700 ${S * 0.026}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S * 0.055, S * 0.072)

  // Línea separadora
  ctx.fillStyle = hexToRgba(acento, 0.6)
  ctx.fillRect(S * 0.055, S * 0.085, S * 0.08, 2)

  // Título — grande y bold
  ctx.font = `900 ${S * 0.105}px Inter, sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S * 0.055, S * 0.66, S * 0.88, S * 0.115)

  // Subtítulo
  ctx.font = `400 ${S * 0.042}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  wrapText(ctx, v.subtitulo, S * 0.055, tY + S * 0.07, S * 0.88, S * 0.05)

  // Hashtags
  ctx.font = `700 ${S * 0.027}px Inter, sans-serif`
  ctx.fillStyle = hexToRgba(acento, 0.95)
  ctx.fillText(v.hashtags.split(' ').slice(0, 3).join(' '), S * 0.055, S * 0.945)

  // Línea inferior
  ctx.fillStyle = hexToRgba(acento, 0.4)
  ctx.fillRect(S * 0.055, S * 0.958, S * 0.9, 1.5)
}

async function renderSplit(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE
  const acento = v.colorAcento || '#7c3aed'
  const oscuro = darken(acento, 60)

  // Fondo claro lado derecho
  ctx.fillStyle = '#f0f2f8'
  ctx.fillRect(0, 0, S, S)

  // Panel izquierdo con gradiente
  const panelGrad = ctx.createLinearGradient(0, 0, S * 0.52, S)
  panelGrad.addColorStop(0, oscuro)
  panelGrad.addColorStop(1, acento)
  ctx.fillStyle = panelGrad
  ctx.fillRect(0, 0, S * 0.52, S)

  // Foto lado derecho con clip
  if (foto) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(S * 0.5, 0, S * 0.5, S)
    ctx.clip()
    const ratio = Math.max((S * 0.5) / foto.width, S / foto.height)
    const fw = foto.width * ratio, fh = foto.height * ratio
    ctx.drawImage(foto, S * 0.5 + ((S * 0.5) - fw) / 2, (S - fh) / 2, fw, fh)
    ctx.restore()
    // Overlay foto
    const fGrad = ctx.createLinearGradient(S * 0.5, 0, S, 0)
    fGrad.addColorStop(0, hexToRgba(oscuro, 0.5))
    fGrad.addColorStop(1, 'rgba(0,0,0,0.1)')
    ctx.fillStyle = fGrad
    ctx.fillRect(S * 0.5, 0, S * 0.5, S)
  } else {
    // Sin foto: patrón geométrico derecho
    ctx.fillStyle = '#e8ecf5'
    ctx.fillRect(S * 0.5, 0, S * 0.5, S)
    ctx.strokeStyle = hexToRgba(acento, 0.12)
    ctx.lineWidth = 1.5
    for (let i = 0; i < 8; i++) {
      ctx.beginPath()
      ctx.arc(S * 0.75, S * 0.5, S * (0.05 + i * 0.07), 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Diagonal de separación
  ctx.fillStyle = '#f0f2f8'
  ctx.beginPath()
  ctx.moveTo(S * 0.48, 0)
  ctx.lineTo(S * 0.56, 0)
  ctx.lineTo(S * 0.5, S)
  ctx.lineTo(S * 0.42, S)
  ctx.closePath()
  ctx.fill()

  // Contenido panel izquierdo
  ctx.textAlign = 'left'

  // Club nombre
  ctx.font = `700 ${S * 0.024}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(club.toUpperCase(), S * 0.07, S * 0.1)

  // Línea decorativa
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(S * 0.07, S * 0.115, S * 0.28, 1.5)

  // Deporte tag
  ctx.font = `700 ${S * 0.02}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('TENIS DE MESA', S * 0.07, S * 0.145)

  // Título
  ctx.font = `900 ${S * 0.088}px Inter, sans-serif`
  ctx.fillStyle = '#ffffff'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S * 0.07, S * 0.36, S * 0.4, S * 0.1)

  // Línea acento bajo título
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(S * 0.07, tY + S * 0.035, S * 0.2, 3)

  // Subtítulo
  ctx.font = `400 ${S * 0.036}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  wrapText(ctx, v.subtitulo, S * 0.07, tY + S * 0.085, S * 0.39, S * 0.046)

  // Descripción
  if (v.descripcion) {
    ctx.font = `400 ${S * 0.027}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    wrapText(ctx, v.descripcion, S * 0.07, tY + S * 0.185, S * 0.39, S * 0.036)
  }

  // Hashtags
  ctx.font = `700 ${S * 0.024}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(v.hashtags.split(' ').slice(0, 3).join(' '), S * 0.07, S * 0.91)
}

async function renderMinimal(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE
  const acento = v.colorAcento || '#06b6d4'

  // Fondo muy oscuro casi negro
  ctx.fillStyle = '#05070d'
  ctx.fillRect(0, 0, S, S)

  // Foto ultra oscura como textura
  if (foto) {
    ctx.globalAlpha = 0.12
    const ratio = Math.max(S / foto.width, S / foto.height)
    const fw = foto.width * ratio, fh = foto.height * ratio
    ctx.drawImage(foto, (S - fw) / 2, (S - fh) / 2, fw, fh)
    ctx.globalAlpha = 1
  }

  // Dos círculos de luz de color
  const c1 = ctx.createRadialGradient(S * 0.15, S * 0.85, 0, S * 0.15, S * 0.85, S * 0.55)
  c1.addColorStop(0, hexToRgba(acento, 0.22))
  c1.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = c1
  ctx.fillRect(0, 0, S, S)

  const c2 = ctx.createRadialGradient(S * 0.85, S * 0.15, 0, S * 0.85, S * 0.15, S * 0.4)
  c2.addColorStop(0, hexToRgba(acento, 0.12))
  c2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = c2
  ctx.fillRect(0, 0, S, S)

  // Grid de puntos decorativo (top-right)
  ctx.fillStyle = hexToRgba(acento, 0.15)
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      ctx.beginPath()
      ctx.arc(S * 0.72 + col * S * 0.04, S * 0.08 + row * S * 0.04, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Línea horizontal top
  ctx.strokeStyle = hexToRgba(acento, 0.3)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(S * 0.06, S * 0.09)
  ctx.lineTo(S * 0.94, S * 0.09)
  ctx.stroke()

  // Club nombre + deporte
  ctx.font = `700 ${S * 0.024}px Inter, sans-serif`
  ctx.fillStyle = hexToRgba(acento, 0.7)
  ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S * 0.06, S * 0.075)

  ctx.font = `400 ${S * 0.018}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'right'
  ctx.fillText('TENIS DE MESA', S * 0.94, S * 0.075)

  // Título — centrado vertical
  ctx.textAlign = 'center'
  ctx.font = `900 ${S * 0.112}px Inter, sans-serif`
  ctx.fillStyle = '#ffffff'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S / 2, S * 0.44, S * 0.86, S * 0.122)

  // Línea acento centrada
  const lineW = S * 0.16
  ctx.fillStyle = acento
  ctx.fillRect(S / 2 - lineW / 2, tY + S * 0.045, lineW, 4)

  // Subtítulo
  ctx.font = `300 ${S * 0.042}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.textAlign = 'center'
  wrapText(ctx, v.subtitulo, S / 2, tY + S * 0.105, S * 0.8, S * 0.052)

  // Descripción
  if (v.descripcion) {
    ctx.font = `400 ${S * 0.028}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    wrapText(ctx, v.descripcion, S / 2, tY + S * 0.2, S * 0.75, S * 0.038)
  }

  // Línea horizontal bottom
  ctx.strokeStyle = hexToRgba(acento, 0.2)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(S * 0.06, S * 0.916)
  ctx.lineTo(S * 0.94, S * 0.916)
  ctx.stroke()

  // Hashtags
  ctx.font = `700 ${S * 0.026}px Inter, sans-serif`
  ctx.fillStyle = hexToRgba(acento, 0.75)
  ctx.textAlign = 'center'
  ctx.fillText(v.hashtags.split(' ').slice(0, 3).join(' '), S / 2, S * 0.948)
}

// ── Render principal ────────────────────────────────────────────────────────
async function renderVariante(canvas: HTMLCanvasElement, v: Variante, foto: HTMLImageElement | null, club: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  await cargarFuentes()
  if (v.layout === 'hero') await renderHero(ctx, v, foto, club)
  else if (v.layout === 'split') await renderSplit(ctx, v, foto, club)
  else await renderMinimal(ctx, v, foto, club)
}

// ── FlyrCard ────────────────────────────────────────────────────────────────
function FlyrCard({ variante, foto, clubNombre, seleccionada, onSelect }: {
  variante: Variante; foto: HTMLImageElement | null; clubNombre: string
  seleccionada: boolean; onSelect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current) renderVariante(canvasRef.current, variante, foto, clubNombre)
  }, [variante, foto, clubNombre])

  function descargar(e: React.MouseEvent) {
    e.stopPropagation()
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = `flyer-${variante.layout}-${Date.now()}.png`
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  const tonoLabel: Record<string, string> = { celebratorio: '🎉 Celebratorio', formal: '📋 Formal', hype: '🔥 Hype' }

  return (
    <div onClick={onSelect} style={{
      border: seleccionada ? `2px solid ${C.primary}` : `2px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: C.card,
      transition: 'all 0.15s',
      boxShadow: seleccionada ? `0 0 0 4px ${C.primaryL}` : '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1/1', display: 'block' }} />
        {seleccionada && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: C.primary, color: '#fff', borderRadius: 20,
            fontSize: 11, fontWeight: 600, padding: '3px 10px',
          }}>✓ Seleccionada</div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {variante.layout}
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>{tonoLabel[variante.tono] || variante.tono}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{variante.titulo}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{variante.subtitulo}</div>
        <button onClick={descargar} style={{
          width: '100%', padding: '8px',
          background: seleccionada ? C.primary : 'transparent',
          color: seleccionada ? '#fff' : C.primary,
          border: `1px solid ${C.primary}`, borderRadius: 7,
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <Download size={13} /> Descargar PNG (1080×1080)
        </button>
      </div>
    </div>
  )
}

// ── Página Principal ────────────────────────────────────────────────────────
export default function RedesSocialesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [prompt, setPrompt] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoImg, setFotoImg] = useState<HTMLImageElement | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [seleccionada, setSeleccionada] = useState<number | null>(null)
  const [clubNombre, setClubNombre] = useState('Mi Club')
  const [clubContexto, setClubContexto] = useState<ClubContexto>({ nombre: 'Mi Club', deporte: 'Tenis de Mesa', colores: ['#4f46e5'] })

  const ejemplos = [
    '¡Ganamos el torneo regional! Campeones 2026',
    'Convocatoria: entrenamientos este sábado 10am',
    'Nuevo récord personal de nuestro jugador estrella',
    'Torneo interno este fin de semana, ¡inscríbete!',
  ]

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol === 'jugador') { router.push('/perfil'); return }
    if (perfil.club_id) {
      const supabase = createClient()
      supabase.from('clubes').select('nombre').eq('id', perfil.club_id).single()
        .then(({ data }) => {
          if (data?.nombre) {
            setClubNombre(data.nombre)
            setClubContexto({ nombre: data.nombre, deporte: 'Tenis de Mesa', colores: ['#4f46e5', '#ffffff'] })
          }
        })
    }
  }, [authLoading, perfil])

  useEffect(() => {
    if (!foto) { setFotoImg(null); return }
    const url = URL.createObjectURL(foto)
    const img = new Image()
    img.onload = () => setFotoImg(img)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [foto])

  async function generar() {
    if (!prompt.trim()) return
    setGenerando(true); setError(''); setVariantes([]); setSeleccionada(null)
    try {
      const res = await fetch('/api/generar-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, clubContexto }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVariantes(data.variantes)
    } catch (e: any) {
      setError(e.message || 'Error al generar. Intenta de nuevo.')
    } finally { setGenerando(false) }
  }

  if (authLoading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>Redes Sociales</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Genera flyers profesionales con IA en segundos</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Panel izquierdo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Prompt */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 8 }}>
                ¿Qué quieres publicar?
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Ej: ¡Ganamos el torneo regional! Campeones 2026"
                rows={4}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generar() }}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, color: C.text, resize: 'vertical',
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.hint, marginBottom: 5 }}>Ejemplos:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {ejemplos.map(ej => (
                    <button key={ej} onClick={() => setPrompt(ej)} style={{
                      textAlign: 'left', padding: '5px 8px', background: C.bg,
                      border: `1px solid ${C.border}`, borderRadius: 6,
                      fontSize: 11, color: C.muted, cursor: 'pointer',
                    }}>{ej}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Foto */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 8 }}>
                Foto <span style={{ fontWeight: 400, color: C.hint }}>(opcional)</span>
              </label>
              {foto ? (
                <div style={{ position: 'relative' }}>
                  <img src={URL.createObjectURL(foto)} alt="foto"
                    style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <button onClick={() => { setFoto(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                      borderRadius: '50%', width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}><X size={14} /></button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} style={{
                  border: `2px dashed ${C.border}`, borderRadius: 8,
                  padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                }}>
                  <Upload size={22} color={C.hint} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 3 }}>Sube una foto del club</div>
                  <div style={{ fontSize: 11, color: C.hint }}>JPG, PNG — se usa como fondo del flyer</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setFoto(f) }} />
            </div>

            {/* Botones */}
            <button onClick={generar} disabled={!prompt.trim() || generando} style={{
              width: '100%', padding: '13px',
              background: !prompt.trim() || generando ? '#c7d2fe' : C.primary,
              color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: !prompt.trim() || generando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {generando
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generando variantes...</>
                : <><Sparkles size={16} /> Generar 3 variantes</>
              }
            </button>

            {variantes.length > 0 && (
              <button onClick={generar} style={{
                width: '100%', padding: '10px', background: 'transparent',
                color: C.primary, border: `1px solid ${C.primary}`, borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}><RefreshCw size={13} /> Regenerar</button>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
                {error}
              </div>
            )}
          </div>

          {/* Panel derecho */}
          <div>
            {generando && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.primaryL, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={22} color={C.primary} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Creando tus variantes...</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>La IA está diseñando 3 flyers únicos para ti</div>
                </div>
              </div>
            )}

            {!generando && variantes.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 400, gap: 12, border: `2px dashed ${C.border}`, borderRadius: 12,
              }}>
                <ImageIcon size={40} color={C.hint} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: C.muted }}>Tus flyers aparecerán aquí</div>
                  <div style={{ fontSize: 13, color: C.hint, marginTop: 4 }}>Escribe un prompt y haz click en Generar</div>
                </div>
              </div>
            )}

            {!generando && variantes.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>3 variantes generadas</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Haz click para seleccionar y descargar</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {variantes.map((v, i) => (
                    <FlyrCard key={i} variante={v} foto={fotoImg} clubNombre={clubNombre}
                      seleccionada={seleccionada === i} onSelect={() => setSeleccionada(i)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } textarea:focus { border-color: #4f46e5 !important; }`}</style>
    </AppLayout>
  )
}
