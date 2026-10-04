'use client'

import { useCallback, useEffect, useState } from 'react'
import { Accessibility } from 'lucide-react'
import styles from './SpinhouseComplementos.module.css'
import { cargarFichaParalimpica, guardarFichaParalimpica, registrarConsentimientoSalud } from '@/app/actions/ficha-paralimpica'
import { MODALIDADES_PARALIMPICAS, requiereApoderado, type ConsentimientoSalud, type FichaParalimpica, type ModalidadParalimpica } from '@/lib/domain/fichaParalimpica'
import { fechaChile } from '@/lib/domain/fechaChile'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { cachedFetch, invalidate } from '@/lib/query-cache'

const TABLAS = ['jugador_ficha_paralimpica', 'jugador_consentimientos_salud']
const campo = { width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, background: '#f8fafc', color: '#0f172a', fontFamily: 'inherit' } as const
const boton = { border: '1px solid transparent', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#4f46e5', color: '#fff', cursor: 'pointer' } as const
const cancelar = { ...boton, background: '#fff', border: '1px solid #e2e8f0', color: '#64748b' } as const
const etiqueta = { display: 'grid', gap: 5, fontSize: 12, color: '#475569', marginBottom: 12 } as const

export default function PanelFichaParalimpica({ jugadorId, clubId, fechaNacimiento, puedeEditar }: {
  jugadorId: string
  clubId: string
  fechaNacimiento: string | null
  puedeEditar: boolean
}) {
  const { perfil } = usePerfil()
  const claveCache = `ficha-paralimpica:${perfil?.id ?? ''}:${clubId}:${jugadorId}`
  const [ficha, setFicha] = useState<FichaParalimpica | null>(null)
  const [firmas, setFirmas] = useState<ConsentimientoSalud[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargaExitosa, setCargaExitosa] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [firmaAbierta, setFirmaAbierta] = useState(false)
  const [modalidad, setModalidad] = useState<ModalidadParalimpica | ''>('')
  const [clase, setClase] = useState('')
  const [accesibilidad, setAccesibilidad] = useState('')
  const [fechaFirma, setFechaFirma] = useState(fechaChile)
  const [otorgado, setOtorgado] = useState(true)
  const [firmadoPor, setFirmadoPor] = useState<'jugador' | 'apoderado'>('apoderado')
  const [nombreFirmante, setNombreFirmante] = useState('')
  const [respaldo, setRespaldo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const res = await cachedFetch(claveCache, async () => {
        const respuesta = await cargarFichaParalimpica(jugadorId)
        if ('error' in respuesta) throw new Error(respuesta.error)
        return respuesta
      }, 30_000, TABLAS)
      setCargaExitosa(true)
      setFicha(res.ficha)
      setFirmas(res.consentimientos)
      setError('')
    } catch (err) {
      setCargaExitosa(false)
      setError(err instanceof Error ? err.message : 'No se pudo cargar la ficha paralímpica.')
    } finally { setCargando(false) }
  }, [claveCache, jugadorId])

  useEffect(() => {
    const inicial = setTimeout(() => { void cargar() }, 0)
    return () => clearTimeout(inicial)
  }, [cargar])
  useEnVivo(TABLAS, clubId, () => { void cargar() }, { conClub: TABLAS })

  const vigente = firmas.find(f => f.fecha <= fechaChile())
  const autorizado = vigente?.otorgado === true
  const apoderadoObligatorio = requiereApoderado(fechaNacimiento, fechaFirma)
  const opcionesClase = MODALIDADES_PARALIMPICAS.find(m => m.valor === modalidad)?.clases ?? []

  async function guardar() {
    if (guardando) return
    setGuardando(true); setError(''); setMensaje('')
    try {
      const res = await guardarFichaParalimpica({
        jugadorId, modalidad: modalidad || null, claseDeportiva: clase ? Number(clase) : null,
        necesidadesAccesibilidad: accesibilidad,
      })
      if (res.error) { setError(res.error); return }
      setEditando(false); setMensaje('Ficha guardada.'); invalidate(claveCache); await cargar()
    } catch { setError('No se pudo guardar la ficha. Intenta nuevamente.') }
    finally { setGuardando(false) }
  }

  async function registrarFirma() {
    if (guardando) return
    setGuardando(true); setError(''); setMensaje('')
    try {
      const res = await registrarConsentimientoSalud({
        jugadorId, otorgado, fecha: fechaFirma, firmadoPor: apoderadoObligatorio ? 'apoderado' : firmadoPor,
        nombreFirmante, respaldo,
      })
      if (res.error) { setError(res.error); return }
      setFirmaAbierta(false); setEditando(false); setMensaje('Firma registrada.'); invalidate(claveCache); await cargar()
    } catch { setError('No se pudo registrar la firma. Intenta nuevamente.') }
    finally { setGuardando(false) }
  }

  return (
    <section className={styles.panel} style={{ marginBottom: 16 }}>
      <h3 className={styles.title}><span className={styles.titleIcon}><Accessibility size={16} /></span>Ficha paralímpica</h3>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>Clasificación deportiva y apoyos para entrenar. Información privada del jugador y del staff autorizado.</p>
      {cargando && <p style={{ fontSize: 13 }}>Cargando ficha…</p>}
      {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
      {!cargando && !cargaExitosa && <button style={boton} onClick={() => { invalidate(claveCache); void cargar() }}>Reintentar carga</button>}
      {mensaje && <p role="status" style={{ color: '#15803d', fontSize: 13 }}>{mensaje}</p>}
      {!cargando && cargaExitosa && <>
        <div style={{ background: autorizado ? '#f0fdf4' : '#fff7ed', border: `1px solid ${autorizado ? '#bbf7d0' : '#fed7aa'}`, borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
          <strong>Datos de salud: {autorizado ? 'autorizados' : vigente ? 'consentimiento retirado' : 'sin consentimiento registrado'}</strong>
          <p style={{ margin: '6px 0 0' }}>{autorizado ? 'El consentimiento permite registrar la clasificación y los apoyos para el entrenamiento.' : 'Hace falta consentimiento vigente antes de registrar estos datos. Si es menor de edad, debe firmar su apoderado.'}</p>
          {vigente && <p style={{ margin: '6px 0 0' }}>Firma del {vigente.fecha} · {vigente.nombre_firmante} ({vigente.firmado_por === 'apoderado' ? 'apoderado' : 'jugador'})</p>}
          {puedeEditar && !firmaAbierta && <button style={{ ...boton, marginTop: 10 }} onClick={() => { setOtorgado(!autorizado); setFechaFirma(fechaChile()); setFirmaAbierta(true); setMensaje('') }}>Registrar {autorizado ? 'retiro o nueva firma' : 'consentimiento'}</button>}
        </div>

        {firmaAbierta && puedeEditar && <div className={styles.formBox}>
          <p style={{ fontSize: 12, margin: '0 0 12px', color: '#475569' }}>Finalidad de la autorización: tratar la clasificación deportiva y las necesidades de apoyo para organizar entrenamientos inclusivos. Conserva el documento firmado; este registro deja constancia de su autorización o retiro.</p>
          <div className={styles.formGrid}><label style={etiqueta}>Autorización<select style={campo} value={otorgado ? 'si' : 'no'} onChange={e => setOtorgado(e.target.value === 'si')}><option value="si">Autoriza el tratamiento de datos de salud</option><option value="no">Retira la autorización</option></select></label>
          <label style={etiqueta}>Fecha de firma<input style={campo} type="date" value={fechaFirma} max={fechaChile()} onChange={e => setFechaFirma(e.target.value)} /></label>
          <label style={etiqueta}>Quién firmó<select style={campo} value={apoderadoObligatorio ? 'apoderado' : firmadoPor} disabled={apoderadoObligatorio} onChange={e => setFirmadoPor(e.target.value as 'jugador' | 'apoderado')}><option value="apoderado">Apoderado</option><option value="jugador">El jugador</option></select></label>
          </div>{apoderadoObligatorio && <p style={{ fontSize: 12, color: '#92400e' }}>Debe firmar el apoderado: el jugador era menor a la fecha de la firma o falta acreditar su fecha de nacimiento.</p>}
          <label style={etiqueta}>Nombre completo de quien firmó<input style={campo} maxLength={160} value={nombreFirmante} onChange={e => setNombreFirmante(e.target.value)} /></label>
          <label style={etiqueta}>Dónde se conserva el respaldo de la firma<input style={campo} maxLength={1000} value={respaldo} onChange={e => setRespaldo(e.target.value)} placeholder="Documento firmado en carpeta del club" /></label>
          <div className={styles.actions}><button style={boton} disabled={guardando} onClick={() => void registrarFirma()}>{guardando ? 'Registrando…' : 'Registrar firma'}</button><button style={cancelar} disabled={guardando} onClick={() => setFirmaAbierta(false)}>Cancelar</button></div>
        </div>}

        {ficha && !editando && <div className={styles.detailGrid}>
          <div><strong>Modalidad:</strong> {MODALIDADES_PARALIMPICAS.find(m => m.valor === ficha.modalidad)?.etiqueta ?? 'Sin clasificación'}</div>
          <div><strong>Clase deportiva:</strong> {ficha.clase_deportiva ?? 'Pendiente de clasificación'}</div>
          <div><strong>Necesidades de accesibilidad:</strong> {ficha.necesidades_accesibilidad ?? 'Sin registrar'}</div>
        </div>}
        {!ficha && autorizado && <p style={{ fontSize: 13, color: '#64748b' }}>Todavía no se registró la clasificación ni los apoyos.</p>}
        {autorizado && puedeEditar && !editando && <button style={{ ...boton, marginTop: 12 }} onClick={() => { setModalidad(ficha?.modalidad ?? ''); setClase(ficha?.clase_deportiva?.toString() ?? ''); setAccesibilidad(ficha?.necesidades_accesibilidad ?? ''); setEditando(true); setMensaje('') }}>Editar ficha</button>}
        {editando && autorizado && puedeEditar && <div className={styles.formBox}>
          <div className={styles.formGrid}><label style={etiqueta}>Modalidad<select style={campo} value={modalidad} onChange={e => { setModalidad(e.target.value as ModalidadParalimpica | ''); setClase('') }}><option value="">Sin clasificación</option>{MODALIDADES_PARALIMPICAS.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}</select></label>
          <label style={etiqueta}>Clase deportiva<select style={campo} value={clase} disabled={!modalidad} onChange={e => setClase(e.target.value)}><option value="">Pendiente de clasificación</option>{opcionesClase.map(n => <option key={n} value={n}>Clase {n}</option>)}</select></label>
          </div><p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Registra la clasificación deportiva acreditada. Si falta, déjala pendiente.</p>
          <label style={etiqueta}>Necesidades de accesibilidad<textarea style={campo} rows={3} maxLength={2000} value={accesibilidad} onChange={e => setAccesibilidad(e.target.value)} placeholder="Rampa, apoyo para traslado, intérprete…" /></label>
          <div className={styles.actions}><button style={boton} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar ficha'}</button><button style={cancelar} disabled={guardando} onClick={() => setEditando(false)}>Cancelar</button></div>
        </div>}
        {firmas.length > 0 && <details className={styles.history}><summary>Historial de consentimientos</summary>{firmas.map(f => <p key={f.id} className={styles.historyEntry}>{f.fecha}: {f.otorgado ? 'autoriza' : 'retira'} · {f.nombre_firmante} ({f.firmado_por}) · respaldo: {f.respaldo}{f.registrado_por_nombre && ` · registrado por ${f.registrado_por_nombre}`}</p>)}</details>}
      </>}
    </section>
  )
}
