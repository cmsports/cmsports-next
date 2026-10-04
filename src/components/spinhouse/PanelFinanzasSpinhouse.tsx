'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowRightLeft, CheckCircle2, Clock, Coins, Tag, TrendingUp, Users, Wallet } from 'lucide-react'
import styles from './PanelFinanzasSpinhouse.module.css'
import { cargarFinanzasSpinhouse, guardarTarifaSpinhouse, confirmarHorasSpinhouse, asignarIngresoSpinhouse, liquidarEntrenadorSpinhouse } from '@/app/actions/finanzasSpinhouse'
import { calcularLiquidacion, calcularMargenes, proyectarCaja, TIPOS_FINANZAS, type DatosFinanzasSpinhouse, type TipoFinanzas } from '@/lib/domain/finanzasSpinhouse'
import { cachedFetch, invalidate } from '@/lib/query-cache'
import { useEnVivo } from '@/lib/useEnVivo'
import { fechaChile } from '@/lib/domain/fechaChile'
import { useTextoMonto } from '@/components/Monto'
import { etiquetaCategoria } from '@/lib/domain/categoriasFinanzas'

const TABLAS = ['spinhouse_finanzas_tarifas', 'spinhouse_finanzas_horas', 'spinhouse_finanzas_asignaciones', 'spinhouse_finanzas_liquidaciones', 'asistencia_profesores', 'mensualidades', 'movimientos', 'profesores', 'bloques_horario']

