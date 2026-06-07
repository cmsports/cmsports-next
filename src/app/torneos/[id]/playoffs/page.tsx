'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fasesOrden = ['16vos','8vos','cuartos','semis','final']
const faseLabel: Record<string,string> = {
  inscripcion:'Inscripción', grupos:'Fase de grupos',
  '16vos':'16vos de final', '8vos':'8vos de final',
  cuartos:'Cuartos de final', semis:'Semifinal', final:'Final', finalizado:'Finalizado'
}

export default function TorneoDetallePage() {
  const [perfil, setPerfil] = useState<any>(null)
  const [torneo, setTorneo] = useState<any>(null)
  const [grupos, setGrupos] = useState<any[]>([])
  const [partidos, setPartidos] = useState<any[]>([])
  const [jugadores, setJugadores] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mesaOpen, setMesaOpen] = useState(false)
  const [busquedaMesa, setBusquedaMesa] = useState('')
  const [rutMesa, setRutMesa] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const router = useRouter()
  const params = useParams()
  const torneoId = params.id as string

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: p } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      setPerfil(p)
      await cargarTorneo()
      setLoading(false)
    }
    cargar()
  }, [torneoId])

  async function cargarTorneo() {
    const { data: t } = await supabase.from('torneos').select('*').eq('id', torneoId).single()
    setTorneo(t)

    const { data: g } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).order('nombre')
    setGrupos(g || [])

    if (g?.length) {
      const grupoIds = g.map((gr: any) => gr.id)
      const { data: gj } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', grupoIds)
      setJugadores(gj || [])
    }

    const { data: pts } = await supabase.from('torneo_partidos').select('*,ja:jugador_a(id,nombre,elo),jb:jugador_b(id,nombre,elo),jg:ganador(id,nombre)').eq('torneo_id', torneoId)
    setPartidos(pts || [])

    const { data: pgs } = await supabase.from('torneo_pagos').select('*').eq('torneo_id', torneoId)
    setPagos(pgs || [])
  }

  async function marcarGanador(partidoId: string, ganadorId: string) {
    await supabase.from('torneo_partidos').update({ ganador: ganadorId }).eq('id', partidoId)

    // Actualizar ELO
    const partido = partidos.find(p => p.id === partidoId)
    if (partido) {
      const perdedorId = partido.jugador_a === ganadorId ? partido.jugador_b : partido.jugador_a
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('jugadores').select('elo').eq('id', ganadorId).single(),
        supabase.from('jugadores').select('elo').eq('id', perdedorId).single()
      ])
      if (g && p) {
        const K = 32
        const eG = 1 / (1 + Math.pow(10, (p.elo - g.elo) / 400))
        const nuevoG = Math.round(g.elo + K * (1 - eG))
        const nuevoP = Math.round(p.elo + K * (0 - (1 - eG)))
        await Promise.all([
          supabase.from('jugadores').update({ elo: nuevoG }).eq('id', ganadorId),
          supabase.from('jugadores').update({ elo: nuevoP }).eq('id', perdedorId)
        ])
      }
    }

    await cargarTorneo()
  }

  async function inscribirEnMesa() {
    if (!busquedaMesa) return
    let jugadorId = null
    const { data: jugExistente } = await supabase.from('jugadores').select('id').ilike('nombre', `%${busquedaMesa}%`).eq('club_id', perfil?.club_id).maybeSingle()

    if (jugExistente) {
      jugadorId = jugExistente.id
    } else {
      const { data: nuevo } = await supabase.from('jugadores').insert({
        club_id: perfil?.club_id, nombre: busquedaMesa, rut: rutMesa || null,
        categoria: 'principiante', sesiones_limite: 0, elo: 1200
      }).select().single()
      jugadorId = nuevo?.id
    }
    if (!jugadorId) return

    let { data: grupoMesa } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).eq('nombre', 'MESA').maybeSingle()
    if (!grupoMesa) {
      const { data: ng } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: 'MESA' }).select().single()
      grupoMesa = ng
    }

    const yaInscrito = jugadores.find((j: any) => j.jugador_id === jugadorId)
    if (yaInscrito) { alert('Este jugador ya está inscrito'); return }

    await supabase.from('grupo_jugadores').insert({ grupo_id: grupoMesa.id, jugador_id: jugadorId })

    if (torneo?.cuota_inscripcion > 0) {
      await supabase.from('torneo_pagos').insert({
        torneo_id: torneoId, jugador_id: jugadorId,
        estado: 'pagado', metodo_pago: metodoPago,
        fecha_pago: new Date().toISOString().slice(0,10)
      })
    }

    setBusquedaMesa(''); setRutMesa('')
    await cargarTorneo()
  }

  async function cerrarInscripcion() {
    if (!confirm('¿Cerrar inscripción y generar grupos con seeding ELO?')) return

    const grupoIds = grupos.map((g: any) => g.id)
    const { data: inscritos } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', grupoIds)
    if (!inscritos?.length) { alert('No hay inscritos'); return }

    // Eliminar grupos anteriores
    for (const gid of grupoIds) {
      await supabase.from('grupo_jugadores').delete().eq('grupo_id', gid)
      await supabase.from('torneo_grupos').delete().eq('id', gid)
    }

    const jugs = inscritos.map((i: any) => i.jugadores).filter(Boolean)
    jugs.sort((a: any, b: any) => (b.elo || 1200) - (a.elo || 1200))

    const numGrupos = Math.max(2, Math.round(jugs.length / 3))
    const nuevosGrupos: any[] = []
    for (let i = 0; i < numGrupos; i++) {
      const { data: g } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: String.fromCharCode(65 + i) }).select().single()
      nuevosGrupos.push(g)
    }

    const asignaciones: any[] = []
    let dir = 1, gi = 0
    for (let i = 0; i < jugs.length; i++) {
      asignaciones.push({ grupo_id: nuevosGrupos[gi].id, jugador_id: jugs[i].id })
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
    await supabase.from('grupo_jugadores').insert(asignaciones)

    const pts: any[] = []
    for (const g of nuevosGrupos) {
      const jugsG = asignaciones.filter(a => a.grupo_id === g.id)
      for (let i = 0; i < jugsG.length; i++) {
        for (let j = i + 1; j < jugsG.length; j++) {
          pts.push({ torneo_id: torneoId, grupo_id: g.id, fase: 'grupos', jugador_a: jugsG[i].jugador_id, jugador_b: jugsG[j].jugador_id, orden: pts.length })
        }
      }
    }
    if (pts.length) await supabase.from('torneo_partidos').insert(pts)
    await supabase.from('torneos').update({ fase: 'grupos', inscripcion_abierta: false }).eq('id', torneoId)
    setMesaOpen(false)
    await cargarTorneo()
  }

  async function avanzarALlaves() {
    if (!confirm('¿Cerrar fase de grupos y generar playoffs con regla espejo y BYEs automáticos?')) return

    const grupoIds = grupos.filter((g: any) => g.nombre !== 'MESA').map((g: any) => g.id)
    const gjData = jugadores.filter((j: any) => grupoIds.includes(j.grupo_id))
    const partidosGrupos = partidos.filter(p => p.fase === 'grupos')

    // Calcular stats
    const stats: Record<string, any> = {}
    gjData.forEach((j: any) => {
      stats[j.jugador_id] = { jugador: j.jugadores, grupo_id: j.grupo_id, grupo_nombre: grupos.find((g: any) => g.id === j.grupo_id)?.nombre || '', pts: 0 }
    })
    partidosGrupos.filter(p => p.ganador).forEach(p => {
      if (stats[p.ganador]) stats[p.ganador].pts += 2
    })

    // Top 2 por grupo
    const primeros: any[] = []
    const segundos: any[] = []
    for (const grupo of grupos.filter((g: any) => g.nombre !== 'MESA')) {
      const jugsG = Object.values(stats).filter((s: any) => s.grupo_id === grupo.id)
      jugsG.sort((a: any, b: any) => b.pts - a.pts || (b.jugador?.elo || 0) - (a.jugador?.elo || 0))
      if (jugsG[0]) { primeros.push(jugsG[0]); await supabase.from('grupo_jugadores').update({ clasificado: true }).eq('grupo_id', grupo.id).eq('jugador_id', (jugsG[0] as any).jugador.id) }
      if (jugsG[1]) segundos.push(jugsG[1])
    }

    // Semillas: 1ros polo norte, 2dos polo sur invertidos
    const semillas = [...primeros, ...segundos.slice().reverse()]
    const n = semillas.length
    if (n < 2) { alert('No hay suficientes clasificados'); return }

    // Potencia de 2 y BYEs
    let tamBracket = 2
    while (tamBracket < n) tamBracket *= 2
    const numByes = tamBracket - n

    const conBye = semillas.slice(0, numByes)
    const sinBye = semillas.slice(numByes)

    // Fase inicial
    let faseInicial = 'final'
    if (tamBracket <= 4) faseInicial = 'semis'
    else if (tamBracket <= 8) faseInicial = 'cuartos'
    else if (tamBracket <= 16) faseInicial = '8vos'
    else faseInicial = '16vos'

    const nuevosPartidos: any[] = []
    const mid = Math.floor(sinBye.length / 2)

    // Regla espejo
    for (let i = 0; i < mid; i++) {
      const jugA = sinBye[i] as any
      const jugB = sinBye[sinBye.length - 1 - i] as any
      if (jugA?.jugador?.id && jugB?.jugador?.id) {
        nuevosPartidos.push({ torneo_id: torneoId, fase: faseInicial, jugador_a: jugA.jugador.id, jugador_b: jugB.jugador.id, orden: i })
      }
    }

    // BYEs — pasan directo
    for (let i = 0; i < conBye.length; i++) {
      const j = conBye[i] as any
      nuevosPartidos.push({ torneo_id: torneoId, fase: faseInicial, jugador_a: j.jugador.id, jugador_b: null, ganador: j.jugador.id, orden: mid + i })
    }

    if (nuevosPartidos.length) await supabase.from('torneo_partidos').insert(nuevosPartidos)
    await supabase.from('torneos').update({ fase: faseInicial, estado: 'en_curso' }).eq('id', torneoId)

    const byeMsg = numByes > 0 ? ` (${numByes} BYE${numByes > 1 ? 's' : ''} a los mejores)` : ''
    alert(`Playoffs generados con regla espejo${byeMsg}`)
    await cargarTorneo()
  }

  async function avanzarSiguienteFase(faseActual: string) {
    const idx = fasesOrden.indexOf(faseActual)
    if (idx < 0 || idx >= fasesOrden.length - 1) return
    const siguienteFase = fasesOrden[idx + 1]

    const partidosFase = partidos.filter(p => p.fase === faseActual)
    const ganadores = partidosFase.map(p => (p as any).jg).filter(Boolean)
    ganadores.sort((a: any, b: any) => (b.elo || 0) - (a.elo || 0))

    const mid = Math.floor(ganadores.length / 2)
    const nuevosPartidos: any[] = []
    for (let i = 0; i < mid; i++) {
      nuevosPartidos.push({ torneo_id: torneoId, fase: siguienteFase, jugador_a: ganadores[i].id, jugador_b: ganadores[ganadores.length - 1 - i].id, orden: i })
    }

    await supabase.from('torneo_partidos').insert(nuevosPartidos)
    await supabase.from('torneos').update({ fase: siguienteFase }).eq('id', torneoId)
    await cargarTorneo()
  }

  async function finalizarTorneo() {
    if (!confirm('¿Finalizar el torneo?')) return
    await supabase.from('torneos').update({ estado: 'finalizado', fase: 'finalizado' }).eq('id', torneoId)
    await cargarTorneo()
  }

  const esAdmin = perfil?.rol === 'admin'
  const cuota = torneo?.cuota_inscripcion || 0
  const totalInscritos = [...new Set(jugadores.map((j: any) => j.jugador_id))].length
  const pagados = pagos.filter(p => p.estado === 'pagado').length
  const recaudado = pagados * cuota
  const proyectado = totalInscritos * cuota
  const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

  // Partidos por fase para playoffs
  const faseActual = torneo?.fase
  const esPlayoffs = faseActual && fasesOrden.includes(faseActual)
  const partidosFaseActual = partidos.filter(p => p.fase === faseActual)
  const todosJugadosFase = partidosFaseActual.length > 0 && partidosFaseActual.every(p => p.ganador)
  const todosGruposJugados = partidos.filter(p => p.fase === 'grupos').length > 0 && partidos.filter(p => p.fase === 'grupos').every(p => p.ganador)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117' }}>
      <div style={{ color:'#6c7280' }}>Cargando...</div>
    </div>
  )

  return (
    <AppLayout perfil={perfil}>
      {/* Header */}
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={() => router.push('/torneos')} style={{ background:'transparent', border:'1px solid #1e2030', borderRadius:8, padding:'6px 14px', color:'#8890a4', fontSize:13, cursor:'pointer' }}>← Volver</button>
        <h1 style={{ fontSize:20, fontWeight:700, color:'#fff', margin:0 }}>{torneo?.nombre}</h1>
        <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>{faseLabel[faseActual] || faseActual}</span>
        {esAdmin && torneo?.inscripcion_abierta && (
          <button onClick={() => setMesaOpen(true)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🪑 Mesa inscripción</button>
        )}
        {esAdmin && faseActual === 'grupos' && todosGruposJugados && (
          <button onClick={avanzarALlaves} style={{ background:'#a78bfa', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>⚔️ Generar playoffs →</button>
        )}
        {esAdmin && esPlayoffs && todosJugadosFase && faseActual !== 'final' && (
          <button onClick={() => avanzarSiguienteFase(faseActual)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Siguiente fase →</button>
        )}
        {esAdmin && faseActual === 'final' && todosJugadosFase && torneo?.estado !== 'finalizado' && (
          <button onClick={finalizarTorneo} style={{ background:'#34d399', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🏆 Finalizar torneo</button>
        )}
      </div>

      {/* Control financiero */}
      {esAdmin && cuota > 0 && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>💰 Control financiero</div>
            {!torneo?.contabilidad_enviada ? (
              <button onClick={async () => {
                if (!confirm(`¿Enviar ${fmt(recaudado)} a Finanzas?`)) return
                await supabase.from('movimientos').insert({ club_id: perfil?.club_id, tipo:'ingreso', categoria:'inscripcion_torneo', descripcion:`Ingreso Torneo — ${torneo.nombre}`, monto: recaudado, fecha: new Date().toISOString().slice(0,10), registrado_por_nombre: perfil?.nombre || 'Admin' })
                await supabase.from('torneos').update({ contabilidad_enviada: true }).eq('id', torneoId)
                await cargarTorneo()
              }} style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
                📤 Enviar a Finanzas
              </button>
            ) : <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Enviado</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[
              { label:'Inscritos', value:totalInscritos, color:'#c8cfe0' },
              { label:'Meta', value:fmt(proyectado), color:'#6c7280' },
              { label:'Recaudado', value:fmt(recaudado), color:'#34d399' },
              { label:'Pendiente', value:fmt(proyectado - recaudado), color: proyectado - recaudado > 0 ? '#f87171' : '#34d399' },
            ].map(s => (
              <div key={s.label} style={{ background:'#0a0c12', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FASE GRUPOS */}
      {faseActual === 'grupos' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
          {grupos.filter((g: any) => g.nombre !== 'MESA').map(grupo => {
            const jugsGrupo = jugadores.filter((j: any) => j.grupo_id === grupo.id)
            const ptosMap: Record<string, number> = {}
            jugsGrupo.forEach((j: any) => ptosMap[j.jugador_id] = 0)
            partidos.filter(p => p.grupo_id === grupo.id && p.ganador).forEach(p => { if (ptosMap[p.ganador] !== undefined) ptosMap[p.ganador] += 2 })
            const jugsOrdenados = [...jugsGrupo].sort((a: any, b: any) => (ptosMap[b.jugador_id] || 0) - (ptosMap[a.jugador_id] || 0))
            const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)

            return (
              <div key={grupo.id} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e2030', fontSize:14, fontWeight:600, color:'#fff' }}>Grupo {grupo.nombre}</div>
                {jugsOrdenados.map((j: any, i: number) => (
                  <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #1e2030', borderLeft:`3px solid ${i === 0 ? '#fbbf24' : 'transparent'}` }}>
                    <span style={{ fontSize:14 }}>{i === 0 ? '👑' : i === 1 ? '2' : '—'}</span>
                    <div style={{ flex:1, fontSize:13, color:'#c8cfe0' }}>{j.jugadores?.nombre || '—'}</div>
                    <span style={{ fontSize:12, color:'#a78bfa', fontWeight:600 }}>{ptosMap[j.jugador_id] || 0}pts</span>
                    {esAdmin && cuota > 0 && (() => {
                      const pago = pagos.find(p => p.jugador_id === j.jugador_id)
                      return pago?.estado === 'pagado'
                        ? <span style={{ background:'#34d39922', color:'#34d399', padding:'2px 6px', borderRadius:10, fontSize:10 }}>✓</span>
                        : <span onClick={async () => {
                            const ex = pagos.find(p => p.jugador_id === j.jugador_id)
                            if (ex) await supabase.from('torneo_pagos').update({ estado:'pagado' }).eq('id', ex.id)
                            else await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: j.jugador_id, estado:'pagado', metodo_pago:'efectivo' })
                            await cargarTorneo()
                          }} style={{ background:'#f8717122', color:'#f87171', padding:'2px 6px', borderRadius:10, fontSize:10, cursor:'pointer' }}>Pend.</span>
                    })()}
                  </div>
                ))}
                <div style={{ padding:'8px 16px' }}>
                  {partidosGrupo.map(p => {
                    const jugA = jugsGrupo.find((j: any) => j.jugador_id === p.jugador_a)
                    const jugB = jugsGrupo.find((j: any) => j.jugador_id === p.jugador_b)
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                        <span style={{ flex:1, color: p.ganador === p.jugador_a ? '#34d399' : '#c8cfe0', textAlign:'right' }}>{jugA?.jugadores?.nombre || '—'}</span>
                        <span style={{ color:'#4b5063', fontSize:10 }}>vs</span>
                        <span style={{ flex:1, color: p.ganador === p.jugador_b ? '#34d399' : '#c8cfe0' }}>{jugB?.jugadores?.nombre || '—'}</span>
                        {esAdmin && !p.ganador && (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => marcarGanador(p.id, p.jugador_a)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>A ✓</button>
                            <button onClick={() => marcarGanador(p.id, p.jugador_b)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>✓ B</button>
                          </div>
                        )}
                        {p.ganador && <span style={{ color:'#34d399', fontSize:10 }}>✓</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* PLAYOFFS */}
      {esPlayoffs && (
        <div>
          <div style={{ background:'#1e1b4b', border:'1px solid #6c63ff44', borderRadius:10, padding:'10px 16px', fontSize:13, color:'#a78bfa', marginBottom:16 }}>
            💡 Haz clic en el nombre del ganador para registrar el resultado
          </div>
          <div style={{ overflowX:'auto', paddingBottom:12 }}>
            <div style={{ display:'flex', gap:20, minWidth:'max-content' }}>
              {fasesOrden.slice(0, fasesOrden.indexOf(faseActual) + 1).map(fase => {
                const ps = partidos.filter(p => p.fase === fase)
                if (!ps.length) return null
                return (
                  <div key={fase} style={{ minWidth:180 }}>
                    <div style={{ fontSize:11, color:'#4b5063', textTransform:'uppercase', letterSpacing:'1px', textAlign:'center', marginBottom:10, padding:'4px 8px', background:'#0a0c12', borderRadius:6 }}>
                      {faseLabel[fase]}
                    </div>
                    {ps.map((p, i) => {
                      const isBye = p.jugador_b === null
                      return (
                        <div key={p.id} style={{ background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, overflow:'hidden', marginBottom:8 }}>
                          {/* Jugador A */}
                          <div
                            onClick={() => esAdmin && !p.ganador && !isBye && marcarGanador(p.id, p.jugador_a)}
                            style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #1e2030', cursor: esAdmin && !p.ganador && !isBye ? 'pointer' : 'default', background: p.ganador === p.jugador_a ? '#052e16' : 'transparent' }}
                          >
                            <span style={{ fontSize:12, color: p.ganador === p.jugador_a ? '#34d399' : '#c8cfe0' }}>
                              <span style={{ fontSize:9, background:'#1e1b4b', color:'#a78bfa', padding:'1px 4px', borderRadius:3, marginRight:4 }}>{i*2+1}</span>
                              {(p as any).ja?.nombre || 'TBD'}
                            </span>
                            {p.ganador === p.jugador_a && <span style={{ color:'#34d399', fontSize:12 }}>✓</span>}
                          </div>
                          {/* Jugador B */}
                          {isBye ? (
                            <div style={{ padding:'10px 12px', fontSize:11, color:'#4b5063', fontStyle:'italic' }}>BYE — pasa directo</div>
                          ) : (
                            <div
                              onClick={() => esAdmin && !p.ganador && marcarGanador(p.id, p.jugador_b)}
                              style={{ padding:'10px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor: esAdmin && !p.ganador ? 'pointer' : 'default', background: p.ganador === p.jugador_b ? '#052e16' : 'transparent' }}
                            >
                              <span style={{ fontSize:12, color: p.ganador === p.jugador_b ? '#34d399' : '#c8cfe0' }}>
                                <span style={{ fontSize:9, background:'#1e1b4b', color:'#a78bfa', padding:'1px 4px', borderRadius:3, marginRight:4 }}>{i*2+2}</span>
                                {(p as any).jb?.nombre || 'TBD'}
                              </span>
                              {p.ganador === p.jugador_b && <span style={{ color:'#34d399', fontSize:12 }}>✓</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Campeón */}
          {faseActual === 'finalizado' && (() => {
            const pFinal = partidos.find(p => p.fase === 'final' && p.ganador)
            const campeon = pFinal ? (pFinal.ganador === pFinal.jugador_a ? (pFinal as any).ja : (pFinal as any).jb) : null
            return campeon ? (
              <div style={{ background:'linear-gradient(135deg,#fbbf2422,#14161f)', border:'1px solid #fbbf2444', borderRadius:16, padding:24, textAlign:'center', marginBottom:16 }}>
                <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#fbbf24' }}>¡Campeón!</div>
                <div style={{ fontSize:18, color:'#fff', marginTop:4 }}>{campeon.nombre}</div>
              </div>
            ) : null
          })()}
        </div>
      )}

      {/* Mesa inscripción modal */}
      {mesaOpen && (
        <div style={{ position:'fixed', inset:0, background:'#00000088', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:16, padding:24, width:'100%', maxWidth:480 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>🪑 Mesa de inscripción</div>
              <button onClick={() => setMesaOpen(false)} style={{ background:'transparent', border:'none', color:'#6c7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
              {[
                { label:'Inscritos', value:totalInscritos, color:'#c8cfe0' },
                { label:'Recaudado', value:fmt(recaudado), color:'#34d399' },
                { label:'Por persona', value:fmt(cuota), color:'#fbbf24' },
              ].map(s => (
                <div key={s.label} style={{ background:'#0a0c12', borderRadius:8, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input style={{ flex:2, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                placeholder="Nombre del participante" value={busquedaMesa} onChange={e => setBusquedaMesa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && inscribirEnMesa()} />
              <input style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                placeholder="RUT" value={rutMesa} onChange={e => setRutMesa(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <select style={{ flex:1, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                <option value="efectivo">💵 Efectivo</option>
                <option value="transferencia">💳 Transferencia</option>
              </select>
              <button onClick={inscribirEnMesa} style={{ flex:1, background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'10px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                + Inscribir
              </button>
            </div>
            <button onClick={cerrarInscripcion} style={{ width:'100%', padding:12, background:'#34d39922', color:'#34d399', border:'1px solid #34d39944', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
              ✓ Cerrar inscripción y generar grupos
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
