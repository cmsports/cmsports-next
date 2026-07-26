'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Upload, Download, Trash2 } from 'lucide-react'
import { subirDocumentoJugador, eliminarDocumentoJugador, type TipoDocumento } from '@/app/actions/jugadores'
import { firmarUrls } from '@/lib/supabase/privado'

const DOCS: { tipo: TipoDocumento; label: string; icono: string }[] = [
  { tipo: 'derecho_formacion', label: 'Derecho de formación', icono: '📄' },
  { tipo: 'carta_compromiso',  label: 'Carta de compromiso',  icono: '✍️' },
]

const ACEPTA = '.pdf,.doc,.docx,image/*'

type Doc = { tipo: string; archivo_url: string | null; archivo_path: string | null; nombre_archivo: string | null; subido_por: string | null; creado_en: string }

export default function DocumentosJugador({ jugadorId, puedeEditar }: {
  jugadorId: string
  /** El propio jugador y el staff pueden subir; el resto solo ve y descarga. */
  puedeEditar: boolean
}) {
  const [docs, setDocs]         = useState<Record<string, Doc>>({})
  const [urls, setUrls]         = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError]       = useState('')
  const refs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    let activo = true
    async function cargar() {
      const { data } = await createClient().from('jugador_documentos')
        .select('tipo,archivo_url,archivo_path,nombre_archivo,subido_por,creado_en')
        .eq('jugador_id', jugadorId)
      if (!activo) return

      const filas = (data as Doc[]) || []
      // Los archivos viven en el bucket privado: el enlace se firma acá y vence.
      const firmadas = await firmarUrls(filas.map(d => d.archivo_path))
      if (!activo) return

      const mapa: Record<string, Doc> = {}
      for (const d of filas) mapa[d.tipo] = d
      setDocs(mapa)
      setUrls(firmadas)
      setCargando(false)
    }
    void cargar()
    return () => { activo = false }
  }, [jugadorId])

  // Enlace vigente del documento (firmado ahora, o el legado del bucket público).
  const enlaceDe = (d: Doc) => (d.archivo_path ? urls[d.archivo_path] : d.archivo_url) || null

  async function onArchivo(tipo: TipoDocumento, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('El archivo supera los 10 MB'); return }

    setError('')
    setSubiendo(tipo)
    const reader = new FileReader()
    reader.onload = async ev => {
      const res = await subirDocumentoJugador({
        jugadorId, tipo,
        base64: ev.target?.result as string,
        nombreArchivo: file.name,
      })
      setSubiendo(null)
      if (res.error) { setError(String(res.error)); return }
      setDocs(prev => ({
        ...prev,
        [tipo]: { tipo, archivo_url: null, archivo_path: res.path ?? null, nombre_archivo: file.name, subido_por: null, creado_en: new Date().toISOString() },
      }))
      if (res.path && res.url) setUrls(prev => ({ ...prev, [res.path!]: res.url! }))
    }
    reader.onerror = () => { setSubiendo(null); setError('No se pudo leer el archivo') }
    reader.readAsDataURL(file)
  }

  async function borrar(tipo: TipoDocumento) {
    if (!confirm('¿Eliminar este documento?')) return
    await eliminarDocumentoJugador({ jugadorId, tipo })
    setDocs(prev => { const next = { ...prev }; delete next[tipo]; return next })
  }

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#dc2626', margin: '0 20px 12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '4px 20px 16px' }}>
        {DOCS.map(({ tipo, label, icono }) => {
          const doc = docs[tipo]
          const estaSubiendo = subiendo === tipo

          return (
            <div
              key={tipo}
              style={{
                border: `1px ${doc ? 'solid' : 'dashed'} ${doc ? '#bbf7d0' : '#cbd5e1'}`,
                background: doc ? '#f0fdf4' : '#f8fafc',
                borderRadius: 10, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8,
                minHeight: 128,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 17 }}>{icono}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{label}</span>
              </div>

              {cargando ? (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Cargando…</div>
              ) : doc ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                    <FileText size={12} /> Documento cargado
                  </div>
                  {doc.nombre_archivo && (
                    <div style={{ fontSize: 10, color: '#64748b', wordBreak: 'break-all', lineHeight: 1.4 }}>
                      {doc.nombre_archivo}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <a
                      href={enlaceDe(doc) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#16a34a', textDecoration: 'none', opacity: enlaceDe(doc) ? 1 : 0.5, pointerEvents: enlaceDe(doc) ? 'auto' : 'none' }}
                    >
                      <Download size={12} /> Ver / descargar
                    </a>
                    {puedeEditar && (
                      <>
                        <button
                          onClick={() => refs.current[tipo]?.click()}
                          disabled={estaSubiendo}
                          title="Reemplazar"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 8px', color: '#64748b', cursor: estaSubiendo ? 'wait' : 'pointer' }}
                        >
                          <Upload size={12} />
                        </button>
                        <button
                          onClick={() => borrar(tipo)}
                          title="Eliminar"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '6px 8px', color: '#dc2626', cursor: 'pointer' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                    Sin documento. Sube el escaneado en PDF, Word o foto.
                  </div>
                  {puedeEditar ? (
                    <button
                      onClick={() => refs.current[tipo]?.click()}
                      disabled={estaSubiendo}
                      style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: estaSubiendo ? '#e2e8f0' : '#4f46e5', color: estaSubiendo ? '#94a3b8' : '#fff', border: 'none', borderRadius: 7, padding: '8px 10px', fontSize: 11, fontWeight: 700, cursor: estaSubiendo ? 'wait' : 'pointer' }}
                    >
                      <Upload size={12} /> {estaSubiendo ? 'Subiendo…' : 'Subir documento'}
                    </button>
                  ) : (
                    <div style={{ marginTop: 'auto', fontSize: 10, color: '#cbd5e1' }}>Pendiente de entrega</div>
                  )}
                </>
              )}

              {puedeEditar && (
                <input
                  ref={el => { refs.current[tipo] = el }}
                  type="file"
                  accept={ACEPTA}
                  style={{ display: 'none' }}
                  onChange={e => onArchivo(tipo, e)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
