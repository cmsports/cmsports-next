'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { generarBloquesHorario } from '@/lib/domain/liga'
import { moverPartidoLiga, iniciarFecha, registrarResultadoPartido, registrarWalkover, reprogramarPartidoAFecha5 } from '@/app/actions/liga'
import AppLayout from '@/app/layout-app'
import { Card, Badge, Button, Modal } from '@/components/ui'
import { usePerfil } from '@/lib/auth/PerfilProvider'

const supabase = createClient()
const BLOQUES = generarBloquesHorario()

interface PartidoBoard {
  id: string
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

interface Mesa {
  id: string
  numero: number
}

export default function FechaProgramacionPage() {
  const params = useParams<{ fechaId: string }>()
  const fechaId = params.fechaId
  const { perfil } = usePerfil()

  const [fecha, setFecha] = useState<{ numero: number; estado: string; ligaNombre: string } | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [partidos, setPartidos] = useState<PartidoBoard[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [partidoResultado, setPartidoResultado] = useState<PartidoBoard | null>(null)
  const [setsA, setSetsA] = useState('3')
  const [setsB, setSetsB] = useState('0')
  const [guardandoResultado, setGuardandoResultado] = useState(false)
  const [guardandoAccion, setGuardandoAccion] = useState(false)

  const cargar = useCallback(async () => {
    const { data: fechaData } = await supabase.from('liga_fechas').select('numero, estado, liga_id, ligas(nombre)').eq('id', fechaId).single()
    if (!fechaData) { setLoading(false); return }
    const ligaRel = Array.isArray(fechaData.ligas) ? fechaData.ligas[0] : fechaData.ligas
    setFecha({ numero: fechaData.numero, estado: fechaData.estado, ligaNombre: ligaRel?.nombre ?? '' })

    const [{ data: mesasData }, { data: partidosData }, { data: divisionesData }] = await Promise.all([
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', fechaData.liga_id).order('numero', { ascending: true }),
      supabase.from('liga_partidos').select('id, division_id, mesa_id, bloque_horario, jugador_a_id, jugador_b_id, arbitro_id, estado, sets_a, sets_b').eq('fecha_id', fechaId),
      supabase.from('liga_divisiones').select('id, nombre').eq('liga_id', fechaData.liga_id),
    ])

    const nombreDivisionPorId = new Map((divisionesData || []).map(d => [d.id, d.nombre]))
    setMesas(mesasData || [])
    const lista: PartidoBoard[] = (partidosData || []).map(p => ({
      id: p.id,
      mesaId: p.mesa_id,
      bloqueHorario: p.bloque_horario,
      jugadorAId: p.jugador_a_id,
      jugadorBId: p.jugador_b_id,
      arbitroId: p.arbitro_id,
      estado: p.estado,
      setsA: p.sets_a,
      setsB: p.sets_b,
      divisionNombre: nombreDivisionPorId.get(p.division_id) ?? '',
    }))
    setPartidos(lista)

    const idsJugadores = Array.from(new Set(lista.flatMap(p => [p.jugadorAId, p.jugadorBId, p.arbitroId].filter((x): x is string => !!x))))
    if (idsJugadores.length) {
      const { data: jugadoresData } = await supabase.from('jugadores').select('id, nombre').in('id', idsJugadores)
      const mapa: Record<string, string> = {}
      for (const j of jugadoresData || []) mapa[j.id] = j.nombre
      setNombres(mapa)
    }
    setLoading(false)
  }, [fechaId])

  useEffect(() => { cargar() }, [cargar])

  function partidoEn(mesaId: string, bloque: string) {
    return partidos.find(p => p.mesaId === mesaId && p.bloqueHorario === bloque)
  }

  async function soltarEn(mesaId: string, bloque: string) {
    if (!draggingId || fecha?.estado !== 'programada') return
    const partidoId = draggingId
    setDraggingId(null)
    setError('')

    if (partidoEn(mesaId, bloque)) {
      setError('Esa mesa ya está ocupada en ese horario')
      return
    }

    const anterior = partidos.find(p => p.id === partidoId)
    if (!anterior) return

    // Optimista: muestra el cambio de inmediato, revierte si el servidor lo rechaza
    setPartidos(prev => prev.map(p => (p.id === partidoId ? { ...p, mesaId, bloqueHorario: bloque } : p)))

    const res = await moverPartidoLiga({ partidoId, fechaId, mesaId, bloqueHorario: bloque })
    if (res.error) {
      setError(res.error)
      setPartidos(prev => prev.map(p => (p.id === partidoId ? anterior : p)))
    }
  }

  async function handleIniciarFecha() {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setError(res.error); return }
    cargar()
  }

  function abrirResultado(partido: PartidoBoard) {
    if (fecha?.estado !== 'en_juego' || ['finalizado', 'walkover'].includes(partido.estado)) return
    setPartidoResultado(partido)
    setSetsA('3')
    setSetsB('0')
  }

  async function handleGuardarResultado() {
    if (!partidoResultado) return
    setGuardandoResultado(true)
    setError('')
    const res = await registrarResultadoPartido({ partidoId: partidoResultado.id, setsA: Number(setsA), setsB: Number(setsB) })
    setGuardandoResultado(false)
    if (res.error) { setError(res.error); return }
    setPartidoResultado(null)
    cargar()
  }

  async function handleWalkover(ganadorId: string) {
    if (!partidoResultado) return
    setGuardandoAccion(true)
    setError('')
    const res = await registrarWalkover({ partidoId: partidoResultado.id, ganadorId })
    setGuardandoAccion(false)
    if (res.error) { setError(res.error); return }
    setPartidoResultado(null)
    cargar()
  }

  async function handleReprogramar() {
    if (!partidoResultado) return
    setGuardandoAccion(true)
    setError('')
    const res = await reprogramarPartidoAFecha5({ partidoId: partidoResultado.id })
    setGuardandoAccion(false)
    if (res.error) { setError(res.error); return }
    setPartidoResultado(null)
    cargar()
  }

  async function exportarProgramacion(orden: 'fecha' | 'mesa') {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('CmSports', 14, 14)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`${fecha?.ligaNombre} — Fecha ${fecha?.numero} — Programación por ${orden === 'fecha' ? 'horario' : 'mesa'}`, 14, 24)

    const filas = [...partidos].sort((a, b) => {
      if (orden === 'mesa') {
        const mA = mesas.find(m => m.id === a.mesaId)?.numero ?? 0
        const mB = mesas.find(m => m.id === b.mesaId)?.numero ?? 0
        if (mA !== mB) return mA - mB
      }
      return (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? '')
    })

    autoTable(doc, {
      startY: 42,
      head: [['Horario', 'Mesa', 'División', 'Jugador A', 'Jugador B', 'Árbitro']],
      body: filas.map(p => [
        p.bloqueHorario ?? '—',
        mesas.find(m => m.id === p.mesaId)?.numero ?? '—',
        p.divisionNombre,
        nombres[p.jugadorAId] ?? '—',
        nombres[p.jugadorBId] ?? '—',
        p.arbitroId ? nombres[p.arbitroId] ?? '—' : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      margin: { left: 14, right: 14 },
    })

    doc.save(`liga_fecha${fecha?.numero}_por_${orden}.pdf`)
  }

  async function exportarHojasDePartido() {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const filas = [...partidos].sort((a, b) => (a.bloqueHorario ?? '').localeCompare(b.bloqueHorario ?? ''))

    filas.forEach((p, i) => {
      if (i > 0) doc.addPage()
      let y = 18
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(fecha?.ligaNombre ?? 'Liga', 14, y)
      y += 10
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      const linea = (label: string, valor: string) => { doc.text(`${label}: ${valor}`, 14, y); y += 7 }
      linea('Fecha', String(fecha?.numero ?? ''))
      linea('División', p.divisionNombre)
      linea('Mesa', String(mesas.find(m => m.id === p.mesaId)?.numero ?? '—'))
      linea('Horario', p.bloqueHorario ?? '—')
      linea('Jugador A', nombres[p.jugadorAId] ?? '—')
      linea('Jugador B', nombres[p.jugadorBId] ?? '—')
      linea('Árbitro', p.arbitroId ? nombres[p.arbitroId] ?? '—' : '—')

      y += 6
      doc.setFont('helvetica', 'bold')
      doc.text('Sets', 14, y)
      y += 8
      doc.setFont('helvetica', 'normal')
      for (let s = 1; s <= 5; s++) {
        doc.text(`Set ${s}:  ____  -  ____`, 14, y)
        y += 8
      }
      y += 4
      doc.text('Resultado final:  ____  -  ____', 14, y); y += 10
      doc.text('Ganador: ______________________________', 14, y); y += 10
      doc.text('Observaciones: ________________________________________________', 14, y)
    })

    doc.save(`liga_fecha${fecha?.numero}_hojas_de_partido.pdf`)
  }

  if (loading) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Cargando programación…</div></AppLayout>
  if (!fecha) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Fecha no encontrada</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Fecha {fecha.numero}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {fecha.estado === 'programada'
                ? 'Arrastra un partido a otra mesa u horario para reprogramarlo'
                : fecha.estado === 'en_juego'
                ? 'Haz clic en un partido para registrar su resultado'
                : 'Fecha finalizada'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Badge variant={fecha.estado === 'en_juego' ? 'success' : 'default'}>
              {fecha.estado === 'programada' ? 'Programada' : fecha.estado === 'en_juego' ? 'En juego' : 'Finalizada'}
            </Badge>
            <Button size="sm" variant="secondary" onClick={() => exportarProgramacion('fecha')}>PDF por horario</Button>
            <Button size="sm" variant="secondary" onClick={() => exportarProgramacion('mesa')}>PDF por mesa</Button>
            <Button size="sm" variant="secondary" onClick={exportarHojasDePartido}>Hojas de partido</Button>
            {fecha.estado === 'programada' && <Button size="sm" onClick={handleIniciarFecha}>Iniciar Fecha</Button>}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-[var(--red-light)] text-[var(--red)] text-sm px-4 py-2">{error}</div>
        )}

        <Card noPadding className="overflow-auto">
          <table className="border-collapse w-full text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white border-b border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-muted)]">Horario</th>
                {mesas.map(mesa => (
                  <th key={mesa.id} className="border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] min-w-[180px]">
                    Mesa {mesa.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BLOQUES.map(bloque => (
                <tr key={bloque}>
                  <td className="sticky left-0 bg-white border-b border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] tabular-nums">
                    {bloque}
                  </td>
                  {mesas.map(mesa => {
                    const partido = partidoEn(mesa.id, bloque)
                    return (
                      <td
                        key={mesa.id}
                        className="border-b border-l border-[var(--border)] px-2 py-1 align-top"
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => soltarEn(mesa.id, bloque)}
                      >
                        {partido ? (
                          <div
                            draggable={fecha.estado === 'programada'}
                            onDragStart={() => setDraggingId(partido.id)}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => abrirResultado(partido)}
                            className={`rounded-lg border border-[var(--border)] px-2 py-1.5 ${
                              partido.estado === 'finalizado' ? 'bg-[var(--green-light)]' : partido.estado === 'walkover' ? 'bg-[var(--yellow-light)]' : 'bg-slate-50'
                            } ${fecha.estado === 'programada' ? 'cursor-grab active:cursor-grabbing' : fecha.estado === 'en_juego' && !['finalizado', 'walkover'].includes(partido.estado) ? 'cursor-pointer' : ''}`}
                          >
                            <div className="text-xs font-medium text-[var(--text)] truncate">
                              {nombres[partido.jugadorAId] ?? '—'} vs {nombres[partido.jugadorBId] ?? '—'}
                            </div>
                            {partido.arbitroId && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                Árbitro: {nombres[partido.arbitroId] ?? '—'}
                              </div>
                            )}
                            {partido.estado === 'finalizado' && (
                              <div className="text-[11px] font-semibold text-[var(--green)]">
                                {partido.setsA}-{partido.setsB}
                              </div>
                            )}
                            {partido.estado === 'walkover' && (
                              <div className="text-[11px] font-semibold text-[var(--yellow)]">Walkover</div>
                            )}
                          </div>
                        ) : (
                          <div className="h-[42px] rounded-lg border border-dashed border-[var(--border)]" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal open={!!partidoResultado} onClose={() => setPartidoResultado(null)} title="Registrar resultado">
        {partidoResultado && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text)]">
              {nombres[partidoResultado.jugadorAId] ?? '—'} vs {nombres[partidoResultado.jugadorBId] ?? '—'}
            </p>
            <div className="flex items-center gap-3">
              <select className="bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm" value={`${setsA}-${setsB}`} onChange={e => { const [a, b] = e.target.value.split('-'); setSetsA(a); setSetsB(b) }}>
                {RESULTADOS_BO5.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <span className="text-xs text-[var(--text-muted)]">Sets {nombres[partidoResultado.jugadorAId] ?? 'A'} — Sets {nombres[partidoResultado.jugadorBId] ?? 'B'}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPartidoResultado(null)}>Cancelar</Button>
              <Button onClick={handleGuardarResultado} loading={guardandoResultado}>Confirmar</Button>
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">¿No se pudo jugar?</p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorAId)}>
                  Walkover: gana {nombres[partidoResultado.jugadorAId] ?? 'Jugador A'}
                </Button>
                <Button size="sm" variant="secondary" disabled={guardandoAccion} onClick={() => handleWalkover(partidoResultado.jugadorBId)}>
                  Walkover: gana {nombres[partidoResultado.jugadorBId] ?? 'Jugador B'}
                </Button>
                <Button size="sm" variant="danger" disabled={guardandoAccion} onClick={handleReprogramar}>
                  Reprogramar a Fecha 5
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  )
}

const RESULTADOS_BO5 = ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3']
