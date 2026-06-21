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

// ── Stock fotos de tenis de mesa (Unsplash, gratis, CORS ok) ────────────────
const STOCK_FOTOS = [
  'https://images.unsplash.com/photo-1518928286447-dc161b7cd6fb?w=1080&q=85&auto=format&fit=crop', // jugador sirviendo
  'https://images.unsplash.com/photo-1659303388076-de1535159d6c?w=1080&q=85&auto=format&fit=crop', // hombre jugando
  'https://images.unsplash.com/photo-1461748659110-16121c049d52?w=1080&q=85&auto=format&fit=crop', // dos jugadores
  'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?w=1080&q=85&auto=format&fit=crop', // mesa azul atmosférica
  'https://images.unsplash.com/photo-1676827613262-5fba25cee5fd?w=1080&q=85&auto=format&fit=crop', // paletas en mesa azul
  'https://images.unsplash.com/photo-1515773512591-dfaf9e052325?w=1080&q=85&auto=format&fit=crop', // raqueta y pelota
]
const stockImgCache: Record<string, HTMLImageElement> = {}
async function loadStockFoto(url: string): Promise<HTMLImageElement> {
  if (stockImgCache[url]) return stockImgCache[url]
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { stockImgCache[url] = img; resolve(img) }
    img.onerror = reject
    img.src = url
  })
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
  ctx.font = `700 ${fontSize}px 'Barlow Condensed', sans-serif`
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

// Badge alineado a la izquierda (calcula cx automáticamente)
function pillBadgeLeft(ctx: CanvasRenderingContext2D, text: string, lx: number, cy: number, bg: string, color: string, fontSize: number) {
  ctx.font = `700 ${fontSize}px 'Barlow Condensed', sans-serif`
  const tw = ctx.measureText(text).width
  const pw = tw + fontSize * 1.6
  pillBadge(ctx, text, lx + pw / 2, cy, bg, color, fontSize)
}

function drawFoto(ctx: CanvasRenderingContext2D, foto: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / foto.width, h / foto.height)
  const fw = foto.width * ratio, fh = foto.height * ratio
  ctx.drawImage(foto, x + (w - fw) / 2, y + (h - fh) / 2, fw, fh)
}

