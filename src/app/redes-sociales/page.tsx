'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import {
  Sparkles, Upload, ImageIcon, Download, RefreshCw,
  Loader2, Camera, X, ChevronDown
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
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

// ── Constantes ─────────────────────────────────────────────────────────────
const CANVAS_SIZE = 1080
const SCALE = 0.5 // preview a 540px

const C = {
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  hint: '#94a3b8',
  primary: '#4f46e5',
  primaryL: '#ede9fe',
}

// ── Utilidades de canvas ────────────────────────────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  let line = ''
  let currentY = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY)
      line = word
      currentY += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, currentY)
  return currentY
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Renderizador de variantes ───────────────────────────────────────────────
async function renderVariante(
  canvas: HTMLCanvasElement,
  variante: Variante,
  foto: HTMLImageElement | null,
  clubNombre: string,
  logoUrl?: string
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE

  const S = CANVAS_SIZE
  const acento = variante.colorAcento || '#4f46e5'
  const textoColor = variante.colorTexto || '#ffffff'

  // ── LAYOUT HERO ──
  if (variante.layout === 'hero') {
    // Fondo oscuro
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, S, S)

    // Foto de fondo
    if (foto) {
      const ratio = Math.max(S / foto.width, S / foto.height)
      const fw = foto.width * ratio
      const fh = foto.height * ratio
      const fx = (S - fw) / 2
      const fy = (S - fh) / 2
      ctx.drawImage(foto, fx, fy, fw, fh)
    }

    // Gradient overlay de abajo hacia arriba
    const grad = ctx.createLinearGradient(0, S * 0.3, 0, S)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.5, 'rgba(0,0,0,0.7)')
    grad.addColorStop(1, 'rgba(0,0,0,0.92)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, S, S)

    // Línea de acento superior
    ctx.fillStyle = acento
    ctx.fillRect(0, 0, S, 8)

    // Nombre del club arriba
    ctx.font = `600 ${S * 0.028}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.textAlign = 'left'
    ctx.fillText(clubNombre.toUpperCase(), S * 0.06, S * 0.08)

    // Titulo
    ctx.font = `800 ${S * 0.1}px Inter, sans-serif`
    ctx.fillStyle = textoColor
    ctx.textAlign = 'left'
    wrapText(ctx, variante.titulo.toUpperCase(), S * 0.06, S * 0.72, S * 0.88, S * 0.11)

    // Subtitulo
    ctx.font = `400 ${S * 0.042}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    wrapText(ctx, variante.subtitulo, S * 0.06, S * 0.85, S * 0.88, S * 0.048)

    // Hashtags
    ctx.font = `500 ${S * 0.028}px Inter, sans-serif`
    ctx.fillStyle = hexToRgba(acento, 0.9)
    ctx.fillText(variante.hashtags, S * 0.06, S * 0.94)
  }

  // ── LAYOUT SPLIT ──
  else if (variante.layout === 'split') {
    // Fondo blanco / claro
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, S, S)

    // Panel izquierdo con color acento
    ctx.fillStyle = acento
    ctx.fillRect(0, 0, S * 0.48, S)

    // Foto en el lado derecho
    if (foto) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(S * 0.5, 0, S * 0.5, S)
      ctx.clip()
      const ratio = Math.max((S * 0.5) / foto.width, S / foto.height)
      const fw = foto.width * ratio
      const fh = foto.height * ratio
      const fx = S * 0.5 + ((S * 0.5) - fw) / 2
      const fy = (S - fh) / 2
      ctx.drawImage(foto, fx, fy, fw, fh)
      ctx.restore()
    }

    // Overlay sutil sobre la foto
    const gradRight = ctx.createLinearGradient(S * 0.5, 0, S, 0)
    gradRight.addColorStop(0, 'rgba(0,0,0,0.3)')
    gradRight.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradRight
    ctx.fillRect(S * 0.5, 0, S * 0.5, S)

    // Separador diagonal
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.moveTo(S * 0.46, 0)
    ctx.lineTo(S * 0.52, 0)
    ctx.lineTo(S * 0.52, S)
    ctx.lineTo(S * 0.46, S)
    ctx.closePath()
    ctx.fill()

    // Texto en panel izquierdo
    ctx.textAlign = 'left'

    // Club nombre
    ctx.font = `600 ${S * 0.026}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(clubNombre.toUpperCase(), S * 0.07, S * 0.12)

    // Linea decorativa
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(S * 0.07, S * 0.15, S * 0.12, 3)

    // Titulo
    ctx.font = `800 ${S * 0.082}px Inter, sans-serif`
    ctx.fillStyle = '#ffffff'
    wrapText(ctx, variante.titulo.toUpperCase(), S * 0.07, S * 0.35, S * 0.38, S * 0.095)

    // Subtitulo
    ctx.font = `400 ${S * 0.038}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.88)'
    wrapText(ctx, variante.subtitulo, S * 0.07, S * 0.65, S * 0.38, S * 0.046)

    // Descripcion
    if (variante.descripcion) {
      ctx.font = `300 ${S * 0.03}px Inter, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      wrapText(ctx, variante.descripcion, S * 0.07, S * 0.75, S * 0.38, S * 0.038)
    }

    // Hashtags
    ctx.font = `500 ${S * 0.026}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(variante.hashtags, S * 0.07, S * 0.9)
  }

  // ── LAYOUT MINIMAL ──
  else {
    // Fondo oscuro profundo
    const bgColor = '#0d0d0d'
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, S, S)

    // Foto como fondo sutil (muy oscura)
    if (foto) {
      ctx.globalAlpha = 0.18
      const ratio = Math.max(S / foto.width, S / foto.height)
      const fw = foto.width * ratio
      const fh = foto.height * ratio
      ctx.drawImage(foto, (S - fw) / 2, (S - fh) / 2, fw, fh)
      ctx.globalAlpha = 1
    }

    // Círculo de acento decorativo
    const circleGrad = ctx.createRadialGradient(S * 0.85, S * 0.15, 0, S * 0.85, S * 0.15, S * 0.45)
    circleGrad.addColorStop(0, hexToRgba(acento, 0.25))
    circleGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = circleGrad
    ctx.fillRect(0, 0, S, S)

    // Líneas decorativas
    ctx.strokeStyle = hexToRgba(acento, 0.5)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(S * 0.06, S * 0.12)
    ctx.lineTo(S * 0.06, S * 0.18)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(S * 0.06, S * 0.2)
    ctx.lineTo(S * 0.94, S * 0.2)
    ctx.stroke()

    // Club nombre
    ctx.font = `600 ${S * 0.028}px Inter, sans-serif`
    ctx.fillStyle = hexToRgba(acento, 0.9)
    ctx.textAlign = 'left'
    ctx.fillText(clubNombre.toUpperCase(), S * 0.1, S * 0.17)

    // Titulo - centrado verticalmente
    ctx.font = `900 ${S * 0.105}px Inter, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    wrapText(ctx, variante.titulo.toUpperCase(), S / 2, S * 0.42, S * 0.86, S * 0.118)

    // Línea acento bajo titulo
    ctx.fillStyle = acento
    ctx.fillRect(S * 0.38, S * 0.6, S * 0.24, 5)

    // Subtitulo
    ctx.font = `300 ${S * 0.042}px Inter, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.textAlign = 'center'
    wrapText(ctx, variante.subtitulo, S / 2, S * 0.68, S * 0.82, S * 0.052)

    // Hashtags abajo centrados
    ctx.font = `500 ${S * 0.028}px Inter, sans-serif`
    ctx.fillStyle = hexToRgba(acento, 0.8)
    ctx.textAlign = 'center'
    ctx.fillText(variante.hashtags, S / 2, S * 0.9)

    // Línea inferior
    ctx.strokeStyle = hexToRgba(acento, 0.3)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(S * 0.06, S * 0.94)
    ctx.lineTo(S * 0.94, S * 0.94)
    ctx.stroke()
  }
}

