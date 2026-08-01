'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  const touchRef = useRef<{
    partidoId: string
    ghost: HTMLDivElement
    offsetX: number
    offsetY: number
    overTd: HTMLElement | null
  } | null>(null)
  const [partidoResultado, setPartidoResultado] = useState<PartidoBoard | null>(null)
  const modalAbiertoEn = useRef<number>(0)
  const [setsA, setSetsA] = useState('3')
  const [setsB, setSetsB] = useState('0')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [guardandoAccion, setGuardandoAccion] = useState(false)
  const [montado, setMontado] = useState(false)

  useEffect(() => { setMontado(true) }, [])

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

  useEffect(() => {
    const timer = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(timer)
  }, [cargar])

  useEffect(() => {
    const canal = supabase
      .channel(`tablero-${fechaId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'liga_partidos',
        filter: `fecha_id=eq.${fechaId}`,
      }, () => { void cargar() })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'liga_fechas',
        filter: `id=eq.${fechaId}`,
      }, () => { void cargar() })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [fechaId, cargar])

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

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>, partidoId: string) {
    if (fecha?.estado !== 'programada') return
    const touch = e.touches[0]
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const ghost = card.cloneNode(true) as HTMLDivElement
    Object.assign(ghost.style, {
      position: 'fixed', top: rect.top + 'px', left: rect.left + 'px',
      width: rect.width + 'px', margin: '0', opacity: '0.88',
      pointerEvents: 'none', zIndex: '8000',
      transform: 'scale(1.06) rotate(1.5deg)',
      boxShadow: '0 14px 36px rgba(15,23,42,0.28)', transition: 'none',
      borderRadius: '12px',
    })
    document.body.appendChild(ghost)
    setDraggingId(partidoId)
    touchRef.current = { partidoId, ghost, offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top, overTd: null }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const t = touchRef.current
    if (!t) return
    const touch = e.touches[0]
    t.ghost.style.top = (touch.clientY - t.offsetY) + 'px'
    t.ghost.style.left = (touch.clientX - t.offsetX) + 'px'
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const td = el?.closest('[data-drop-mesa]') as HTMLElement | null
    if (t.overTd && t.overTd !== td) {
      t.overTd.style.background = ''
      t.overTd.style.outline = ''
    }
    if (td && td !== t.overTd) {
      td.style.background = 'rgba(99,102,241,0.1)'
      td.style.outline = '2px solid #6366f1'
      td.style.outlineOffset = '-2px'
    }
    t.overTd = td
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const t = touchRef.current
    if (!t) return
    const touch = e.changedTouches[0]
    t.ghost.remove()
    if (t.overTd) { t.overTd.style.background = ''; t.overTd.style.outline = '' }
    setDraggingId(null)
    touchRef.current = null
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    const td = el?.closest('[data-drop-mesa]') as HTMLElement | null
    if (td) {
      const mesaId = td.dataset.dropMesa
      const bloque = td.dataset.dropBloque
      if (mesaId && bloque) void soltarEn(mesaId, bloque)
    }
  }

  async function handleIniciarFecha() {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setError(res.error); return }
    setFecha(prev => prev ? { ...prev, estado: 'en_juego' } : prev)
  }

  function abrirResultado(partido: PartidoBoard) {
    if (['finalizado', 'walkover'].includes(partido.estado)) return
    // eslint-disable-next-line react-hooks/purity -- solo se invoca desde el onClick de la card (línea ~933), nunca durante el render
    modalAbiertoEn.current = Date.now()
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
    const ganadorNombre = nombres[ganadorId] ?? ganadorId
    if (!confirm(`¿Registrar walkover a favor de ${ganadorNombre}?\n\nEsta acción cuenta como victoria/derrota en el ranking y no tiene deshacer.`)) return
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
    const { default: autoTable } = await import('jspdf-autotable')
    const { encabezado, piePagina, colorPorNombre, estiloTabla, sinDatos, COLOR } = await import('@/lib/pdf/estilo')
    if (!fecha) return
    const f = fecha
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

    const y = encabezado(doc, {
      club: f.ligaNombre,
      titulo: `Fecha ${f.numero} · Programación por horario`,
      subtitulo: hoy,
    })

    const sorted = [...partidosVisibles]
      .filter(p => p.bloqueHorario && p.mesaId)
      .sort((a, b) => {
        const bc = (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '')
        return bc !== 0 ? bc : (mesas.find(m => m.id === a.mesaId)?.numero ?? 0) - (mesas.find(m => m.id === b.mesaId)?.numero ?? 0)
      })

    if (sorted.length === 0) {
      sinDatos(doc, y, 'Todavía no hay partidos programados en esta fecha.')
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Hora', 'Mesa', 'División', 'Jugador A', '', 'Jugador B', 'Árbitro']],
        body: sorted.map(p => [
          p.bloqueHorario ?? '—',
          `Mesa ${mesas.find(m => m.id === p.mesaId)?.numero ?? '—'}`,
          p.divisionNombre,
          nombres[p.jugadorAId] ?? '—',
          'vs',
          nombres[p.jugadorBId] ?? '—',
          p.arbitroId ? (nombres[p.arbitroId] ?? '') : '—',
        ]),
        ...estiloTabla(),
        columnStyles: {
          0: { cellWidth: 16, fontStyle: 'bold' },
          1: { cellWidth: 18 },
          2: { cellWidth: 26 },
          3: { fontStyle: 'bold', font: 'times' },
          4: { cellWidth: 8, halign: 'center', textColor: COLOR.tenue },
          5: { fontStyle: 'bold', font: 'times' },
          6: { cellWidth: 32 },
        },
        didParseCell: hookData => {
          if (hookData.section === 'body' && hookData.column.index === 2) {
            hookData.cell.styles.textColor = colorPorNombre(String(hookData.cell.raw))
            hookData.cell.styles.fontStyle = 'bold'
          }
        },
      })
    }

    piePagina(doc, `${f.ligaNombre} · Fecha ${f.numero} · Programación por horario`)
    doc.save(`fecha${f.numero}_horarios.pdf`)
  }

  async function exportarPDFMesa() {
    const { default: jsPDF } = await import('jspdf')
    const { encabezado, piePagina, colorPorNombre, tinte, sinDatos, COLOR } = await import('@/lib/pdf/estilo')
    if (!fecha) return
    const f = fecha
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    const M = 10
    const CW = W - 2 * M
    const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    const VERDE: [number, number, number] = [5, 150, 105]

    // Geometría de columnas
    const STRIPE = 3
    const C_HORA = 18
    const C_JUG  = 60
    const C_SET  = 10
    const C_RES  = 14
    const C_ARB  = CW - STRIPE - C_HORA - C_JUG - 5 * C_SET - C_RES
    const RH = 12   // alto de fila por partido
    const TH = 7    // alto de encabezado de columnas
    const MH = 7    // alto de sub-encabezado de mesa
    const PIE_RESERVA = 16 // espacio que deja libre el pie de página compartido

    const xHora = M + STRIPE
    const xJug  = xHora + C_HORA
    const xS    = (i: number) => xJug + C_JUG + i * C_SET
    const xRes  = xJug + C_JUG + 5 * C_SET
    const xArb  = xRes + C_RES
    const xR    = W - M

    const allMatches = [...partidosVisibles]
      .filter(p => p.bloqueHorario && p.mesaId)
      .sort((a, b) => {
        const mn = (p: PartidoBoard) => mesas.find(m => m.id === p.mesaId)?.numero ?? 0
        const diff = mn(a) - mn(b)
        return diff !== 0 ? diff : (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '')
      })

    const mesaGrupos: { mesa: Mesa; matches: PartidoBoard[] }[] = []
    for (const p of allMatches) {
      const mesa = mesas.find(m => m.id === p.mesaId)
      if (!mesa) continue
      const last = mesaGrupos[mesaGrupos.length - 1]
      if (last?.mesa.id === mesa.id) last.matches.push(p)
      else mesaGrupos.push({ mesa, matches: [p] })
    }

    let y = 0
    function dibujarEncabezadoColumnas() {
      doc.setFillColor(...COLOR.primarioOs)
      doc.rect(M, y, CW, TH, 'F')
      doc.setTextColor(210, 214, 255); doc.setFontSize(6); doc.setFont('helvetica', 'bold')
      const chY = y + TH / 2 + 0.8
      doc.text('HORA', xHora + C_HORA / 2, chY, { align: 'center' })
      doc.text('JUGADORES', xJug + C_JUG / 2, chY, { align: 'center' })
      for (let s = 1; s <= 5; s++) doc.text(`S${s}`, xS(s - 1) + C_SET / 2, chY, { align: 'center' })
      doc.text('RES', xRes + C_RES / 2, chY, { align: 'center' })
      doc.text('ÁRBITRO', xArb + C_ARB / 2, chY, { align: 'center' })
      y += TH
    }
    function nuevaPagina() {
      y = encabezado(doc, { club: f.ligaNombre, titulo: `Fecha ${f.numero} · Programación por mesa`, subtitulo: hoy, color: VERDE })
      dibujarEncabezadoColumnas()
    }
    function saltoDePaginaSiNoCabe(alto: number) {
      if (y + alto > H - PIE_RESERVA) { doc.addPage(); nuevaPagina() }
    }

    nuevaPagina()

    if (allMatches.length === 0) {
      sinDatos(doc, y, 'Todavía no hay partidos programados en esta fecha.')
    }

    for (const { mesa, matches } of mesaGrupos) {
      saltoDePaginaSiNoCabe(MH + RH)

      doc.setFillColor(...VERDE)
      doc.rect(M, y, CW, MH, 'F')
      doc.setTextColor(...COLOR.blanco); doc.setFontSize(8); doc.setFont('helvetica', 'bold')
      doc.text(`◉  Mesa ${mesa.numero}`, M + 4, y + MH / 2 + 1)
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
      doc.setTextColor(...tinte(VERDE, 0.2))
      doc.text(`${matches.length} partido${matches.length !== 1 ? 's' : ''}`, xR, y + MH / 2 + 1, { align: 'right' })
      y += MH

      for (const p of matches) {
        saltoDePaginaSiNoCabe(RH)

        const dc = colorPorNombre(p.divisionNombre)
        const lt = tinte(dc, 0.08)
        const jA = nombres[p.jugadorAId] ?? '—'
        const jB = nombres[p.jugadorBId] ?? '—'
        const arb = p.arbitroId ? nombres[p.arbitroId] ?? '' : ''
        const rMid = y + RH / 2

        doc.setFillColor(...lt)
        doc.rect(M, y, CW, RH, 'F')
        doc.setFillColor(...dc)
        doc.rect(M, y, STRIPE, RH, 'F')

        doc.setTextColor(28, 40, 78); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold')
        doc.text(p.bloqueHorario ?? '—', xHora + C_HORA / 2, rMid + 1, { align: 'center' })

        doc.setTextColor(...dc); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold')
        doc.text(p.divisionNombre, xJug + 2, y + 3)

        doc.setFont('times', 'bold')
        doc.setTextColor(8, 18, 42); doc.setFontSize(8)
        doc.text(jA, xJug + 2, y + RH / 2 - 0.5, { maxWidth: C_JUG - 4 })

        doc.setFont('times', 'italic')
        doc.setTextColor(45, 58, 95); doc.setFontSize(7.5)
        doc.text(jB, xJug + 2, y + RH - 2.5, { maxWidth: C_JUG - 4 })

        doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.2)
        doc.line(xJug, rMid, xR, rMid)

        for (let s = 0; s < 5; s++) {
          const xsCol = xS(s)
          doc.setFillColor(...COLOR.blanco)
          doc.setDrawColor(168, 188, 212); doc.setLineWidth(0.35)
          doc.rect(xsCol + 0.8, y + 0.8, C_SET - 1.6, RH / 2 - 1, 'FD')
          doc.rect(xsCol + 0.8, rMid + 0.5, C_SET - 1.6, RH / 2 - 1.3, 'FD')
        }

        doc.setFillColor(238, 242, 255)
        doc.setDrawColor(...dc); doc.setLineWidth(0.5)
        doc.rect(xRes + 0.5, y + 0.8, C_RES - 1, RH / 2 - 1, 'FD')
        doc.rect(xRes + 0.5, rMid + 0.5, C_RES - 1, RH / 2 - 1.3, 'FD')

        if (arb) {
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(30, 45, 75); doc.setFontSize(6.5)
          doc.text(arb, xArb + 2, rMid + 1, { maxWidth: C_ARB - 4 })
        }

        doc.setDrawColor(172, 190, 212); doc.setLineWidth(0.25)
        for (const x of [xHora, xJug, xS(0), xS(1), xS(2), xS(3), xS(4), xRes, xArb]) {
          doc.line(x, y, x, y + RH)
        }
        doc.setDrawColor(165, 185, 210); doc.setLineWidth(0.4)
        doc.line(M, y + RH, xR, y + RH)

        y += RH
      }
    }

    // ── Observaciones ─────────────────────────────────────────────────
    if (allMatches.length > 0) {
      const OBS_H = 22
      saltoDePaginaSiNoCabe(OBS_H + 4)
      y += 4
      doc.setFillColor(...COLOR.fondoSuave)
      doc.rect(M, y, CW, OBS_H, 'F')
      doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.35)
      doc.rect(M, y, CW, OBS_H, 'S')
      doc.setTextColor(...COLOR.mutado); doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.text('Observaciones:', M + 3, y + 6)
      doc.setDrawColor(...COLOR.borde); doc.setLineWidth(0.3)
      doc.line(M + 3, y + 11, xR - 3, y + 11)
      doc.line(M + 3, y + 17, xR - 3, y + 17)
      doc.setTextColor(...COLOR.tenue); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
      doc.text('Firma árbitro:', M + 3, y + OBS_H - 2)
      doc.line(M + 28, y + OBS_H - 1.5, M + 90, y + OBS_H - 1.5)
    }

    piePagina(doc, `${f.ligaNombre} · Fecha ${f.numero} · Programación por mesa`)
    doc.save(`fecha${f.numero}_por_mesa.pdf`)
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
                          data-drop-mesa={mesa.id}
                          data-drop-bloque={bloque}
                          style={{ padding: 8, borderRight: '1px solid #f1f5f9', verticalAlign: 'top', minWidth: 180 }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => soltarEn(mesa.id, bloque)}
                        >
                          {partido ? (
                            <div
                              draggable={fecha.estado === 'programada'}
                              onDragStart={() => setDraggingId(partido.id)}
                              onDragEnd={() => setDraggingId(null)}
                              onTouchStart={fecha.estado === 'programada' ? e => handleTouchStart(e, partido.id) : undefined}
                              onTouchMove={fecha.estado === 'programada' ? handleTouchMove : undefined}
                              onTouchEnd={fecha.estado === 'programada' ? handleTouchEnd : undefined}
                              onTouchCancel={fecha.estado === 'programada' ? handleTouchEnd : undefined}
                              onClick={fecha.estado !== 'programada' ? (e) => { e.stopPropagation(); abrirResultado(partido) } : undefined}
                              style={{
                                borderRadius: 12,
                                background: partido.estado === 'finalizado'
                                  ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)'
                                  : partido.estado === 'walkover' ? 'linear-gradient(135deg,#fffbeb,#fef9c3)'
                                  : '#ffffff',
                                border: `1px solid ${
                                  partido.estado === 'finalizado' ? '#86efac'
                                  : partido.estado === 'walkover' ? '#fcd34d' : '#e8edf5'}`,
                                padding: '10px 12px',
                                cursor: fecha.estado === 'programada' ? 'grab' : clickeable ? 'pointer' : 'default',
                                touchAction: fecha.estado === 'programada' ? 'none' : 'auto',
                                opacity: draggingId === partido.id ? 0.45 : 1,
                                borderLeft: `4px solid ${dc}`,
                                boxShadow: partido.estado === 'finalizado' ? '0 2px 8px rgba(16,185,129,0.12)' : draggingId === partido.id ? 'none' : '0 2px 8px rgba(15,23,42,0.06)',
                                transition: 'opacity 0.15s, box-shadow 0.15s',
                              }}
                            >
                              {/* División chip con fondo */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8, background: `${dc}18`, borderRadius: 20, padding: '2px 8px 2px 5px' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: dc, flexShrink: 0, boxShadow: `0 0 4px ${dc}88` }} />
                                <span style={{ fontSize: 10, color: dc, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{partido.divisionNombre}</span>
                              </div>

                              {/* Jugadores con mini avatar chips */}
                              <div style={{ cursor: clickeable ? 'pointer' : 'default' }}>
                                {[partido.jugadorAId, partido.jugadorBId].map((jid, ji) => {
                                  const nm = nombres[jid] ?? '—'
                                  const inits = nm !== '—' ? (nm.trim().split(/\s+/).length >= 2 ? (nm.trim().split(/\s+/)[0][0] + nm.trim().split(/\s+/).slice(-1)[0][0]).toUpperCase() : nm.slice(0,2).toUpperCase()) : '?'
                                  return (
                                    <div key={jid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: ji === 0 ? 3 : 0 }}>
                                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: dc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: 'white', flexShrink: 0, opacity: 0.85 }}>{inits}</div>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
                                      {ji === 0 && <span style={{ fontSize: 9, color: hint, flexShrink: 0, marginLeft: 'auto' }}>vs</span>}
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Resultado con mini set bars */}
                              {partido.estado === 'finalizado' && (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '4px 8px' }}>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: '#15803d', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{partido.setsA}–{partido.setsB}</span>
                                    <div style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'center' }}>
                                      {Array.from({ length: Math.max(Number(partido.setsA) || 0, Number(partido.setsB) || 0) }).map((_, si) => (
                                        <div key={si} style={{ height: 4, flex: 1, borderRadius: 2, background: si < (partido.setsA ?? 0) ? '#059669' : si < (partido.setsB ?? 0) ? '#94a3b8' : '#e2e8f0', transition: 'background 0.2s' }} />
                                      ))}
                                    </div>
                                    <span style={{ fontSize: 12 }}>✅</span>
                                  </div>
                                </div>
                              )}
                              {partido.estado === 'walkover' && (
                                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: 8, padding: '4px 10px' }}>
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
                                    style={{ width: '100%', marginTop: 7, fontSize: 11, color: ink, background: '#ffffff', border: '1px solid #6366f1', borderRadius: 6, outline: 'none', padding: '2px 4px' }}
                                  >
                                    <option value="">Sin árbitro</option>
                                    {roster.filter(id => id !== partido.jugadorAId && id !== partido.jugadorBId).map(id => (
                                      <option key={id} value={id}>{nombres[id] ?? id}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <div onClick={e => { e.stopPropagation(); setEditandoArbitroId(partido.id) }} style={{ fontSize: 10, color: muted, marginTop: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', background: '#f8fafc', borderRadius: 6 }}>
                                    <span style={{ fontSize: 12 }}>👤</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                      {partido.arbitroId ? `${nombres[partido.arbitroId] ?? '—'}` : 'Asignar árbitro'}
                                    </span>
                                    <span style={{ color: hint, flexShrink: 0, fontSize: 11 }}>✎</span>
                                  </div>
                                )
                              ) : partido.arbitroId && partido.estado !== 'finalizado' && partido.estado !== 'walkover' ? (
                                <div style={{ fontSize: 10, color: muted, marginTop: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 12 }}>👤</span>
                                  <span style={{ fontWeight: 600 }}>{nombres[partido.arbitroId] ?? '—'}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{
                              height: 52, borderRadius: 12,
                              border: '1.5px dashed #e2e8f0',
                              background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
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
      {montado && createPortal(
        partidoResultado ? (
        <div onClick={() => { if (Date.now() - modalAbiertoEn.current > 200) setPartidoResultado(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#ffffff', borderRadius: 20, width: '100%', maxWidth: 440, margin: '0 16px', boxShadow: '0 24px 60px rgba(15,23,42,0.3)', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
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
        ) : null
      , document.body)}
    </div>
  )
}
