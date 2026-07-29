'use client'

// Lo que el profe necesita al llegar: qué le toca hoy, dónde, a qué hora y
// quiénes son sus alumnos de esos grupos.
//
// Antes traía además el total de alumnos del club, las evaluaciones pendientes
// y una lista de quiénes no venían hace cinco días. Nada de eso le sirve para
// entrar a la cancha, y el feedback trimestral se sacó del sistema entero.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { fechaChile } from '@/lib/domain/fechaChile'
import { diaDesdeFecha, hhmm, rangoHorario } from '@/lib/domain/horario'
import { sedeLabel } from '@/lib/domain/sedeGrupo'

const supabase = createClient()

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 16px rgba(15,23,42,0.18)', animation: 'entraTarjeta var(--normal) var(--curva) both' } as const
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'

type Bloque = {
  id: string
  nombre: string
  sede: string
  hora_inicio: string
  hora_fin: string
  alumnos: { id: string; nombre: string; categoria: string | null }[]
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function DashboardProfesorPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const ahora = new Date()
  const hoy = fechaChile()

  useEffect(() => {
    async function cargar() {
      if (authLoading) return
      if (!perfil) { router.push('/login'); return }
      if (perfil.rol !== 'admin' && perfil.rol !== 'profesor' && perfil.rol !== 'superadmin') {
        router.push('/dashboard'); return
      }
      if (!perfil.club_id) { setLoading(false); return }

      const dia = diaDesdeFecha(hoy)
      if (!dia) { setBloques([]); setLoading(false); return }   // fin de semana

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      const [{ data: bs }, { data: rel }, { data: jug }, { data: exc }] = await Promise.all([
        db.from('bloques_horario')
          .select('id,nombre,sede,hora_inicio,hora_fin')
          .eq('club_id', perfil.club_id).eq('activo', true).eq('dia_semana', dia)
          .lte('vigente_desde', hoy)
          .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
          .order('hora_inicio'),
        db.from('bloque_jugadores').select('bloque_id,jugador_id').is('vigente_hasta', null),
        db.from('jugadores').select('id,nombre,categoria')
          .eq('club_id', perfil.club_id).eq('estado', 'activo')
          .or('es_externo.is.null,es_externo.eq.false'),
        // Un día suspendido no es un día de clase: si el grupo no se dicta, no
        // tiene por qué aparecerle en la lista de hoy.
        db.from('bloque_excepciones').select('bloque_id').eq('fecha', hoy),
      ])

      const suspendidos = new Set((exc ?? []).map((e: { bloque_id: string }) => e.bloque_id))
      const porId = new Map((jug ?? []).map((j: { id: string }) => [j.id, j]))
      const armados: Bloque[] = ((bs ?? []) as Bloque[])
        .filter(b => !suspendidos.has(b.id))
        .map(b => ({
          ...b,
          alumnos: (rel ?? [])
            .filter((r: { bloque_id: string }) => r.bloque_id === b.id)
            .map((r: { jugador_id: string }) => porId.get(r.jugador_id))
            .filter(Boolean)
            .sort((a: { nombre: string }, z: { nombre: string }) => a.nombre.localeCompare(z.nombre)),
        }))

      setBloques(armados)
      setLoading(false)
    }
    void cargar()
  }, [authLoading, hoy, perfil, router])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#a9bac8' }}>
      <div style={{ color: hint }}>Cargando...</div>
    </div>
  )

  const saludo = ahora.getHours() < 12 ? 'Buenos días' : ahora.getHours() < 20 ? 'Buenas tardes' : 'Buenas noches'
  const totalAlumnos = bloques.reduce((s, b) => s + b.alumnos.length, 0)
  const horaAhora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: text, margin: 0 }}>
          {saludo}, {perfil?.nombre?.split(' ')[0] || 'Profesor'}
        </h1>
        <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
          {DIAS[ahora.getDay()]} {ahora.getDate()} de {MESES[ahora.getMonth()]} {ahora.getFullYear()}
          {bloques.length > 0 && ` · ${bloques.length} grupo${bloques.length === 1 ? '' : 's'} · ${totalAlumnos} alumnos`}
        </div>
      </div>

      {bloques.length === 0 ? (
        <div style={{ ...card, padding: 34, textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>☕</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: text, marginBottom: 4 }}>Hoy no hay clases</div>
          <div style={{ fontSize: 12, color: muted }}>
            Ningún grupo entrena hoy, o el día está marcado sin clase.
          </div>
        </div>
      ) : (
        <div className="anim-lista" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bloques.map(b => {
            // El que está corriendo ahora se destaca: es el que el profe tiene
            // enfrente cuando abre el teléfono.
            const enCurso = horaAhora >= hhmm(b.hora_inicio) && horaAhora <= hhmm(b.hora_fin)
            return (
              <div key={b.id} style={{ ...card, overflow: 'hidden',
                border: enCurso ? '2px solid #4f46e5' : '1px solid #e2e8f0' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: text, fontVariantNumeric: 'tabular-nums' }}>
                        {rangoHorario(b.hora_inicio, b.hora_fin)}
                      </span>
                      {enCurso && (
                        <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                          fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>
                          AHORA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text, marginTop: 3 }}>{b.nombre}</div>
                    <div style={{ fontSize: 12, color: muted, marginTop: 1 }}>📍 {sedeLabel(b.sede)}</div>
                  </div>
                  <Link href="/asistencia"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                      textDecoration: 'none', borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 700 }}>
                    Pasar lista
                  </Link>
                </div>

                <div style={{ padding: '12px 18px' }}>
                  <div style={{ fontSize: 11, color: hint, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.4px', marginBottom: 8 }}>
                    {b.alumnos.length} alumno{b.alumnos.length === 1 ? '' : 's'}
                  </div>
                  {b.alumnos.length === 0 ? (
                    <div style={{ fontSize: 12, color: hint }}>Este grupo todavía no tiene inscritos.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {b.alumnos.map(a => (
                        <span key={a.id}
                          style={{ background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 20,
                            padding: '5px 11px', fontSize: 12, color: text }}>
                          {a.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}
