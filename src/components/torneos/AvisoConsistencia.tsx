'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { verificarTorneo } from '@/app/actions/torneos'
import { useEnVivo } from '@/lib/useEnVivo'

type Problema = { codigo: string; grupo: string; detalle: string }
type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sano'; grupos: number; partidos: number }
  | { tipo: 'problemas'; problemas: Problema[] }
  | { tipo: 'error'; mensaje: string }

const MAX_VISIBLES = 8

/**
 * Avisa si los grupos y los partidos del torneo no cuadran entre sí.
 *
 * El 2026-10-25 un movimiento de jugadores dejó TC A y TC B con partidos
 * contra quien ya no estaba en el grupo, y nadie lo supo hasta que se jugó
 * encima. Este aviso mira la base, no lo que la pantalla tiene en memoria:
 * se verifica al abrir y cada vez que cambian los partidos del torneo, que es
 * lo que toca cualquier movimiento de jugadores.
 *
 * Solo informa. No repara nada: arreglar un grupo es una decisión del juez.
 */
export default function AvisoConsistencia({ torneoId, clubId }: { torneoId: string; clubId: string | null }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [verificando, setVerificando] = useState(false)
  // Solo vale la última respuesta: en una ráfaga de cambios, la lenta no pisa a la nueva.
  const ultima = useRef(0)

  const verificar = useCallback(async () => {
    const mia = ++ultima.current
    setVerificando(true)
    try {
      const res = await verificarTorneo({ torneoId })
      if (mia !== ultima.current) return
      if (res.error) { setEstado({ tipo: 'error', mensaje: res.error }); return }
      if (!res.inconsistencias) return
      setEstado(res.inconsistencias.length
        ? { tipo: 'problemas', problemas: res.inconsistencias }
        : { tipo: 'sano', grupos: res.grupos ?? 0, partidos: res.partidos ?? 0 })
    } catch {
      if (mia === ultima.current) setEstado({ tipo: 'error', mensaje: 'No se pudo comunicar con el servidor.' })
    } finally {
      if (mia === ultima.current) setVerificando(false)
    }
  }, [torneoId])

  useEffect(() => { void verificar() }, [verificar])

  // Un movimiento borra y vuelve a crear los partidos del grupo: dos eventos seguidos.
  // 1,5 s los agrupa en una sola verificación.
  useEnVivo(['torneo_partidos'], clubId, () => { void verificar() }, { filtro: `torneo_id=eq.${torneoId}`, esperaMs: 1500 })

  if (estado.tipo === 'cargando') return null

  if (estado.tipo === 'sano') {
    if (!estado.grupos) return null
    return (
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
        ✓ Grupos y partidos verificados: {estado.grupos} {estado.grupos === 1 ? 'grupo' : 'grupos'}, {estado.partidos} partidos.
      </p>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
        No se pudo verificar el torneo: {estado.mensaje}{' '}
        <button type="button" onClick={() => void verificar()} disabled={verificando}
          style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}>
          Reintentar
        </button>
      </p>
    )
  }

  const visibles = estado.problemas.slice(0, MAX_VISIBLES)
  const ocultos = estado.problemas.length - visibles.length
  return (
    <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <strong style={{ color: '#991b1b', fontSize: 14 }}>
        Los grupos de este torneo no cuadran con sus partidos ({estado.problemas.length} {estado.problemas.length === 1 ? 'problema' : 'problemas'})
      </strong>
      <ul style={{ margin: '8px 0', paddingLeft: 18, color: '#991b1b', fontSize: 13 }}>
        {visibles.map((p, i) => <li key={`${p.codigo}-${i}`}>{p.detalle}</li>)}
        {ocultos > 0 && <li>…y {ocultos} más.</li>}
      </ul>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#991b1b' }}>
        No sigas cargando resultados en estos grupos hasta corregirlo. Avisa a soporte con esta pantalla a la vista.
      </p>
      <button type="button" onClick={() => void verificar()} disabled={verificando}
        style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 12px', color: '#991b1b', fontSize: 12, cursor: 'pointer' }}>
        {verificando ? 'Verificando…' : 'Volver a verificar'}
      </button>
    </div>
  )
}
