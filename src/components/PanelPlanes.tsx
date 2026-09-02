'use client'

// Las tarifas de mensualidad del club: frecuencia semanal × tipo → monto.
//
// Existe porque en Spinhouse la cuota sale de una tarifa publicada, no de un
// acuerdo por persona. Mantener eso a mano en 140 fichas garantiza que se
// desactualice: sube el precio y hay que tocar 140 filas, o no se toca ninguna.
//
// Ojo con la asimetría: los planes se cargan acá, pero cambiarle el precio a un
// plan NO reescribe las cuotas ya emitidas. La plata de un mes cerrado no
// cambia, y `generar_mensualidades` congela el monto al emitir.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEnVivo } from '@/lib/useEnVivo'
import { Plus, Tag, TriangleAlert, Users } from 'lucide-react'
import { montoIngresado } from '@/lib/domain/mensualidades'
import { cobraPorPlan, etiquetaPlan, planesVigentes, type Plan } from '@/lib/domain/planes'
import { CONFIG_POR_DEFECTO, type LectorConfig } from '@/lib/domain/clubConfig'
import { configDelClub } from '@/lib/supabase/clubConfig'
import { fechaChile } from '@/lib/domain/fechaChile'

const supabase = createClient()

const card  = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' } as const
const text  = '#0f172a'
const muted = '#64748b'
const hint  = '#94a3b8'

const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const,
  background: '#f4f7fa', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', color: text,
}
const labelStyle = { fontSize: 11, color: muted, display: 'block' as const, marginBottom: 4, fontWeight: 600 }

const TIPOS = [
  { value: 'grupal',     label: 'Grupal' },
  { value: 'particular', label: 'Particular' },
  { value: 'libre',      label: 'Libre' },
]

const VACIO = { nombre: '', frecuencia: '2', tipo: 'grupal', monto: '' }

/** Los pesos como se escriben en Chile: 45.000, no 45000. */
function pesos(n: number): string {
  return '$' + n.toLocaleString('es-CL')
}

