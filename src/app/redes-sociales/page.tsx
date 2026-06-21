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
  fecha?: string
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

// Paleta USB
const USB = {
  azulOscuro: '#060e1e',
  azulMedio:  '#0a2254',
  azulVivo:   '#1d4ed8',
  cyan:       '#06b6d4',
  cyanBright: '#22d3ee',
  amarillo:   '#fbbf24',
  blanco:     '#ffffff',
}

// ── Cargar fuentes ──────────────────────────────────────────────────────────
let fontesLoaded = false
async function cargarFuentes() {
  if (fontesLoaded) return
  try {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Inter:wght@400;600;700&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    await document.fonts.ready
    fontesLoaded = true
  } catch (_) {}
}

// ── Utilidades ──────────────────────────────────────────────────────────────
function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, align: CanvasTextAlign = 'left'): number {
  ctx.textAlign = align
  const words = text.split(' ')
  let line = '', cy = y
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy); line = w; cy += lh
    } else line = test
  }
  ctx.fillText(line, x, cy)
  return cy
}

function pillBadge(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, bg: string, color: string, fontSize: number) {
  ctx.font = `700 ${fontSize}px Barlow Condensed, sans-serif`
  const tw = ctx.measureText(text).width
  const pw = tw + fontSize * 1.6, ph = fontSize * 1.8
  const rx = cx - pw / 2, ry = cy - ph / 2, r = ph / 2
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.moveTo(rx + r, ry)
  ctx.lineTo(rx + pw - r, ry)
  ctx.quadraticCurveTo(rx + pw, ry, rx + pw, ry + r)
  ctx.lineTo(rx + pw, ry + ph - r)
  ctx.quadraticCurveTo(rx + pw, ry + ph, rx + pw - r, ry + ph)
  ctx.lineTo(rx + r, ry + ph)
  ctx.quadraticCurveTo(rx, ry + ph, rx, ry + ph - r)
  ctx.lineTo(rx, ry + r)
  ctx.quadraticCurveTo(rx, ry, rx + r, ry)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.fillText(text, cx, cy + fontSize * 0.38)
}

function drawFoto(ctx: CanvasRenderingContext2D, foto: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / foto.width, h / foto.height)
  const fw = foto.width * ratio, fh = foto.height * ratio
  ctx.drawImage(foto, x + (w - fw) / 2, y + (h - fh) / 2, fw, fh)
}

// ── LAYOUT 1: GRAN TORNEO — fondo degradado + foto + título gigante ─────────
async function renderHero(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // Fondo
  ctx.fillStyle = USB.azulOscuro
  ctx.fillRect(0, 0, S, S)

  // Foto de fondo con overlay azul fuerte
  if (foto) {
    ctx.save()
    ctx.globalAlpha = 0.45
    drawFoto(ctx, foto, 0, 0, S, S)
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, rgba(USB.azulOscuro, 0.5))
  grad.addColorStop(0.35, rgba(USB.azulMedio, 0.6))
  grad.addColorStop(1, rgba(USB.azulOscuro, 0.97))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, S, S)

  // Banda diagonal de color top-right
  ctx.save()
  ctx.fillStyle = rgba(USB.cyan, 0.18)
  ctx.beginPath()
  ctx.moveTo(S * 0.55, 0); ctx.lineTo(S, 0); ctx.lineTo(S, S * 0.55); ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Línea cyan top
  const lgTop = ctx.createLinearGradient(0, 0, S, 0)
  lgTop.addColorStop(0, rgba(USB.cyan, 0))
  lgTop.addColorStop(0.4, USB.cyan)
  lgTop.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = lgTop
  ctx.fillRect(0, 0, S, 6)

  // Puntos decorativos top-right
  ctx.fillStyle = rgba(USB.cyanBright, 0.2)
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      { ctx.beginPath(); ctx.arc(S*0.76+c*S*0.045, S*0.06+r*S*0.045, 3, 0, Math.PI*2); ctx.fill() }

  // Nombre club + deporte
  ctx.font = `700 ${S*0.022}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.6)
  ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S*0.055, S*0.066)
  ctx.font = `600 ${S*0.018}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.cyan, 0.8)
  ctx.fillText('TENIS DE MESA', S*0.055, S*0.09)

  // Línea separadora
  const lgLine = ctx.createLinearGradient(0, 0, S*0.5, 0)
  lgLine.addColorStop(0, rgba(USB.cyan, 0.6))
  lgLine.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = lgLine
  ctx.fillRect(S*0.055, S*0.1, S*0.35, 2)

  // Título principal — GIGANTE
  ctx.font = `900 ${S*0.132}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco
  ctx.textAlign = 'left'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S*0.05, S*0.5, S*0.9, S*0.14, 'left')

  // Badge fecha/subtítulo
  if (v.fecha || v.subtitulo) {
    const badgeText = (v.fecha || v.subtitulo).toUpperCase()
    pillBadge(ctx, badgeText, S*0.22, tY + S*0.075, USB.cyan, USB.azulOscuro, S*0.028)
  }

  // Descripción
  if (v.descripcion) {
    ctx.font = `600 ${S*0.032}px Inter, sans-serif`
    ctx.fillStyle = rgba(USB.blanco, 0.7)
    ctx.textAlign = 'left'
    wrapText(ctx, v.descripcion, S*0.055, tY + S*0.16, S*0.88, S*0.042, 'left')
  }

  // Hashtags
  ctx.font = `700 ${S*0.026}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.85)
  ctx.textAlign = 'left'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S*0.055, S*0.946)

  // Línea bottom
  const lgBot = ctx.createLinearGradient(0, 0, S, 0)
  lgBot.addColorStop(0, USB.cyan); lgBot.addColorStop(1, rgba(USB.cyan,0))
  ctx.fillStyle = lgBot
  ctx.fillRect(0, S*0.958, S, 3)
}

