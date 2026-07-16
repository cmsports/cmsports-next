'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generarBloquesHorario, normalizarBloque, BLOQUE_INICIO, BLOQUE_FIN } from '@/lib/domain/liga'
import {
  moverPartidoLiga, iniciarFecha, registrarResultadoPartido,
  registrarWalkover, reprogramarPartidoAFecha5, cambiarArbitroPartido,
} from '@/app/actions/liga'

const supabase = createClient()

const ink   = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']

// Colores por división (cycling)
const DIV_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f43f5e','#84cc16','#ec4899','#3b82f6',
]
function divColor(nombre: string) {
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) | 0
  return DIV_COLORS[Math.abs(h) % DIV_COLORS.length]
}

interface PartidoBoard {
  id: string
  divisionId: string
  mesaId: string | null
  bloqueHorario: string | null
  jugadorAId: string
  jugadorBId: string
  arbitroId: string | null
  estado: string
  setsA: number | null
  setsB: number | null
  divisionNombre: string
}
interface Mesa { id: string; numero: number }

export function TableroFecha({
  fechaId,
  divisionId,
  ligaId,
}: {
  fechaId: string
  divisionId?: string
  ligaId: string
}) {
  const [fecha, setFecha] = useState<{ numero: number; estado: string; ligaId: string; ligaNombre: string } | null>(null)
  const [bloques, setBloques] = useState<string[]>(() => generarBloquesHorario())
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [partidos, setPartidos] = useState<PartidoBoard[]>([])
  const [editandoArbitroId, setEditandoArbitroId] = useState<string | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [jugadoresPorDivision, setJugadoresPorDivision] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [partidoResultado, setPartidoResultado] = useState<PartidoBoard | null>(null)
  const [setsA, setSetsA] = useState('3')
  const [setsB, setSetsB] = useState('0')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [guardandoAccion, setGuardandoAccion] = useState(false)

  const cargar = useCallback(async () => {
    const db = supabase as any
    const [{ data: fechaData }, { data: mesasData }, { data: rawPartidos }, { data: divisionesData }, { data: jugadoresData }] = await Promise.all([
      supabase.from('liga_fechas').select('numero, estado, liga_id, ligas(nombre, bloque_minutos)').eq('id', fechaId).single(),
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero', { ascending: true }),
      db.from('liga_partidos').select('id, division_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id, estado, sets_a, sets_b').eq('fecha_id', fechaId).is('deleted_at', null),
      supabase.from('liga_divisiones').select('id, nombre').eq('liga_id', ligaId),
      supabase.from('jugadores').select('id, nombre'),
    ])
    if (!fechaData) { setLoading(false); return }

    const ligaRel = (Array.isArray(fechaData.ligas) ? fechaData.ligas[0] : fechaData.ligas) as Record<string, unknown> | null
    setFecha({ numero: fechaData.numero, estado: fechaData.estado, ligaId: fechaData.liga_id, ligaNombre: String(ligaRel?.nombre ?? '') })
    setBloques(generarBloquesHorario(BLOQUE_INICIO, BLOQUE_FIN, Number(ligaRel?.bloque_minutos ?? 30)))

    const divisionIds = (divisionesData || []).map((d: any) => d.id)
    const { data: divJugData } = divisionIds.length > 0
      ? await supabase.from('liga_division_jugadores').select('division_id, jugador_id').in('division_id', divisionIds)
      : { data: [] as any[] }

    const nombreDivisionPorId = new Map((divisionesData || []).map((d: any) => [d.id, d.nombre]))
    setMesas(mesasData || [])

    const lista: PartidoBoard[] = ((rawPartidos || []) as Array<{
      id: string; division_id: string; mesa_id: string | null; bloque_horario: string | null
      jugador_a_id: string; jugador_b_id: string; arbitro_id: string | null
      estado: string; sets_a: number | null; sets_b: number | null
    }>).map(p => ({
      id: p.id, divisionId: p.division_id, mesaId: p.mesa_id,
      bloqueHorario: normalizarBloque(p.bloque_horario),
      jugadorAId: p.jugador_a_id, jugadorBId: p.jugador_b_id, arbitroId: p.arbitro_id,
      estado: p.estado, setsA: p.sets_a, setsB: p.sets_b,
      divisionNombre: nombreDivisionPorId.get(p.division_id) ?? '',
    }))
    setPartidos(lista)

    const mapaDivJug: Record<string, string[]> = {}
    for (const row of divJugData || []) mapaDivJug[row.division_id] = [...(mapaDivJug[row.division_id] || []), row.jugador_id]
    setJugadoresPorDivision(mapaDivJug)

    const mapa: Record<string, string> = {}
    for (const j of jugadoresData || []) mapa[j.id] = j.nombre
    setNombres(mapa)

    setLoading(false)
  }, [fechaId, ligaId])

  useEffect(() => { cargar() }, [cargar])

  const partidosVisibles = divisionId ? partidos.filter(p => p.divisionId === divisionId) : partidos
  const mesasVisibles = divisionId
    ? mesas.filter(m => partidosVisibles.some(p => p.mesaId === m.id))
    : mesas

  function partidoEn(mesaId: string, bloque: string) {
    return partidosVisibles.find(p => p.mesaId === mesaId && p.bloqueHorario === bloque)
  }

  async function soltarEn(mesaId: string, bloque: string) {
    if (!draggingId || fecha?.estado !== 'programada') return
    const partidoId = draggingId
    setDraggingId(null); setError('')
    if (partidoEn(mesaId, bloque)) { setError('Esa mesa ya está ocupada en ese horario'); return }
    const anterior = partidos.find(p => p.id === partidoId)
    if (!anterior) return
    setPartidos(prev => prev.map(p => (p.id === partidoId ? { ...p, mesaId, bloqueHorario: bloque } : p)))
    const res = await moverPartidoLiga({ partidoId, fechaId, mesaId, bloqueHorario: bloque })
    if (res.error) { setError(res.error); setPartidos(prev => prev.map(p => (p.id === partidoId ? anterior : p))) }
  }

  async function handleIniciarFecha() {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setError(res.error); return }
    setFecha(prev => prev ? { ...prev, estado: 'en_juego' } : prev)
  }

  function abrirResultado(partido: PartidoBoard) {
    if (['finalizado', 'walkover'].includes(partido.estado)) return
    setPartidoResultado(partido); setSetsA('3'); setSetsB('0')
  }

  async function handleGuardarResultado() {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }
    const sA = Number(setsA), sB = Number(setsB)
    setPartidoResultado(null)
    setPartidos(prev => prev.map(p => p.id === partSnap.id ? { ...p, estado: 'finalizado', setsA: sA, setsB: sB } : p))
    setGuardandoResultado(true)
    const res = await registrarResultadoPartido({ partidoId: partSnap.id, setsA: sA, setsB: sB })
    setGuardandoResultado(false)
    if (res.error) { setError(res.error); setPartidos(prev => prev.map(p => p.id === partSnap.id ? partSnap : p)) }
  }

  async function handleWalkover(ganadorId: string) {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }
    setPartidoResultado(null)
    setPartidos(prev => prev.map(p => p.id === partSnap.id ? { ...p, estado: 'walkover' } : p))
    setGuardandoAccion(true)
    const res = await registrarWalkover({ partidoId: partSnap.id, ganadorId })
    setGuardandoAccion(false)
    if (res.error) { setError(res.error); setPartidos(prev => prev.map(p => p.id === partSnap.id ? partSnap : p)) }
  }

  async function handleReprogramar() {
    if (!partidoResultado) return
    const partSnap = { ...partidoResultado }
    setPartidoResultado(null)
    setPartidos(prev => prev.filter(p => p.id !== partSnap.id))
    setGuardandoAccion(true)
    const res = await reprogramarPartidoAFecha5({ partidoId: partSnap.id })
    setGuardandoAccion(false)
    if (res.error) { setError(res.error); setPartidos(prev => [...prev, partSnap]) }
  }

  async function handleCambiarArbitro(partidoId: string, arbitroId: string) {
    setError('')
    const anterior = partidos.find(p => p.id === partidoId)
    setPartidos(prev => prev.map(p => p.id === partidoId ? { ...p, arbitroId: arbitroId || null } : p))
    setEditandoArbitroId(null)
    const res = await cambiarArbitroPartido({ partidoId, arbitroId: arbitroId || null })
    if (res.error) { setError(res.error); if (anterior) setPartidos(prev => prev.map(p => p.id === partidoId ? anterior : p)) }
  }

  async function exportarPDFHorarios() {
    const { default: jsPDF } = await import('jspdf')
    if (!fecha) return
    const f = fecha
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 13
    const CW = W - 2 * M
    const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

    function rgb(hex: string): [number,number,number] {
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
    }

    let pageNum = 0
    function nuevaPagina() {
      if (pageNum > 0) doc.addPage()
      pageNum++
      // Header oscuro
      doc.setFillColor(22, 20, 60)
      doc.rect(0, 0, W, 32, 'F')
      doc.setFillColor(99, 102, 241)
      doc.rect(0, 29, W, 3, 'F')
      // Liga
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(15)
      doc.setFont('helvetica', 'bold')
      doc.text(f.ligaNombre, M, 13)
      // Subtítulo
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(170, 175, 220)
      doc.text(`Fecha ${f.numero}  ·  Programación por horario`, M, 22)
      doc.text(hoy, W - M, 22, { align: 'right' })
      // Footer
      doc.setFillColor(248, 250, 252)
      doc.rect(0, H - 10, W, 10, 'F')
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.25)
      doc.line(M, H - 10, W - M, H - 10)
      doc.setTextColor(148, 163, 184); doc.setFontSize(7)
      doc.text(`${f.ligaNombre} · Fecha ${f.numero}`, W / 2, H - 4, { align: 'center' })
      doc.text(`${pageNum}`, W - M, H - 4, { align: 'right' })
      return 38
    }

    // Ordenar por horario → mesa
    const sorted = [...partidosVisibles]
      .filter(p => p.bloqueHorario && p.mesaId)
      .sort((a, b) => {
        const bc = (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '')
        return bc !== 0 ? bc : (mesas.find(m => m.id === a.mesaId)?.numero ?? 0) - (mesas.find(m => m.id === b.mesaId)?.numero ?? 0)
      })

    // Agrupar por bloque
    const grupos: { bloque: string; items: typeof sorted }[] = []
    for (const p of sorted) {
      const b = p.bloqueHorario!
      const last = grupos[grupos.length - 1]
      if (last?.bloque === b) last.items.push(p)
      else grupos.push({ bloque: b, items: [p] })
    }

    const BH = 8    // bloque header height
    const RH = 9    // row height
    const GAP = 5   // gap between groups

    let y = nuevaPagina()

    for (const grupo of grupos) {
      const needed = BH + grupo.items.length * RH + GAP
      if (y + needed > H - 13) { y = nuevaPagina() }

      // Fila de horario
      doc.setFillColor(238, 242, 255)
      doc.rect(M, y, CW, BH, 'F')
      doc.setFillColor(99, 102, 241)
      doc.rect(M, y, 3, BH, 'F')
      doc.setTextColor(49, 46, 129)
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(grupo.bloque, M + 6, y + 5.4)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.setTextColor(99, 102, 241)
      doc.text(`${grupo.items.length} partido${grupo.items.length !== 1 ? 's' : ''}`, W - M, y + 5.4, { align: 'right' })
      y += BH

      for (let i = 0; i < grupo.items.length; i++) {
        const p = grupo.items[i]
        const dc = rgb(divColor(p.divisionNombre))
        const mesaNum = mesas.find(m => m.id === p.mesaId)?.numero ?? '—'
        const jA = nombres[p.jugadorAId] ?? '—'
        const jB = nombres[p.jugadorBId] ?? '—'
        const arb = p.arbitroId ? nombres[p.arbitroId] ?? '' : ''
        const cy = y + RH / 2 + 0.8

        // Fondo alterno
        if (i % 2 === 0) { doc.setFillColor(252, 253, 255); doc.rect(M, y, CW, RH, 'F') }

        // Línea de color de división (izquierda)
        doc.setFillColor(...dc); doc.rect(M, y, 2.5, RH, 'F')

        // Mesa pill
        doc.setFillColor(241, 245, 249)
        doc.roundedRect(M + 4.5, y + 1.5, 16, RH - 3, 1, 1, 'F')
        doc.setTextColor(71, 85, 105); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
        doc.text(`M ${mesaNum}`, M + 12.5, cy, { align: 'center' })

        // División (coloreado)
        doc.setTextColor(...dc); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
        doc.text(p.divisionNombre, M + 22.5, cy)

        // Jugador A
        doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
        doc.text(jA, M + 57, cy)

        // vs
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
        doc.setTextColor(180, 190, 210)
        doc.text('vs', W / 2 + 4, cy, { align: 'center' })

        // Jugador B
        doc.setTextColor(15, 23, 42); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
        doc.text(jB, W / 2 + 10, cy)

        // Árbitro
        if (arb) {
          doc.setFontSize(7); doc.setFont('helvetica', 'normal')
          doc.setTextColor(160, 170, 190)
          doc.text(`árb: ${arb}`, W - M, cy, { align: 'right' })
        }

        // Separador
        doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2)
        doc.line(M, y + RH, W - M, y + RH)
        y += RH
      }
      y += GAP
    }

    doc.save(`fecha${fecha.numero}_horarios.pdf`)
  }

  async function exportarPDFMesa() {
    const { default: jsPDF } = await import('jspdf')
    if (!fecha) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 12
    const CW = W - 2 * M

    function rgb(hex: string): [number,number,number] {
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
    }
    const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

    // Constantes de la tarjeta de partido
    const BW = 14   // score box width
    const BH = 7    // score box height
    const CARD_TOP_PAD = 3
    const CARD_BOT_PAD = 3

    function cardH() {
      // stripe(1.5) + top(3) + info(7) + sep(1.5) + names(8) + sets(5*(BH+1.5)) + gap(2) + result(BH+2) + winner(8) + bot(3)
      return 1.5 + CARD_TOP_PAD + 7 + 1.5 + 8 + 5 * (BH + 1.5) + 2 + (BH + 2) + 8 + CARD_BOT_PAD
    }

    const mesasOrdenadas = [...mesasVisibles]
      .filter(m => partidosVisibles.some(p => p.mesaId === m.id && p.bloqueHorario))
      .sort((a, b) => a.numero - b.numero)

    function matchesDeMesa(mesaId: string) {
      return partidosVisibles
        .filter(p => p.mesaId === mesaId && p.bloqueHorario)
        .sort((a, b) => (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? ''))
    }

    function drawMesaPageHeader(mesaNum: number): number {
      // Fondo oscuro header
      doc.setFillColor(22, 20, 60)
      doc.rect(0, 0, W, 26, 'F')
      doc.setFillColor(16, 185, 129)
      doc.rect(0, 23, W, 3, 'F')

      // Círculo de mesa
      doc.setFillColor(16, 185, 129)
      doc.circle(M + 11, 13, 9, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text(String(mesaNum), M + 11, 15.5, { align: 'center' })

      // MESA label
      doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.setTextColor(100, 230, 185)
      doc.text('MESA', M + 11, 6.5, { align: 'center' })

      // Liga + fecha
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text(fecha!.ligaNombre, M + 24, 12)
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      doc.setTextColor(170, 220, 200)
      doc.text(`Fecha ${fecha!.numero} · ${hoy}`, M + 24, 19)

      // Footer de la página
      doc.setFillColor(248, 250, 252)
      doc.rect(0, H - 9, W, 9, 'F')
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.25)
      doc.line(M, H - 9, W - M, H - 9)
      doc.setTextColor(148, 163, 184); doc.setFontSize(6.5)
      doc.text(`${fecha!.ligaNombre} · Fecha ${fecha!.numero} · Mesa ${mesaNum}`, W / 2, H - 3.5, { align: 'center' })

      return 30  // y inicial después del header
    }

    function drawContHeader(mesaNum: number): number {
      doc.setFillColor(238, 242, 255)
      doc.rect(0, 0, W, 12, 'F')
      doc.setDrawColor(199, 210, 254); doc.setLineWidth(0.3)
      doc.line(0, 12, W, 12)
      doc.setTextColor(49, 46, 129); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(`Mesa ${mesaNum} (continuación)  ·  Fecha ${fecha!.numero}`, M, 8)
      return 15
    }

    function drawMatchCard(p: PartidoBoard, y: number) {
      const dc = rgb(divColor(p.divisionNombre))
      const jA = nombres[p.jugadorAId] ?? '—'
      const jB = nombres[p.jugadorBId] ?? '—'
      const arb = p.arbitroId ? nombres[p.arbitroId] ?? '' : ''
      const CH = cardH()

      // Fondo blanco + borde exterior sutil
      doc.setFillColor(255, 255, 255)
      doc.rect(M, y, CW, CH, 'F')
      doc.setDrawColor(220, 228, 240); doc.setLineWidth(0.3)
      doc.rect(M, y, CW, CH, 'S')

      // Stripe de color de división arriba
      doc.setFillColor(...dc)
      doc.rect(M, y, CW, 1.5, 'F')

      let cy = y + 1.5 + CARD_TOP_PAD

      // Línea de info: división | horario | árbitro
      doc.setFillColor(...dc)
      doc.circle(M + 5, cy + 3, 2.2, 'F')
      doc.setTextColor(...dc); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text(p.divisionNombre, M + 9, cy + 4.5)

      doc.setTextColor(49, 46, 129); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.text(p.bloqueHorario ?? '—', W / 2, cy + 4.5, { align: 'center' })

      if (arb) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal')
        doc.setTextColor(150, 163, 190)
        doc.text(`Árbitro: ${arb}`, W - M - 3, cy + 4.5, { align: 'right' })
      }
      cy += 7

      // Separador
      doc.setDrawColor(230, 236, 245); doc.setLineWidth(0.4)
      doc.line(M + 3, cy, W - M - 3, cy)
      cy += 1.5

      // Nombres de jugadores
      doc.setTextColor(15, 23, 42); doc.setFontSize(10.5); doc.setFont('helvetica', 'bold')
      doc.text(jA, M + 5, cy + 5.5)
      doc.text(jB, W - M - 5, cy + 5.5, { align: 'right' })

      // Decoración central "vs"
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal')
      doc.setTextColor(180, 190, 210)
      doc.text('vs', W / 2, cy + 5.5, { align: 'center' })
      cy += 8

      // Sets (5 filas con cajas)
      const boxLeft  = W / 2 - BW - 7
      const boxRight = W / 2 + 7

      for (let s = 1; s <= 5; s++) {
        // Label del set
        doc.setTextColor(120, 134, 155); doc.setFontSize(8); doc.setFont('helvetica', s < 4 ? 'bold' : 'normal')
        doc.text(`Set ${s}`, M + 5, cy + BH / 2 + 1.2)

        // Caja Jugador A (izquierda del centro)
        doc.setFillColor(250, 251, 255)
        doc.setDrawColor(170, 185, 210); doc.setLineWidth(0.6)
        doc.rect(boxLeft, cy, BW, BH, 'FS')

        // Guión central
        doc.setTextColor(180, 190, 210); doc.setFontSize(10)
        doc.text('—', W / 2, cy + BH / 2 + 1.2, { align: 'center' })

        // Caja Jugador B (derecha del centro)
        doc.rect(boxRight, cy, BW, BH, 'FS')

        cy += BH + 1.5
      }
      cy += 2

      // Fila resultado (cajas más destacadas)
      doc.setFillColor(238, 242, 255)
      doc.setDrawColor(...dc); doc.setLineWidth(0.8)
      doc.rect(boxLeft, cy, BW, BH + 1, 'FS')
      doc.rect(boxRight, cy, BW, BH + 1, 'FS')

      doc.setTextColor(49, 46, 129); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text('RESULTADO', M + 5, cy + (BH + 1) / 2 + 1.2)

      doc.setTextColor(120, 134, 155); doc.setFontSize(10)
      doc.text('—', W / 2, cy + (BH + 1) / 2 + 1.2, { align: 'center' })
      cy += BH + 3

      // Línea ganador + firma
      doc.setTextColor(49, 46, 129); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
      doc.text('GANADOR:', M + 5, cy + 4)
      doc.setDrawColor(170, 185, 210); doc.setLineWidth(0.5)
      doc.line(M + 28, cy + 4.5, W / 2 + 5, cy + 4.5)

      doc.setTextColor(160, 175, 200); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
      doc.text('Firma:', W / 2 + 9, cy + 4)
      doc.line(W / 2 + 23, cy + 4.5, W - M - 3, cy + 4.5)

      return y + CH
    }

    let firstPage = true
    for (const mesa of mesasOrdenadas) {
      const matches = matchesDeMesa(mesa.id)
      if (!matches.length) continue

      if (!firstPage) doc.addPage()
      firstPage = false

      let y = drawMesaPageHeader(mesa.numero)
      const CH = cardH()
      const GAP = 5

      for (let i = 0; i < matches.length; i++) {
        if (y + CH > H - 12) {
          doc.addPage()
          y = drawContHeader(mesa.numero)
          // Footer también en páginas de continuación
          doc.setFillColor(248, 250, 252)
          doc.rect(0, H - 9, W, 9, 'F')
          doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.25)
          doc.line(M, H - 9, W - M, H - 9)
          doc.setTextColor(148, 163, 184); doc.setFontSize(6.5)
          doc.text(`${fecha!.ligaNombre} · Fecha ${fecha!.numero} · Mesa ${mesa.numero}`, W / 2, H - 3.5, { align: 'center' })
        }

        y = drawMatchCard(matches[i], y)
        if (i < matches.length - 1) y += GAP
      }
    }

    doc.save(`fecha${fecha.numero}_por_mesa.pdf`)
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
  )
  if (!fecha) return (
    <div style={{ padding: 24, color: muted, fontSize: 13 }}>Fecha no encontrada</div>
  )

  // Stats de la fecha
  const totalPartidos = partidosVisibles.length
  const finalizados = partidosVisibles.filter(p => p.estado === 'finalizado' || p.estado === 'walkover').length
  const progPct = totalPartidos > 0 ? Math.round((finalizados / totalPartidos) * 100) : 0

  const ESTADO_INFO = {
    programada: { label: 'Programada', emoji: '📋', color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
    en_juego:   { label: 'En juego',   emoji: '🟢', color: '#059669', bg: '#d1fae5', border: '#6ee7b7' },
    finalizada: { label: 'Finalizada', emoji: '✅', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  }
  const est = ESTADO_INFO[fecha.estado as keyof typeof ESTADO_INFO] ?? ESTADO_INFO.programada

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
        boxShadow: '0 8px 24px rgba(49,46,129,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 26 }}>🏓</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
                Fecha {fecha.numero}
              </span>
              <span style={{
                background: est.bg, color: est.color, border: `1px solid ${est.border}`,
                padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              }}>
                {est.emoji} {est.label}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
              {fecha.estado === 'programada'
                ? '👆 Arrastrá partidos para reprogramar · Click para asignar árbitro'
                : fecha.estado === 'en_juego'
                ? '✏️ Click en un partido para registrar el resultado'
                : `✅ ${finalizados} de ${totalPartidos} partidos jugados`}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={exportarPDFHorarios} style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              🕐 Por horario
            </button>
            <button onClick={exportarPDFMesa} style={{ background: 'rgba(16,185,129,0.18)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              📋 Por mesa
            </button>
            {fecha.estado === 'programada' && (
              <button
                onClick={handleIniciarFecha}
                style={{
                  background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white',
                  border: 'none', borderRadius: 8, padding: '8px 16px',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.4)',
                }}>
                🚀 Iniciar Fecha
              </button>
            )}
          </div>
        </div>

        {/* Barra de progreso */}
        {totalPartidos > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Progreso</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{finalizados}/{totalPartidos} partidos · {progPct}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progPct}%`, background: 'linear-gradient(90deg,#6ee7b7,#10b981)', borderRadius: 99, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div onClick={() => setError('')} style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14, cursor: 'pointer', border: '1px solid #fecaca', display: 'flex', gap: 8, alignItems: 'center' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Grilla de partidos ──────────────────────────────────────────── */}
      <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
                <th style={{ position: 'sticky', left: 0, background: '#1e1b4b', padding: '12px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Horario</th>
                {mesasVisibles.map(mesa => (
                  <th key={mesa.id} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, minWidth: 180 }}>
                    🏓 Mesa {mesa.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloques.map((bloque, bIdx) => {
                const tienePartidos = mesasVisibles.some(m => !!partidoEn(m.id, bloque))
                if (!tienePartidos && fecha.estado !== 'programada') return null
                return (
                  <tr key={bloque} style={{ borderBottom: '1px solid #f1f5f9', background: bIdx % 2 === 0 ? '#ffffff' : '#fafbff' }}>
                    <td style={{
                      position: 'sticky', left: 0,
                      background: bIdx % 2 === 0 ? '#ffffff' : '#fafbff',
                      padding: '10px 16px', fontSize: 12, fontWeight: 700, color: ink, fontFamily: 'monospace',
                      borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap',
                    }}>
                      ⏰ {bloque}
                    </td>
                    {mesasVisibles.map(mesa => {
                      const partido = partidoEn(mesa.id, bloque)
                      const clickeable = partido && !['finalizado', 'walkover'].includes(partido.estado)
                      const roster = partido ? (jugadoresPorDivision[partido.divisionId] || []) : []
                      const dc = partido ? divColor(partido.divisionNombre) : '#e2e8f0'

                      return (
                        <td
                          key={mesa.id}
                          style={{ padding: 8, borderRight: '1px solid #f1f5f9', verticalAlign: 'top', minWidth: 180 }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => soltarEn(mesa.id, bloque)}
                        >
                          {partido ? (
                            <div
                              draggable={fecha.estado === 'programada'}
                              onDragStart={() => setDraggingId(partido.id)}
                              onDragEnd={() => setDraggingId(null)}
                              style={{
                                borderRadius: 10,
                                background: partido.estado === 'finalizado' ? '#f0fdf4'
                                  : partido.estado === 'walkover' ? '#fffbeb' : '#ffffff',
                                border: `1px solid ${
                                  partido.estado === 'finalizado' ? '#86efac'
                                  : partido.estado === 'walkover' ? '#fcd34d' : '#e2e8f0'}`,
                                padding: '10px 12px',
                                cursor: fecha.estado === 'programada' ? 'grab' : clickeable ? 'pointer' : 'default',
                                opacity: draggingId === partido.id ? 0.5 : 1,
                                borderLeft: `4px solid ${dc}`,
                              }}
                            >
                              {/* División chip */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dc, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: dc, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{partido.divisionNombre}</span>
                              </div>

                              {/* Jugadores */}
                              <div onClick={() => abrirResultado(partido)} style={{ fontSize: 13, fontWeight: 700, color: ink, lineHeight: 1.3, marginBottom: 4 }}>
                                {nombres[partido.jugadorAId] ?? '—'}
                                <span style={{ color: hint, fontWeight: 400, fontSize: 11, margin: '0 4px' }}>vs</span>
                                {nombres[partido.jugadorBId] ?? '—'}
                              </div>

                              {/* Resultado o árbitro */}
                              {partido.estado === 'finalizado' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '2px 8px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', fontFamily: 'monospace' }}>{partido.setsA}–{partido.setsB}</span>
                                  <span style={{ fontSize: 10 }}>✅</span>
                                </div>
                              )}
                              {partido.estado === 'walkover' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 6, padding: '2px 8px' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a16207' }}>🏳️ Walkover</span>
                                </div>
                              )}

                              {/* Árbitro */}
                              {fecha.estado === 'programada' && roster.length > 0 ? (
                                editandoArbitroId === partido.id ? (
                                  <select
                                    autoFocus value={partido.arbitroId ?? ''}
                                    onBlur={() => setEditandoArbitroId(null)}
                                    onClick={e => e.stopPropagation()}
                                    onChange={async e => { await handleCambiarArbitro(partido.id, e.target.value) }}
                                    style={{ width: '100%', marginTop: 6, fontSize: 11, color: ink, background: '#ffffff', border: '1px solid #6366f1', borderRadius: 6, outline: 'none', padding: '2px 4px' }}
                                  >
                                    <option value="">Sin árbitro</option>
                                    {roster.filter(id => id !== partido.jugadorAId && id !== partido.jugadorBId).map(id => (
                                      <option key={id} value={id}>{nombres[id] ?? id}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div onClick={e => { e.stopPropagation(); setEditandoArbitroId(partido.id) }} style={{ fontSize: 10, color: muted, marginTop: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {partido.arbitroId ? `👤 ${nombres[partido.arbitroId] ?? '—'}` : '👤 Sin árbitro'}
                                    </span>
                                    <span style={{ color: hint, flexShrink: 0 }}>✎</span>
                                  </div>
                                )
                              ) : partido.arbitroId && partido.estado !== 'finalizado' && partido.estado !== 'walkover' ? (
                                <div style={{ fontSize: 10, color: muted, marginTop: 5 }}>👤 {nombres[partido.arbitroId] ?? '—'}</div>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{
                              height: 52, borderRadius: 10,
                              border: '1.5px dashed #e2e8f0',
                              background: '#f8fafc',
                            }} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sin programar */}
      {(() => {
        const sinProgramar = partidosVisibles.filter(p => !p.mesaId || !p.bloqueHorario)
        if (!sinProgramar.length) return null
        return (
          <div style={{ marginTop: 16, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ background: '#fef9c3', color: '#a16207', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: '1px solid #fcd34d' }}>
                ⏳ Sin programar ({sinProgramar.length})
              </span>
              <span style={{ fontSize: 11, color: hint }}>
                {fecha.estado === 'programada' ? 'Arrastrá hacia una celda de la grilla' : 'Partidos sin ubicación'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sinProgramar.map(partido => {
                const dc = divColor(partido.divisionNombre)
                return (
                  <div
                    key={partido.id}
                    draggable={fecha.estado === 'programada'}
                    onDragStart={() => setDraggingId(partido.id)}
                    onDragEnd={() => setDraggingId(null)}
                    style={{
                      borderRadius: 10, border: `1px solid #e2e8f0`, borderLeft: `4px solid ${dc}`,
                      background: '#f8fafc', padding: '8px 12px',
                      cursor: fecha.estado === 'programada' ? 'grab' : 'default',
                      minWidth: 170, opacity: draggingId === partido.id ? 0.4 : 1,
                    }}
                  >
                    <div style={{ fontSize: 10, color: dc, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{partido.divisionNombre}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: ink }}>
                      {nombres[partido.jugadorAId] ?? '—'} vs {nombres[partido.jugadorBId] ?? '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Modal resultado ─────────────────────────────────────────────── */}
      {partidoResultado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(15,23,42,0.3)', overflow: 'hidden' }}>
            {/* Header del modal */}
            <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#4f46e5)', padding: '20px 24px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Registrar resultado
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'white', lineHeight: 1.3 }}>
                {nombres[partidoResultado.jugadorAId] ?? '—'}
                <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, fontSize: 14, margin: '0 8px' }}>vs</span>
                {nombres[partidoResultado.jugadorBId] ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                {divColor(partidoResultado.divisionNombre) && '●'} {partidoResultado.divisionNombre}
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {/* Selector resultado */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 8, fontWeight: 600 }}>Resultado (sets)</label>
                <select
                  style={{ width: '100%', background: '#f4f7fa', border: '2px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', color: ink, fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: 'monospace' }}
                  value={`${setsA}-${setsB}`}
                  onChange={e => { const [a, b] = e.target.value.split('-'); setSetsA(a); setSetsB(b) }}
                >
                  {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <div style={{ fontSize: 12, color: '#6366f1', marginTop: 8, fontWeight: 600 }}>
                  🏆 Gana: {Number(setsA) > Number(setsB) ? (nombres[partidoResultado.jugadorAId] ?? '—') : (nombres[partidoResultado.jugadorBId] ?? '—')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button onClick={() => setPartidoResultado(null)} style={{ flex: 1, padding: 12, background: '#f4f7fa', border: 'none', borderRadius: 10, color: muted, fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={handleGuardarResultado} disabled={guardandoResultado} style={{ flex: 2, padding: 12, background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', borderRadius: 10, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: guardandoResultado ? 0.6 : 1, boxShadow: '0 4px 12px rgba(16,185,129,0.35)' }}>
                  {guardandoResultado ? 'Guardando...' : '✅ Confirmar resultado'}
                </button>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: muted, marginBottom: 10 }}>¿No se pudo jugar?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorAId)} style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    🏳️ W/O → {(nombres[partidoResultado.jugadorAId] ?? '—').split(' ')[0]}
                  </button>
                  <button disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorBId)} style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    🏳️ W/O → {(nombres[partidoResultado.jugadorBId] ?? '—').split(' ')[0]}
                  </button>
                  <button disabled={guardandoAccion} onClick={handleReprogramar} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    📅 Mover a Reajuste
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
