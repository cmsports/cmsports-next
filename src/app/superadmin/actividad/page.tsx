'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, Clock, Layers, Users } from 'lucide-react'
import { cargarActividad } from '@/app/actions/actividad'
import {
  DIAS_VENTANA, MINUTOS_EN_LINEA, formatearDuracion, haceCuanto,
  promedioDiarioPorUsuario, rankingModulos, sesionesEnLinea,
  type FilaActividad,
} from '@/lib/domain/actividad'
import { MODULOS } from '@/lib/domain/modulos'

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, animation: 'entraTarjeta var(--normal) var(--curva) both' } as const

/** Cada cuánto se refresca el panel. Es "en vivo", pero nadie mira un contador
 *  de sesiones cada segundo: 30 s alcanza y no castiga la base. */
const REFRESCO_MS = 30_000

const NOMBRE_MODULO = new Map(MODULOS.map(m => [m.key as string, m.label]))
function etiquetaModulo(modulo: string | null): string {
  if (!modulo) return 'Fuera de módulo'
  return NOMBRE_MODULO.get(modulo) ?? modulo
}

const ROL_COLOR: Record<string, { bg: string; fg: string }> = {
  superadmin: { bg: '#ede9fe', fg: '#4338ca' },
  admin: { bg: '#dbeafe', fg: '#1d4ed8' },
  profesor: { bg: '#dcfce7', fg: '#15803d' },
  jugador: { bg: '#f1f5f9', fg: '#475569' },
}

function Seccion({ icon: Icon, titulo, descripcion, children }: {
  icon: typeof Activity; titulo: string; descripcion: string; children: React.ReactNode
}) {
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 2 }}>
        <Icon size={16} color="#4f46e5" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{titulo}</h2>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>{descripcion}</p>
      {children}
    </div>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: '#94a3b8', padding: '10px 0' }}>{children}</div>
}

export default function ActividadPage() {
  const [filas, setFilas] = useState<FilaActividad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  // Se guarda el instante del último refresco para que "hace X min" se
  // recalcule al repintar y no quede congelado en el primer render.
  const [ahora, setAhora] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    const res = await cargarActividad()
    if (res.error) setError(res.error)
    else { setFilas(res.filas ?? []); setError('') }
    setAhora(new Date())
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
    const tick = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(tick)
  }, [cargar])

  if (cargando) return <div style={{ color: '#94a3b8', fontSize: 14, padding: 24 }}>Cargando actividad...</div>

  // `ahora` fijo para todo el render: si cada función llamara a new Date() por
  // su cuenta, dos tarjetas podrían usar cortes distintos.
  const momento = ahora ?? new Date()
  const enLinea = sesionesEnLinea(filas, momento)
  const promedio = promedioDiarioPorUsuario(filas, momento)
  const ranking = rankingModulos(filas)
  const top = ranking[0]
  const ultimos = filas.slice(0, 50)

  const tarjetas = [
    { label: 'Usando la app ahora', value: enLinea.length, hint: `últimos ${MINUTOS_EN_LINEA} min`, icon: Activity, color: '#16a34a' },
    { label: 'Uso promedio al día', value: formatearDuracion(promedio.segundos), hint: 'por persona, en los días que entró', icon: Clock, color: '#4f46e5' },
    { label: 'Personas activas', value: promedio.usuarios, hint: `en ${DIAS_VENTANA} días`, icon: Users, color: '#0891b2' },
    { label: 'Módulo más usado', value: top ? etiquetaModulo(top.modulo) : '—', hint: top ? formatearDuracion(top.segundos) : 'sin datos', icon: Layers, color: '#d97706' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Actividad</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>
          Quién está usando CmSports y en qué. Se refresca solo cada {REFRESCO_MS / 1000} s · ventana de {DIAS_VENTANA} días
        </p>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        {tarjetas.map(t => (
          <div key={t.label} style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <t.icon size={15} color={t.color} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{t.label}</span>
            </div>
            <div className="tabular-nums" style={{ fontSize: 19, fontWeight: 700, color: '#0f172a' }}>{t.value}</div>
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>{t.hint}</div>
          </div>
        ))}
      </div>

      <Seccion icon={Activity} titulo="En línea ahora" descripcion={`Con actividad en los últimos ${MINUTOS_EN_LINEA} minutos`}>
        {enLinea.length === 0 ? (
          <Vacio>Nadie está usando la app en este momento.</Vacio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {enLinea.map(s => {
              const rol = ROL_COLOR[s.rol ?? ''] ?? ROL_COLOR.jugador
              return (
                <div key={s.usuarioId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.nombre ?? 'Cuenta eliminada'}
                  </span>
                  <span style={{ background: rol.bg, color: rol.fg, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                    {s.rol ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.club ?? 'Sin club'} · {etiquetaModulo(s.modulo)}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{s.ruta}</span>
                </div>
              )
            })}
          </div>
        )}
      </Seccion>

      <Seccion icon={Layers} titulo="Módulos más usados" descripcion="Tiempo acumulado y número de visitas. Un módulo con muchas visitas cortas no es lo mismo que uno con pocas visitas largas.">
        {ranking.length === 0 ? (
          <Vacio>Todavía no hay actividad registrada.</Vacio>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Módulo</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Tiempo</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Visitas</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(m => (
                  <tr key={m.modulo ?? 'sin-modulo'} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 8px', color: m.modulo ? '#0f172a' : '#94a3b8' }}>{etiquetaModulo(m.modulo)}</td>
                    <td className="tabular-nums" style={{ padding: '7px 8px', textAlign: 'right', color: '#0f172a' }}>{formatearDuracion(m.segundos)}</td>
                    <td className="tabular-nums" style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{m.visitas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion icon={Clock} titulo="Últimos movimientos" descripcion="Las 50 pantallas más recientes que se abrieron">
        {ultimos.length === 0 ? (
          <Vacio>Sin movimientos todavía.</Vacio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {ultimos.map((f, i) => (
              <div key={`${f.usuarioId}-${f.ocurridoEn}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12, borderBottom: '1px solid #f8fafc' }}>
                <span style={{ color: '#0f172a', minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.nombre ?? 'Cuenta eliminada'}
                </span>
                <span style={{ color: '#94a3b8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {etiquetaModulo(f.modulo)} · {f.ruta}
                </span>
                {f.segundos > 0 && (
                  <span className="tabular-nums" style={{ color: '#64748b', flexShrink: 0 }}>{formatearDuracion(f.segundos)}</span>
                )}
                <span style={{ color: '#cbd5e1', flexShrink: 0, minWidth: 78, textAlign: 'right' }}>{haceCuanto(f.ocurridoEn, momento)}</span>
              </div>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  )
}