// ── Componente FlyrCard ─────────────────────────────────────────────────────
function FlyrCard({
  variante,
  foto,
  clubNombre,
  index,
  seleccionada,
  onSelect,
}: {
  variante: Variante
  foto: HTMLImageElement | null
  clubNombre: string
  index: number
  seleccionada: boolean
  onSelect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    renderVariante(canvasRef.current, variante, foto, clubNombre)
  }, [variante, foto, clubNombre])

  function descargar() {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `flyer-${variante.layout}-${Date.now()}.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  const tonoLabel: Record<string, string> = {
    celebratorio: '🎉 Celebratorio',
    formal: '📋 Formal',
    hype: '🔥 Hype',
  }

  return (
    <div
      onClick={onSelect}
      style={{
        border: seleccionada ? `2px solid ${C.primary}` : `2px solid ${C.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: C.card,
        transition: 'all 0.15s',
        boxShadow: seleccionada ? `0 0 0 4px ${C.primaryL}` : '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      {/* Canvas preview */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            aspectRatio: '1/1',
            display: 'block',
          }}
        />
        {seleccionada && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: C.primary, color: '#fff',
            borderRadius: 20, fontSize: 11, fontWeight: 600,
            padding: '3px 10px',
          }}>
            ✓ Seleccionada
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {variante.layout}
          </span>
          <span style={{ fontSize: 11, color: C.muted }}>
            {tonoLabel[variante.tono] || variante.tono}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
          {variante.titulo}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
          {variante.subtitulo}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); descargar() }}
          style={{
            width: '100%',
            padding: '8px',
            background: seleccionada ? C.primary : 'transparent',
            color: seleccionada ? '#fff' : C.primary,
            border: `1px solid ${C.primary}`,
            borderRadius: 7,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Download size={13} />
          Descargar PNG (1080×1080)
        </button>
      </div>
    </div>
  )
}

