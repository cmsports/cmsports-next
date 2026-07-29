'use client'

// ponytail: extraído tal cual desde src/app/asistencia/page.tsx para poder
// embeberlo como tab dentro de Jugadores. El wrapper AppLayout ahora vive
// afuera (en la página que lo usa).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import GraficoAsistencia from '@/components/GraficoAsistencia'
import {
  asignarMontoClaseExtraordinaria, corregirAsistencia, eliminarAsistencia, eliminarClaseExtraordinaria,
  registrarAsistenciaAction, registrarClaseExtraordinaria,
} from '@/app/actions/asistencia'
import { montoIngresado, SIN_CUOTA } from '@/lib/domain/mensualidades'
import { useOnlineStatus } from '@/lib/offline/useOnlineStatus'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import { diaDesdeFecha, hhmm, rangoHorario, ventanaAbierta } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'
import {
  guardarJugadoresCache,
  obtenerJugadoresCache,
  encolarAsistencia,
  obtenerCola,
  quitarDeCola,
  type AsistenciaPendiente,
} from '@/lib/offline/db'
import { cachedFetch } from '@/lib/query-cache'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function formatFechaLarga(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function marcaTiempoActual() {
  return Date.now()
}

/** Un bloque que se dicta hoy, con lo justo para elegirlo en pantalla. */
type BloqueDelDia = {
  id: string
  nombre: string
  sede: string
  hora_inicio: string
  hora_fin: string
  dia_semana: string
}

/** Una clase extra ya registrada hoy. */
type ClaseExtraHoy = {
  id: string
  jugador_id: string
  bloque_id: string | null
  hora: string | null
  monto: number | null
}

// Día de la semana de hoy en el formato del horario ('lun'..'vie').
function diaDeHoy(): string {
  return ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][
    new Date(fechaChile() + 'T12:00:00').getDay()
  ]
}

