'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ban, Check, Copy, Loader2, MonitorSmartphone, Plus, RotateCw } from 'lucide-react'
import {
  crearORotarKioscoAction,
  listarKioscosAction,
  revocarKioscoAction,
  type KioscoAsistencia,
} from '@/app/actions/kiosco'

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const input = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box' } as const
const boton = { border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 } as const

type Secreto = { clubId: string; nombre: string; token: string } | null

export default function GestionKioscos() {
  const [kioscos, setKioscos] = useState<KioscoAsistencia[]>([])
  const [nombre, setNombre] = useState('Tablet recepción')
  const [secreto, setSecreto] = useState<Secreto>(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    const resultado = await listarKioscosAction()
    setKioscos(resultado.kioscos)
    setError(resultado.error || '')
    setCargando(false)
  }, [])

  useEffect(() => {
    const carga = window.setTimeout(() => { void cargar() }, 0)
    return () => window.clearTimeout(carga)
  }, [cargar])

  async function generar(nombreKiosco: string, kioscoId?: string) {
    setError('')
    setCopiado(false)
    setProcesando(kioscoId || 'nuevo')
    const resultado = await crearORotarKioscoAction({ nombre: nombreKiosco, kioscoId })
    setProcesando(null)
    if (!resultado.kiosco) { setError(resultado.error || 'No se pudo autorizar'); return }
    setSecreto(resultado.kiosco)
    if (!kioscoId) setNombre('Tablet recepción')
    await cargar()
  }

  async function revocar(kiosco: KioscoAsistencia) {
    if (!window.confirm(`¿Revocar “${kiosco.nombre}”? Dejará de registrar asistencias inmediatamente.`)) return
    setProcesando(kiosco.id)
    const resultado = await revocarKioscoAction(kiosco.id)
    setProcesando(null)
    if (!resultado.ok) { setError(resultado.error || 'No se pudo revocar'); return }
    setSecreto(null)
    await cargar()
  }

  function enlaceActual() {
    if (!secreto || typeof window === 'undefined') return ''
    return `${window.location.origin}/asistencia/${secreto.clubId}#autorizar=${encodeURIComponent(secreto.token)}`
  }

  async function copiarEnlace() {
    const enlace = enlaceActual()
    if (!enlace) return
    await navigator.clipboard.writeText(enlace)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div style={{ ...card, maxWidth: 760, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <MonitorSmartphone size={17} color="#4f46e5" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Dispositivos de asistencia</span>
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
        Cada tablet o computador necesita su propio enlace secreto. Puedes rotarlo o revocarlo en cualquier momento.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={80} style={input} placeholder="Ej: Tablet recepción" />
        <button onClick={() => generar(nombre)} disabled={procesando !== null} style={{ ...boton, background: '#4f46e5', color: '#fff', whiteSpace: 'nowrap' }}>
          {procesando === 'nuevo' ? <Loader2 size={14} /> : <Plus size={14} />} Autorizar
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', background: '#fef2f2', borderRadius: 8, padding: 10, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {secreto && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>Enlace de “{secreto.nombre}”</div>
          <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.5, marginBottom: 10 }}>
            Cópialo y ábrelo una vez en ese dispositivo. El enlace desaparecerá de la barra y quedará enlazado. No se puede recuperar después.
          </div>
          <button onClick={copiarEnlace} style={{ ...boton, background: '#16a34a', color: '#fff' }}>
            {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar enlace de autorización'}
          </button>
        </div>
      )}

      {cargando ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Cargando dispositivos…</div> : kioscos.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Aún no hay dispositivos autorizados.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {kioscos.map(kiosco => (
            <div key={kiosco.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{kiosco.nombre}</div>
                <div style={{ fontSize: 11, color: kiosco.activo ? '#16a34a' : '#94a3b8', marginTop: 3 }}>
                  {kiosco.activo ? 'Activo' : 'Revocado'} · Último uso: {kiosco.ultimo_uso_en ? new Date(kiosco.ultimo_uso_en).toLocaleString('es-CL') : 'nunca'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => generar(kiosco.nombre, kiosco.id)} disabled={procesando !== null} title="Rotar token" style={{ ...boton, background: '#ede9fe', color: '#3730a3' }}>
                  <RotateCw size={13} /> Rotar
                </button>
                {kiosco.activo && <button onClick={() => revocar(kiosco)} disabled={procesando !== null} style={{ ...boton, background: '#fef2f2', color: '#dc2626' }}>
                  <Ban size={13} /> Revocar
                </button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
