'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { fechaChile } from '@/lib/domain/fechaChile'
import DocumentosJugador from '@/components/DocumentosJugador'
import MarcasAuspiciadores from '@/components/MarcasAuspiciadores'
import { useModulos } from '@/lib/hooks/useModulos'
import { firmarUrl } from '@/lib/supabase/privado'
import { cargarHistorialJugador } from '@/lib/supabase/historial'
import { sesionesDelMes, type SesionesMes } from '@/lib/domain/historialAsistencia'
import { cuentaDelJugador, tieneExtrasPendientes, type ClaseExtraJugador } from '@/lib/domain/estadoCuenta'
import { useEnVivo } from '@/lib/useEnVivo'
import RankingJugador from '@/components/RankingJugador'

const CAMPOS_FICHA = 'id,nombre,categoria,tipo_plan,sesiones_usadas,sesiones_limite,foto_path,rut,email,telefono,fecha_nacimiento,direccion,comuna,contacto_emergencia_nombre,contacto_emergencia_telefono,indicaciones_medicas,talla_polera,talla_short'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaLarga(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${Number(d)} de ${MESES[Number(m) - 1] ?? m} de ${y}`
}

function edadDesde(fecha: string | null | undefined): number | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha.slice(0, 10))) return null
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const [hy, hm, hd] = fechaChile().split('-').map(Number)
  let edad = hy - y
  if (hm < m || (hm === m && hd < d)) edad--
  return edad
}

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

function Dato({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
      <span style={{ fontSize: 12, color: muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: value ? text : hint, fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}

// El perfil ya no sigue el torneo en vivo: se fueron el banner, los avisos
// animados, las felicitaciones al campeón y las tres suscripciones en tiempo
// real que los alimentaban. El jugador ve lo suyo —su plan, sus sesiones, sus
// asistencias, su feedback— y el ranking de su categoría vive en su módulo.

export default function PerfilPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugador, setJugador] = useState<any>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [extrasImpagas, setExtrasImpagas] = useState<ClaseExtraJugador[]>([])
  const [loading, setLoading] = useState(true)
  const [yaRegistroHoy, setYaRegistroHoy] = useState(false)
  // Se derivan de los bloques, no de las columnas de `jugadores`: esas son un
  // caché que arrastraba el total del mes anterior hasta que alguien volviera
  // a pasar lista. Ver sesionesDelMes().
  const [sesiones, setSesiones] = useState<SesionesMes | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const { tiene } = useModulos()

  const hoy = fechaChile()

  const cargar = useCallback(async () => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }

    if (perfil.jugador_id) {
      const mesActual = new Date().getMonth() + 1
      const anioActual = new Date().getFullYear()

      // Todo lo suyo, en paralelo.
      const resultados = await Promise.all([
        supabase.from('jugadores').select(CAMPOS_FICHA).eq('id', perfil.jugador_id).single(),
        // Solo presencias: la lista se llama "Últimas asistencias" y el aviso
        // de hoy dice "¡Buen entrenamiento!" — una falta registrada no es eso.
        supabase.from('asistencia').select('id,jugador_id,fecha,hora').eq('jugador_id', perfil.jugador_id).eq('estado', 'presente').order('fecha', { ascending: false }).limit(10),
        supabase.from('mensualidades').select('id,mes,anio,monto,estado').eq('jugador_id', perfil.jugador_id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
        supabase.from('asistencia').select('id').eq('jugador_id', perfil.jugador_id).eq('fecha', hoy).eq('estado', 'presente'),
        // Las clases extra impagas también son deuda. Sin esto el hero decía
        // "✅ Pagado" mientras Mi Estado de Cuenta —la pantalla de al lado—
        // decía "Pendiente $3.000" del mismo jugador el mismo día.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('clases_extraordinarias').select('id,fecha,monto,pagada_en').eq('jugador_id', perfil.jugador_id).is('pagada_en', null),
      ])

      const errorInicial = resultados.find(resultado => resultado.error)?.error
      if (errorInicial) {
        setMensaje({ tipo: 'error', texto: `No se pudo cargar el perfil: ${errorInicial.message}` })
        setLoading(false)
        return
      }

      const [
        { data: j },
        { data: a },
        { data: mens },
        { data: asistHoy },
        { data: ex },
      ] = resultados

      setJugador(j)
      setFotoUrl(await firmarUrl((j as any)?.foto_path))
      setAsistencias(a || [])
      setMensualidadActual(mens)
      setYaRegistroHoy((asistHoy || []).length > 0)
      setExtrasImpagas((ex ?? []) as ClaseExtraJugador[])

      // Las sesiones del mes salen del calendario de sus bloques, igual que
      // en Asistencia Histórica, para que las dos pantallas no puedan decir
      // números distintos.
      if (perfil.club_id) {
        // El mes entero, no hasta hoy: el límite incluye los días que faltan,
        // y un feriado ya cargado para el 20 tiene que descontarse desde ya.
        const desde = `${hoy.slice(0, 7)}-01`
        const hasta = `${hoy.slice(0, 7)}-${new Date(anioActual, mesActual, 0).getDate()}`
        const historial = await cargarHistorialJugador(perfil.club_id, perfil.jugador_id, desde, hasta)
        setSesiones(sesionesDelMes(perfil.jugador_id, { ...historial, hoy }, hoy))
      }
    }
    setLoading(false)
  }, [authLoading, perfil, hoy, router, supabase])

  useEffect(() => { void cargar() }, [cargar])
  // Si el jugador (o el admin) cambia la ficha, esta pantalla se actualiza sola.
  useEnVivo(['jugadores'], perfil?.club_id ?? null, cargar, { conClub: ['jugadores'] })

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  if (!jugador) return (
    <AppLayout perfil={perfil}>
      <div style={{ ...card, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏓</div>
        <div style={{ fontSize: 16, color: text, marginBottom: 8 }}>Perfil no vinculado</div>
        <div style={{ fontSize: 13, color: muted }}>Contacta al administrador del club</div>
      </div>
    </AppLayout>
  )

  const iniciales = jugador.nombre?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  // El estado de la cuenta entera, no solo de la cuota: una clase extra impaga
  // es plata que debe, y decirle "Pagado" mientras Mi Estado de Cuenta le cobra
  // $3.000 es la clase de contradicción por la que deja de creerle a las dos.
  const cuenta = cuentaDelJugador(mensualidadActual, extrasImpagas)
  const mensEstado = mensualidadActual?.estado
  const estadoCuenta = !mensEstado && !tieneExtrasPendientes(cuenta) ? null
    : cuenta.total === 0 ? 'pagado'
    : mensEstado === 'atrasado' ? 'atrasado'
    : 'pendiente'
  const mensLabel = estadoCuenta === 'pagado' ? '✅ Pagado' : estadoCuenta === 'atrasado' ? '❌ Atrasado' : estadoCuenta === 'pendiente' ? '⚠️ Pendiente' : '—'
  const mensColor = estadoCuenta === 'pagado' ? '#86efac' : estadoCuenta === 'atrasado' ? '#fca5a5' : estadoCuenta === 'pendiente' ? '#fde68a' : 'rgba(255,255,255,0.7)'
  const edad = edadDesde(jugador.fecha_nacimiento)
  const nacimiento = fechaLarga(jugador.fecha_nacimiento)
  const nacimientoLabel = nacimiento ? (edad !== null ? `${nacimiento} (${edad} años)` : nacimiento) : null
  const tallasLabel = [jugador.talla_polera && `Polera ${jugador.talla_polera}`, jugador.talla_short && `Short ${jugador.talla_short}`].filter(Boolean).join(' · ') || null
  const direccionLabel = [jugador.direccion, jugador.comuna].filter(Boolean).join(', ') || null
  const emergenciaLabel = [jugador.contacto_emergencia_nombre, jugador.contacto_emergencia_telefono].filter(Boolean).join(' · ') || null
  const indicaciones = jugador.indicaciones_medicas && jugador.indicaciones_medicas.toLowerCase() !== 'no' ? jugador.indicaciones_medicas : null

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt={jugador.nombre} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0 }}>
              {iniciales}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{jugador.nombre}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{jugador.categoria}</div>
          </div>
          <button
            onClick={() => router.push('/configuracion')}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
          >
            Editar datos →
          </button>
        </div>

        {/* Estado de la cuota. El contador de torneos que estaba al lado se
            quitó: al jugador no le dice nada del entrenamiento. */}
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: mensColor, lineHeight: 1.8 }}>{mensLabel}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
            {tieneExtrasPendientes(cuenta) ? 'Mensualidad + clases extra' : 'Mensualidad'}
          </div>
        </div>

        {/* Sesiones del mes — salen de los días que le tocan según sus bloques. */}
        {jugador.tipo_plan !== 'libre' && sesiones && sesiones.limite > 0 && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Sesiones del mes</span>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{sesiones.usadas}/{sesiones.limite}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 4, height: 6 }}>
              <div style={{ width: `${Math.min((sesiones.usadas / sesiones.limite) * 100, 100)}%`, background: sesiones.usadas >= sesiones.limite ? '#fca5a5' : '#fff', borderRadius: 4, height: '100%', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Ficha: los mismos datos que se editan en Configuración. Sin esto el
          jugador guardaba el RUT y volvía acá y no veía nada. */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text }}>Mis datos</div>
          <button
            onClick={() => router.push('/configuracion')}
            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: muted, cursor: 'pointer', fontWeight: 600 }}
          >
            Editar
          </button>
        </div>
        <div style={{ padding: '4px 20px 8px' }}>
          <Dato label="Nombre" value={jugador.nombre} />
          <Dato label="RUT" value={jugador.rut} />
          <Dato label="Nacimiento" value={nacimientoLabel} />
          <Dato label="Correo" value={jugador.email} />
          <Dato label="Teléfono" value={jugador.telefono} />
          <Dato label="Dirección" value={direccionLabel} />
          <Dato label="Tallas" value={tallasLabel} />
          <Dato label="Emergencia" value={emergenciaLabel} />
          {indicaciones && <Dato label="Indicaciones médicas" value={indicaciones} />}
        </div>
      </div>

      {/* Auspiciadores — los mismos tres logos que ve el admin en su dashboard.
          Los descuentos son de los jugadores: son ellos los que los usan, así
          que tienen que estar donde ellos entran.

          `esStaff={false}` es lo único que cambia respecto del dashboard: sin
          eso, el componente muestra los botones de subir y borrar, y también
          los vouchers dados de baja. Acá solo ve los activos, y los mira. */}
      {tiene('tienda_buin') && (
        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: text, marginBottom: 10 }}>
            🎟️ Descuentos para socios
          </div>
          <MarcasAuspiciadores
            clubId={perfil?.club_id ?? null}
            esStaff={false}
            borderColor="#e2e8f0"
          />
        </div>
      )}

      {/* Marcar asistencia */}
      {mensaje && (
        <div style={{ background: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, textAlign: 'center', fontSize: 14, fontWeight: 600, color: mensaje.tipo === 'ok' ? '#16a34a' : '#dc2626' }}>
          {mensaje.texto}
        </div>
      )}

      {/* La asistencia la registra el profe. El jugador ve si ya quedó marcado,
          pero no puede marcarse: lo decidió el club y lo impone la migración 105. */}
      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        {yaRegistroHoy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Asistencia registrada</div>
              <div style={{ fontSize: 12, color: muted }}>¡Buen entrenamiento hoy!</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>🏓</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: text }}>Todavía sin asistencia hoy</div>
              <div style={{ fontSize: 12, color: muted }}>Tu profesor la registra al pasar lista.</div>
            </div>
          </div>
        )}
      </div>



      {/* Su posición en el ranking. Antes solo existía en la pantalla Ranking y
          dentro del PDF del informe, así que el jugador tenía que ir a buscarse
          en una lista de treinta para saber cómo va. */}
      {perfil?.club_id && perfil?.jugador_id && (
        <div style={{ marginBottom: 16 }}>
          <RankingJugador clubId={perfil.club_id} jugadorId={perfil.jugador_id} titulo="Mi ranking" />
        </div>
      )}

      {/* Documentos firmados — el jugador puede subir los suyos */}
      {perfil?.jugador_id && (
        <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
            Mis documentos
          </div>
          <div style={{ paddingTop: 12 }}>
            <DocumentosJugador jugadorId={perfil.jugador_id} puedeEditar />
          </div>
        </div>
      )}

      {/* Últimas asistencias */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: text }}>
          Últimas asistencias
        </div>
        {asistencias.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: hint, fontSize: 13 }}>Sin asistencias registradas</div>
        ) : asistencias.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13, color: text }}>{a.fecha}</span>
            <span style={{ fontSize: 13, color: muted }}>{a.hora?.slice(0, 5)}</span>
          </div>
        ))}
      </div>
    </AppLayout>
  )
}

