'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cargarFinanzasSpinhouse, guardarTarifaSpinhouse, confirmarHorasSpinhouse, asignarIngresoSpinhouse, liquidarEntrenadorSpinhouse } from '@/app/actions/finanzasSpinhouse'
import { calcularLiquidacion, calcularMargenes, proyectarCaja, TIPOS_FINANZAS, type DatosFinanzasSpinhouse, type TipoFinanzas } from '@/lib/domain/finanzasSpinhouse'
import { cachedFetch, invalidate } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { useTextoMonto } from '@/components/Monto'
import { etiquetaCategoria } from '@/lib/domain/categoriasFinanzas'

const TABLAS = ['spinhouse_finanzas_tarifas', 'spinhouse_finanzas_horas', 'spinhouse_finanzas_asignaciones', 'spinhouse_finanzas_liquidaciones', 'asistencia_profesores', 'mensualidades', 'movimientos', 'profesores', 'bloques_horario']
const inputClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const buttonClass = 'rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const panelClass = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3'

export default function PanelFinanzasSpinhouse({ clubId, mes, anio }: { clubId: string | null; mes: number; anio: number }) {
  const fmt = useTextoMonto()
  const claveActual = `${clubId}:${anio}:${mes}`
  const peticion = useRef(0)
  const [estado, setEstado] = useState<{ clave: string; datos: DatosFinanzasSpinhouse } | null>(null)
  const datos = estado?.clave === claveActual ? estado.datos : null
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [tarifa, setTarifa] = useState({ profesorId: '', tipoClase: 'grupal' as TipoFinanzas, rol: 'principal' as 'principal' | 'auxiliar', desde: `${anio}-${String(mes).padStart(2,'0')}-01`, montoHora: '' })
  const [horas, setHoras] = useState<Record<string, { minutos: string; tipoClase: TipoFinanzas; rol: 'principal' | 'auxiliar'; seCobraAparte: boolean | null }>>({})
  const cargar = useCallback(async () => {
    if (!clubId) return
    const solicitud = ++peticion.current
    try {
      const result = await cachedFetch(`spinhouse-finanzas:${clubId}:${anio}:${mes}`, () => cargarFinanzasSpinhouse({ mes, anio }), 60000, TABLAS)
      if (solicitud !== peticion.current) return
      if ('error' in result) { setError(result.error ?? 'No se pudo cargar'); setEstado(null); return }
      setEstado({ clave: `${clubId}:${anio}:${mes}`, datos: result.data }); setError('')
    } catch { if (solicitud === peticion.current) { setError('No se pudieron cargar las finanzas. Reintenta.'); setEstado(null) } }
  }, [clubId, mes, anio])
  useEffect(() => { void cargar() }, [cargar])
  useEnVivo(TABLAS, clubId, () => { void cargar() }, { conClub: TABLAS })

  async function operar(accion: () => Promise<{ error?: string; data?: unknown }>, exito: string) {
    if (ocupado) return
    setOcupado(true); setMensaje(''); setError('')
    try {
      const result = await accion()
      if (result.error) { setError(result.error); return }
      invalidate(`spinhouse-finanzas:${clubId}`)
      setMensaje(exito)
      await cargar()
    } catch { setError('No se confirmó la operación. Revisa los datos antes de reintentar.') }
    finally { setOcupado(false) }
  }

  if (!datos) return <div className={panelClass}><p role={error ? 'alert' : 'status'}>{error || 'Cargando finanzas…'}</p><button onClick={() => { invalidate(`spinhouse-finanzas:${clubId}`); void cargar() }} className={buttonClass}>Reintentar</button></div>
  const cerrados = new Set(datos.liquidaciones.map(l => l.profesor_id))
  const calculo = calcularLiquidacion(datos.sesiones.filter(s => !cerrados.has(s.profesor_id)), datos.tarifas)
  const detalles = [...datos.liquidaciones.flatMap(l => l.detalles), ...calculo.detalles]
  const margenes = calcularMargenes(datos.ingresos, detalles)
  const caja = proyectarCaja(datos.cuotas, mes, anio)
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const mesTerminado = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}` < fechaChile()
  const profesoresPeriodo = [...new Set([...datos.sesiones.map(s => s.profesor_id), ...datos.liquidaciones.map(l => l.profesor_id)])]

  function verTabla(filas: typeof margenes.bloques) {
    return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Línea / bloque</th><th className="p-2">Ingresos cobrados</th><th className="p-2">Costo entrenadores</th><th className="p-2">Margen</th></tr></thead><tbody>{filas.map(f => <tr key={f.clave} className="border-t border-slate-100"><td className="p-2">{datos?.bloques.find(b => b.id === f.clave)?.nombre ?? etiquetaCategoria(f.nombre)}</td><td className="p-2">{fmt(f.ingresos)}</td><td className="p-2">{fmt(f.costo)}</td><td className="p-2">{fmt(f.margen)}</td></tr>)}</tbody></table>{!filas.length && <p>No hay ingresos ni horas valorizadas en este periodo.</p>}</div>
  }
  return <div className="space-y-4 text-slate-900">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {mensaje && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{mensaje}</p>}
    <section className={panelClass}><h2 className="text-lg font-bold">Márgenes y liquidaciones</h2><p className="text-sm text-slate-600">Las tarifas y las horas confirmadas valorizan las clases dictadas. Al liquidar se guarda el detalle definitivo y se registra un gasto de sueldo. Revisa los gastos de sueldo ya ingresados para evitar duplicarlos.</p>
      {calculo.pendientes.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Margen parcial: {calculo.pendientes.length} sesiones todavía tienen horas o tarifas pendientes.</p>}
      <h3 className="font-semibold">Por línea de negocio</h3>{verTabla(margenes.lineas)}<h3 className="font-semibold">Por bloque</h3>{verTabla(margenes.bloques)}
      <p className="text-xs text-slate-600">El margen descuenta solamente el costo de entrenadores. Los ingresos sin bloque se muestran separados; así evitas atribuir cuotas a grupos sin respaldo.</p>
    </section>
    <section className={panelClass}><h3 className="font-bold">Tarifa por entrenador, clase y rol</h3>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void operar(() => guardarTarifaSpinhouse({ ...tarifa, montoHora: Number(tarifa.montoHora) }), 'Tarifa guardada. Las liquidaciones cerradas conservan sus importes.') }}>
        <select aria-label="Entrenador" required className={inputClass} value={tarifa.profesorId} onChange={e => setTarifa({ ...tarifa, profesorId: e.target.value })}><option value="">Entrenador</option>{datos.profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        <select aria-label="Tipo de clase" className={inputClass} value={tarifa.tipoClase} onChange={e => setTarifa({ ...tarifa, tipoClase: e.target.value as TipoFinanzas })}>{TIPOS_FINANZAS.map(t => <option key={t}>{t}</option>)}</select>
        <select aria-label="Rol del entrenador" className={inputClass} value={tarifa.rol} onChange={e => setTarifa({ ...tarifa, rol: e.target.value as 'principal' | 'auxiliar' })}><option>principal</option><option>auxiliar</option></select>
        <label className="text-sm">Vigente desde el mes<input aria-label="Mes de vigencia" required type="month" className={inputClass} value={tarifa.desde.slice(0,7)} onChange={e => setTarifa({ ...tarifa, desde: `${e.target.value}-01` })} /></label>
        <input aria-label="Tarifa CLP por hora" required type="number" min="0" max="10000000" placeholder="CLP por hora" className={inputClass} value={tarifa.montoHora} onChange={e => setTarifa({ ...tarifa, montoHora: e.target.value })} /><button disabled={ocupado} className={buttonClass}>Guardar tarifa</button>
      </form><div className="space-y-1 text-sm">{datos.tarifas.map(t => <p key={`${t.profesor_id}:${t.tipo_clase}:${t.rol}:${t.desde}`}>{datos.profesores.find(p => p.id === t.profesor_id)?.nombre} · {t.tipo_clase} · {t.rol} · desde {t.desde}: {fmt(t.monto_hora)} / hora</p>)}</div>
    </section>
    {datos.sesiones.some(s => !cerrados.has(s.profesor_id)) && <section className={panelClass}><h3 className="font-bold">Confirmar o corregir horas dictadas</h3><p className="text-sm text-slate-600">Revisa la duración efectivamente dictada antes de liquidar. Las marcas nuevas conservan el horario del día; los históricos necesitan confirmación porque el horario actual no permite reconstruirlos.</p>{datos.sesiones.filter(s => !cerrados.has(s.profesor_id)).map(s => {
      const valor = horas[s.asistencia_id] ?? { minutos: s.minutos ? String(s.minutos) : '', tipoClase: (s.tipo_clase ?? 'grupal') as TipoFinanzas, rol: (s.rol ?? 'principal') as 'principal' | 'auxiliar', seCobraAparte: s.se_cobra_aparte }
      const editar = (cambio: Partial<typeof valor>) => setHoras({ ...horas, [s.asistencia_id]: { ...valor, ...cambio } })
      return <form key={s.asistencia_id} className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm" onSubmit={e => { e.preventDefault(); void operar(() => confirmarHorasSpinhouse({ asistenciaId: s.asistencia_id, minutos: Number(valor.minutos), tipoClase: valor.tipoClase, rol: valor.rol, seCobraAparte: valor.seCobraAparte! }), 'Horas confirmadas') }}><span>{s.fecha} · {s.profesor_nombre} · {s.bloque_nombre}</span><input aria-label={`Minutos dictados por ${s.profesor_nombre} el ${s.fecha}`} required type="number" min="1" max="1440" placeholder="Minutos" className={inputClass} value={valor.minutos} onChange={e => editar({ minutos: e.target.value })} /><select aria-label="Tipo histórico" className={inputClass} value={valor.tipoClase} onChange={e => editar({ tipoClase: e.target.value as TipoFinanzas })}>{TIPOS_FINANZAS.map(t => <option key={t}>{t}</option>)}</select><select aria-label="Rol histórico" className={inputClass} value={valor.rol} onChange={e => editar({ rol: e.target.value as 'principal' | 'auxiliar' })}><option>principal</option><option>auxiliar</option></select><select aria-label="Modalidad de cobro histórica" required className={inputClass} value={valor.seCobraAparte === null ? '' : String(valor.seCobraAparte)} onChange={e => editar({ seCobraAparte: e.target.value === '' ? null : e.target.value === 'true' })}><option value="">Confirma modalidad de cobro</option><option value="false">Incluida en mensualidad</option><option value="true">Cobro aparte</option></select><button className={buttonClass} disabled={ocupado}>Confirmar horas</button></form>
    })}</section>}
    <section className={panelClass}><h3 className="font-bold">Liquidación mensual por entrenador</h3>{!mesTerminado && <p className="text-sm text-slate-600">La liquidación estará disponible al terminar el mes.</p>}{profesoresPeriodo.map(id => {
      const liquidada = datos.liquidaciones.find(l => l.profesor_id === id)
      const ds = detalles.filter(d => d.profesor_id === id)
      const pendientes = calculo.pendientes.filter(p => p.sesion.profesor_id === id)
      return <div key={id} className="space-y-2 border-t py-3"><p className="font-medium">{liquidada?.profesor_nombre ?? datos.profesores.find(p => p.id === id)?.nombre} · {liquidada ? 'Liquidada' : 'Por liquidar'} · {fmt(liquidada?.total ?? ds.reduce((sum,d) => sum + d.costo,0))}</p><ul className="text-sm">{ds.map(d => <li key={d.asistencia_id}>{d.fecha} · {d.bloque_nombre} · {d.tipo_clase} / {d.rol} · {d.tipo_clase === 'arriendo' ? 'Arriendo' : d.se_cobra_aparte ? 'Cobro aparte' : 'Incluida en mensualidad'}: {d.minutos} min × {fmt(d.monto_hora)} / hora = {fmt(d.costo)}</li>)}</ul>{pendientes.map(p => <p className="text-sm text-amber-800" key={p.sesion.asistencia_id}>{p.sesion.fecha}: {p.motivo}</p>)}{!liquidada && <button className={buttonClass} disabled={ocupado || !mesTerminado || pendientes.length > 0 || !ds.length} onClick={() => { if (window.confirm('Se cerrará la liquidación y se registrará el gasto de sueldo. Verifica que no exista un pago manual para este periodo. ¿Liquidar?')) void operar(() => liquidarEntrenadorSpinhouse({ profesorId: id, mes, anio }), 'Liquidación cerrada y gasto registrado') }}>Liquidar y registrar gasto</button>}</div>
    })}{!profesoresPeriodo.length && <p>No hay asistencias de entrenadores en este mes.</p>}</section>
    <section className={panelClass}><h3 className="font-bold">Asignar ingresos a bloques</h3><p className="text-sm text-slate-600">Asigna solamente ingresos que correspondan a un bloque concreto. La categoría y el importe original se conservan.</p>{datos.ingresos.map(i => <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"><span>{i.descripcion || etiquetaCategoria(i.categoria)} · {fmt(i.monto)}</span><select aria-label={`Bloque de ${i.descripcion ?? i.categoria}`} className={inputClass} value={i.bloque_id ?? ''} disabled={ocupado} onChange={e => { void operar(() => asignarIngresoSpinhouse({ movimientoId: i.id, bloqueId: e.target.value || null }), 'Asignación guardada') }}><option value="">Sin bloque asignado</option>{datos.bloques.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></div>)}</section>
    <section className={panelClass}><h3 className="font-bold">Proyección de cobros del mes siguiente</h3><p>{caja.cantidadCuotas} cuotas emitidas · {fmt(caja.emitido)}</p><p>Morosidad de los seis meses anteriores: {caja.morosidad === null ? 'Sin historial suficiente' : `${(caja.morosidad * 100).toFixed(1)} %`}</p><p className="font-semibold">Cobro esperado: {caja.proyectado === null ? 'Sin proyección disponible' : fmt(caja.proyectado)}</p><p className="text-xs text-slate-600">Cuotas emitidas del próximo mes × porcentaje de cuotas históricas pagadas, ponderado por monto. Excluye exentos. Si todavía no se emitieron cuotas o no hay historial, no se estima un importe. Este cálculo proyecta cobros; no descuenta otros gastos futuros.</p></section>
  </div>
}
