'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { copiarTexto } from '@/lib/clipboard'
import { Check, Copy } from 'lucide-react'

const supabase = createClient()
const text = '#0f172a'
const muted = '#64748b'
const hint = '#94a3b8'
const mensajeGenerico = 'No encontramos una cuenta con ese RUT. Revisá el número o hablá con el club.'

type Estado = 'idle' | 'loading' | 'ok' | 'error' | 'limitado'
type Resultado = { nombre: string; usuario: string; password: string }

function formatRutPuntos(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length <= 1) return clean
  const dv = clean.slice(-1)
  const num = clean.slice(0, -1)
  return `${num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

export default function MiAccesoPage() {
  const params = useParams()
  const clubId = params.clubId as string
  const [rut, setRut] = useState('')
  const [estado, setEstado] = useState<Estado>('idle')
  const [mensaje, setMensaje] = useState('')
  const [dato, setDato] = useState<Resultado | null>(null)
  const [copiado, setCopiado] = useState<'usuario' | 'password' | null>(null)

  async function consultar() {
    const limpio = rut.replace(/[^0-9kK]/g, '')
    if (limpio.length < 8) {
      setEstado('error')
      setMensaje('Ingresá tu RUT completo')
      return
    }
    setEstado('loading')
    setMensaje('')
    const { data, error } = await supabase.rpc('consultar_credencial_por_rut', {
      p_club_id: clubId,
      p_rut: rut,
    })
    const fila = (data as Array<{
      encontrado: boolean
      limitado: boolean
      nombre: string | null
      usuario_login: string | null
      password_plano: string | null
    }> | null)?.[0]

    if (error || !fila) {
      setEstado('error')
      setMensaje(mensajeGenerico)
      return
    }
    if (fila.limitado) {
      setEstado('limitado')
      setMensaje('Demasiados intentos. Esperá un minuto y volvé a probar.')
      return
    }
    if (!fila.encontrado || !fila.usuario_login || !fila.password_plano) {
      setEstado('error')
      setMensaje(mensajeGenerico)
      return
    }
    setDato({
      nombre: fila.nombre || '',
      usuario: fila.usuario_login,
      password: fila.password_plano,
    })
    setEstado('ok')
  }

  async function copiar(cual: 'usuario' | 'password', valor: string) {
    const ok = await copiarTexto(valor)
    if (ok) {
      setCopiado(cual)
      setTimeout(() => setCopiado(null), 1500)
    }
  }

  function otraConsulta() {
    setEstado('idle')
    setDato(null)
    setRut('')
    setMensaje('')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#a9bac8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#3730a3,#4f46e5)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26, color: 'white', margin: '0 auto 16px' }}>CM</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: text }}>Tu acceso a CmSports</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 6, lineHeight: 1.5 }}>
            Poné tu RUT y vas a ver tu usuario y tu contraseña. Nadie más ve los datos de otra persona.
          </div>
        </div>

        {estado === 'ok' && dato && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize: 13, color: muted, marginBottom: 4 }}>Hola</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: text, marginBottom: 18 }}>{dato.nombre}</div>

            <CampoCopiable etiqueta="Usuario" valor={dato.usuario} copiado={copiado === 'usuario'} onCopiar={() => void copiar('usuario', dato.usuario)} />
            <CampoCopiable etiqueta="Contraseña" valor={dato.password} copiado={copiado === 'password'} onCopiar={() => void copiar('password', dato.password)} />

            <a href="/login" style={{
              display: 'block', width: '100%', padding: 16, background: '#f43f5e', color: 'white',
              border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, textAlign: 'center',
              textDecoration: 'none', boxSizing: 'border-box', marginTop: 8,
            }}>
              Ir a ingresar →
            </a>
            <div style={{ fontSize: 12, color: hint, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
              Te recomendamos cambiar la contraseña después del primer ingreso.
            </div>
            <button onClick={otraConsulta} style={{
              display: 'block', width: '100%', marginTop: 10, background: 'transparent', border: 'none',
              color: muted, fontSize: 12, cursor: 'pointer',
            }}>
              Consultar otro RUT
            </button>
          </div>
        )}

        {estado !== 'ok' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28, boxShadow: '0 4px 16px rgba(15,23,42,0.18)' }}>
            {(estado === 'error' || estado === 'limitado') && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626', marginBottom: 16, textAlign: 'center' }}>
                {mensaje}
              </div>
            )}

            <label style={{ fontSize: 12, color: muted, display: 'block', marginBottom: 8 }}>RUT</label>
            <input
              style={{ width: '100%', background: '#f4f7fa', border: '2px solid #e2e8f0', borderRadius: 12, padding: 16, color: text, fontSize: 22, outline: 'none', textAlign: 'center', letterSpacing: 2, fontFamily: 'monospace', boxSizing: 'border-box' }}
              placeholder="12.345.678-9"
              value={rut}
              onChange={e => setRut(formatRutPuntos(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && void consultar()}
              maxLength={12}
              autoFocus
              inputMode="text"
              autoComplete="off"
            />
            <button onClick={() => void consultar()} disabled={estado === 'loading'} style={{
              width: '100%', marginTop: 16, padding: 18,
              background: estado === 'loading' ? '#94a3b8' : '#f43f5e',
              color: 'white', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700,
              cursor: estado === 'loading' ? 'not-allowed' : 'pointer',
            }}>
              {estado === 'loading' ? 'Buscando...' : 'Ver mis datos →'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: hint }}>
              ¿Problemas? Avisale al club.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CampoCopiable({ etiqueta, valor, copiado, onCopiar }: {
  etiqueta: string
  valor: string
  copiado: boolean
  onCopiar: () => void
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: hint, fontWeight: 600, letterSpacing: 0.4, marginBottom: 6 }}>{etiqueta}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ flex: 1, fontSize: 14, color: text, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{valor}</div>
        <button onClick={onCopiar} title={`Copiar ${etiqueta.toLowerCase()}`} style={{
          background: copiado ? '#f0fdf4' : 'transparent',
          color: copiado ? '#16a34a' : muted,
          border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
        }}>
          {copiado ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  )
}
