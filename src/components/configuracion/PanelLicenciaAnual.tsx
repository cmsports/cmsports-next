'use client'

// Qué año de licencia se está cobrando. Es la clave `licencia.anio` de
// `club_config`, pero va en su propio panel y no en "Cómo funciona este club":
// ese panel vive detrás del módulo 'config_club' —tiene las perillas de
// morosidad— y Buin no lo tiene. El año de la licencia es del admin y no
// debería obligarlo a ver nada más.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { configDelClub } from '@/lib/supabase/clubConfig'
import { definicionDe } from '@/lib/domain/clubConfig'
import { useEnVivo } from '@/lib/useEnVivo'
import { invalidarPorTabla } from '@/lib/query-cache'
import { BadgeCheck } from 'lucide-react'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const DEF = definicionDe('licencia.anio')

export default function PanelLicenciaAnual({ clubId }: { clubId: string }) {
  const [anio, setAnio]           = useState<number | null>(null)
  const [borrador, setBorrador]   = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [guardado, setGuardado]   = useState(false)

  const cargar = useCallback(async () => {
    const a = (await configDelClub(clubId))('licencia.anio')
    setAnio(a)
    setBorrador(String(a))
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['club_config'], clubId, () => { void cargar() })

  async function guardar() {
    const nuevo = parseInt(borrador, 10)
    if (!Number.isInteger(nuevo) || nuevo < DEF.min || nuevo > DEF.max) {
      setError(`Escribe un año entre ${DEF.min} y ${DEF.max}.`)
      return
    }
    if (nuevo === anio) return
    if (!confirm(`¿Pasar a cobrar la licencia ${nuevo}?\n\nEn las fichas aparecerá "Pago confirmado licencia ${nuevo}" y nadie figurará como pagado para ese año hasta que lo marques. Lo pagado de la licencia ${anio} queda guardado.`)) return

    setGuardando(true)
    setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: err } = await (supabase as any).from('club_config')
      .upsert({ club_id: clubId, clave: 'licencia.anio', valor: nuevo }, { onConflict: 'club_id,clave' })
    setGuardando(false)
    if (err) { setError('No se pudo guardar: ' + err.message); return }
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
    // El aviso en vivo también tira el caché, pero puede llegar después de
    // esta recarga y dejarla leyendo el año viejo.
    invalidarPorTabla('club_config')
    await cargar()
  }

  return (
    <div style={{ ...card, padding: 20, maxWidth: 760, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <BadgeCheck size={16} color="#16a34a" />
        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Licencia anual</span>
      </div>
      <p style={{ fontSize: 12, color: hint, margin: '0 0 14px', lineHeight: 1.55 }}>
        El año que se está cobrando. Cuando empieces a cobrar el año siguiente,
        cámbialo acá: el botón de la ficha y el filtro de Jugadores pasan a ese año.
      </p>

      {error && (
        <div style={{ padding: '11px 14px', marginBottom: 12, borderRadius: 8, background: '#fef2f2', borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label htmlFor="licencia-anio" style={{ fontSize: 13, fontWeight: 600, color: text }}>
          {DEF.label}
        </label>
        <input
          id="licencia-anio" type="number" min={DEF.min} max={DEF.max}
          value={borrador} disabled={anio == null || guardando}
          onChange={e => setBorrador(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void guardar() }}
          style={{ width: 96, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        />
        <button
          onClick={() => void guardar()}
          disabled={anio == null || guardando || borrador === String(anio)}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
            background: borrador === String(anio) ? '#e2e8f0' : '#16a34a',
            color: borrador === String(anio) ? muted : '#fff',
            cursor: borrador === String(anio) || guardando ? 'default' : 'pointer' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        {guardado && <span style={{ fontSize: 12, color: '#16a34a' }}>Guardado</span>}
      </div>
    </div>
  )
}
