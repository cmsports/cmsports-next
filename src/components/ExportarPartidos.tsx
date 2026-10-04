'use client'

import { useEffect, useRef, useState } from 'react'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useModulos } from '@/lib/hooks/useModulos'
import { exportarPartidos, puedeExportarPartidos } from '@/app/actions/exportacionPartidos'
import type { FormatoExportacionPartidos, TipoCompetenciaExportable } from '@/lib/domain/exportacionPartidos'

export default function ExportarPartidos({ tipo, competenciaId }: { tipo: TipoCompetenciaExportable; competenciaId: string }) {
  const { perfil } = usePerfil()
  const { modulos } = useModulos()
  const [confirmacion, setConfirmacion] = useState<{ clave: string; habilitado: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [esError, setEsError] = useState(false)
  const enVuelo = useRef(false)
  const clave = `${perfil?.club_id ?? ''}:${perfil?.rol ?? ''}:${modulos.join(',')}`
  useEffect(() => {
    let vigente = true
    if (perfil?.club_id && ['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
      puedeExportarPartidos().then(si => { if (vigente) setConfirmacion({ clave, habilitado: si }) }).catch(() => {})
    }
    return () => { vigente = false }
  }, [perfil?.club_id, perfil?.rol, clave])

  async function descargar(formato: FormatoExportacionPartidos) {
    if (enVuelo.current) return
    enVuelo.current = true
    setOcupado(true)
    setMensaje('')
    try {
      const res = await exportarPartidos({ tipo, competenciaId, formato })
      if ('error' in res) { setEsError(true); setMensaje(res.error); return }
      const url = URL.createObjectURL(new Blob([res.contenido], { type: res.mime }))
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = res.nombreArchivo
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setEsError(false)
      setMensaje(`${res.total} partidos exportados.`)
    } catch {
      setEsError(true)
      setMensaje('No se pudo descargar. Intenta nuevamente.')
    } finally {
      enVuelo.current = false
      setOcupado(false)
    }
  }

  if (confirmacion?.clave !== clave || !confirmacion.habilitado) return null
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
    {(['csv', 'json'] as const).map(formato => <button key={formato} type="button" onClick={() => descargar(formato)} disabled={ocupado}
      title={`Exportar todos los partidos a ${formato.toUpperCase()}`}
      style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: ocupado ? 'wait' : 'pointer', opacity: ocupado ? 0.6 : 1 }}>
      {ocupado ? 'Exportando…' : `Partidos ${formato.toUpperCase()}`}
    </button>)}
    {mensaje && <span role={esError ? 'alert' : 'status'} style={{ color: esError ? '#b91c1c' : '#166534', background: '#fff', borderRadius: 6, padding: '4px 6px', fontSize: 12 }}>{mensaje}</span>}
  </div>
}