export default function AsistenciaPanel({ perfil }: { perfil: any }) {
  const [jugadores, setJugadores] = useState<any[]>([])
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)
  const [jugadorPropio, setJugadorPropio] = useState<any>(null)
  const [yaRegistroHoy, setYaRegistroHoy] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [pendientesCount, setPendientesCount] = useState(0)

  // Los bloques que se dictan hoy y quiénes están inscritos en cada uno. Sirven
  // para achicar la lista al pasar lista; no mandan sobre la asistencia, que
  // sigue siendo tocar un nombre.
  // Dos listas y a propósito. Los filtros muestran toda la semana, para poder
  // buscar a cualquiera. Pero "hoy entrena o no" tiene que salir solo de los
  // bloques de hoy: si sale de todos, nadie es candidato a clase extra nunca.
  const [bloquesDelDia, setBloquesDelDia] = useState<BloqueDelDia[]>([])
  const [inscritosDe,   setInscritosDe]   = useState<Record<string, string[]>>({})
  const [sedeSel,      setSedeSel]      = useState('')
  const [bloqueSel,    setBloqueSel]    = useState('')

  // Los que vinieron a un grupo que no es el suyo. Van aparte de `asistencias`
  // porque no descuentan sesión ni cuentan en el porcentaje: se cobran aparte.
  const [extrasHoy,    setExtrasHoy]    = useState<ClaseExtraHoy[]>([])
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [mostrarOtros, setMostrarOtros] = useState(false)
  const [buscaOtro,    setBuscaOtro]    = useState('')

  const [modalMonto,   setModalMonto]   = useState<ClaseExtraHoy | null>(null)
  const [montoTexto,   setMontoTexto]   = useState('')
  const [errorMonto,   setErrorMonto]   = useState('')
  const [guardandoMonto, setGuardandoMonto] = useState(false)

  // Los bloques de hoy del propio jugador, para saber si puede marcarse.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [misBloquesHoy, setMisBloquesHoy] = useState<any[] | null>(null)
  // Le tocaba entrenar hoy, pero el día está marcado sin clase.
  // Lo mismo pero para el staff, sobre el día que está mirando.
  const [suspension,    setSuspension]    = useState<{ grupos: number; motivo: string | null } | null>(null)
  const recargaPendiente = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [fechaVista, setFechaVista] = useState(() => fechaChile())
  const [asistenciasDia, setAsistenciasDia] = useState<any[]>([])
  const [cargandoDia, setCargandoDia] = useState(false)

  const router = useRouter()
  const online = useOnlineStatus()
  const hoy = fechaChile()
  const hora = horaChile()
  const clubId = perfil?.club_id ?? null
  const esAdminOProfesor = perfil?.rol === 'admin' || perfil?.rol === 'profesor'
  // El profesor marca la clase extra; el precio lo decide un administrador.
  const puedeMontos = perfil?.rol === 'admin' || perfil?.rol === 'superadmin'

  const sincronizarCola = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const cola = await obtenerCola()
    const pendientes = cola.filter(c => c.clubId === id)
    for (const item of pendientes) {
      const result = await registrarAsistenciaAction(item.clubId, item.jugadorId, item.fecha, item.hora)
      if (!result.error) await quitarDeCola(item.id)
    }
  }, [clubId])

  const cargarDatos = useCallback(async (cid?: string) => {
    const id = cid || clubId
    if (!id) return
    const cola = await obtenerCola()
    const pendientesHoy: AsistenciaPendiente[] = cola.filter(c => c.clubId === id && c.fecha === hoy)
    setPendientesCount(cola.filter(c => c.clubId === id).length)

    if (!navigator.onLine) {
      const cached = await obtenerJugadoresCache(id)
      setJugadores((cached as any[]) || [])
      setAsistencias(pendientesHoy.map(p => ({ id: p.id, jugador_id: p.jugadorId, hora: p.hora, pendienteSync: true })))
      if (perfil?.jugador_id) {
        setYaRegistroHoy(pendientesHoy.some(p => p.jugadorId === perfil.jugador_id))
      }
      return
    }

    const jugKey = perfil?.rol === 'jugador' && perfil.jugador_id
      ? `asist:jug:${perfil.jugador_id}`
      : `asist:jugs:${id}`

    let j: any[]
    try {
      j = await cachedFetch(jugKey, async () => {
        let q = supabase.from('jugadores')
          .select('id,nombre,categoria,sesiones_usadas,sesiones_limite,horario,entrena_lun,entrena_mar,entrena_mie,entrena_jue,entrena_vie')
          .eq('club_id', id).eq('estado', 'activo').order('nombre')
        if (perfil?.rol === 'jugador' && perfil.jugador_id) q = q.eq('id', perfil.jugador_id)
        const { data, error } = await q
        if (error) throw error
        return data || []
      }, 60_000)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e?.message || 'No fue posible cargar los jugadores' })
      return
    }

    const { data: a, error: asistenciasError } = await supabase
      .from('asistencia').select('id,jugador_id,hora,fecha,estado')
      .eq('club_id', id).eq('fecha', hoy).order('hora', { ascending: false })
    if (asistenciasError) {
      setMensaje({ tipo: 'error', texto: asistenciasError.message })
      return
    }
    setJugadores(j)
    await guardarJugadoresCache(id, j || [])

    const yaSincronizadas = new Set((a || []).map((x: any) => x.jugador_id))
    const pendientesSinSincronizar = pendientesHoy
      .filter(p => !yaSincronizadas.has(p.jugadorId))
      .map(p => ({ id: p.id, jugador_id: p.jugadorId, hora: p.hora, pendienteSync: true }))
    const asistenciasHoy = [...(a || []), ...pendientesSinSincronizar]
    setAsistencias(asistenciasHoy)

    if (perfil?.jugador_id) {
      setYaRegistroHoy((a || []).some((as: any) => as.jugador_id === perfil.jugador_id) || pendientesHoy.some(p => p.jugadorId === perfil.jugador_id))
    }
  }, [clubId, hoy, perfil])

  // Las clases extra del día que se está mirando. Si la migración 098 todavía
  // no corrió, esto devuelve error y data null: el `?? []` lo absorbe y la
  // pantalla queda como antes.
  // Las de la fecha elegida. Antes cargaba dos fechas porque la lista de
  // registro escribía siempre en hoy aunque se mirara otro día; ahora manda una
  // sola fecha en toda la pantalla y esa distinción sobra.
  const cargarExtras = useCallback(async (fecha: string, cid?: string) => {
    const id = cid || clubId
    if (!id) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('clases_extraordinarias')
      .select('id,jugador_id,bloque_id,hora,monto')
      .eq('club_id', id).eq('fecha', fecha)
    setExtrasHoy((data ?? []) as ClaseExtraHoy[])
  }, [clubId])

  // El staff marca el día sin clase en Horario y acá no había ninguna señal:
  // se podía pasar lista de un día que el club dio por suspendido, y esas
  // asistencias no las descuenta nadie. Es aviso, no control: marcarlo y
  // deshacerlo se sigue haciendo en Horario, que es donde vive el horario.
  const cargarSuspension = useCallback(async (fecha: string, cid?: string) => {
    const id = cid || clubId
    if (!id || !esAdminOProfesor) return
    const { data: bl } = await supabase.from('bloques_horario')
      .select('id').eq('club_id', id)
    const ids = (bl ?? []).map((b: { id: string }) => b.id)
    if (ids.length === 0) { setSuspension(null); return }
    const { data } = await supabase.from('bloque_excepciones')
      .select('motivo').in('bloque_id', ids).eq('fecha', fecha)
    const filas = (data ?? []) as { motivo: string | null }[]
    setSuspension(filas.length === 0
      ? null
      : { grupos: filas.length, motivo: filas.map(f => f.motivo).find(Boolean) ?? null })
  }, [clubId, esAdminOProfesor])

  const cargarAsistenciasDia = useCallback(async (fecha: string) => {
    if (!clubId) return
    setCargandoDia(true)
    const { data, error } = await supabase.from('asistencia').select('id,jugador_id,hora,fecha,estado').eq('club_id', clubId).eq('fecha', fecha).order('hora', { ascending: false })
    if (error) setMensaje({ tipo: 'error', texto: error.message })
    setAsistenciasDia(data || [])
    setCargandoDia(false)
  }, [clubId])

  useEffect(() => {
    async function cargar() {
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol === 'jugador' && perfil.jugador_id) {
        const cliente = createClient()
        const { data: j } = await cliente.from('jugadores').select('id,nombre,sesiones_usadas,sesiones_limite').eq('id', perfil.jugador_id).single()
        setJugadorPropio(j)
      }
      if (perfil.club_id) {
        if (navigator.onLine) await sincronizarCola(perfil.club_id)
        await cargarDatos(perfil.club_id)
        await cargarExtras(fechaChile(), perfil.club_id)
      }
      setLoading(false)
    }
    void cargar()
  }, [cargarDatos, cargarExtras, perfil, router, sincronizarCola])

  // Las extras y el aviso de día suspendido se recargan al cambiar el día que
  // se está mirando.
  useEffect(() => {
    if (!clubId || !fechaVista) return
    void cargarExtras(fechaVista)
    void cargarSuspension(fechaVista)
  }, [cargarExtras, cargarSuspension, clubId, fechaVista])

  useEffect(() => {
    if (online && clubId) {
      void sincronizarCola(clubId).then(() => cargarDatos(clubId))
    }
  }, [cargarDatos, clubId, online, sincronizarCola])


  // Los bloques que se dictan hoy y sus inscritos. Es lo que permite pasar
  // lista de a un grupo en vez de buscar veinte nombres entre ciento tres.
  //
  // Si esta consulta falla o el día no tiene bloques, la pantalla se queda con
  // la lista completa y sin filtros: es exactamente como funcionaba antes, y
  // el profe nunca se queda sin poder pasar lista.
  // Todo se calcula para la FECHA ELEGIDA, no para hoy. Es lo que permite
  // completar el dia que se olvido: los grupos que se dictaban ese dia y los
  // que estaban inscritos ENTONCES, que no son necesariamente los de ahora.
  useEffect(() => {
    if (!clubId || !esAdminOProfesor || !fechaVista) return
    let vigente = true
    void (async () => {
      const dia = diaDesdeFecha(fechaVista)
      if (!dia) { setBloquesDelDia([]); setInscritosDe({}); return }   // fin de semana

      const { data: bloques } = await supabase.from('bloques_horario')
        .select('id,nombre,sede,hora_inicio,hora_fin,dia_semana')
        .eq('club_id', clubId).eq('dia_semana', dia)
        .lte('vigente_desde', fechaVista)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaVista}`)
        .order('hora_inicio')
      if (!vigente) return
      const delDia = (bloques ?? []) as BloqueDelDia[]
      const bloqueIds = delDia.map(b => b.id)

      // Las inscripciones tal como estaban esa fecha, no las abiertas de hoy:
      // alguien pudo haber salido del grupo la semana pasada y ese dia si
      // entrenaba. Se pide con `in(bloque_id)` sobre los bloques ya filtrados
      // por club — antes se apoyaba solo en RLS y arrastraba todo el club
      // hasta filtrarlo en el cliente.
      let rel: { bloque_id: string; jugador_id: string }[] = []
      if (bloqueIds.length > 0) {
        const { data } = await supabase.from('bloque_jugadores')
          .select('bloque_id,jugador_id')
          .in('bloque_id', bloqueIds)
          .lte('vigente_desde', fechaVista)
          .or(`vigente_hasta.is.null,vigente_hasta.gte.${fechaVista}`)
        rel = (data ?? []) as { bloque_id: string; jugador_id: string }[]
      }
      if (!vigente) return

      const porBloque: Record<string, string[]> = {}
      for (const r of rel) {
        ;(porBloque[r.bloque_id] ??= []).push(r.jugador_id)
      }
      setBloquesDelDia(delDia)
      setInscritosDe(porBloque)
    })()
    return () => { vigente = false }
  }, [clubId, esAdminOProfesor, fechaVista])

  // Los bloques que le tocan hoy al propio jugador.
  useEffect(() => {
    if (!perfil?.jugador_id || esAdminOProfesor) return
    let vigente = true
    void (async () => {
      const { data } = await supabase.from('bloque_jugadores')
        .select('bloques_horario(id,nombre,dia_semana,hora_inicio,hora_fin,activo,vigente_desde,vigente_hasta)')
        .eq('jugador_id', perfil.jugador_id).is('vigente_hasta', null)
      if (!vigente) return
      const dia = diaDeHoy()
      const suyos = (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r.bloques_horario)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b && b.activo && b.dia_semana === dia
          && b.vigente_desde <= hoy && (b.vigente_hasta === null || b.vigente_hasta >= hoy))

      // Lo mismo que comprueba el servidor antes de dejar marcar: si el día
      // está sin clase, no hay entrenamiento que anunciar. Si el panel dijera
      // "tu entrenamiento es a las 17:00" y el botón contestara "hoy no hay
      // clase", el alumno pensaría que la app está rota.
      const { data: susp } = suyos.length > 0
        ? await supabase.from('bloque_excepciones').select('bloque_id')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .in('bloque_id', suyos.map((b: any) => b.id)).eq('fecha', hoy)
        : { data: [] }
      if (!vigente) return
      const sinClase = new Set((susp ?? []).map((e: { bloque_id: string }) => e.bloque_id))

      setMisBloquesHoy(suyos
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => !sinClase.has(b.id))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio))))
    })()
    return () => { vigente = false }
  }, [perfil?.jugador_id, esAdminOProfesor, hoy])

  useEffect(() => {
    if (!clubId || !fechaVista || fechaVista === hoy) return
    const carga = window.setTimeout(() => { void cargarAsistenciasDia(fechaVista) }, 0)
    return () => window.clearTimeout(carga)
  }, [cargarAsistenciasDia, clubId, fechaVista, hoy])

  useEffect(() => {
    if (!clubId) return

    // Pasar lista son veinte clicks seguidos, y cada uno vuelve también por
    // acá. Sin agrupar serían cuarenta recargas de la lista completa en un
    // minuto: la propia y la del eco. Se espera a que pare la ráfaga.
    const refrescar = () => {
      if (recargaPendiente.current) clearTimeout(recargaPendiente.current)
      recargaPendiente.current = setTimeout(() => {
        void cargarDatos(clubId)
        void cargarExtras(fechaVista)
        if (fechaVista !== hoy) void cargarAsistenciasDia(fechaVista)
      }, 600)
    }

    const canal = supabase
      .channel(`asistencia-panel-${clubId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'asistencia', filter: `club_id=eq.${clubId}`,
      }, refrescar)
      // Las clases extra viven en otra tabla, así que necesitan su propia
      // suscripción: sin esto, el profe que registra una desde el celular no la
      // ve aparecer en el computador del club.
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'clases_extraordinarias', filter: `club_id=eq.${clubId}`,
      }, refrescar)
      .subscribe()

    return () => {
      if (recargaPendiente.current) clearTimeout(recargaPendiente.current)
      void supabase.removeChannel(canal)
    }
  }, [cargarAsistenciasDia, cargarDatos, cargarExtras, clubId, fechaVista, hoy])

  /**
   * El jugador vino a un grupo que no es el suyo. Se cobra aparte.
   *
   * El bloque es opcional: si hay un horario elegido se usa ese, y si no queda
   * sin grupo hasta que alguien lo complete. Marcar que alguien vino tiene que
   * ser un toque; de qué grupo fue y cuánto cuesta se resuelve después.
   */
  async function registrarExtra(jugadorId: string, bloqueId?: string | null) {
    setRegistrando(jugadorId)
    // El `||` y no `??`: sin horario elegido `bloqueSel` es cadena vacía, no
    // null, y `??` no la atrapa. Esa cadena vacía llegaba a un campo uuid y la
    // base contestaba «invalid input syntax for type uuid: ""».
    //
    // Y el bloque solo si de verdad funciona hoy: desde que los filtros
    // muestran toda la semana, `bloqueSel` puede ser el del jueves. Colgarle la
    // clase extra de hoy a un bloque de otro día es dato falso; mejor sin
    // grupo, que después se completa desde el histórico.
    const delFiltro = bloquesDelDia.some(b => b.id === bloqueSel) ? bloqueSel : ''
    const bloque = (bloqueId ?? delFiltro) || null
    const res = await registrarClaseExtraordinaria({
      jugadorId, fecha: fechaVista, bloqueId: bloque,
      hora: fechaVista !== hoy && bloqueElegido ? hhmm(bloqueElegido.hora_inicio) : hora,
    })
    setRegistrando(null)
    if (res.error) {
      setMensaje({ tipo: 'error', texto: res.error })
      setTimeout(() => setMensaje(null), 6000)
      return
    }
    setBuscaOtro('')
    // La fecha que se está mirando, no hoy: anotar una visita en un día pasado
    // recargaba las extras de hoy y la recién creada no aparecía.
    await cargarExtras(fechaVista)
  }

  async function guardarMonto() {
    if (!modalMonto) return
    const monto = montoIngresado(montoTexto)
    if (monto != null && monto <= 0) { setErrorMonto('El monto tiene que ser mayor a cero.'); return }
    setGuardandoMonto(true)
    setErrorMonto('')
    const res = await asignarMontoClaseExtraordinaria({ id: modalMonto.id, monto })
    setGuardandoMonto(false)
    if (res.error) { setErrorMonto(res.error); return }
    setModalMonto(null)
    await cargarExtras(fechaVista)
  }

  async function borrarExtra(id: string) {
    if (!confirm('¿Borrar esta clase extra?')) return
    setEliminando(id)
    const res = await eliminarClaseExtraordinaria({ id })
    setEliminando(null)
    if (res.error) { setMensaje({ tipo: 'error', texto: res.error }); setTimeout(() => setMensaje(null), 6000); return }
    setModalMonto(null)
    await cargarExtras(fechaVista)
  }

  /**
   * Recarga lo que la pantalla está mostrando de verdad.
   *
   * Hay dos listas y cada una tiene su carga: la de hoy (`asistencias`) y la
   * del día que se está mirando (`asistenciasDia`). Llamar siempre a la de hoy
   * hacía que registrar en una fecha pasada guardara bien y no se viera: la
   * fila seguía ofreciendo "Marcar presente" como si el clic no hubiera hecho
   * nada, y quedaba pareciendo que el botón estaba roto.
   *
   * Va en una función y no repetido en cada sitio porque justamente eso fue lo
   * que falló: el borrado sí distinguía las dos listas y el registro no.
   */
  async function refrescarDia() {
    if (fechaVista === hoy) await cargarDatos()
    else await cargarAsistenciasDia(fechaVista)
  }

  /**
   * "Es de este grupo": convierte una visita mal anotada en asistencia normal.
   *
   * Primero marca la asistencia y después borra la extra, y no al revés: si el
   * borrado falla queda el día registrado dos veces —molesto pero visible y
   * recuperable—, mientras que al revés se perdería el registro entero.
   */
  async function convertirExtraEnAsistencia(jugadorId: string, extraId: string) {
    setRegistrando(jugadorId)
    const horaRegistro = fechaVista !== hoy && bloqueElegido ? hhmm(bloqueElegido.hora_inicio) : hora

    const marcada = await registrarAsistenciaAction(clubId!, jugadorId, fechaVista, horaRegistro)
    if (marcada.error) {
      setMensaje({ tipo: 'error', texto: marcada.error })
      setRegistrando(null)
      setTimeout(() => setMensaje(null), 6000)
      return
    }

    const borrada = await eliminarClaseExtraordinaria({ id: extraId })
    setRegistrando(null)
    if (borrada.error) {
      // El caso típico: la extra ya se cobró. La plata no se deshace desde acá.
      setMensaje({ tipo: 'error', texto: `Quedó marcada la asistencia, pero la clase extra no se pudo borrar: ${borrada.error}` })
      setTimeout(() => setMensaje(null), 9000)
    }
    await refrescarDia()
    await cargarExtras(fechaVista)
  }

  async function quitarAsistencia(jugadorId: string) {
    const id = asistenciaIdDe.get(jugadorId)
    if (!id) return
    const nombre = jugadores.find(j => j.id === jugadorId)?.nombre ?? 'este jugador'
    await handleEliminar(id, nombre)
  }

  /**
   * Marca ausente sin descontar sesión: el jugador estaba inscrito ese día y no
   * llegó. Pasa por `corregirAsistencia` para que el estado quede auditado y
   * las sesiones usadas se recalculen. Igual que Presente, se puede deshacer
   * desde el mismo botón (queda como "quitar" para volver a azul).
   */
  async function registrarAusente(jugadorId: string) {
    if (yaRegistrado.has(jugadorId)) return
    setRegistrando(jugadorId)
    const result = await corregirAsistencia({ jugadorId, fecha: fechaVista, estado: 'ausente' })
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(null)
      setTimeout(() => setMensaje(null), 6000)
      return
    }
    await refrescarDia()
    setRegistrando(null)
    setBusqueda('')
  }

  async function registrarAsistencia(jugadorId: string) {
    if (yaRegistrado.has(jugadorId)) return

    // Quien ese día no tiene ningún bloque no puede tener una asistencia
    // normal: no había clase suya que cumplir. Se registra directo como clase
    // extra, sin preguntar nada. Antes esto le descontaba una sesión del plan y
    // el día ni siquiera aparecía en su calendario, porque no estaba programado.
    if (esAdminOProfesor && bloquesDelDia.length > 0 && !tieneBloqueEseDia(jugadorId)) {
      await registrarExtra(jugadorId, null)
      return
    }

    setRegistrando(jugadorId)

    // La hora sale del bloque elegido cuando se completa un día pasado: poner
    // la hora actual dejaría una llegada a las once de la noche en una clase de
    // las cinco de la tarde.
    const horaRegistro = fechaVista !== hoy && bloqueElegido
      ? hhmm(bloqueElegido.hora_inicio)
      : hora

    // Sin conexión solo se encola el día de hoy: la cola se pensó para pasar
    // lista en la cancha, y completar un día viejo desde ahí sería adivinar.
    if (!navigator.onLine && fechaVista === hoy) {
      const jug = jugadores.find(j => j.id === jugadorId)
      const item: AsistenciaPendiente = {
        id: `pending-${jugadorId}-${hoy}`,
        clubId: clubId!,
        jugadorId,
        fecha: hoy,
        hora,
        jugadorNombre: jug?.nombre || '',
        creadoEn: marcaTiempoActual(),
      }
      await encolarAsistencia(item)
      setAsistencias(prev => [...prev, { id: item.id, jugador_id: jugadorId, hora, pendienteSync: true }])
      setPendientesCount(prev => prev + 1)
      setRegistrando(null)
      setBusqueda('')
      return
    }

    const result = await registrarAsistenciaAction(clubId!, jugadorId, fechaVista, horaRegistro)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(null)
      return
    }
    await refrescarDia()
    setRegistrando(null)
    setBusqueda('')
  }

  async function handleEliminar(asistenciaId: string, nombreJugador: string) {
    if (!confirm(`¿Eliminar asistencia de ${nombreJugador}?`)) return
    setEliminando(asistenciaId)
    const result = await eliminarAsistencia(asistenciaId)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
    } else {
      await refrescarDia()
    }
    setEliminando(null)
  }

  const esJugador = perfil?.rol === 'jugador'

  // El grupo que le toca hoy, solo para saludarlo con el nombre. Ya no decide
  // nada: el jugador no marca, así que no hay ventana que calcular.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const miBloqueAbierto = misBloquesHoy?.find((b: any) => ventanaAbierta(b.hora_inicio, b.hora_fin, hora)) ?? null
  // Recinto y horario, en ese orden: es como el profe piensa el día. Llega a
  // una sede, a una hora, y tiene a ese grupo enfrente.
  //
  // Solo los grupos de HOY. Antes salían los de toda la semana y eran diecisiete
  // pastillas un martes que tiene dos grupos: elegir una era encontrarse con
  // gente que hoy no entrena. Y esta lista escribe en la fecha de hoy, así que
  // ofrecer el grupo del jueves es invitar a marcar presente a quien no vino.
  //
  // Para alguien de otro grupo está "Vino alguien de otro grupo", que se busca
  // por nombre y queda como clase extra.
  const sedesHoy = [...new Set(bloquesDelDia.map(b => b.sede))].sort()
  // Con una sola sede no hay nada que elegir: el paso sobra y se salta.
  const sedeEfectiva = sedesHoy.length === 1 ? sedesHoy[0] : sedeSel
  const bloquesDeLaSede = (sedeEfectiva
    ? bloquesDelDia.filter(b => b.sede === sedeEfectiva)
    : bloquesDelDia
  ).slice().sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))

  const inscritosDelBloque = bloqueSel ? new Set(inscritosDe[bloqueSel] ?? []) : null

  const filtrados = jugadores.filter(j =>
    j.nombre?.toLowerCase().includes(busqueda.toLowerCase()) &&
    (!inscritosDelBloque || inscritosDelBloque.has(j.id))
  )

  const bloqueElegido = bloquesDelDia.find(b => b.id === bloqueSel) ?? null

  // Los que ese día no están en ningún bloque: para ellos, venir es una clase
  // extra. Sale de los bloques de la fecha elegida, no de la semana entera: si
  // contara toda la semana, nadie sería candidato nunca.
  const conBloqueEseDia = new Set(Object.values(inscritosDe).flat())
  function tieneBloqueEseDia(jugadorId: string) {
    return conBloqueEseDia.has(jugadorId)
  }

  // Candidatos a clase extra: cualquiera que no esté inscrito en el bloque
  // elegido. La base vuelve a comprobarlo antes de escribir.
  const yaTieneExtra = new Set(extrasHoy.map(e => e.jugador_id))
  const otrosJugadores = bloqueSel
    ? jugadores.filter(j =>
        !inscritosDelBloque?.has(j.id) &&
        !yaTieneExtra.has(j.id) &&
        j.nombre?.toLowerCase().includes(buscaOtro.toLowerCase()))
    : []

  const extrasMostradas = extrasHoy
  const nombreDe = (id: string) => jugadores.find(j => j.id === id)?.nombre ?? '—'
  const fmtMonto = (n: number | null) => n == null ? null : '$' + Number(n).toLocaleString('es-CL')

  const asistenciasMostradas = fechaVista === hoy ? asistencias : asistenciasDia

  // Quién ya está marcado en la fecha elegida. La lista de registro manual se
  // apaga con esto, así que tiene que salir del día que se está pasando y no
  // siempre de hoy.
  const yaRegistrado = new Set(asistenciasMostradas.map(a => a.jugador_id))

  // Para poder deshacer desde la misma lista: antes había que bajar a la tabla
  // de abajo a buscar la fila y apretar la cruz.
  const asistenciaIdDe = new Map(asistenciasMostradas.map(a => [a.jugador_id, a.id]))
  const estadoDe = new Map<string, string>(asistenciasMostradas.map(a => [a.jugador_id, a.estado ?? 'presente']))
  const extraDe = new Map(extrasHoy.map(e => [e.jugador_id, e]))

  // Registrar es lo que se hace en la cancha; completar un día viejo es otra
  // cosa y el botón tiene que decirlo antes de que lo aprieten.
  const etiquetaMarcar = fechaVista === hoy ? '✅ Registrar' : '✅ Marcar presente'

  /**
   * Una clase extra que no puede ser cierta: dice que el jugador vino de visita
   * a un grupo del que sí es parte ese día.
   *
   * Pasa cuando lo inscriben al grupo después de haberle anotado la visita —el
   * mismo día, más tarde—, porque la inscripción arranca a las 00:00 y alcanza
   * para atrás la clase que ya había ocurrido. La fila queda diciendo dos cosas
   * opuestas y hasta ahora no había forma de arreglarla desde acá.
   *
   * Venir a OTRO grupo un día en que además entrenás en el tuyo sí es legítimo,
   * y por eso no alcanza con "tiene extra y tiene grupo": se mira a qué grupo
   * apunta la extra.
   */
  function extraContradice(jugadorId: string) {
    const e = extraDe.get(jugadorId)
    if (!e) return false
    if (!tieneBloqueEseDia(jugadorId)) return false
    // Sin grupo anotado, la extra solo vale para quien ese día no entrenaba.
    if (!e.bloque_id) return true
    return (inscritosDe[e.bloque_id] ?? []).includes(jugadorId)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: hint }}>Cargando...</div>
  )

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: text, marginBottom: 4 }}>📋 Asistencia</h2>
        <p style={{ fontSize: 13, color: muted }}>Hoy {hoy} · ✅ {asistencias.length} registros</p>
      </div>

      {!online && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
          📡 Sin conexión — los registros se guardan localmente y se sincronizan automáticamente al recuperar internet
        </div>
      )}
      {online && pendientesCount > 0 && (
        <div style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#3730a3', fontWeight: 600 }}>
          🔄 Sincronizando {pendientesCount} {pendientesCount === 1 ? 'registro pendiente' : 'registros pendientes'}...
        </div>
      )}

      {mensaje && (
        <div style={{
          background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 12, padding: '14px 18px', marginBottom: 16, textAlign: 'center',
          fontSize: 14, fontWeight: 600, color: mensaje.tipo === 'ok' ? '#16a34a' : '#dc2626',
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* El día está marcado sin clase desde Horario. Acá solo se avisa: sin
          esto se podía pasar lista de un día que el club dio por suspendido. */}
      {esAdminOProfesor && suspension && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#c2410c' }}>
          <strong>🚫 Este día está marcado sin clase</strong>
          {suspension.motivo ? ` — ${suspension.motivo}` : ''}
          {` · ${suspension.grupos} grupo${suspension.grupos === 1 ? '' : 's'}.`}
          <div style={{ fontSize: 12, marginTop: 3, color: muted }}>
            No cuenta para el porcentaje de nadie. Si al final sí hubo clase, se restaura desde Horario → Día sin clase.
          </div>
        </div>
      )}

      {/* ESTADO DEL JUGADOR — sin botón: la asistencia la pasa el profe */}
      {esJugador && jugadorPropio && (
        <div style={{ ...card, padding: 24, marginBottom: 20, textAlign: 'center' }}>
          {yaRegistroHoy ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>Asistencia registrada</div>
              <div style={{ fontSize: 13, color: muted }}>Tu profesor ya te marcó hoy. ¡Buen entrenamiento!</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏓</div>
              <div style={{ fontSize: 16, color: text, marginBottom: 6 }}>Hola, {jugadorPropio.nombre?.split(' ')[0]}</div>
              <div style={{ fontSize: 13, color: muted }}>
                {miBloqueAbierto
                  ? `Hoy te toca ${miBloqueAbierto.nombre}.`
                  : 'Todavía no tienes asistencia registrada hoy.'}
              </div>
            </>
          )}
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '12px 16px', marginTop: 16, fontSize: 13, color: '#1e40af', lineHeight: 1.5,
          }}>
            La asistencia ahora la registra tu profesor al pasar lista. Si crees que falta
            un día tuyo, avísale a él o al administrador del club.
          </div>
        </div>
      )}

      {/* ASISTENCIAS DEL DÍA */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text, textTransform: 'capitalize' }}>
          Asistencias {fechaVista === hoy ? 'de hoy' : `del ${formatFechaLarga(fechaVista)}`} ({asistenciasMostradas.length})
          {extrasMostradas.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 600, color: '#a16207' }}>
              · {extrasMostradas.length} clase{extrasMostradas.length === 1 ? '' : 's'} extra
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            {cargandoDia ? (
              <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Cargando...</div>
            ) : asistenciasMostradas.length === 0 && extrasMostradas.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: hint, fontSize: 13 }}>Sin asistencias registradas este día</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Jugador</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase' }}>Hora</th>
                    {esAdminOProfesor && <th style={{ padding: '10px 16px', width: 60 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {asistenciasMostradas.map(a => {
                    const jug = jugadores.find(j => j.id === a.jugador_id)
                    const filaAusente = a.estado === 'ausente'
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9', background: filaAusente ? '#fef2f2' : undefined }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: text }}>
                          {jug?.nombre || '—'}
                          {filaAusente && (
                            <span style={{ marginLeft: 8, background: '#dc2626', color: 'white',
                              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                              AUSENTE
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums' }}>{a.hora?.slice(0, 5)}</td>
                        {esAdminOProfesor && (
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {a.pendienteSync ? (
                              <span style={{ background: '#ede9fe', color: '#3730a3', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⏳ pendiente</span>
                            ) : (
                              <button onClick={() => handleEliminar(a.id, jug?.nombre || '')} disabled={eliminando === a.id} style={{ background: 'none', border: 'none', color: '#dc262688', cursor: eliminando === a.id ? 'not-allowed' : 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 6, opacity: eliminando === a.id ? 0.4 : 1 }} title="Eliminar asistencia">✕</button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {/* Las clases extra, en amarillo. Tocar el nombre abre el
                      monto: es donde el profe se acuerda de cobrarla. */}
                  {extrasMostradas.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fefce8' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: text }}>
                        {nombreDe(e.jugador_id)}
                        <span style={{ marginLeft: 8, background: '#eab308', color: '#422006',
                          padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                          CLASE EXTRA
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums' }}>
                        {e.hora?.slice(0, 5)}
                      </td>
                      {esAdminOProfesor && (
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {puedeMontos ? (
                            <button
                              onClick={() => { setModalMonto(e); setMontoTexto(e.monto != null ? String(e.monto) : ''); setErrorMonto('') }}
                              style={{ background: e.monto != null ? '#fff' : '#fff7ed',
                                border: `1px solid ${e.monto != null ? '#e2e8f0' : '#fed7aa'}`,
                                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                color: e.monto != null ? text : '#c2410c', cursor: 'pointer' }}>
                              {fmtMonto(e.monto) ?? SIN_CUOTA}
                            </button>
                          ) : (
                            // El profesor la ve registrada pero no le pone precio.
                            <span style={{ fontSize: 11, color: hint }}>
                              {fmtMonto(e.monto) ?? 'la cobra el admin'}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {esAdminOProfesor && clubId && (
            <div style={{ borderLeft: '1px solid #e2e8f0', padding: 16 }}>
              <MiniCalendarioAsistencia clubId={clubId} fechaSeleccionada={fechaVista} onSeleccionar={setFechaVista} hoy={hoy} />
            </div>
          )}
        </div>
      </div>

      {/* GRÁFICO DE ASISTENCIA (Admin/Profesor) */}
      {esAdminOProfesor && clubId && (
        <div style={{ marginBottom: 24 }}>
          <GraficoAsistencia clubId={clubId} modo="completo" />
        </div>
      )}

      {/* REGISTRO MANUAL (Admin/Profesor) */}
      {esAdminOProfesor && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:10, marginBottom: 12, flexWrap:'wrap' }}>
            {/* Dice "de hoy" porque escribe en la fecha de hoy aunque arriba se
                esté mirando otro día: sin decirlo, el profe cree que está
                completando el día que tiene a la vista. */}
            <div style={{ fontSize: 13, fontWeight: 600, color: text }}>
              ✏️ Registro manual {fechaVista !== hoy && <span style={{ fontWeight: 400, color: '#c2410c', textTransform: 'capitalize' }}>— {formatFechaLarga(fechaVista)}</span>}
            </div>
            <div style={{ fontSize: 12, color: muted }}>
              {bloqueElegido
                ? `${filtrados.filter(j => yaRegistrado.has(j.id)).length} de ${filtrados.length} en ${bloqueElegido.nombre}`
                : `${yaRegistrado.size} de ${jugadores.length} registrados`}
            </div>
          </div>
          <input
            style={{ width: '100%', boxSizing:'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none', marginBottom: 10 }}
            placeholder="Buscar por nombre para achicar la lista..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />

          {/* Los filtros van plegados: sin abrirlos se ve la lista completa,
              que es lo que el profe usa la mayoría de las veces. */}
          <button onClick={() => setFiltrosAbiertos(a => !a)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
              padding: '2px 0 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: muted }}>
            <span style={{ display: 'inline-block', transition: 'transform var(--rapido) var(--curva)',
              transform: filtrosAbiertos ? 'rotate(90deg)' : 'none' }}>▸</span>
            Filtros
            {(fechaVista !== hoy || bloqueElegido) && (
              <span style={{ background: '#ede9fe', color: '#3730a3', borderRadius: 20, padding: '2px 9px', fontSize: 11 }}>
                {fechaVista !== hoy ? formatFechaLarga(fechaVista) : ''}
                {fechaVista !== hoy && bloqueElegido ? ' · ' : ''}
                {bloqueElegido?.nombre ?? ''}
              </span>
            )}
          </button>

          {filtrosAbiertos && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10,
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>

              {/* La fecha manda sobre todo lo demás: cambia qué grupos existen,
                  quiénes estaban inscritos entonces y dónde se escribe. */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11, color: hint, fontWeight: 600, minWidth: 54 }}>Día</span>
                <input type="date" value={fechaVista} max={hoy}
                  onChange={e => { if (e.target.value) { setFechaVista(e.target.value); setBloqueSel('') } }}
                  style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                    padding: '7px 10px', color: text, fontSize: 13, outline: 'none' }} />
                {fechaVista !== hoy && (
                  <button onClick={() => { setFechaVista(hoy); setBloqueSel('') }}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer' }}>
                    Volver a hoy
                  </button>
                )}
              </div>

              {bloquesDelDia.length === 0 && (
                <div style={{ fontSize: 11, color: hint }}>
                  Ese día no funciona ningún grupo.
                </div>
              )}
            </div>
          )}

          {/* Recinto y horario del día elegido. Elegir uno deja en la lista
              exactamente a sus inscritos, y a nadie más. */}
          {filtrosAbiertos && bloquesDelDia.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10,
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
              {sedesHoy.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 11, color: hint, fontWeight: 600, minWidth: 54 }}>Recinto</span>
                  {sedesHoy.map(s => {
                    // Con una sola sede el recinto igual se muestra: es el dato
                    // de dónde se juega hoy. Va prendido y no se puede apagar,
                    // porque apagarlo no cambiaría la lista y solo confunde.
                    const unica = sedesHoy.length === 1
                    const activo = unica || sedeSel === s
                    return (
                      <button key={s} disabled={unica}
                        onClick={() => { setSedeSel(activo ? '' : s); setBloqueSel('') }}
                        style={{ padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 20,
                          cursor: unica ? 'default' : 'pointer',
                          border: `1px solid ${activo ? '#4f46e5' : '#e2e8f0'}`,
                          background: activo ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#ffffff',
                          color: activo ? '#ffffff' : muted }}>
                        {sedeLabel(s)}
                      </button>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, color: hint, fontWeight: 600, minWidth: 54 }}>Horario</span>
                <button onClick={() => setBloqueSel('')}
                  style={{ padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${bloqueSel === '' ? '#4f46e5' : '#e2e8f0'}`,
                    background: bloqueSel === '' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#ffffff',
                    color: bloqueSel === '' ? '#ffffff' : muted }}>
                  Todos ({jugadores.length})
                </button>
                {bloquesDeLaSede.map(b => {
                  const activo = bloqueSel === b.id
                  const cuantos = (inscritosDe[b.id] ?? []).length
                  // El nombre del grupo va en la pastilla: dos grupos del mismo
                  // día pueden empezar a la misma hora en sedes distintas, y por
                  // la hora sola no se distinguen.
                  return (
                    <button key={b.id} onClick={() => setBloqueSel(activo ? '' : b.id)}
                      style={{ padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                        border: `1px solid ${activo ? '#4f46e5' : '#e2e8f0'}`,
                        background: activo ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#ffffff',
                        color: activo ? '#ffffff' : muted }}>
                      {rangoHorario(b.hora_inicio, b.hora_fin)} · {b.nombre} · {cuantos}
                    </button>
                  )
                })}
              </div>

              {bloqueElegido && (
                <div style={{ fontSize: 11, color: hint }}>
                  {sedeLabel(bloqueElegido.sede)} · {filtrados.length} inscritos
                </div>
              )}
            </div>
          )}
          {/* La lista completa se ve sin buscar: es la única forma de pasar
              lista, así que tiene que estar toda a mano. */}
          <div style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 520, overflowY: 'auto' }}>
              {filtrados.map(j => {
                const ya = yaRegistrado.has(j.id)
                const estado = estadoDe.get(j.id)
                const esAusente = ya && estado === 'ausente'
                const extra = extraDe.get(j.id)
                const contradice = extraContradice(j.id)
                // Quien ese día no tiene ningún grupo no puede tener asistencia
                // normal: lo suyo es siempre una clase extra. El botón lo dice
                // desde antes de apretarlo, en vez de avisarlo después.
                const esExtra = bloquesDelDia.length > 0 && !tieneBloqueEseDia(j.id)
                // La fila solo se apaga cuando el día quedó resuelto de verdad.
                // Tener una clase extra ya no la congela: esa era la única razón
                // por la que una contradicción no se podía arreglar desde acá.
                const resuelto = ya
                const enCurso = registrando === j.id
                return (
                  <div key={j.id}
                    onClick={() => {
                      if (resuelto || enCurso) return
                      if (contradice && extra) void convertirExtraEnAsistencia(j.id, extra.id)
                      else void registrarAsistencia(j.id)
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
                      borderBottom: '1px solid #e2e8f0', cursor: resuelto || enCurso ? 'default' : 'pointer', opacity: resuelto ? 0.6 : 1,
                      background: esAusente ? '#fef2f2' : contradice ? '#fef2f2' : esExtra && !resuelto ? '#fffbeb' : undefined }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{j.nombre}</div>
                      <div style={{ fontSize: 11, color: muted }}>
                        {j.sesiones_usadas}/{j.sesiones_limite} sesiones · {j.categoria}
                        {esExtra && <span style={{ color: '#a16207', fontWeight: 600 }}> · ese día no entrena</span>}
                        {contradice && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · anotado como visita, pero es de este grupo</span>}
                      </div>
                    </div>
                    {enCurso
                      ? <span style={{ color: muted, fontSize: 12 }}>Guardando...</span>
                      : ya
                        ? esAusente
                          ? <button onClick={e => { e.stopPropagation(); void quitarAsistencia(j.id) }}
                              title="Quitar la ausencia de este día"
                              style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✗ Ausente</button>
                          : <button onClick={e => { e.stopPropagation(); void quitarAsistencia(j.id) }}
                              title="Quitar la asistencia de este día"
                              style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✅ Registrado</button>
                        : contradice
                          ? <button style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>Es de este grupo</button>
                          : extra
                            // Vino a otro grupo y además le tocaba el suyo: las dos
                            // cosas son ciertas, así que se avisa y se deja marcar.
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ background: '#fef9c3', color: '#713f12', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>🟡 Clase extra</span>
                                <button style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{etiquetaMarcar}</button>
                              </div>
                            : esExtra
                              ? <button style={{ background: '#eab308', color: '#422006', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>🟡 Clase extra</button>
                              // No registrado y le tocaba entrenar: dos botones.
                              // El de presente sigue disparándose al tocar la fila,
                              // así que el clic ancho de siempre no cambia; el de
                              // ausente detiene la propagación para que solo él actúe.
                              : <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <button style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{etiquetaMarcar}</button>
                                  <button onClick={e => { e.stopPropagation(); void registrarAusente(j.id) }}
                                    title="Marcar ausente"
                                    style={{ background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✗ Ausente</button>
                                </div>
                    }
                  </div>
                )
              })}
              {filtrados.length === 0 && <div style={{ padding: 16, color: muted, fontSize: 13, textAlign: 'center' }}>Sin resultados</div>}
          </div>

          {/* Vino alguien que no es de este grupo. Necesita un bloque elegido:
              sin saber a qué horario vino no se puede cobrar la clase. Sirve
              también para días pasados, porque escribe en la fecha elegida. */}
          {bloqueElegido && (
            <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              {!mostrarOtros ? (
                <button onClick={() => setMostrarOtros(true)}
                  style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 8,
                    padding: '8px 13px', fontSize: 12, fontWeight: 600, color: '#713f12', cursor: 'pointer' }}>
                  ＋ Vino alguien de otro grupo
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#713f12' }}>Clase extra</div>
                    <button onClick={() => { setMostrarOtros(false); setBuscaOtro('') }}
                      style={{ background: 'none', border: 'none', color: muted, fontSize: 12, cursor: 'pointer' }}>
                      Cerrar
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: hint, marginBottom: 8 }}>
                    Queda registrada en {rangoHorario(bloqueElegido.hora_inicio, bloqueElegido.hora_fin)}.
                    No le descuenta sesiones y se cobra aparte.
                  </div>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', background: '#fffbeb', border: '1px solid #fde047',
                      borderRadius: 8, padding: '9px 12px', color: text, fontSize: 13, outline: 'none', marginBottom: 8 }}
                    placeholder="Buscar al jugador que vino..."
                    value={buscaOtro} onChange={e => setBuscaOtro(e.target.value)}
                  />
                  {buscaOtro.trim().length > 0 && (
                    <div style={{ border: '1px solid #fde047', borderRadius: 8, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                      {otrosJugadores.slice(0, 25).map(j => (
                        <div key={j.id} onClick={() => registrarExtra(j.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderBottom: '1px solid #fef9c3', cursor: 'pointer', background: '#fffbeb' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{j.nombre}</span>
                          {registrando === j.id
                            ? <span style={{ color: muted, fontSize: 12 }}>Registrando...</span>
                            : <span style={{ background: '#eab308', color: '#422006', border: 'none', borderRadius: 6,
                                padding: '5px 11px', fontSize: 11, fontWeight: 700 }}>Clase extra</span>}
                        </div>
                      ))}
                      {otrosJugadores.length === 0 && (
                        <div style={{ padding: 14, color: muted, fontSize: 12, textAlign: 'center', background: '#fffbeb' }}>
                          Sin resultados
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cuánto se le cobra por la clase extra */}
      {modalMonto && (
        <div className="anim-fondo" onClick={e => { if (e.target === e.currentTarget) setModalMonto(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 }}>
          <div className="anim-modal" style={{ ...card, padding: 22, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>Clase extra</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 2, marginBottom: 16 }}>
              {nombreDe(modalMonto.jugador_id)}
            </div>

            <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 5 }}>Monto a cobrar (CLP)</label>
            <input type="number" autoFocus
              style={{ width: '100%', boxSizing: 'border-box', background: '#f4f7fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '10px 12px', color: text, fontSize: 14, outline: 'none' }}
              value={montoTexto} onChange={e => setMontoTexto(e.target.value)} />
            <div style={{ fontSize: 11, color: hint, marginTop: 6, marginBottom: 16 }}>
              Si todavía no sabés cuánto, dejalo vacío: queda como &ldquo;{SIN_CUOTA}&rdquo;.
            </div>

            {errorMonto && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '9px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                {errorMonto}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalMonto(null)}
                style={{ flex: 1, padding: 11, background: 'transparent', border: '1px solid #e2e8f0',
                  borderRadius: 8, color: muted, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarMonto} disabled={guardandoMonto}
                style={{ flex: 1, padding: 11, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {guardandoMonto ? 'Guardando...' : 'Guardar'}
              </button>
            </div>

            <button onClick={() => borrarExtra(modalMonto.id)} disabled={eliminando === modalMonto.id}
              style={{ width: '100%', padding: '9px 14px', marginTop: 10, borderRadius: 8, fontSize: 12,
                border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>
              {eliminando === modalMonto.id ? 'Borrando...' : 'Borrar esta clase extra'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

/* ── Mini calendario para elegir el día a revisar ── */
function MiniCalendarioAsistencia({ clubId, fechaSeleccionada, onSeleccionar, hoy }: {
  clubId: string
  fechaSeleccionada: string
  onSeleccionar: (fecha: string) => void
  hoy: string
}) {
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [diasConDatos, setDiasConDatos] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function cargar() {
      const supabase = createClient()
      const inicio = new Date(anio, mes, 1).toISOString().slice(0, 10)
      const fin = new Date(anio, mes + 1, 0).toISOString().slice(0, 10)
      const { data } = await supabase.from('asistencia').select('fecha').eq('club_id', clubId).gte('fecha', inicio).lte('fecha', fin).limit(200)
      const dias = new Set((data || []).map((d: any) => d.fecha))
      setDiasConDatos(dias)
    }
    if (clubId) cargar()

    const canal = supabase
      .channel(`asistencia-calendario-${clubId}-${anio}-${mes}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'asistencia', filter: `club_id=eq.${clubId}`,
      }, () => { void cargar() })
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [clubId, mes, anio])

  function cambiarMes(dir: number) {
    let nuevoMes = mes + dir
    let nuevoAnio = anio
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++ }
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio-- }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const primerDia = new Date(anio, mes, 1).getDay()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const nombresDias = ['Su', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

  return (
    <div style={{ width: 230 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => cambiarMes(-1)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, color: muted, cursor: 'pointer', width: 22, height: 22 }}>‹</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: text }}>{nombresMes[mes]} {anio}</span>
        <button onClick={() => cambiarMes(1)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 6, color: muted, cursor: 'pointer', width: 22, height: 22 }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {nombresDias.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: hint, fontWeight: 600, padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', rowGap: 2 }}>
        {Array.from({ length: primerDia }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const dia = i + 1
          const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
          const esHoy = fecha === hoy
          const esSeleccionado = fecha === fechaSeleccionada
          const tieneDatos = diasConDatos.has(fecha)
          return (
            <div key={dia} onClick={() => onSeleccionar(fecha)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, cursor: 'pointer', padding: '2px 0' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: esSeleccionado || esHoy ? 700 : 400,
                background: esSeleccionado ? '#4f46e5' : esHoy ? '#ede9fe' : 'transparent',
                color: esSeleccionado ? 'white' : esHoy ? '#3730a3' : text,
              }}>
                {dia}
              </div>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: tieneDatos ? '#4f46e5' : 'transparent' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
