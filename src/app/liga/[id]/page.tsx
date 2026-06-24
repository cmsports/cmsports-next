'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import AppLayout from '@/app/layout-app'
import { Card, CardHeader, Button, Input, Badge } from '@/components/ui'
import {
  crearDivision, crearMesa, eliminarMesa,
  asignarJugadoresDivision, generarFixtureDivisionAction,
  generarProgramacionLiga, iniciarFecha,
} from '@/app/actions/liga'
import { Plus, Trash2, Calendar as CalendarIcon, Grid3x3 } from 'lucide-react'

const supabase = createClient()

interface Division { id: string; nombre: string; fixture_generado: boolean }
interface Mesa { id: string; numero: number }
interface Fecha { id: string; numero: number; es_ajuste: boolean; estado: string }
interface Jugador { id: string; nombre: string }

export default function LigaDetallePage() {
  const params = useParams<{ id: string }>()
  const ligaId = params.id
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()

  const [liga, setLiga] = useState<{ nombre: string } | null>(null)
  const [divisiones, setDivisiones] = useState<Division[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [fechas, setFechas] = useState<Fecha[]>([])
  const [jugadoresClub, setJugadoresClub] = useState<Jugador[]>([])
  const [divisionJugadores, setDivisionJugadores] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState('')

  const [nombreDivision, setNombreDivision] = useState('')
  const [numeroMesa, setNumeroMesa] = useState('')
  const [divisionExpandida, setDivisionExpandida] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data: ligaData } = await supabase.from('ligas').select('nombre, club_id').eq('id', ligaId).single()
    if (!ligaData) { setLoading(false); return }
    setLiga({ nombre: ligaData.nombre })

    const [{ data: divs }, { data: ms }, { data: fch }, { data: jugs }, { data: dj }] = await Promise.all([
      supabase.from('liga_divisiones').select('id, nombre, fixture_generado').eq('liga_id', ligaId).order('orden'),
      supabase.from('liga_mesas').select('id, numero').eq('liga_id', ligaId).order('numero'),
      supabase.from('liga_fechas').select('id, numero, es_ajuste, estado').eq('liga_id', ligaId).order('numero'),
      supabase.from('jugadores').select('id, nombre').eq('club_id', ligaData.club_id).eq('estado', 'activo').order('nombre'),
      supabase.from('liga_division_jugadores').select('division_id, jugador_id'),
    ])
    setDivisiones(divs || [])
    setMesas(ms || [])
    setFechas(fch || [])
    setJugadoresClub(jugs || [])

    const mapa: Record<string, string[]> = {}
    for (const row of dj || []) {
      if (!(divs || []).find(d => d.id === row.division_id)) continue
      mapa[row.division_id] = [...(mapa[row.division_id] || []), row.jugador_id]
    }
    setDivisionJugadores(mapa)
    setLoading(false)
  }, [ligaId])

  useEffect(() => { cargar() }, [cargar])

  async function handleCrearDivision() {
    if (!nombreDivision.trim()) return
    const res = await crearDivision({ ligaId, nombre: nombreDivision, orden: divisiones.length })
    if (res.error) { setMensaje(res.error); return }
    setNombreDivision('')
    cargar()
  }

  async function handleCrearMesa() {
    const numero = parseInt(numeroMesa)
    if (!numero) return
    const res = await crearMesa({ ligaId, numero })
    if (res.error) { setMensaje(res.error); return }
    setNumeroMesa('')
    cargar()
  }

  async function handleEliminarMesa(mesaId: string) {
    await eliminarMesa({ mesaId })
    cargar()
  }

  function toggleJugadorDivision(divisionId: string, jugadorId: string) {
    setDivisionJugadores(prev => {
      const actuales = prev[divisionId] || []
      const nuevos = actuales.includes(jugadorId) ? actuales.filter(id => id !== jugadorId) : [...actuales, jugadorId]
      return { ...prev, [divisionId]: nuevos }
    })
  }

  async function handleGuardarJugadores(division: Division) {
    const ids = divisionJugadores[division.id] || []
    const res = await asignarJugadoresDivision({ divisionId: division.id, jugadorIds: ids, regenerarFixture: division.fixture_generado })
    if (res.error) { setMensaje(res.error); return }
    setMensaje('')
    cargar()
  }

  async function handleGenerarFixture(divisionId: string) {
    const res = await generarFixtureDivisionAction({ divisionId })
    setMensaje(res.error || `Fixture generado: ${res.totalPartidos} partidos`)
    cargar()
  }

  async function handleGenerarProgramacion() {
    const res = await generarProgramacionLiga({ ligaId })
    if (res.error) { setMensaje(res.error); return }
    setMensaje(`Programados: ${res.totalProgramados}. Sin programar (van a Fecha 5): ${res.totalSinProgramar}`)
    cargar()
  }

  async function handleIniciarFecha(fechaId: string) {
    const res = await iniciarFecha({ fechaId })
    if (res.error) { setMensaje(res.error); return }
    cargar()
  }

  if (authLoading || loading) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Cargando…</div></AppLayout>
  if (!liga) return <AppLayout perfil={perfil}><div className="p-6 text-sm text-[var(--text-muted)]">Liga no encontrada</div></AppLayout>

  return (
    <AppLayout perfil={perfil}>
      <div className="p-6 space-y-5">
        <h1 className="text-xl font-semibold text-[var(--text)]">{liga.nombre}</h1>

        {mensaje && <div className="rounded-lg bg-[var(--sky-light)] text-[var(--sky-dark)] text-sm px-4 py-2">{mensaje}</div>}

        <Card>
          <CardHeader title="Divisiones" subtitle="Cada división juega round robin solo contra sí misma" />
          <div className="flex gap-3 mb-4">
            <Input placeholder="Ej: División 1" value={nombreDivision} onChange={e => setNombreDivision(e.target.value)} className="flex-1" />
            <Button onClick={handleCrearDivision} icon={Plus}>Agregar división</Button>
          </div>

          <div className="space-y-3">
            {divisiones.map(division => (
              <div key={division.id} className="border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setDivisionExpandida(divisionExpandida === division.id ? null : division.id)}>
                  <div className="font-medium text-[var(--text)]">{division.nombre}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant={division.fixture_generado ? 'success' : 'default'}>
                      {division.fixture_generado ? 'Fixture generado' : 'Sin fixture'}
                    </Badge>
                    <span className="text-xs text-[var(--text-muted)]">{(divisionJugadores[division.id] || []).length} jugadores</span>
                  </div>
                </div>

                {divisionExpandida === division.id && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-auto p-2 bg-slate-50 rounded-lg">
                      {jugadoresClub.map(j => (
                        <label key={j.id} className="flex items-center gap-2 text-xs text-[var(--text)]">
                          <input
                            type="checkbox"
                            checked={(divisionJugadores[division.id] || []).includes(j.id)}
                            onChange={() => toggleJugadorDivision(division.id, j.id)}
                          />
                          {j.nombre}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => handleGuardarJugadores(division)}>
                        {division.fixture_generado ? 'Guardar y regenerar fixture' : 'Guardar jugadores'}
                      </Button>
                      {!division.fixture_generado && (
                        <Button size="sm" onClick={() => handleGenerarFixture(division.id)}>Generar fixture</Button>
                      )}
                      {division.fixture_generado && (
                        <Button size="sm" variant="secondary" onClick={() => router.push(`/liga/division/${division.id}`)}>Ver ranking</Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {divisiones.length === 0 && <p className="text-xs text-[var(--text-muted)]">Aún no hay divisiones</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Mesas" subtitle="Recurso físico compartido entre todas las divisiones" />
          <div className="flex gap-3 mb-4">
            <Input type="number" placeholder="Número de mesa" value={numeroMesa} onChange={e => setNumeroMesa(e.target.value)} className="w-40" />
            <Button onClick={handleCrearMesa} icon={Plus}>Agregar mesa</Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {mesas.map(mesa => (
              <span key={mesa.id} className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1 text-xs text-[var(--text)]">
                <Grid3x3 className="size-3" /> Mesa {mesa.numero}
                <button onClick={() => handleEliminarMesa(mesa.id)} className="text-[var(--text-muted)] hover:text-[var(--red)]">
                  <Trash2 className="size-3" />
                </button>
              </span>
            ))}
            {mesas.length === 0 && <p className="text-xs text-[var(--text-muted)]">Aún no hay mesas</p>}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Fechas"
            subtitle="Fechas 1-4 son regulares; Fecha 5 es de ajuste"
            action={<Button size="sm" onClick={handleGenerarProgramacion} icon={CalendarIcon}>Generar programación</Button>}
          />
          <div className="grid gap-2">
            {fechas.map(fecha => (
              <div key={fecha.id} className="flex items-center justify-between border border-[var(--border)] rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text)]">Fecha {fecha.numero}</span>
                  {fecha.es_ajuste && <Badge variant="warning">Ajuste</Badge>}
                  <Badge variant={fecha.estado === 'en_juego' ? 'success' : 'default'}>
                    {fecha.estado === 'programada' ? 'Programada' : fecha.estado === 'en_juego' ? 'En juego' : 'Finalizada'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/liga/fecha/${fecha.id}`)}>Ver tablero</Button>
                  {fecha.estado === 'programada' && !fecha.es_ajuste && (
                    <Button size="sm" onClick={() => handleIniciarFecha(fecha.id)}>Iniciar Fecha</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