// ── LAYOUT 2: SPLIT DINÁMICO — foto grande derecha, texto izquierda ─────────
async function renderSplit(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // Fondo azul oscuro
  ctx.fillStyle = USB.azulOscuro
  ctx.fillRect(0, 0, S, S)

  // Foto derecha (60% del ancho)
  if (foto) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(S*0.38, 0, S*0.62, S)
    ctx.clip()
    ctx.globalAlpha = 0.7
    drawFoto(ctx, foto, S*0.38, 0, S*0.62, S)
    ctx.globalAlpha = 1
    ctx.restore()
    // Overlay degradado sobre foto
    const fGrad = ctx.createLinearGradient(S*0.38, 0, S, 0)
    fGrad.addColorStop(0, rgba(USB.azulOscuro, 0.92))
    fGrad.addColorStop(0.5, rgba(USB.azulOscuro, 0.3))
    fGrad.addColorStop(1, rgba(USB.azulOscuro, 0.5))
    ctx.fillStyle = fGrad
    ctx.fillRect(S*0.38, 0, S*0.62, S)
  } else {
    // Sin foto: gradiente azul a cyan
    const noFotoGrad = ctx.createLinearGradient(S*0.38, 0, S, S)
    noFotoGrad.addColorStop(0, USB.azulMedio)
    noFotoGrad.addColorStop(1, rgba(USB.azulVivo, 0.5))
    ctx.fillStyle = noFotoGrad
    ctx.fillRect(S*0.38, 0, S*0.62, S)
    // Círculos concéntricos
    ctx.strokeStyle = rgba(USB.cyan, 0.1)
    ctx.lineWidth = 2
    for (let i = 1; i <= 8; i++) {
      ctx.beginPath()
      ctx.arc(S*0.82, S*0.5, S*i*0.065, 0, Math.PI*2)
      ctx.stroke()
    }
  }

  // Panel izquierdo degradado
  const panelGrad = ctx.createLinearGradient(0, 0, S*0.52, 0)
  panelGrad.addColorStop(0, USB.azulOscuro)
  panelGrad.addColorStop(0.8, rgba(USB.azulOscuro, 0.98))
  panelGrad.addColorStop(1, rgba(USB.azulOscuro, 0.7))
  ctx.fillStyle = panelGrad
  ctx.fillRect(0, 0, S*0.52, S)

  // Barra vertical cyan izquierda
  const barGrad = ctx.createLinearGradient(0, 0, 0, S)
  barGrad.addColorStop(0, rgba(USB.cyan,0))
  barGrad.addColorStop(0.3, USB.cyan)
  barGrad.addColorStop(0.7, USB.cyan)
  barGrad.addColorStop(1, rgba(USB.cyan,0))
  ctx.fillStyle = barGrad
  ctx.fillRect(0, 0, 7, S)

  // Nombre club
  ctx.font = `700 ${S*0.02}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.5)
  ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S*0.06, S*0.1)

  // Línea cyan
  ctx.fillStyle = USB.cyan
  ctx.fillRect(S*0.06, S*0.115, S*0.1, 3)

  // Deporte
  ctx.font = `600 ${S*0.018}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.cyan, 0.7)
  ctx.fillText('TENIS DE MESA', S*0.06, S*0.14)

  // Título
  ctx.font = `900 ${S*0.1}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco
  ctx.textAlign = 'left'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S*0.06, S*0.36, S*0.44, S*0.11, 'left')

  // Badge subtítulo/fecha
  if (v.fecha || v.subtitulo) {
    const bt = (v.fecha || v.subtitulo).toUpperCase()
    pillBadge(ctx, bt, S*0.19, tY + S*0.075, USB.cyan, USB.azulOscuro, S*0.026)
  }

  // Descripción
  if (v.descripcion) {
    ctx.font = `400 ${S*0.03}px Inter, sans-serif`
    ctx.fillStyle = rgba(USB.blanco, 0.65)
    ctx.textAlign = 'left'
    wrapText(ctx, v.descripcion, S*0.06, tY + S*0.165, S*0.43, S*0.04, 'left')
  }

  // Hashtags bottom
  ctx.font = `700 ${S*0.024}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.75)
  ctx.textAlign = 'left'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S*0.06, S*0.925)
}