// ── LAYOUT 1: SPOTLIGHT — foto full + backlight radial + badges centrados ────
async function renderHero(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // 1. Fondo base oscuro
  ctx.fillStyle = USB.azulOscuro
  ctx.fillRect(0, 0, S, S)

  // 2. Foto full canvas al 82%
  if (foto) {
    ctx.save()
    ctx.globalAlpha = 0.82
    drawFoto(ctx, foto, 0, 0, S, S)
    ctx.globalAlpha = 1
    ctx.restore()
  } else {
    const bg = ctx.createLinearGradient(0, 0, S, S)
    bg.addColorStop(0, USB.azulMedio); bg.addColorStop(0.6, '#0f2a6e'); bg.addColorStop(1, USB.azulOscuro)
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = rgba(USB.cyan, 0.08); ctx.lineWidth = 2
    for (let i = 1; i <= 9; i++) { ctx.beginPath(); ctx.arc(S*0.5, S*0.4, S*i*0.06, 0, Math.PI*2); ctx.stroke() }
  }

  // 3. Backlight radial detrás del jugador (efecto Teletón USB)
  const bl = ctx.createRadialGradient(S*0.5, S*0.38, 0, S*0.5, S*0.38, S*0.56)
  bl.addColorStop(0, rgba(USB.cyanBright, 0.52))
  bl.addColorStop(0.18, rgba(USB.azulVivo, 0.44))
  bl.addColorStop(0.42, rgba(USB.azulVivo, 0.16))
  bl.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = bl; ctx.fillRect(0, 0, S, S)

  // 4. Vignette oscura en bordes
  const vig = ctx.createRadialGradient(S*0.5, S*0.5, S*0.22, S*0.5, S*0.5, S*0.78)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, rgba(USB.azulOscuro, 0.7))
  ctx.fillStyle = vig; ctx.fillRect(0, 0, S, S)

  // 5. Gradiente oscuro en bottom (área de texto)
  const gBot = ctx.createLinearGradient(0, S*0.46, 0, S)
  gBot.addColorStop(0, 'rgba(0,0,0,0)')
  gBot.addColorStop(0.3, rgba(USB.azulOscuro, 0.78))
  gBot.addColorStop(1, rgba(USB.azulOscuro, 0.97))
  ctx.fillStyle = gBot; ctx.fillRect(0, S*0.46, S, S*0.54)

  // 6. Gradiente oscuro en top (área de club info)
  const gTop = ctx.createLinearGradient(0, 0, 0, S*0.16)
  gTop.addColorStop(0, rgba(USB.azulOscuro, 0.85)); gTop.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gTop; ctx.fillRect(0, 0, S, S*0.16)

  // 7. Línea cyan top (gradiente horizontal)
  const ltop = ctx.createLinearGradient(0, 0, S, 0)
  ltop.addColorStop(0, rgba(USB.cyan, 0)); ltop.addColorStop(0.5, USB.cyan); ltop.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = ltop; ctx.fillRect(0, 0, S, 5)

  // 8. Club info top-left
  ctx.font = `700 ${S*0.022}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.9); ctx.textAlign = 'left'
  ctx.fillText('· ' + club.toUpperCase() + ' ·', S*0.052, S*0.065)
  ctx.fillStyle = rgba(USB.cyan, 0.75)
  ctx.fillRect(S*0.052, S*0.078, S*0.25, 2)
  ctx.font = `600 ${S*0.017}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.7)
  ctx.fillText('TENIS DE MESA', S*0.052, S*0.097)

  // Año top-right
  ctx.font = `700 ${S*0.02}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.4); ctx.textAlign = 'right'
  ctx.fillText(new Date().getFullYear().toString(), S*0.95, S*0.065)

  // 9. TÍTULO — centrado, Barlow 900, sombra oscura
  ctx.shadowColor = rgba(USB.azulOscuro, 0.95); ctx.shadowBlur = 22
  ctx.font = `900 ${S*0.122}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco; ctx.textAlign = 'center'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S*0.5, S*0.6, S*0.9, S*0.128, 'center')
  ctx.shadowBlur = 0

  // 10. Badge subtítulo (color acento)
  if (v.subtitulo) {
    pillBadge(ctx, v.subtitulo.toUpperCase(), S*0.5, tY + S*0.076, v.colorAcento || USB.cyan, USB.blanco, S*0.03)
  }

  // 11. Badge fecha (glass)
  if (v.fecha) {
    const fechaY = v.subtitulo ? tY + S*0.148 : tY + S*0.076
    pillBadge(ctx, v.fecha.toUpperCase(), S*0.5, fechaY, rgba(USB.azulOscuro, 0.55), USB.blanco, S*0.026)
  }

  // 12. Hashtags
  ctx.font = `700 ${S*0.026}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.8); ctx.textAlign = 'center'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S*0.5, S*0.948)

  // Línea bottom
  const lbot = ctx.createLinearGradient(0, 0, S, 0)
  lbot.addColorStop(0, rgba(USB.cyan, 0)); lbot.addColorStop(0.5, USB.cyan); lbot.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = lbot; ctx.fillRect(0, S*0.96, S, 4)
}

// ── LAYOUT 2: CINEMATIC — corte diagonal + speed lines + jugador derecha ────
async function renderSplit(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // 1. Fondo base oscuro
  ctx.fillStyle = USB.azulOscuro
  ctx.fillRect(0, 0, S, S)

  // 2. Foto lado derecho (80%), corte diagonal
  if (foto) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(S*0.30, 0); ctx.lineTo(S, 0); ctx.lineTo(S, S); ctx.lineTo(S*0.18, S)
    ctx.closePath(); ctx.clip()
    ctx.globalAlpha = 0.82
    drawFoto(ctx, foto, S*0.15, 0, S*0.85, S)
    ctx.globalAlpha = 1
    ctx.restore()
    // Degradado de integración izquierdo sobre la foto
    const fGrad = ctx.createLinearGradient(S*0.15, 0, S*0.7, 0)
    fGrad.addColorStop(0, USB.azulOscuro)
    fGrad.addColorStop(0.4, rgba(USB.azulOscuro, 0.6))
    fGrad.addColorStop(0.7, rgba(USB.azulOscuro, 0.12))
    fGrad.addColorStop(1, rgba(USB.azulOscuro, 0.3))
    ctx.fillStyle = fGrad; ctx.fillRect(S*0.15, 0, S*0.85, S)
  } else {
    const nf = ctx.createLinearGradient(S*0.28, 0, S, S)
    nf.addColorStop(0, USB.azulMedio); nf.addColorStop(1, USB.azulVivo)
    ctx.fillStyle = nf; ctx.fillRect(S*0.28, 0, S*0.72, S)
    ctx.strokeStyle = rgba(USB.cyan, 0.07); ctx.lineWidth = 2
    for (let i = 1; i <= 10; i++) { ctx.beginPath(); ctx.arc(S*0.72, S*0.5, S*i*0.055, 0, Math.PI*2); ctx.stroke() }
  }

  // 3. Panel izquierdo (oscuro con degradado)
  const panelGrad = ctx.createLinearGradient(0, 0, S*0.58, 0)
  panelGrad.addColorStop(0, USB.azulOscuro)
  panelGrad.addColorStop(0.72, rgba(USB.azulOscuro, 0.96))
  panelGrad.addColorStop(1, rgba(USB.azulOscuro, 0.55))
  ctx.fillStyle = panelGrad; ctx.fillRect(0, 0, S*0.58, S)

  // 4. Barra vertical izquierda con glow cyan
  const barGrad = ctx.createLinearGradient(0, 0, 0, S)
  barGrad.addColorStop(0, rgba(USB.cyanBright, 0))
  barGrad.addColorStop(0.2, USB.cyanBright); barGrad.addColorStop(0.8, USB.cyanBright)
  barGrad.addColorStop(1, rgba(USB.cyanBright, 0))
  ctx.fillStyle = barGrad; ctx.fillRect(0, 0, 6, S)
  const glowGrad = ctx.createLinearGradient(0, 0, 32, 0)
  glowGrad.addColorStop(0, rgba(USB.cyanBright, 0.3)); glowGrad.addColorStop(1, rgba(USB.cyanBright, 0))
  ctx.fillStyle = glowGrad; ctx.fillRect(6, 0, 32, S)

  // 5. Speed lines (izquierda, efecto velocidad)
  for (let i = 0; i < 24; i++) {
    const yb = S * 0.035 + i * S * 0.04
    const len = S * 0.08 + Math.sin(i * 1.3) * S * 0.055
    const xOff = S * 0.042 + Math.sin(i * 0.6) * S * 0.018
    const alpha = i % 5 === 0 ? 0.2 : 0.06
    ctx.strokeStyle = rgba(USB.cyanBright, alpha)
    ctx.lineWidth = i % 4 === 0 ? 2 : 1
    ctx.beginPath(); ctx.moveTo(xOff, yb); ctx.lineTo(xOff + len, yb); ctx.stroke()
  }

  // 6. Franja diagonal decorativa (acento)
  ctx.save()
  ctx.fillStyle = rgba(v.colorAcento || USB.cyan, 0.14)
  ctx.beginPath()
  ctx.moveTo(S*0.05, S*0.38); ctx.lineTo(S*0.46, S*0.38); ctx.lineTo(S*0.42, S*0.415); ctx.lineTo(S*0.01, S*0.415)
  ctx.closePath(); ctx.fill()
  ctx.restore()

  // 7. Club info top-left
  ctx.font = `700 ${S*0.02}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.85); ctx.textAlign = 'left'
  ctx.fillText(club.toUpperCase(), S*0.065, S*0.082)
  ctx.fillStyle = rgba(USB.cyan, 0.8)
  ctx.fillRect(S*0.065, S*0.096, S*0.13, 2)
  ctx.font = `400 ${S*0.016}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.42)
  ctx.fillText('TENIS DE MESA', S*0.065, S*0.116)

  // 8. TÍTULO — izquierda, enorme
  ctx.shadowColor = rgba(USB.azulOscuro, 0.9); ctx.shadowBlur = 16
  ctx.font = `900 ${S*0.108}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco; ctx.textAlign = 'left'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S*0.065, S*0.35, S*0.48, S*0.115, 'left')
  ctx.shadowBlur = 0

  // 9. Badge subtítulo (izq, alineado)
  if (v.subtitulo) {
    pillBadgeLeft(ctx, v.subtitulo.toUpperCase(), S*0.065, tY + S*0.078, v.colorAcento || USB.cyan, USB.blanco, S*0.026)
  }

  // 10. Badge fecha
  if (v.fecha) {
    const fy = v.subtitulo ? tY + S*0.148 : tY + S*0.078
    pillBadgeLeft(ctx, v.fecha.toUpperCase(), S*0.065, fy, rgba(USB.azulOscuro, 0.65), USB.blanco, S*0.024)
  }

  // 11. Hashtags bottom-left
  ctx.font = `700 ${S*0.024}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.72); ctx.textAlign = 'left'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S*0.065, S*0.938)

  // Línea bottom
  const lbot = ctx.createLinearGradient(0, 0, S, 0)
  lbot.addColorStop(0, USB.cyan); lbot.addColorStop(0.6, rgba(USB.cyan, 0.15)); lbot.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = lbot; ctx.fillRect(0, S*0.956, S, 4)
}

// ── LAYOUT 3: POSTER BOLD — foto full + backlight + franja torn CTA ─────────
async function renderMinimal(ctx: CanvasRenderingContext2D, v: Variante, foto: HTMLImageElement | null, club: string) {
  const S = CANVAS_SIZE

  // 1. Fondo base
  ctx.fillStyle = USB.azulOscuro
  ctx.fillRect(0, 0, S, S)

  // 2. Foto full canvas al 85%
  if (foto) {
    ctx.save()
    ctx.globalAlpha = 0.85
    drawFoto(ctx, foto, 0, 0, S, S)
    ctx.globalAlpha = 1
    ctx.restore()
  } else {
    const bg = ctx.createLinearGradient(0, 0, S*0.8, S)
    bg.addColorStop(0, '#0c1a4a'); bg.addColorStop(0.5, USB.azulVivo); bg.addColorStop(1, '#040b14')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S)
    // Hexágonos decorativos (posiciones fijas)
    const hexes = [[S*0.28, S*0.38], [S*0.72, S*0.62], [S*0.5, S*0.22], [S*0.14, S*0.68]]
    hexes.forEach(([hx, hy]) => {
      ctx.strokeStyle = rgba(USB.cyan, 0.09); ctx.lineWidth = 2; ctx.beginPath()
      for (let j = 0; j < 6; j++) {
        const a = (j * Math.PI) / 3 - Math.PI / 6, r = S*0.11
        if (j === 0) ctx.moveTo(hx + r*Math.cos(a), hy + r*Math.sin(a))
        else ctx.lineTo(hx + r*Math.cos(a), hy + r*Math.sin(a))
      }
      ctx.closePath(); ctx.stroke()
    })
  }

  // 3. Backlight radial INTENSO (efecto Teletón)
  const bl = ctx.createRadialGradient(S*0.5, S*0.34, 0, S*0.5, S*0.34, S*0.62)
  bl.addColorStop(0, rgba(USB.cyanBright, 0.65))
  bl.addColorStop(0.14, rgba(USB.azulVivo, 0.56))
  bl.addColorStop(0.34, rgba(USB.azulVivo, 0.22))
  bl.addColorStop(0.62, rgba(USB.azulOscuro, 0.08))
  bl.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = bl; ctx.fillRect(0, 0, S, S)

  // 4. Gradiente oscuro top (club info)
  const gTop = ctx.createLinearGradient(0, 0, 0, S*0.2)
  gTop.addColorStop(0, rgba(USB.azulOscuro, 0.88)); gTop.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gTop; ctx.fillRect(0, 0, S, S*0.2)

  // 5. Club info top (centrado)
  ctx.font = `700 ${S*0.02}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.blanco, 0.88); ctx.textAlign = 'center'
  ctx.fillText('· ' + club.toUpperCase() + ' ·', S*0.5, S*0.065)
  const ltop = ctx.createLinearGradient(S*0.22, 0, S*0.78, 0)
  ltop.addColorStop(0, rgba(USB.cyan, 0)); ltop.addColorStop(0.5, USB.cyan); ltop.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = ltop; ctx.fillRect(S*0.22, S*0.079, S*0.56, 3)
  ctx.font = `400 ${S*0.016}px Inter, sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.58); ctx.textAlign = 'center'
  ctx.fillText('CLUB DEPORTIVO · TENIS DE MESA', S*0.5, S*0.1)

  // 6. TÍTULO — centrado, ENORME, con sombra oscura fuerte
  ctx.shadowColor = rgba(USB.azulOscuro, 0.98); ctx.shadowBlur = 28
  ctx.font = `900 ${S*0.138}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = USB.blanco; ctx.textAlign = 'center'
  const tY = wrapText(ctx, v.titulo.toUpperCase(), S*0.5, S*0.46, S*0.93, S*0.146, 'center')
  ctx.shadowBlur = 0

  // 7. Franja CTA con borde torn (ondas sinusoidales deterministas)
  const panelTop = tY + S * 0.062
  ctx.save()
  ctx.fillStyle = rgba(USB.azulOscuro, 0.92)
  ctx.beginPath()
  ctx.moveTo(0, panelTop)
  for (let x = 0; x <= S + 16; x += 16) {
    const wy = panelTop + Math.sin(x * 0.024) * 12 + Math.sin(x * 0.057) * 5
    ctx.lineTo(x, wy)
  }
  ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.closePath(); ctx.fill()
  ctx.restore()

  // Línea cyan sobre la franja
  const lline = ctx.createLinearGradient(0, 0, S, 0)
  lline.addColorStop(0, rgba(USB.cyan, 0)); lline.addColorStop(0.12, USB.cyan)
  lline.addColorStop(0.88, USB.cyan); lline.addColorStop(1, rgba(USB.cyan, 0))
  ctx.fillStyle = lline; ctx.fillRect(0, panelTop + 2, S, 4)

  // 8. Badges dentro de la franja
  const badgeY = panelTop + S*0.058
  if (v.subtitulo) {
    pillBadge(ctx, v.subtitulo.toUpperCase(), S*0.5, badgeY, v.colorAcento || USB.cyan, USB.blanco, S*0.03)
  }
  if (v.fecha) {
    const fy = v.subtitulo ? badgeY + S*0.07 : badgeY
    pillBadge(ctx, v.fecha.toUpperCase(), S*0.5, fy, rgba(USB.blanco, 0.14), USB.blanco, S*0.025)
  }

  // 9. Hashtags bottom
  ctx.font = `700 ${S*0.026}px 'Barlow Condensed', sans-serif`
  ctx.fillStyle = rgba(USB.cyanBright, 0.76); ctx.textAlign = 'center'
  ctx.fillText(v.hashtags.split(' ').slice(0,3).join('  '), S*0.5, S*0.945)

  // Línea bottom
  ctx.fillStyle = rgba(USB.cyan, 0.45)
  ctx.fillRect(S*0.12, S*0.958, S*0.76, 3)
}

