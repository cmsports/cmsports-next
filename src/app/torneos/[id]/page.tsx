'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/app/layout-app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
      await cargarTorneo(p.club_id)
      setLoading(false)
    }
    cargar()
  }, [torneoId])

  async function cargarTorneo(cid?: string) {
    const { data: t } = await supabase.from('torneos').select('*').eq('id', torneoId).single()
    setTorneo(t)

    const { data: g } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).order('nombre')
    setGrupos(g || [])

    if (g?.length) {
      const grupoIds = g.map((gr: any) => gr.id)
      const { data: gj } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', grupoIds)
      setJugadores(gj || [])
    }

    const { data: pts } = await supabase.from('torneo_partidos').select('*').eq('torneo_id', torneoId)
    setPartidos(pts || [])

    const { data: pgs } = await supabase.from('torneo_pagos').select('*').eq('torneo_id', torneoId)
    setPagos(pgs || [])
  }

  async function inscribirEnMesa() {
    if (!busquedaMesa) return
    // Buscar jugador existente
    let jugadorId = null
    const { data: jugExistente } = await supabase.from('jugadores').select('id').ilike('nombre', `%${busquedaMesa}%`).eq('club_id', perfil?.club_id).single()
    
    if (jugExistente) {
      jugadorId = jugExistente.id
    } else {
      const { data: nuevo } = await supabase.from('jugadores').insert({
        club_id: perfil?.club_id, nombre: busquedaMesa, rut: rutMesa || null,
        categoria: 'principiante', sesiones_limite: 0
      }).select().single()
      jugadorId = nuevo?.id
    }
    if (!jugadorId) return

    // Agregar a grupo MESA
    let { data: grupoMesa } = await supabase.from('torneo_grupos').select('*').eq('torneo_id', torneoId).eq('nombre', 'MESA').single()
    if (!grupoMesa) {
      const { data: ng } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: 'MESA' }).select().single()
      grupoMesa = ng
    }
    await supabase.from('grupo_jugadores').insert({ grupo_id: grupoMesa.id, jugador_id: jugadorId })

    // Registrar pago si hay cuota
    if (torneo?.cuota_inscripcion > 0) {
      await supabase.from('torneo_pagos').insert({
        torneo_id: torneoId, jugador_id: jugadorId,
        estado: 'pagado', metodo_pago: metodoPago,
        fecha_pago: new Date().toISOString().slice(0,10)
      })
      await supabase.from('movimientos').insert({
        club_id: perfil?.club_id, tipo: 'ingreso', categoria: 'inscripcion_torneo',
        descripcion: `Inscripción torneo — ${busquedaMesa}`,
        monto: torneo.cuota_inscripcion, fecha: new Date().toISOString().slice(0,10),
        registrado_por_nombre: perfil?.nombre || 'Admin'
      })
    }

    setBusquedaMesa(''); setRutMesa('')
    await cargarTorneo()
  }

  async function marcarGanador(partidoId: string, ganadorId: string) {
    await supabase.from('torneo_partidos').update({ ganador: ganadorId }).eq('id', partidoId)
    await cargarTorneo()
  }

  async function cerrarInscripcion() {
    if (!confirm('¿Cerrar inscripción y generar grupos con seeding ELO?')) return
    
    // Obtener todos los inscritos
    const { data: grupos } = await supabase.from('torneo_grupos').select('id').eq('torneo_id', torneoId)
    const grupoIds = grupos?.map((g:any) => g.id) || []
    const { data: inscritos } = await supabase.from('grupo_jugadores').select('*,jugadores(id,nombre,elo)').in('grupo_id', grupoIds)
    
    if (!inscritos?.length) { alert('No hay inscritos'); return }

    // Eliminar grupos anteriores
    for (const gid of grupoIds) {
      await supabase.from('grupo_jugadores').delete().eq('grupo_id', gid)
      await supabase.from('torneo_grupos').delete().eq('id', gid)
    }

    // Ordenar por ELO y crear grupos nuevos
    const jugs = inscritos.map((i:any) => i.jugadores).filter(Boolean)
    jugs.sort((a:any, b:any) => (b.elo||1200) - (a.elo||1200))
    
    const numGrupos = Math.max(2, Math.round(jugs.length / 3))
    const nuevosGrupos: any[] = []
    for (let i = 0; i < numGrupos; i++) {
      const { data: g } = await supabase.from('torneo_grupos').insert({ torneo_id: torneoId, nombre: String.fromCharCode(65+i) }).select().single()
      nuevosGrupos.push(g)
    }

    // Serpenteo
    const asignaciones: any[] = []
    let dir = 1, gi = 0
    for (let i = 0; i < jugs.length; i++) {
      asignaciones.push({ grupo_id: nuevosGrupos[gi].id, jugador_id: jugs[i].id })
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos-1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
    await supabase.from('grupo_jugadores').insert(asignaciones)

    // Generar partidos
    const pts: any[] = []
    for (const g of nuevosGrupos) {
      const jugsG = asignaciones.filter(a => a.grupo_id === g.id)
      for (let i = 0; i < jugsG.length; i++) {
        for (let j = i+1; j < jugsG.length; j++) {
          pts.push({ torneo_id: torneoId, grupo_id: g.id, fase:'grupos', jugador_a: jugsG[i].jugador_id, jugador_b: jugsG[j].jugador_id, orden: pts.length })
        }
      }
    }
    if (pts.length) await supabase.from('torneo_partidos').insert(pts)
    await supabase.from('torneos').update({ fase:'grupos', inscripcion_abierta: false }).eq('id', torneoId)
    await cargarTorneo()
    setMesaOpen(false)
  }

  const esAdmin = perfil?.rol === 'admin'
  const cuota = torneo?.cuota_inscripcion || 0
  const totalInscritos = [...new Set(jugadores.map((j:any) => j.jugador_id))].length
  const pagados = pagos.filter(p => p.estado === 'pagado').length
  const recaudado = pagados * cuota
  const proyectado = totalInscritos * cuota

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
        <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>{torneo?.fase}</span>
        {esAdmin && torneo?.inscripcion_abierta && (
          <button onClick={() => setMesaOpen(true)} style={{ background:'#6c63ff', color:'white', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>🪑 Mesa inscripción</button>
        )}
      </div>

      {/* Control financiero */}
      {esAdmin && cuota > 0 && (
        <div style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>💰 Control financiero</div>
            {!torneo?.contabilidad_enviada ? (
              <button onClick={async () => {
                if (!confirm(`¿Enviar $${recaudado.toLocaleString('es-CL')} a Finanzas?`)) return
                await supabase.from('movimientos').insert({
                  club_id: perfil?.club_id, tipo:'ingreso', categoria:'inscripcion_torneo',
                  descripcion: `Ingreso Torneo - ${torneo.nombre}`,
                  monto: recaudado, fecha: new Date().toISOString().slice(0,10),
                  registrado_por_nombre: perfil?.nombre || 'Admin'
                })
                await supabase.from('torneos').update({ contabilidad_enviada: true }).eq('id', torneoId)
                await cargarTorneo()
              }} style={{ background:'#1e1b4b', color:'#a78bfa', border:'none', borderRadius:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
                📤 Enviar a Finanzas
              </button>
            ) : <span style={{ background:'#34d39922', color:'#34d399', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 }}>✓ Enviado a Finanzas</span>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[
              { label:'Inscritos', value:totalInscritos, color:'#c8cfe0' },
              { label:'Meta', value:'$'+proyectado.toLocaleString('es-CL'), color:'#6c7280' },
              { label:'Recaudado', value:'$'+recaudado.toLocaleString('es-CL'), color:'#34d399' },
              { label:'Pendiente', value:'$'+(proyectado-recaudado).toLocaleString('es-CL'), color: proyectado-recaudado > 0 ? '#f87171' : '#34d399' },
            ].map(s => (
              <div key={s.label} style={{ background:'#0a0c12', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grupos */}
      {torneo?.fase === 'grupos' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
          {grupos.filter(g => g.nombre !== 'MESA').map(grupo => {
            const jugsGrupo = jugadores.filter((j:any) => j.grupo_id === grupo.id)
            const ptosMap: Record<string, number> = {}
            jugsGrupo.forEach((j:any) => ptosMap[j.jugador_id] = 0)
            partidos.filter(p => p.grupo_id === grupo.id && p.ganador).forEach(p => { if (ptosMap[p.ganador] !== undefined) ptosMap[p.ganador] += 2 })
            const jugsOrdenados = [...jugsGrupo].sort((a:any, b:any) => (ptosMap[b.jugador_id]||0) - (ptosMap[a.jugador_id]||0))

            const partidosGrupo = partidos.filter(p => p.grupo_id === grupo.id)

            return (
              <div key={grupo.id} style={{ background:'#14161f', border:'1px solid #1e2030', borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e2030', fontSize:14, fontWeight:600, color:'#fff' }}>
                  Grupo {grupo.nombre}
                </div>
                {jugsOrdenados.map((j:any, i:number) => (
                  <div key={j.jugador_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid #1e2030', borderLeft:`3px solid ${i===0?'#fbbf24':'transparent'}` }}>
                    <span style={{ fontSize:14 }}>{i===0?'👑':i===1?'2':'—'}</span>
                    <div style={{ flex:1, fontSize:13, color:'#c8cfe0' }}>{j.jugadores?.nombre || '—'}</div>
                    <span style={{ fontSize:12, color:'#a78bfa', fontWeight:600 }}>{ptosMap[j.jugador_id]||0}pts</span>
                    {esAdmin && cuota > 0 && (() => {
                      const pago = pagos.find(p => p.jugador_id === j.jugador_id)
                      return pago?.estado === 'pagado'
                        ? <span style={{ background:'#34d39922', color:'#34d399', padding:'2px 6px', borderRadius:10, fontSize:10 }}>✓</span>
                        : <span onClick={async () => {
                            const existing = pagos.find(p => p.jugador_id === j.jugador_id)
                            if (existing) await supabase.from('torneo_pagos').update({ estado:'pagado', metodo_pago:'efectivo' }).eq('id', existing.id)
                            else await supabase.from('torneo_pagos').insert({ torneo_id: torneoId, jugador_id: j.jugador_id, estado:'pagado', metodo_pago:'efectivo' })
                            await cargarTorneo()
                          }} style={{ background:'#f8717122', color:'#f87171', padding:'2px 6px', borderRadius:10, fontSize:10, cursor:'pointer' }}>Pend.</span>
                    })()}
                  </div>
                ))}
                {/* Partidos del grupo */}
                <div style={{ padding:'8px 16px' }}>
                  {partidosGrupo.map(p => {
                    const jugA = jugsGrupo.find((j:any) => j.jugador_id === p.jugador_a)
                    const jugB = jugsGrupo.find((j:any) => j.jugador_id === p.jugador_b)
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid #1a1d2e', fontSize:12 }}>
                        <span style={{ flex:1, color: p.ganador===p.jugador_a?'#34d399':'#c8cfe0', textAlign:'right' }}>{jugA?.jugadores?.nombre||'—'}</span>
                        <span style={{ color:'#4b5063' }}>vs</span>
                        <span style={{ flex:1, color: p.ganador===p.jugador_b?'#34d399':'#c8cfe0' }}>{jugB?.jugadores?.nombre||'—'}</span>
                        {esAdmin && !p.ganador && (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => marcarGanador(p.id, p.jugador_a)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>A</button>
                            <button onClick={() => marcarGanador(p.id, p.jugador_b)} style={{ background:'#6c63ff22', color:'#a78bfa', border:'none', borderRadius:4, padding:'3px 6px', fontSize:10, cursor:'pointer' }}>B</button>
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

      {/* Mesa de inscripción */}
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
                { label:'Recaudado', value:'$'+recaudado.toLocaleString('es-CL'), color:'#34d399' },
                { label:'Por persona', value:'$'+cuota.toLocaleString('es-CL'), color:'#fbbf24' },
              ].map(s => (
                <div key={s.label} style={{ background:'#0a0c12', borderRadius:8, padding:10, textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'#6c7280' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input style={{ flex:2, background:'#0a0c12', border:'1px solid #1e2030', borderRadius:8, padding:'10px 12px', color:'#e8e8f0', fontSize:13, outline:'none' }}
                placeholder="Nombre del participante" value={busquedaMesa} onChange={e => setBusquedaMesa(e.target.value)} />
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