const TIPOS_ETIQUETAS: Record<TipoFinanzas, string> = { grupal: 'Grupal', competitivo: 'Competitivo', particular: 'Particular', adultos: 'Adultos', paralimpico: 'Paralímpico', arriendo: 'Arriendo' }

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

  if (!datos) return (
    <div className={styles.panel}>
      <div className={`${styles.card} ${styles.loading}`}>
        {error ? <AlertCircle size={26} /> : <Wallet size={26} />}
        <p role={error ? 'alert' : 'status'}>{error || 'Cargando finanzas…'}</p>
        {error && <div className={styles.actions}><button type="button" onClick={() => { invalidate(`spinhouse-finanzas:${clubId}`); void cargar() }} className={styles.button}>Reintentar</button></div>}
      </div>
    </div>
  )
  const cerrados = new Set(datos.liquidaciones.map(l => l.profesor_id))
  const calculo = calcularLiquidacion(datos.sesiones.filter(s => !cerrados.has(s.profesor_id)), datos.tarifas)
  const detalles = [...datos.liquidaciones.flatMap(l => l.detalles), ...calculo.detalles]
  const margenes = calcularMargenes(datos.ingresos, detalles)
  const caja = proyectarCaja(datos.cuotas, mes, anio)
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const mesTerminado = `${anio}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}` < fechaChile()
  const profesoresPeriodo = [...new Set([...datos.sesiones.map(s => s.profesor_id), ...datos.liquidaciones.map(l => l.profesor_id)])]
  const ingresosMes = datos.ingresos.reduce((sum, ingreso) => sum + ingreso.monto, 0)
  const costoMes = detalles.reduce((sum, detalle) => sum + detalle.costo, 0)

  function verTabla(filas: typeof margenes.bloques, nombre: string) {
    if (!filas.length) return <div className={styles.empty}><Coins size={25} /><p className={styles.emptyTitle}>Sin movimientos en este periodo</p><p className={styles.emptyDescription}>Los ingresos cobrados y las horas valorizadas aparecerán aquí.</p></div>
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={`Márgenes por ${nombre.toLowerCase()}`}>
          <thead><tr><th scope="col">{nombre}</th><th scope="col" className={styles.number}>Ingresos cobrados</th><th scope="col" className={styles.number}>Costo entrenadores</th><th scope="col" className={styles.number}>Margen</th></tr></thead>
          <tbody>{filas.map(f => <tr key={f.clave}>
            <td>{datos?.bloques.find(b => b.id === f.clave)?.nombre ?? etiquetaCategoria(f.nombre)}</td>
            <td className={`${styles.number} ${styles.income}`}>{fmt(f.ingresos)}</td>
            <td className={`${styles.number} ${styles.cost}`}>{fmt(f.costo)}</td>
            <td className={`${styles.number} ${f.margen < 0 ? styles.cost : styles.margin}`}>{fmt(f.margen)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )
  }

  return <div className={styles.panel}>
    {error && <div role="alert" className={`${styles.alert} ${styles.error}`}><AlertCircle size={16} /><p>{error}</p></div>}
    {mensaje && <div role="status" className={`${styles.alert} ${styles.success}`}><CheckCircle2 size={16} /><p>{mensaje}</p></div>}

    <div className={styles.kpis}>
      <div className={`${styles.card} ${styles.kpi} ${styles.kpiIncome}`}><div className={styles.kpiValue}>{fmt(ingresosMes)}</div><div className={styles.kpiLabel}>💰 Ingresos cobrados</div><div className={styles.kpiHint}>Movimientos del mes seleccionado</div></div>
      <div className={`${styles.card} ${styles.kpi} ${styles.kpiCost}`}><div className={styles.kpiValue}>{fmt(costoMes)}</div><div className={styles.kpiLabel}>💸 Costo de entrenadores</div><div className={styles.kpiHint}>Horas con tarifa confirmada</div></div>
      <div className={`${styles.card} ${styles.kpi}`}><div className={styles.kpiValue}>{fmt(ingresosMes - costoMes)}</div><div className={styles.kpiLabel}>📊 {calculo.pendientes.length ? 'Margen parcial' : 'Margen del mes'}</div><div className={styles.kpiHint}>Ingresos menos costo de entrenadores</div></div>
    </div>

    <section className={styles.card}>
      <div className={styles.header}><div><h2 className={styles.title}><TrendingUp size={18} /> Márgenes del mes</h2><p className={styles.description}>Consulta los ingresos y el costo de las clases por línea de negocio y bloque.</p></div></div>
      {calculo.pendientes.length > 0 && <div className={styles.alert}><AlertCircle size={16} /><p><strong>Margen parcial.</strong> {calculo.pendientes.length} sesiones todavía tienen horas o tarifas pendientes.</p></div>}
      <h3 className={styles.subheading}>Por línea de negocio</h3>{verTabla(margenes.lineas, 'Línea de negocio')}
      <h3 className={styles.subheading}>Por bloque</h3>{verTabla(margenes.bloques, 'Bloque')}
      <p className={styles.note}>El margen descuenta solamente el costo de entrenadores. Los ingresos sin bloque se muestran separados; así evitas atribuir cuotas a grupos sin respaldo.</p>
    </section>

    <section className={styles.card}>
      <div className={styles.header}><div><h3 className={styles.title}><Tag size={18} /> Tarifas de entrenadores</h3><p className={styles.description}>Define el valor por hora según entrenador, tipo de clase, rol y mes de vigencia.</p></div></div>
      <form onSubmit={e => { e.preventDefault(); void operar(() => guardarTarifaSpinhouse({ ...tarifa, montoHora: Number(tarifa.montoHora) }), 'Tarifa guardada. Las liquidaciones cerradas conservan sus importes.') }}>
        <div className={styles.formGrid}>
          <label className={styles.field}><span className={styles.label}>Entrenador</span><select required className={styles.input} value={tarifa.profesorId} onChange={e => setTarifa({ ...tarifa, profesorId: e.target.value })}><option value="">Selecciona un entrenador</option>{datos.profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <label className={styles.field}><span className={styles.label}>Tipo de clase</span><select className={styles.input} value={tarifa.tipoClase} onChange={e => setTarifa({ ...tarifa, tipoClase: e.target.value as TipoFinanzas })}>{TIPOS_FINANZAS.map(t => <option key={t} value={t}>{TIPOS_ETIQUETAS[t]}</option>)}</select></label>
          <label className={styles.field}><span className={styles.label}>Rol del entrenador</span><select className={styles.input} value={tarifa.rol} onChange={e => setTarifa({ ...tarifa, rol: e.target.value as 'principal' | 'auxiliar' })}><option value="principal">Principal</option><option value="auxiliar">Auxiliar</option></select></label>
          <label className={styles.field}><span className={styles.label}>Vigente desde el mes</span><input required type="month" className={styles.input} value={tarifa.desde.slice(0,7)} onChange={e => setTarifa({ ...tarifa, desde: `${e.target.value}-01` })} /></label>
          <label className={styles.field}><span className={styles.label}>Tarifa por hora · CLP</span><input required type="number" min="0" max="10000000" placeholder="Ej. 15000" className={styles.input} value={tarifa.montoHora} onChange={e => setTarifa({ ...tarifa, montoHora: e.target.value })} /></label>
        </div>
        <div className={styles.actions}><button disabled={ocupado} className={styles.button}>{ocupado ? 'Guardando…' : 'Guardar tarifa'}</button></div>
      </form>
      <h4 className={styles.subheading}>Tarifas registradas</h4>
      {datos.tarifas.length ? <div className={styles.tableWrap}><table className={styles.table} aria-label="Tarifas registradas"><thead><tr><th scope="col">Entrenador</th><th scope="col">Clase y rol</th><th scope="col">Vigencia</th><th scope="col" className={styles.number}>Tarifa por hora</th></tr></thead><tbody>{datos.tarifas.map(t => <tr key={`${t.profesor_id}:${t.tipo_clase}:${t.rol}:${t.desde}`}><td>{datos.profesores.find(p => p.id === t.profesor_id)?.nombre}</td><td>{TIPOS_ETIQUETAS[t.tipo_clase as TipoFinanzas] ?? t.tipo_clase}<span className={styles.detail}>{t.rol === 'principal' ? 'Principal' : 'Auxiliar'}</span></td><td>{t.desde}</td><td className={`${styles.number} ${styles.margin}`}>{fmt(t.monto_hora)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><Tag size={25} /><p className={styles.emptyTitle}>Todavía no hay tarifas cargadas</p><p className={styles.emptyDescription}>Registra la tarifa vigente para valorizar las horas dictadas. Las liquidaciones cerradas conservarán su importe.</p></div>}
    </section>

    {datos.sesiones.some(s => !cerrados.has(s.profesor_id)) && <section className={styles.card}>
      <div className={styles.header}><div><h3 className={styles.title}><Clock size={18} /> Confirmar o corregir horas dictadas</h3><p className={styles.description}>Revisa la duración efectivamente dictada antes de liquidar. Las marcas nuevas conservan el horario del día; los históricos necesitan confirmación.</p></div></div>
      <div className={styles.sessionList}>{datos.sesiones.filter(s => !cerrados.has(s.profesor_id)).map(s => {
        const valor = horas[s.asistencia_id] ?? { minutos: s.minutos ? String(s.minutos) : '', tipoClase: (s.tipo_clase ?? 'grupal') as TipoFinanzas, rol: (s.rol ?? 'principal') as 'principal' | 'auxiliar', seCobraAparte: s.se_cobra_aparte }
        const editar = (cambio: Partial<typeof valor>) => setHoras({ ...horas, [s.asistencia_id]: { ...valor, ...cambio } })
        const confirmada = Boolean(s.minutos && s.tipo_clase && s.rol && typeof s.se_cobra_aparte === 'boolean')
        return <form key={s.asistencia_id} className={styles.session} onSubmit={e => { e.preventDefault(); void operar(() => confirmarHorasSpinhouse({ asistenciaId: s.asistencia_id, minutos: Number(valor.minutos), tipoClase: valor.tipoClase, rol: valor.rol, seCobraAparte: valor.seCobraAparte! }), 'Horas confirmadas') }}>
          <div className={styles.sessionHeader}><div><p className={styles.sessionName}>{s.profesor_nombre}</p><p className={styles.sessionMeta}>{s.fecha} · {s.bloque_nombre}</p></div><span className={`${styles.badge} ${confirmada ? '' : styles.pendingBadge}`}>{confirmada ? 'Horas confirmadas' : 'Por confirmar'}</span></div>
          <div className={styles.formGrid}>
            <label className={styles.field}><span className={styles.label}>Minutos dictados</span><input aria-label={`Minutos dictados por ${s.profesor_nombre} el ${s.fecha}`} required type="number" min="1" max="1440" placeholder="Duración en minutos" className={styles.input} value={valor.minutos} onChange={e => editar({ minutos: e.target.value })} /></label>
            <label className={styles.field}><span className={styles.label}>Tipo de clase</span><select className={styles.input} value={valor.tipoClase} onChange={e => editar({ tipoClase: e.target.value as TipoFinanzas })}>{TIPOS_FINANZAS.map(t => <option key={t} value={t}>{TIPOS_ETIQUETAS[t]}</option>)}</select></label>
            <label className={styles.field}><span className={styles.label}>Rol</span><select className={styles.input} value={valor.rol} onChange={e => editar({ rol: e.target.value as 'principal' | 'auxiliar' })}><option value="principal">Principal</option><option value="auxiliar">Auxiliar</option></select></label>
            <label className={styles.field}><span className={styles.label}>Modalidad de cobro</span><select required className={styles.input} value={valor.seCobraAparte === null ? '' : String(valor.seCobraAparte)} onChange={e => editar({ seCobraAparte: e.target.value === '' ? null : e.target.value === 'true' })}><option value="">Confirma modalidad</option><option value="false">Incluida en mensualidad</option><option value="true">Cobro aparte</option></select></label>
          </div>
          <div className={styles.actions}><button className={styles.button} disabled={ocupado}>Confirmar horas</button></div>
        </form>
      })}</div>
    </section>}

    <section className={styles.card}>
      <div className={styles.header}><div><h3 className={styles.title}><Users size={18} /> Liquidación mensual por entrenador</h3><p className={styles.description}>Revisa el detalle de horas y tarifas. Al liquidar se guarda el importe definitivo y se registra un gasto de sueldo.</p></div></div>
      <div className={styles.alert}><AlertCircle size={16} /><p>Revisa los gastos de sueldo ya ingresados para evitar duplicarlos.{!mesTerminado && ' La liquidación estará disponible al terminar el mes.'}</p></div>
      {profesoresPeriodo.length ? <div className={styles.payroll} style={{ marginTop: 16 }}>{profesoresPeriodo.map(id => {
        const liquidada = datos.liquidaciones.find(l => l.profesor_id === id)
        const ds = detalles.filter(d => d.profesor_id === id)
        const pendientes = calculo.pendientes.filter(p => p.sesion.profesor_id === id)
        return <div key={id} className={styles.payrollItem}>
          <div className={styles.sessionHeader}><div><p className={styles.sessionName}>{liquidada?.profesor_nombre ?? datos.profesores.find(p => p.id === id)?.nombre}</p><span className={`${styles.badge} ${liquidada ? '' : styles.pendingBadge}`} style={{ marginTop: 6 }}>{liquidada ? <CheckCircle2 size={12} /> : <Clock size={12} />}{liquidada ? 'Liquidada' : 'Por liquidar'}</span></div><div className={styles.payrollTotal}>{fmt(liquidada?.total ?? ds.reduce((sum,d) => sum + d.costo,0))}<div className={styles.payrollTotalLabel}>{liquidada ? 'Importe cerrado' : 'Horas valorizadas'}</div></div></div>
          {ds.length > 0 && <div className={styles.tableWrap}><table className={styles.table} aria-label={`Detalle de liquidación de ${liquidada?.profesor_nombre ?? datos.profesores.find(p => p.id === id)?.nombre}`}><thead><tr><th scope="col">Fecha y bloque</th><th scope="col">Clase y cobro</th><th scope="col" className={styles.number}>Minutos</th><th scope="col" className={styles.number}>Tarifa / hora</th><th scope="col" className={styles.number}>Costo</th></tr></thead><tbody>{ds.map(d => <tr key={d.asistencia_id}><td>{d.fecha}<span className={styles.detail}>{d.bloque_nombre}</span></td><td>{TIPOS_ETIQUETAS[d.tipo_clase as TipoFinanzas] ?? d.tipo_clase} · {d.rol}<span className={styles.detail}>{d.tipo_clase === 'arriendo' ? 'Arriendo' : d.se_cobra_aparte ? 'Cobro aparte' : 'Incluida en mensualidad'}</span></td><td className={styles.number}>{d.minutos}</td><td className={styles.number}>{fmt(d.monto_hora)}</td><td className={`${styles.number} ${styles.margin}`}>{fmt(d.costo)}</td></tr>)}</tbody></table></div>}
          {pendientes.length > 0 && <div className={styles.pendingList}>{pendientes.map(p => <p key={p.sesion.asistencia_id}>{p.sesion.fecha}: {p.motivo}</p>)}</div>}
          {!liquidada && <div className={styles.actions}><button className={styles.button} disabled={ocupado || !mesTerminado || pendientes.length > 0 || !ds.length} onClick={() => { if (window.confirm('Se cerrará la liquidación y se registrará el gasto de sueldo. Verifica que no exista un pago manual para este periodo. ¿Liquidar?')) void operar(() => liquidarEntrenadorSpinhouse({ profesorId: id, mes, anio }), 'Liquidación cerrada y gasto registrado') }}>Liquidar y registrar gasto</button></div>}
        </div>
      })}</div> : <div className={styles.empty} style={{ marginTop: 16 }}><Users size={25} /><p className={styles.emptyTitle}>Sin asistencias de entrenadores</p><p className={styles.emptyDescription}>Cuando haya clases dictadas en este mes, podrás revisar y liquidar sus horas.</p></div>}
    </section>

    <section className={styles.card}>
      <div className={styles.header}><div><h3 className={styles.title}><ArrowRightLeft size={18} /> Asignar ingresos a bloques</h3><p className={styles.description}>Asigna solamente ingresos que correspondan a un bloque concreto. La categoría y el importe original se conservan.</p></div></div>
      {datos.ingresos.length ? <div className={styles.tableWrap}><table className={styles.table} aria-label="Asignación de ingresos a bloques"><thead><tr><th scope="col">Ingreso</th><th scope="col" className={styles.number}>Monto</th><th scope="col">Bloque asignado</th></tr></thead><tbody>{datos.ingresos.map(i => <tr key={i.id}><td>{i.descripcion || etiquetaCategoria(i.categoria)}{i.descripcion && <span className={styles.detail}>{etiquetaCategoria(i.categoria)}</span>}</td><td className={`${styles.number} ${styles.income}`}>{fmt(i.monto)}</td><td><select aria-label={`Bloque de ${i.descripcion ?? i.categoria}`} className={styles.input} value={i.bloque_id ?? ''} disabled={ocupado} onChange={e => { void operar(() => asignarIngresoSpinhouse({ movimientoId: i.id, bloqueId: e.target.value || null }), 'Asignación guardada') }}><option value="">Sin bloque asignado</option>{datos.bloques.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select></td></tr>)}</tbody></table></div> : <div className={styles.empty}><ArrowRightLeft size={25} /><p className={styles.emptyTitle}>Sin ingresos para asignar</p><p className={styles.emptyDescription}>Los ingresos del mes aparecerán aquí cuando estén registrados.</p></div>}
    </section>

    <section className={styles.card}>
      <div className={styles.header}><div><h3 className={styles.title}><Wallet size={18} /> Proyección de cobros del mes siguiente</h3><p className={styles.description}>Estimación según cuotas emitidas y morosidad de los seis meses anteriores.</p></div></div>
      <div className={styles.cashStats}>
        <div className={styles.cashStat}><p className={styles.kpiLabel}>Cuotas emitidas</p><div className={styles.cashValue}>{fmt(caja.emitido)}</div><p className={styles.detail}>{caja.cantidadCuotas} cuotas del próximo mes</p></div>
        <div className={styles.cashStat}><p className={styles.kpiLabel}>Morosidad histórica</p><div className={caja.morosidad === null ? styles.cashMissing : styles.cashValue}>{caja.morosidad === null ? 'Sin historial suficiente' : `${(caja.morosidad * 100).toFixed(1)} %`}</div><p className={styles.detail}>Seis meses anteriores</p></div>
        <div className={`${styles.cashStat} ${styles.cashStatExpected}`}><p className={styles.kpiLabel}>Cobro esperado</p><div className={caja.proyectado === null ? styles.cashMissing : styles.cashValue}>{caja.proyectado === null ? 'Sin proyección disponible' : fmt(caja.proyectado)}</div><p className={styles.detail}>Importe estimado</p></div>
      </div>
      <p className={styles.note}>Cuotas emitidas del próximo mes × porcentaje de cuotas históricas pagadas, ponderado por monto. Excluye exentos. Si todavía no se emitieron cuotas o no hay historial, no se estima un importe. Este cálculo proyecta cobros; no descuenta otros gastos futuros.</p>
    </section>
  </div>
}