// ── Render principal ────────────────────────────────────────────────────────
async function renderVariante(canvas: HTMLCanvasElement, v: Variante, foto: HTMLImageElement | null, club: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  await cargarFuentes()

  // Si no hay foto del usuario, cargar stock foto de tenis de mesa
  let fotoFinal = foto
  if (!fotoFinal) {
    const layoutIdx = ['hero', 'split', 'minimal'].indexOf(v.layout)
    const stockUrl = STOCK_FOTOS[layoutIdx % STOCK_FOTOS.length]
    try { fotoFinal = await loadStockFoto(stockUrl) } catch (_) {}
  }

  if (v.layout === 'hero') await renderHero(ctx, v, fotoFinal, club)
  else if (v.layout === 'split') await renderSplit(ctx, v, fotoFinal, club)
  else await renderMinimal(ctx, v, fotoFinal, club)
}

// ── FlyrCard ────────────────────────────────────────────────────────────────
function FlyrCard({ variante, foto, clubNombre, seleccionada, onSelect, imagenAI, generandoAI }: {
  variante: Variante; foto: HTMLImageElement | null; clubNombre: string
  seleccionada: boolean; onSelect: () => void
  imagenAI: string | null; generandoAI: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compositeRef = useRef<HTMLCanvasElement>(null)

  // Render Canvas base siempre
  useEffect(() => {
    if (canvasRef.current) renderVariante(canvasRef.current, variante, foto, clubNombre)
  }, [variante, foto, clubNombre])

  // Cuando llega la imagen AI, hacer composite: AI fondo + Canvas texto encima
  useEffect(() => {
    if (!imagenAI || !canvasRef.current || !compositeRef.current) return
    const composite = compositeRef.current
    const ctx = composite.getContext('2d')
    if (!ctx) return
    composite.width = CANVAS_SIZE
    composite.height = CANVAS_SIZE

    const aiImg = new Image()
    aiImg.onload = async () => {
      // 1. Fondo AI
      ctx.drawImage(aiImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
      // 2. Canvas con texto encima (solo el texto, no el fondo)
      // Renderizamos variante con foto null para obtener solo overlays de texto
      // pero sobre la AI image ya puesta
      const tmpCanvas = document.createElement('canvas')
      await renderVariante(tmpCanvas, variante, null, clubNombre)
      // Modo "screen" para mezclar solo los textos claros
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.drawImage(tmpCanvas, 0, 0)
    }
    aiImg.src = imagenAI
  }, [imagenAI, variante, clubNombre])

  function descargar(e: React.MouseEvent) {
    e.stopPropagation()
    // Descargar el composite AI si está listo, sino el Canvas base
    const target = (imagenAI && compositeRef.current) ? compositeRef.current : canvasRef.current
    if (!target) return
    const a = document.createElement('a')
    a.download = `flyer-${variante.layout}-${Date.now()}.png`
    a.href = target.toDataURL('image/png')
    a.click()
  }

  const tonoLabel: Record<string, string> = { celebratorio: '🎉 Celebratorio', formal: '📋 Formal', hype: '🔥 Hype' }
  const mostrarComposite = imagenAI && !generandoAI

  return (
    <div onClick={onSelect} style={{
      border: seleccionada ? `2px solid ${C.primary}` : `2px solid ${C.border}`,
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: C.card,
      transition: 'all 0.15s',
      boxShadow: seleccionada ? `0 0 0 4px ${C.primaryL}` : '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ position: 'relative' }}>
        {/* Canvas base (visible si no hay AI todavía) */}
        <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1/1', display: mostrarComposite ? 'none' : 'block' }} />
        {/* Canvas composite AI+texto (visible cuando llega la AI) */}
        <canvas ref={compositeRef} style={{ width: '100%', aspectRatio: '1/1', display: mostrarComposite ? 'block' : 'none' }} />

        {/* Badge AI generando */}
        {generandoAI && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#22d3ee', borderRadius: 20, fontSize: 11, fontWeight: 600, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generando con IA...
          </div>
        )}
        {mostrarComposite && (
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(6,182,212,0.9)', color: '#fff', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '3px 10px' }}>
            ✨ IA
          </div>
        )}
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
  const [imagenesAI, setImagenesAI] = useState<(string | null)[]>([null, null, null])
  const [generandoAI, setGenerandoAI] = useState<boolean[]>([false, false, false])

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

  async function generarImagenAI(variante: Variante, idx: number) {
    setGenerandoAI(prev => { const n = [...prev]; n[idx] = true; return n })
    try {
      const res = await fetch('/api/generar-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: variante.layout, tono: variante.tono, clubNombre }),
      })
      const data = await res.json()
      if (data.imagen) {
        setImagenesAI(prev => { const n = [...prev]; n[idx] = data.imagen; return n })
      }
    } catch (_) {}
    finally {
      setGenerandoAI(prev => { const n = [...prev]; n[idx] = false; return n })
    }
  }

  async function generar() {
    if (!prompt.trim()) return
    setGenerando(true); setError(''); setVariantes([]); setSeleccionada(null)
    setImagenesAI([null, null, null]); setGenerandoAI([false, false, false])
    try {
      const res = await fetch('/api/generar-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, clubContexto }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVariantes(data.variantes)
      // Generar imágenes AI en paralelo (sin bloquear UI)
      data.variantes.forEach((v: Variante, i: number) => {
        generarImagenAI(v, i)
      })
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
                    <FlyrCard key={i} variante={v} foto={fotoImg} clubNombre={clubNombre} seleccionada={seleccionada === i} onSelect={() => setSeleccionada(i)} imagenAI={imagenesAI[i]} generandoAI={generandoAI[i]} />
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