// ── LAYOUT 3: POSTER BOLD — tipografía dominante estilo "INTERCLUBES" ────────
async function renderMinimal(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // Fondo azul vibrante degradado
  const bgGrad = ctx.createLinearGradient(0, 0, S, S)
  bgGrad.addColorStop(0, USB.azulMedio)
  bgGrad.addColorStop(0.5, USB.azulVivo)
  bgGrad.addColorStop(1, '#0c1a4a')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, S, S)

  // Foto como fondo muy difuso
  if (foto) {
    ctx.save()
    ctx.globalAlpha = 0.15
    drawFoto(ctx, foto, 0, 0, S, S)
    ctx.globalAlpha = 1
    ctx.restore()
    // Overlay para mantener legibilidad
    ctx.fillStyle = rgba(USB.azulMedio, 0.7)
    ctx.fillRect(0, 0, S, S)
  }

  // Forma diagonal decorativa
  ctx.save()
  ctx.fillStyle = rgba(USB.cyan, 0.12)
  ctx.beginPath()
  ctx.moveTo(0, S*0.6); ctx.lineTo(S, S*0.3); ctx.lineTo(S, S*0.55); ctx.lineTo(0, S*0.85)
  ctx.closePath(); ctx.fill()
  ctx.restore()

  // Forma diagonal 2
  ctx.save()
  ctx.fillStyle = rgba(USB.blanco, 0.04)
  ctx.beginPath()
  ctx.moveTo(0, S*0.75); ctx.lineTo(S, S*0.45); ctx.lineTo(S, S*0.58); ctx.lineTo(0, S*0.88)
  ctx.closePath(); ctx.fill()
  ctx.restore()

  // Banda top con nombre
  ctx.fillStyle = rgba(USB.azulOscuro, 0.6)
  ctx.fillRect(0, 0, S, S*0.12)

  // Logo area top-left
  ctx.fillStyle = rgba(USB.blanco, 0.9)
  ctx.beginPath()
  ctx.arc(S*0.08, S*0.06, S*0.038, 0, Math.PI*2)
  ctx.fill()
  ctx.fillStyle = USB.azulVivo
  ctx.font = `900 ${S*0.022}px 'Barlow Condensed', sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(club.split(' ').map((w:string)=>w[0]).join('').slice(0,3).toUpperCase(), S*0.08, S*0.068)

  // Club nombre
  ctx.font = `700 ${S*0.022}px Inter, sans-serif`
  ctx.fillStyle = USB.blanco
  ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S*0.15, S*0.055)
  ctx.font = `400 ${S*0.016}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.5)
  ctx.fillText('CLUB DEPORTIVO · TENIS DE MESA', S*0.15, S*0.075)

  // Año top-right
  ctx.font = `700 ${S*0.018}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.7)
  ctx.textAlign = 'right'
  ctx.fillText(new Date().getFullYear().toString(), S*0.95, S*0.065)

  // TÍTULO — ocupa toda la pantalla, stilo "INTERCLUBES RELÁMPAGO"
  ctx.font = `900 ${S*0.145}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco
  ctx.textAlign = 'center'
  // Shadow/glow
  ctx.shadowColor = rgba(USB.cyan, 0.5)
  ctx.shadowBlur = 30
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S/2, S*0.38, S*0.92, S*0.155, 'center')
  ctx.shadowBlur = 0

  // Línea cyan + línea blanca (como "rayos")
  ctx.fillStyle = USB.cyan
  ctx.fillRect(S*0.06, tY + S*0.04, S*0.88, 5)
  ctx.fillStyle = rgba(USB.blanco, 0.15)
  ctx.fillRect(S*0.06, tY + S*0.05, S*0.88, 2)

  // Badge fecha centrado
  if (v.fecha || v.subtitulo) {
    const bt = (v.fecha || v.subtitulo).toUpperCase()
    pillBadge(ctx, bt, S/2, tY + S*0.1, USB.blanco, USB.azulVivo, S*0.03)
  }

  // Descripción
  if (v.descripcion) {
    ctx.font = `600 ${S*0.034}px Inter, sans-serif`
    ctx.fillStyle = rgba(USB.blanco, 0.85)
    ctx.textAlign = 'center'
    wrapText(ctx, v.descripcion, S/2, tY + S*0.185, S*0.82, S*0.044, 'center')
  }

  // Hashtags bottom
  ctx.font = `700 ${S*0.026}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.8)
  ctx.textAlign = 'center'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S/2, S*0.94)

  // Línea bottom
  ctx.fillStyle = rgba(USB.cyan, 0.5)
  ctx.fillRect(S*0.06, S*0.955, S*0.88, 2)
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
          <div style={{ position: 'absolute', top: 10, right: 10, background: C.primary, color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 600, padding: '3px 10px' }}>
            ✓ Seleccionada
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{variante.layout}</span>
          <span style={{ fontSize: 11, color: C.muted }}>{tonoLabel[variante.tono] || variante.tono}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{variante.titulo}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{variante.subtitulo}</div>
        <button onClick={descargar} style={{
          width: '100%', padding: '8px', background: seleccionada ? C.primary : 'transparent',
          color: seleccionada ? '#fff' : C.primary, border: `1px solid ${C.primary}`, borderRadius: 7,
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
  const [clubContexto, setClubContexto] = useState<ClubContexto>({ nombre: 'Mi Club', deporte: 'Tenis de Mesa', colores: ['#1d4ed8', '#06b6d4'] })

  const ejemplos = [
    '¡Ganamos el torneo regional! Campeones 2026',
    'Gran Torneo este sábado 10am, ¡inscríbete!',
    'Interclubes relámpago, domingo 29, Nogales 264',
    'Torneo a beneficio, cupos limitados',
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
            setClubContexto({ nombre: data.nombre, deporte: 'Tenis de Mesa', colores: ['#1d4ed8', '#06b6d4'] })
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
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>Redes Sociales</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Genera flyers profesionales con IA en segundos</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Panel izquierdo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 8 }}>¿Qué quieres publicar?</label>
              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Ej: Gran torneo USB este sábado 21 de mayo, inscripción $1.500"
                rows={4}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generar() }}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.hint, marginBottom: 5 }}>Ejemplos:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {ejemplos.map(ej => (
                    <button key={ej} onClick={() => setPrompt(ej)} style={{ textAlign: 'left', padding: '5px 8px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.muted, cursor: 'pointer' }}>{ej}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 8 }}>
                Foto del jugador o evento <span style={{ fontWeight: 400, color: C.hint }}>(opcional)</span>
              </label>
              {foto ? (
                <div style={{ position: 'relative' }}>
                  <img src={URL.createObjectURL(foto)} alt="foto" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <button onClick={() => { setFoto(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} style={{ border: `2px dashed ${C.border}`, borderRadius: 8, padding: '28px 20px', textAlign: 'center', cursor: 'pointer' }}>
                  <Upload size={22} color={C.hint} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 3 }}>Sube una foto del club o jugador</div>
                  <div style={{ fontSize: 11, color: C.hint }}>Se usa como fondo del flyer</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setFoto(f) }} />
            </div>

            <button onClick={generar} disabled={!prompt.trim() || generando} style={{
              width: '100%', padding: '13px', background: !prompt.trim() || generando ? '#c7d2fe' : C.primary,
              color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: !prompt.trim() || generando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {generando ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generando variantes...</> : <><Sparkles size={16} /> Generar 3 variantes</>}
            </button>

            {variantes.length > 0 && (
              <button onClick={generar} style={{ width: '100%', padding: '10px', background: 'transparent', color: C.primary, border: `1px solid ${C.primary}`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RefreshCw size={13} /> Regenerar
              </button>
            )}

            {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, border: `2px dashed ${C.border}`, borderRadius: 12 }}>
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
                    <FlyrCard key={i} variante={v} foto={fotoImg} clubNombre={clubNombre} seleccionada={seleccionada === i} onSelect={() => setSeleccionada(i)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} } textarea:focus{border-color:#4f46e5!important;}`}</style>
    </AppLayout>
  )
}