// ── Página Principal ────────────────────────────────────────────────────────
export default function RedesSocialesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  const [prompt, setPrompt] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoImg, setFotoImg] = useState<HTMLImageElement | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')
  const [seleccionada, setSeleccionada] = useState<number | null>(null)
  const [clubNombre, setClubNombre] = useState('Mi Club')
  const [clubContexto, setClubContexto] = useState<ClubContexto>({
    nombre: 'Mi Club',
    deporte: 'Deporte',
    colores: ['#4f46e5'],
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prompts de ejemplo
  const ejemplos = [
    '¡Ganamos el torneo regional! Campeones 2026',
    'Convocatoria: entrenamientos abiertos este sábado',
    'Nuevo récord personal de nuestro jugador estrella',
    'Torneo interno este fin de semana, ¡inscríbete!',
  ]

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (perfil.rol === 'jugador') { router.push('/perfil'); return }

    // Cargar contexto del club
    if (perfil.club_id) {
      const supabase = createClient()
      supabase.from('clubes').select('nombre').eq('id', perfil.club_id).single()
        .then(({ data }) => {
          if (data?.nombre) {
            setClubNombre(data.nombre)
            setClubContexto({
              nombre: data.nombre,
              deporte: 'Tenis de Mesa',
              colores: ['#4f46e5', '#ffffff'],
            })
          }
        })
    }
  }, [authLoading, perfil])

  // Cargar foto como HTMLImageElement
  useEffect(() => {
    if (!foto) { setFotoImg(null); return }
    const url = URL.createObjectURL(foto)
    const img = new Image()
    img.onload = () => setFotoImg(img)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [foto])

  function onFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFoto(file)
  }

  function quitarFoto() {
    setFoto(null)
    setFotoImg(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generar() {
    if (!prompt.trim()) return
    setGenerando(true)
    setError('')
    setVariantes([])
    setSeleccionada(null)

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
    } finally {
      setGenerando(false)
    }
  }

  if (authLoading) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: C.primaryL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Camera size={18} color={C.primary} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
                Redes Sociales
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                Genera flyers profesionales con IA en segundos
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>

          {/* ── Panel izquierdo ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Prompt */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 10 }}>
                ¿Qué quieres publicar?
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Ej: ¡Ganamos el torneo regional! Campeones 2026"
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: C.text,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generar()
                }}
              />

              {/* Ejemplos */}
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: C.hint, marginBottom: 6 }}>Ejemplos rápidos:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ejemplos.map(ej => (
                    <button
                      key={ej}
                      onClick={() => setPrompt(ej)}
                      style={{
                        textAlign: 'left',
                        padding: '5px 8px',
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        fontSize: 11,
                        color: C.muted,
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                    >
                      {ej}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Foto */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: 'block', marginBottom: 10 }}>
                Foto (opcional)
              </label>

              {foto ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={URL.createObjectURL(foto)}
                    alt="foto"
                    style={{
                      width: '100%', aspectRatio: '1/1',
                      objectFit: 'cover', borderRadius: 8,
                      border: `1px solid ${C.border}`,
                    }}
                  />
                  <button
                    onClick={quitarFoto}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                      border: 'none', borderRadius: '50%',
                      width: 28, height: 28,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                  <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>{foto.name}</div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${C.border}`,
                    borderRadius: 8,
                    padding: '32px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <Upload size={24} color={C.hint} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>
                    Arrastra una foto o haz click
                  </div>
                  <div style={{ fontSize: 11, color: C.hint }}>
                    JPG, PNG, WEBP — se usa como fondo del flyer
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onFotoChange}
              />
            </div>

            {/* Botón generar */}
            <button
              onClick={generar}
              disabled={!prompt.trim() || generando}
              style={{
                width: '100%',
                padding: '14px',
                background: !prompt.trim() || generando ? '#c7d2fe' : C.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: !prompt.trim() || generando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.15s',
              }}
            >
              {generando ? (
                <><Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Generando variantes...</>
              ) : (
                <><Sparkles size={16} /> Generar 3 variantes</>
              )}
            </button>

            {variantes.length > 0 && (
              <button
                onClick={generar}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'transparent',
                  color: C.primary,
                  border: `1px solid ${C.primary}`,
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={13} /> Regenerar
              </button>
            )}

            {error && (
              <div style={{
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                fontSize: 13,
                color: '#dc2626',
              }}>
                {error}
              </div>
            )}
          </div>

          {/* ── Panel derecho: variantes ── */}
          <div>
            {generando && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: 400, gap: 16,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: C.primaryL,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={24} color={C.primary} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                    Creando tus variantes...
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                    La IA está diseñando 3 flyers únicos para ti
                  </div>
                </div>
              </div>
            )}

            {!generando && variantes.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: 400, gap: 12,
                border: `2px dashed ${C.border}`,
                borderRadius: 12,
              }}>
                <ImageIcon size={40} color={C.hint} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: C.muted }}>
                    Tus flyers aparecerán aquí
                  </div>
                  <div style={{ fontSize: 13, color: C.hint, marginTop: 4 }}>
                    Escribe un prompt y haz click en Generar
                  </div>
                </div>
              </div>
            )}

            {!generando && variantes.length > 0 && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                    3 variantes generadas
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>
                    Haz click para seleccionar y descargar
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {variantes.map((v, i) => (
                    <FlyrCard
                      key={i}
                      variante={v}
                      foto={fotoImg}
                      clubNombre={clubNombre}
                      index={i}
                      seleccionada={seleccionada === i}
                      onSelect={() => setSeleccionada(i)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea:focus { border-color: #4f46e5 !important; box-shadow: 0 0 0 3px #ede9fe; }
        @media (max-width: 900px) {
          .redes-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AppLayout>
  )
}