export default function PanelPlanes({ clubId }: { clubId: string }) {
  const [planes, setPlanes]     = useState<Plan[]>([])
  const [conteo, setConteo]     = useState<Map<string, number>>(new Map())
  const [config, setConfig]     = useState<LectorConfig>(() => CONFIG_POR_DEFECTO)
  const [sinPlan, setSinPlan]   = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError]       = useState('')

  const [creando, setCreando]   = useState(false)
  const [form, setForm]         = useState(VACIO)
  const [guardando, setGuard]   = useState(false)

  const cargar = useCallback(async () => {
    if (!clubId) return
    setError('')
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const db = supabase as any

      const [cfg, planesRes, jugadoresRes] = await Promise.all([
        configDelClub(clubId),
        db.from('planes_club')
          .select('id, nombre, frecuencia_semanal, tipo_clase, monto, vigente_desde, vigente_hasta, activo')
          .eq('club_id', clubId).order('monto'),
        // Cuántos jugadores tiene cada plan, para que borrar uno no sea a
        // ciegas. Solo activos: los retirados no son gente que se quede sin
        // cuota mañana.
        db.from('jugadores').select('plan_id')
          .eq('club_id', clubId).eq('estado', 'activo'),
      ])

      if (planesRes.error) throw new Error(planesRes.error.message)
      if (jugadoresRes.error) throw new Error(jugadoresRes.error.message)

      const cuenta = new Map<string, number>()
      let huerfanos = 0
      for (const j of (jugadoresRes.data ?? []) as { plan_id: string | null }[]) {
        if (j.plan_id) cuenta.set(j.plan_id, (cuenta.get(j.plan_id) ?? 0) + 1)
        else huerfanos++
      }

      setConfig(() => cfg)
      setPlanes((planesRes.data ?? []) as Plan[])
      setConteo(cuenta)
      setSinPlan(huerfanos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los planes.')
    } finally {
      setCargando(false)
    }
  }, [clubId])

  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(['planes_club', 'jugadores', 'club_config'], clubId, () => { void cargar() })

  async function crear() {
    const nombre = form.nombre.trim()
    if (!nombre) { setError('El plan necesita un nombre.'); return }

    // `montoIngresado` y no `parseInt`: en Chile el punto es separador de
    // miles, y `parseInt('45.000')` devuelve 45. Quien tipeaba así guardaba
    // cuarenta y cinco pesos sin enterarse.
    const monto = montoIngresado(form.monto)
    if (monto == null) { setError('El plan necesita un monto.'); return }

    const frecuencia = form.frecuencia === '' ? null : parseInt(form.frecuencia, 10)

    setGuard(true)
    setError('')
    const { error: err } = await (supabase as any).from('planes_club').insert({
      club_id: clubId, nombre, monto,
      frecuencia_semanal: frecuencia, tipo_clase: form.tipo, activo: true,
    })

    setGuard(false)
    if (err) { setError('No se pudo crear el plan: ' + err.message); return }

    setForm(VACIO)
    setCreando(false)
    await cargar()
  }

  /**
   * Sacar un plan de circulación sin borrarlo.
   *
   * Borrar la fila pondría en NULL el `plan_id` de todos sus jugadores —la FK
   * es ON DELETE SET NULL— y al mes siguiente esa gente emitiría sin monto sin
   * que nadie se entere hasta que llegue el cobro. Desactivar lo saca de la
   * lista de contratables y deja a los que ya lo tienen intactos.
   */
  async function desactivar(plan: Plan) {
    const cuantos = conteo.get(plan.id) ?? 0
    const aviso = cuantos > 0
      ? `${cuantos} ${cuantos === 1 ? 'jugador tiene' : 'jugadores tienen'} el plan "${plan.nombre}".\n\nAl desactivarlo deja de poder contratarse, pero ellos lo conservan y siguen pagando lo mismo.\n\n¿Desactivarlo?`
      : `¿Desactivar el plan "${plan.nombre}"? Deja de aparecer al asignar planes.`
    if (!confirm(aviso)) return

    setError('')
    const { error: err } = await (supabase as any).from('planes_club')
      .update({ activo: false }).eq('id', plan.id)

    if (err) { setError('No se pudo desactivar: ' + err.message); return }
    await cargar()
  }

  async function reactivar(plan: Plan) {
    setError('')
    const { error: err } = await (supabase as any).from('planes_club')
      .update({ activo: true }).eq('id', plan.id)

    if (err) { setError('No se pudo reactivar: ' + err.message); return }
    await cargar()
  }

  async function cambiarMonto(plan: Plan, valor: string) {
    const monto = montoIngresado(valor)
    if (monto == null) { setError('El monto no puede quedar vacío.'); return }
    if (monto === plan.monto) return

    const cuantos = conteo.get(plan.id) ?? 0
    if (cuantos > 0 && !confirm(
      `El plan "${plan.nombre}" pasa de ${pesos(plan.monto)} a ${pesos(monto)}.\n\n` +
      `Afecta a ${cuantos} ${cuantos === 1 ? 'jugador' : 'jugadores'} desde la PRÓXIMA emisión. ` +
      `Las cuotas ya emitidas no cambian.\n\n¿Confirmás?`,
    )) { await cargar(); return }

    setError('')
    const { error: err } = await (supabase as any).from('planes_club')
      .update({ monto }).eq('id', plan.id)

    if (err) { setError('No se pudo cambiar el monto: ' + err.message); return }
    await cargar()
  }

  if (cargando) return <p style={{ fontSize: 13, color: muted }}>Cargando planes…</p>

  const activos = planesVigentes(planes, fechaChile())
  const inactivos = planes.filter(p => !p.activo)
  const usandoPlanes = cobraPorPlan(config)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: text }}>Planes de mensualidad</div>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: hint, maxWidth: 520, lineHeight: 1.55 }}>
            La tarifa que se le cobra a cada jugador según lo que contrató.
          </p>
        </div>
        <button
          type="button" onClick={() => { setCreando(v => !v); setError('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3730a3', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={15} /> Nuevo plan
        </button>
      </div>

      {/* El aviso que evita el malentendido más caro de este módulo. */}
      {!usandoPlanes && planes.length > 0 && (
        <div style={{ ...card, padding: '13px 16px', marginBottom: 14, borderLeft: '3px solid #b45309', display: 'flex', gap: 9 }}>
          <TriangleAlert size={15} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#92400e', lineHeight: 1.55 }}>
            Estos planes están cargados pero <strong>no se están usando</strong>: el
            club todavía cobra con el monto escrito en cada ficha. Para que las
            cuotas salgan de acá, cambiá <em>&ldquo;Cómo se determina la cuota&rdquo;</em> en
            Configuración.
          </p>
        </div>
      )}

      {usandoPlanes && sinPlan > 0 && (
        <div style={{ ...card, padding: '13px 16px', marginBottom: 14, borderLeft: '3px solid #b91c1c', display: 'flex', gap: 9 }}>
          <TriangleAlert size={15} color="#b91c1c" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c', lineHeight: 1.55 }}>
            <strong>{sinPlan} {sinPlan === 1 ? 'jugador activo no tiene' : 'jugadores activos no tienen'} plan asignado.</strong>{' '}
            Su cuota va a emitirse sin monto, salvo que tengan uno propio en su
            ficha. Se asigna desde la ficha de cada jugador.
          </p>
        </div>
      )}

      {error && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 14, borderLeft: '3px solid #b91c1c' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      {creando && (
        <div style={{ ...card, padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="plan-nombre" style={labelStyle}>Nombre</label>
              <input id="plan-nombre" value={form.nombre} autoFocus
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Grupal 2 veces" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="plan-tipo" style={labelStyle}>Tipo de clase</label>
              <select id="plan-tipo" value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="plan-frec" style={labelStyle}>Veces por semana</label>
              <input id="plan-frec" type="number" min={1} max={7} value={form.frecuencia}
                onChange={e => setForm(f => ({ ...f, frecuencia: e.target.value }))}
                placeholder="2" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="plan-monto" style={labelStyle}>Monto mensual</label>
              <input id="plan-monto" value={form.monto} inputMode="numeric"
                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                placeholder="45.000" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void crear()} disabled={guardando}
              style={{ background: '#3730a3', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Creando…' : 'Crear plan'}
            </button>
            <button type="button" onClick={() => { setCreando(false); setForm(VACIO); setError('') }}
              style={{ background: 'transparent', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {planes.length === 0 ? (
        <div style={{ ...card, padding: '36px 24px', textAlign: 'center' }}>
          <Tag size={30} color={hint} style={{ marginBottom: 10 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: text }}>
            Todavía no hay planes cargados
          </p>
          <p style={{ margin: '6px auto 0', fontSize: 13, color: muted, maxWidth: 440, lineHeight: 1.55 }}>
            Cargá uno por cada tarifa que cobra el club. Mientras no haya
            ninguno, las cuotas salen del monto escrito en cada ficha, como
            hasta ahora.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {[...activos, ...inactivos].map(p => {
            const cuantos = conteo.get(p.id) ?? 0
            return (
              <div key={p.id} style={{ ...card, padding: '13px 16px', opacity: p.activo ? 1 : 0.6 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>
                      {etiquetaPlan(p)}
                      {!p.activo && <span style={{ fontSize: 11, color: hint, fontWeight: 500 }}> · desactivado</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: hint, marginTop: 2 }}>
                      <Users size={11} />
                      {cuantos === 0
                        ? 'Nadie lo tiene todavía'
                        : `${cuantos} ${cuantos === 1 ? 'jugador' : 'jugadores'}`}
                      {p.tipo_clase && ` · ${p.tipo_clase}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      defaultValue={p.monto.toLocaleString('es-CL')} inputMode="numeric"
                      key={`${p.id}:${p.monto}`}
                      onBlur={e => void cambiarMonto(p, e.target.value)}
                      aria-label={`Monto del plan ${p.nombre}`}
                      style={{ width: 108, background: '#f4f7fa', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 11px', fontSize: 13, fontWeight: 600, color: text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    />
                    {p.activo ? (
                      <button type="button" onClick={() => void desactivar(p)}
                        style={{ background: 'transparent', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 11px', fontSize: 12, cursor: 'pointer' }}>
                        Desactivar
                      </button>
                    ) : (
                      <button type="button" onClick={() => void reactivar(p)}
                        style={{ background: 'transparent', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 11px', fontSize: 12, cursor: 'pointer' }}>
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
