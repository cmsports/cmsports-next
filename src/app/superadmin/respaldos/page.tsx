'use client'

import { useEffect, useState } from 'react'
import { Database, Download, Building2, ShieldCheck, CalendarClock } from 'lucide-react'
import { useClubesSuperadmin } from '../layout'
import { fechaChile } from '@/lib/domain/fechaChile'
import { CLAVE_ULTIMO_RESPALDO, tocaRespaldar, diasDesde } from '@/lib/domain/respaldoAviso'

const card = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12 } as const

export default function RespaldosPage() {
  const { clubes, conteos, loading } = useClubesSuperadmin()
  const [descargando, setDescargando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState<string | null>(null)

  useEffect(() => { setUltimo(localStorage.getItem(CLAVE_ULTIMO_RESPALDO)) }, [])

  async function descargar(club?: { id: string; nombre: string }) {
    if (descargando) return
    setDescargando(club?.id || 'todos')
    setError('')
    try {
      const res = await fetch(`/api/superadmin/respaldo${club ? `?club=${club.id}` : ''}`)
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null)
        throw new Error(cuerpo?.error || `El servidor respondió ${res.status}`)
      }
      const blob = await res.blob()
      const nombre = res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] || 'respaldo.zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
      // Solo el respaldo completo apaga el aviso: bajar un club suelto no es
      // el respaldo semanal.
      if (!club) {
        const hoy = fechaChile()
        localStorage.setItem(CLAVE_ULTIMO_RESPALDO, hoy)
        setUltimo(hoy)
        window.dispatchEvent(new CustomEvent('cmsports:respaldo-hecho'))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDescargando(null)
    }
  }

  const hoy = fechaChile()
  const pendiente = tocaRespaldar(ultimo, hoy)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>Respaldos</h1>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Descarga la base de datos completa de cada club en formato ZIP</p>
      </div>

      <div style={{
        ...card, padding: 22, marginBottom: 22, border: 'none',
        background: pendiente ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'linear-gradient(135deg, #0f766e, #059669)',
        color: '#fff', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {pendiente ? <Database size={26} /> : <ShieldCheck size={26} />}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>
            {pendiente ? 'Toca descargar las bases de datos' : 'Respaldo de esta semana listo'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarClock size={13} />
            {ultimo
              ? `Último respaldo completo: ${ultimo} (hace ${diasDesde(ultimo, hoy)} día${diasDesde(ultimo, hoy) === 1 ? '' : 's'})`
              : 'Todavía no se ha descargado ningún respaldo desde este navegador'}
          </div>
        </div>
        <button onClick={() => descargar()} disabled={!!descargando} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px',
          background: '#fff', color: '#3730a3', border: 'none', borderRadius: 9,
          fontSize: 13, fontWeight: 700, cursor: descargando ? 'wait' : 'pointer', opacity: descargando ? 0.7 : 1,
        }}>
          <Download size={15} />
          {descargando === 'todos' ? 'Preparando el ZIP...' : 'Descargar todo'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#94a3b8', fontSize: 14 }}>Cargando...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {clubes.map(c => (
            <div key={c.id} style={{ ...card, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: '#ede9fe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Building2 size={18} color="#4f46e5" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{conteos[c.id] ?? 0} jugador{(conteos[c.id] ?? 0) === 1 ? '' : 'es'}</div>
                </div>
              </div>
              <button onClick={() => descargar(c)} disabled={!!descargando} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7,
                fontSize: 12, color: '#1e293b', cursor: descargando ? 'wait' : 'pointer', opacity: descargando ? 0.6 : 1,
              }}>
                <Download size={13} /> {descargando === c.id ? 'Preparando...' : 'Descargar este club'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...card, padding: 16, marginTop: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Qué trae el ZIP</div>
        <ul style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7, paddingLeft: 18 }}>
          <li>Una carpeta por club, y adentro un archivo <code>.json</code> por tabla: jugadores, asistencia, mensualidades, movimientos, torneos con sus partidos, ligas, tienda, evaluaciones, auditorías.</li>
          <li>Una carpeta <code>_global</code> con lo que no pertenece a un club (clubes, configuración de la empresa, tareas).</li>
          <li>Un <code>respaldo.json</code> con la fecha y cuántas filas tiene cada tabla, para revisar de un vistazo que no falta nada.</li>
          <li>Las filas van tal cual salen de la base, así que se pueden volver a insertar si hay que restaurar.</li>
        </ul>
      </div>
    </div>
  )
}
