'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { registrarAsistenciaAction } from '@/app/actions/asistencia'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import { trimestreActual } from '@/lib/domain/trimestre'
import DocumentosJugador from '@/components/DocumentosJugador'
import MarcasAuspiciadores from '@/components/MarcasAuspiciadores'
import { useModulos } from '@/lib/hooks/useModulos'

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

// El perfil ya no sigue el torneo en vivo: se fueron el banner, los avisos
// animados, las felicitaciones al campeón y las tres suscripciones en tiempo
// real que los alimentaban. El jugador ve lo suyo —su plan, sus sesiones, sus
// asistencias, su feedback— y el ranking de su categoría vive en su módulo.

export default function PerfilPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [jugador, setJugador] = useState<any>(null)
  const [asistencias, setAsistencias] = useState<any[]>([])
  const [mensualidadActual, setMensualidadActual] = useState<any>(null)
  const [evaluaciones, setEvaluaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [yaRegistroHoy, setYaRegistroHoy] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [aceptandoCompromiso, setAceptandoCompromiso] = useState(false)
  const [supabase] = useState(() => createClient())
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()
  const { tiene } = useModulos()

  const trimestre = trimestreActual()
  const hoy = fechaChile()
  const hora = horaChile()

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }

      if (perfil.jugador_id) {
        const mesActual = new Date().getMonth() + 1
        const anioActual = new Date().getFullYear()

        // Todo lo suyo, en paralelo.
        const resultados = await Promise.all([
          supabase.from('jugadores').select('id,nombre,categoria,tipo_plan,sesiones_usadas,sesiones_limite').eq('id', perfil.jugador_id).single(),
          supabase.from('asistencia').select('id,jugador_id,fecha,hora').eq('jugador_id', perfil.jugador_id).order('fecha', { ascending: false }).limit(10),
          supabase.from('mensualidades').select('id,mes,anio,estado').eq('jugador_id', perfil.jugador_id).eq('mes', mesActual).eq('anio', anioActual).maybeSingle(),
          supabase.from('evaluaciones_trimestrales').select('id,periodo_trimestre,feedback_profesor,meta_proximo_periodo,firmado_alumno,creado_en').eq('jugador_id', perfil.jugador_id).order('creado_en', { ascending: false }).limit(2),
          supabase.from('asistencia').select('id').eq('jugador_id', perfil.jugador_id).eq('fecha', hoy),
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
          { data: evs },
          { data: asistHoy },
        ] = resultados

        setJugador(j)
        setAsistencias(a || [])
        setMensualidadActual(mens)
        setEvaluaciones(evs || [])
        setYaRegistroHoy((asistHoy || []).length > 0)
      }
      setLoading(false)
    }
    cargar()
  }, [authLoading, perfil, hoy, router, supabase])

  async function handleMarcarAsistencia() {
    if (!jugador || !perfil?.club_id) return
    setMostrarConfirm(false)
    setRegistrando(true)
    const result = await registrarAsistenciaAction(perfil.club_id, jugador.id, hoy, hora)
    if (result.error) {
      setMensaje({ tipo: 'error', texto: result.error })
      setRegistrando(false)
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
      msgTimerRef.current = setTimeout(() => setMensaje(null), 6000)
      return
    }
    setMensaje({ tipo: 'ok', texto: '¡Asistencia registrada!' })
    setYaRegistroHoy(true)
    setRegistrando(false)
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => setMensaje(null), 4000)
  }

  // Mantiene visible al instante el feedback enviado mientras el alumno está en su perfil.
  useEffect(() => {
    if (!perfil?.jugador_id) return
    const jugadorId = perfil.jugador_id

    async function recargarEvaluaciones() {
      const { data: evs } = await supabase
        .from('evaluaciones_trimestrales')
        .select('id,periodo_trimestre,feedback_profesor,meta_proximo_periodo,firmado_alumno,creado_en')
        .eq('jugador_id', jugadorId)
        .order('creado_en', { ascending: false })
        .limit(2)
      setEvaluaciones(evs || [])
    }

    const canal = supabase
      .channel(`feedback-perfil-${perfil.id}-${jugadorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'evaluaciones_trimestrales',
        filter: `jugador_id=eq.${jugadorId}`,
      }, recargarEvaluaciones)
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [perfil?.id, perfil?.jugador_id, supabase])

  async function aceptarCompromiso() {
    const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)
    if (!evalActual) return
    setAceptandoCompromiso(true)
    setMensaje(null)
    try {
      const { error } = await supabase.rpc('confirmar_feedback_jugador', { p_evaluacion_id: evalActual.id })
      if (error) {
        setMensaje({ tipo: 'error', texto: `No se pudo aceptar el compromiso: ${error.message}` })
        return
      }
      setEvaluaciones(prev => prev.map(ev => ev.id === evalActual.id ? { ...ev, firmado_alumno: true } : ev))
      setMensaje({ tipo: 'ok', texto: 'Compromiso aceptado correctamente' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'Ocurrió un error al aceptar el compromiso. Intenta nuevamente.' })
    } finally {
      setAceptandoCompromiso(false)
    }
  }

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
  const mensEstado = mensualidadActual?.estado
  const mensLabel = mensEstado === 'pagado' ? '✅ Pagado' : mensEstado === 'atrasado' ? '❌ Atrasado' : mensEstado === 'pendiente' ? '⚠️ Pendiente' : '—'
  const mensColor = mensEstado === 'pagado' ? '#86efac' : mensEstado === 'atrasado' ? '#fca5a5' : mensEstado === 'pendiente' ? '#fde68a' : 'rgba(255,255,255,0.7)'

  const evalActual = evaluaciones.find(ev => ev.periodo_trimestre === trimestre)

  return (
    <AppLayout perfil={perfil}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0 }}>
            {iniciales}
          </div>
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
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Mensualidad</div>
        </div>

        {/* Sesiones */}
        {jugador.tipo_plan !== 'libre' && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Sesiones del mes</span>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{jugador.sesiones_usadas}/{jugador.sesiones_limite}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 4, height: 6 }}>
              <div style={{ width: `${Math.min(((jugador.sesiones_usadas || 0) / (jugador.sesiones_limite || 1)) * 100, 100)}%`, background: (jugador.sesiones_usadas || 0) >= (jugador.sesiones_limite || 1) ? '#fca5a5' : '#fff', borderRadius: 4, height: '100%', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
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

      <div style={{ ...card, padding: 16, marginBottom: 16 }}>
        {yaRegistroHoy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Asistencia registrada</div>
              <div style={{ fontSize: 12, color: muted }}>¡Buen entrenamiento hoy!</div>
            </div>
          </div>
        ) : mostrarConfirm ? (
          <div>
            <div style={{ fontSize: 13, color: text, marginBottom: 12 }}>¿Confirmar asistencia para hoy?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setMostrarConfirm(false)} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleMarcarAsistencia} disabled={registrando} style={{ flex: 1, padding: '10px', background: registrando ? '#94a3b8' : '#4f46e5', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: registrando ? 'not-allowed' : 'pointer' }}>
                {registrando ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setMostrarConfirm(true)} style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg,#3730a3,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🏓 Marcar asistencia de hoy
          </button>
        )}
      </div>

      {/* Feedback del entrenador */}
      {evalActual?.feedback_profesor && (
        <div style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 8 }}>📝 Informe del entrenador — {trimestre}</div>
          <div style={{ fontSize: 13, color: text, lineHeight: 1.6, marginBottom: evalActual.meta_proximo_periodo ? 12 : 0 }}>{evalActual.feedback_profesor}</div>
          {evalActual.meta_proximo_periodo && (
            <div style={{ background: '#ede9fe', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Meta del próximo período</div>
              <div style={{ fontSize: 13, color: text, lineHeight: 1.6 }}>{evalActual.meta_proximo_periodo}</div>
            </div>
          )}
          {evalActual.firmado_alumno ? (
            <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'center', border: '1px solid #bbf7d0', marginTop: 12 }}>✅ Compromiso aceptado</div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>He leído el informe y acepto las metas del próximo período.</div>
              <button onClick={aceptarCompromiso} disabled={aceptandoCompromiso} style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg,#3730a3,#4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: aceptandoCompromiso ? 'not-allowed' : 'pointer' }}>
                {aceptandoCompromiso ? 'Guardando...' : '✍️ Aceptar compromiso del trimestre'}
              </button>
            </div>
          )}
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

