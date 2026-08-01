'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useEnVivo } from '@/lib/useEnVivo'
import { copiarTexto } from '@/lib/clipboard'
import { listarCredenciales, resetearCredencial, resetearTodasLasCredenciales, type FilaCredencial } from '@/app/actions/credenciales'
import { fechaChile } from '@/lib/domain/fechaChile'
import { linkWhatsApp } from '@/lib/whatsapp'
import WhatsAppBtn from '@/components/WhatsAppBtn'
import { ArrowLeft, Check, Copy, Download, KeyRound, Loader2, RefreshCw, Eye, EyeOff, MessageCircle } from 'lucide-react'

const modalOverlay = { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }
const modalCard = { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 460, maxHeight: '86vh', overflowY: 'auto' as const, boxShadow: '0 20px 60px rgba(15,23,42,0.25)' } as const

function mensajeCredencial(f: FilaCredencial, appUrl: string): string {
  return `Hola ${f.nombre}! Estas son tus credenciales para entrar a CmSports:\n\nUsuario: ${f.usuarioLogin}\nContraseña: ${f.passwordPlano}\n\nIngresá en: ${appUrl}/login\n\nTe recomendamos cambiar la contraseña después del primer ingreso.`
}

/** Selección de jugadores + envío guiado uno por uno: WhatsApp no deja
 * automatizar el envío real, así que esto arma el mensaje y hace de guía
 * ("siguiente") para no tener que ir a buscar a cada jugador a mano. */
function ModalEnviarWhatsApp({ filas, onClose }: { filas: FilaCredencial[]; onClose: () => void }) {
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const candidatos = filas
    .filter(f => f.rol === 'jugador')
    .map(f => ({ ...f, wa: f.passwordPlano ? linkWhatsApp(f.telefono, mensajeCredencial(f, appUrl)) : null }))
  const enviables = candidatos.filter(c => c.wa)
  const noEnviables = candidatos.filter(c => !c.wa)

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(enviables.map(c => c.usuarioId)))
  const [enviando, setEnviando] = useState(false)
  const [indice, setIndice] = useState(0)

  function toggle(id: string) {
    setSeleccion(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const cola = enviables.filter(c => seleccion.has(c.usuarioId))
  const actual = cola[indice]

  if (!enviando) {
    return (
      <div style={modalOverlay} onClick={onClose}>
        <div style={modalCard} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={18} color="#16a34a" /> Enviar credenciales por WhatsApp
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
            Elegí a quién. Cada uno se abre en WhatsApp con el mensaje listo — solo falta apretar enviar.
          </div>

          <button onClick={() => setSeleccion(s => s.size === enviables.length ? new Set() : new Set(enviables.map(c => c.usuarioId)))}
            style={{ fontSize: 12, color: C.sky, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 10, fontWeight: 600 }}>
            {seleccion.size === enviables.length ? 'Deseleccionar todos' : `Seleccionar todos (${enviables.length})`}
          </button>

          <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
            {enviables.map(c => (
              <label key={c.usuarioId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <input type="checkbox" checked={seleccion.has(c.usuarioId)} onChange={() => toggle(c.usuarioId)} />
                <span style={{ fontSize: 13, color: C.text }}>{c.nombre}</span>
              </label>
            ))}
            {noEnviables.map(c => (
              <div key={c.usuarioId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, opacity: 0.55 }}>
                <input type="checkbox" disabled />
                <span style={{ fontSize: 13, color: C.muted }}>{c.nombre}</span>
                <span style={{ fontSize: 11, color: C.orangeD, marginLeft: 'auto' }}>
                  {!c.passwordPlano ? 'clave no visible' : 'sin celular válido'}
                </span>
              </div>
            ))}
            {candidatos.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: C.hint, fontSize: 13 }}>No hay jugadores.</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button onClick={onClose}
              style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={() => { setIndice(0); setEnviando(true) }} disabled={cola.length === 0}
              style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: cola.length === 0 ? 'not-allowed' : 'pointer', opacity: cola.length === 0 ? 0.5 : 1 }}>
              Empezar envío ({cola.length})
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <div style={{ fontSize: 12, color: C.hint, marginBottom: 4 }}>{indice + 1} de {cola.length}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>{actual?.nombre}</div>

        {actual?.wa && <WhatsAppBtn href={actual.wa} style={{ marginBottom: 16 }}>Abrir WhatsApp y enviar</WhatsAppBtn>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
            Terminar acá
          </button>
          {indice + 1 < cola.length ? (
            <button onClick={() => setIndice(i => i + 1)}
              style={{ background: C.sky, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Siguiente →
            </button>
          ) : (
            <button onClick={onClose}
              style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Listo ✓
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const C = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0', text: '#0f172a',
  muted: '#64748b', hint: '#94a3b8', sky: '#4f46e5', skyL: '#ede9fe',
  skyD: '#3730a3', orangeD: '#c2410c', orangeL: '#fff7ed',
  red: '#dc2626', redL: '#fef2f2', green: '#16a34a', greenL: '#f0fdf4',
} as const

const tipoLabel: Record<string, string> = { email: 'Correo', celular: 'Celular', rut: 'RUT' }

export default function CredencialesPage() {
  const { perfil, loading: authLoading } = usePerfil()
  const router = useRouter()
  const [filas, setFilas] = useState<FilaCredencial[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [reseteando, setReseteando] = useState<string | null>(null)
  const [mostrando, setMostrando] = useState(true)
  const [waAbierto, setWaAbierto] = useState(false)
  const [bulkAbierto, setBulkAbierto] = useState(false)
  const [bulkCorriendo, setBulkCorriendo] = useState(false)
  const [bulkResultado, setBulkResultado] = useState('')
  // Los tres arrancan encendidos: por defecto se ve todo, los chips sirven
  // para acotar cuando el admin quiere el reporte de un grupo puntual.
  const [verAdmins, setVerAdmins] = useState(true)
  const [verProfes, setVerProfes] = useState(true)
  const [verJugadores, setVerJugadores] = useState(true)

  const cargar = useCallback(async () => {
    const r = await listarCredenciales()
    if (r.error) { setError(r.error); setCargando(false); return }
    setFilas(r.filas ?? [])
    setCargando(false)
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    // El profe no ve claves de nadie: es dato sensible y no está en su tarea.
    if (perfil.rol !== 'admin' && perfil.rol !== 'superadmin') { router.push('/dashboard'); return }
    // Carga asincrónica: el setState ocurre cuando vuelven las consultas, no
    // durante el efecto. La regla no distingue ese caso.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [authLoading, perfil, router, cargar])

  // Se refresca sola cuando aceptás una solicitud, creás o eliminás un jugador,
  // o cambia una clave. Es la promesa del reporte: "siempre actualizado".
  useEnVivo(['credencial_visible', 'perfiles', 'jugadores'], perfil?.club_id ?? null, cargar)

  if (authLoading || cargando) {
    return (
      <AppLayout perfil={perfil}>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={24} className="animate-spin" color={C.hint} />
        </div>
      </AppLayout>
    )
  }

  const admins = filas.filter(f => (f.rol === 'admin' || f.rol === 'superadmin') && verAdmins)
  const profes = filas.filter(f => f.rol === 'profesor' && verProfes)
  const jugadores = filas.filter(f => f.rol === 'jugador' && verJugadores)

  // Totales sin filtro para los chips: el contador tiene que decirle al admin
  // cuánto se está escondiendo, no cuánto ve.
  const nAdmins = filas.filter(f => f.rol === 'admin' || f.rol === 'superadmin').length
  const nProfes = filas.filter(f => f.rol === 'profesor').length
  const nJugadores = filas.filter(f => f.rol === 'jugador').length

  async function copiar(texto: string, key: string) {
    const ok = await copiarTexto(texto)
    if (ok) { setCopiado(key); setTimeout(() => setCopiado(null), 1600) }
  }

  async function resetear(usuarioId: string, nombre: string) {
    if (!confirm(`Generar una contraseña nueva para ${nombre}? La que tenía deja de funcionar al toque.`)) return
    setReseteando(usuarioId)
    const r = await resetearCredencial({ usuarioId })
    setReseteando(null)
    if (r.error) { alert(r.error); return }
    await cargar()
  }

  async function correrBulk() {
    setBulkCorriendo(true)
    setBulkResultado('')
    const r = await resetearTodasLasCredenciales()
    setBulkCorriendo(false)
    if (r.error) { setBulkResultado('Error: ' + r.error); return }
    setBulkResultado(`${r.cambiadas ?? 0} contraseñas actualizadas${(r.fallidas ?? 0) > 0 ? `, ${r.fallidas} fallaron` : ''}.`)
    await cargar()
  }

  async function exportarPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const W = doc.internal.pageSize.getWidth()

    doc.setFillColor(79, 70, 229)
    doc.rect(0, 0, W, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20); doc.setFont('helvetica', 'bold')
    doc.text('Credenciales del club', 14, 14)
    doc.setFontSize(11); doc.setFont('helvetica', 'normal')
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, 14, 24)
    const partes: string[] = []
    if (verAdmins) partes.push(`Admins: ${admins.length}`)
    if (verProfes) partes.push(`Profes: ${profes.length}`)
    if (verJugadores) partes.push(`Jugadores: ${jugadores.length}`)
    doc.text(partes.join(' · '), W - 14, 24, { align: 'right' })

    let y = 42
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(9); doc.setFont('helvetica', 'italic')
    doc.text('Documento confidencial. Contiene contraseñas de acceso. No compartir públicamente.', 14, y); y += 8

    const bloques: Array<{ titulo: string; filas: FilaCredencial[] }> = []
    if (verAdmins && admins.length > 0) bloques.push({ titulo: 'Administradores', filas: admins })
    if (verProfes && profes.length > 0) bloques.push({ titulo: 'Profesores', filas: profes })
    if (verJugadores && jugadores.length > 0) bloques.push({ titulo: 'Jugadores', filas: jugadores })

    for (const b of bloques) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(b.titulo, 14, y); y += 6
      autoTable(doc, {
        startY: y,
        head: [['#', 'Nombre', 'Usuario', 'Contraseña', 'Tipo']],
        body: b.filas.map((f, i) => [i + 1, f.nombre, f.usuarioLogin || '—', f.passwordPlano || '(sin registro)', tipoLabel[f.tipoLogin]]),
        theme: 'striped', headStyles: { fillColor: [79, 70, 229] }, margin: { left: 14, right: 14 },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // Nombre del archivo cuenta qué grupos vienen adentro, para que
    // credenciales-solo-jugadores.pdf no se confunda con el completo.
    const sufijo = partes.length === 3 ? '' : '-' + [verAdmins && 'admins', verProfes && 'profes', verJugadores && 'jugadores'].filter(Boolean).join('-')
    doc.save(`credenciales${sufijo}-${fechaChile()}.pdf`)
  }

  // Se dibuja como función y no como componente para no chocar con la regla de
  // "no crear componentes durante el render" — es JSX repetido en un .map(), no
  // amerita el ceremonial de un componente aparte.
  function renderFila(f: FilaCredencial, i: number) {
    return (
      <tr key={f.usuarioId} style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: '10px 12px', fontSize: 12, color: C.muted, width: 40 }}>{i + 1}</td>
        <td style={{ padding: '10px 12px', fontSize: 13, color: C.text, fontWeight: 500 }}>{f.nombre}</td>
        <td style={{ padding: '10px 12px', fontSize: 13, color: C.sky }}>
          {f.usuarioLogin || <span style={{ color: C.hint }}>—</span>}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 13, color: C.text, fontFamily: 'ui-monospace, monospace' }}>
          {f.passwordPlano
            ? (mostrando ? f.passwordPlano : '••••••••')
            : <span style={{ color: C.hint, fontSize: 11, fontStyle: 'italic' }}>—</span>}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 11, color: C.muted }}>{tipoLabel[f.tipoLogin]}</td>
        <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {f.passwordPlano && (
            <button onClick={() => copiar(f.passwordPlano!, f.usuarioId)}
              title="Copiar la contraseña"
              style={{ background: copiado === f.usuarioId ? C.greenL : 'transparent', color: copiado === f.usuarioId ? C.green : C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', marginRight: 6 }}>
              {copiado === f.usuarioId ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          <button onClick={() => resetear(f.usuarioId, f.nombre)}
            disabled={reseteando === f.usuarioId}
            title="Generar una contraseña nueva"
            style={{ background: 'transparent', color: C.orangeD, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', cursor: reseteando === f.usuarioId ? 'wait' : 'pointer' }}>
            {reseteando === f.usuarioId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        </td>
      </tr>
    )
  }

  function renderChip(label: string, activo: boolean, onClick: () => void) {
    return (
      <button key={label} onClick={onClick}
        style={{
          background: activo ? C.skyL : C.card,
          color: activo ? C.skyD : C.muted,
          border: `1px solid ${activo ? C.skyD : C.border}`,
          borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
        {activo ? '✓ ' : ''}{label}
      </button>
    )
  }

  return (
    <AppLayout perfil={perfil}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <button onClick={() => router.push('/dashboard')}
            style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: 6 }}>
            <ArrowLeft size={13} /> Volver al dashboard
          </button>
          <h1 style={{ fontSize: 20, color: C.text, margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={20} color={C.skyD} /> Credenciales oficiales del club
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Admins: {admins.length} · Jugadores: {jugadores.length} · Se actualiza sola con solicitudes aceptadas y altas nuevas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setMostrando(m => !m)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {mostrando ? <><EyeOff size={13} /> Ocultar claves</> : <><Eye size={13} /> Mostrar claves</>}
          </button>
          <button onClick={exportarPdf}
            style={{ background: C.sky, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={13} /> Descargar PDF
          </button>
          <button onClick={() => setWaAbierto(true)}
            style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={13} /> Enviar por WhatsApp
          </button>
        </div>
      </div>

      {waAbierto && <ModalEnviarWhatsApp filas={filas} onClose={() => setWaAbierto(false)} />}

      {error && (
        <div style={{ background: C.redL, border: `1px solid ${C.red}`, color: C.red, padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ background: C.orangeL, border: `1px solid ${C.orangeD}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.orangeD, marginBottom: 12, lineHeight: 1.5 }}>
        <strong>Documento confidencial.</strong> Contiene las contraseñas de acceso al sistema. No compartir públicamente. Recomendale a cada persona cambiarla después del primer ingreso.
      </div>

      {/* Filtros de rol: los chips prenden y apagan cada grupo. El contador
          de cada chip refleja el total sin filtro, para que el admin sepa qué
          está escondiendo. Todos empiezan encendidos. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {renderChip(`Administradores (${nAdmins})`, verAdmins, () => setVerAdmins(v => !v))}
        {renderChip(`Profesores (${nProfes})`, verProfes, () => setVerProfes(v => !v))}
        {renderChip(`Jugadores (${nJugadores})`, verJugadores, () => setVerJugadores(v => !v))}
      </div>

      {verAdmins && admins.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text }}>
            Administradores ({admins.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>#</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Nombre</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Usuario</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Contraseña</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((f, i) => renderFila(f, i))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {verProfes && profes.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text }}>
            Profesores ({profes.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>#</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Nombre</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Usuario</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Contraseña</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {profes.map((f, i) => renderFila(f, i))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {verJugadores && (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text }}>
          Jugadores ({jugadores.length})
        </div>
        {jugadores.length === 0
          ? <p style={{ padding: 24, textAlign: 'center', color: C.hint, fontSize: 13 }}>Todavía no hay jugadores.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>#</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Nombre</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Usuario</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Contraseña</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: C.hint, fontWeight: 600 }}>Tipo</th>
                    <th style={{ padding: '10px 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map((f, i) => renderFila(f, i))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
      )}

      {/* Reset masivo: reescribe usuario y clave con el patrón del club.
          Aviso fuerte porque cambia cómo entran los que hoy usan celular. */}
      <div style={{ marginTop: 20, padding: 14, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
        <button onClick={() => setBulkAbierto(a => !a)}
          style={{ background: 'transparent', border: 'none', fontSize: 12, color: C.muted, cursor: 'pointer', padding: 0 }}>
          {bulkAbierto ? '▾' : '▸'} Reset masivo de todo el club
        </button>
        {bulkAbierto && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            Le asigna a todos —admins, profes y jugadores— este par de credenciales:
            <div style={{ marginTop: 6 }}>
              • <strong>Usuario:</strong> <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>inicialnombre + apellido + inicialsegundoapellido @cmsports.cl</code>
            </div>
            <div>
              • <strong>Contraseña:</strong> <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3 }}>nombreapellido123</code>
            </div>
            <div style={{ marginTop: 10, padding: '8px 10px', background: C.orangeL, border: `1px solid ${C.orangeD}`, borderRadius: 6, color: C.orangeD, fontSize: 11 }}>
              <strong>Ojo:</strong> los jugadores que hoy entran con celular o RUT dejan de poder hacerlo. Van a tener que usar su email nuevo (que va a estar en el reporte). Las contraseñas que hayan elegido por su cuenta se pierden.
            </div>
            <div style={{ marginTop: 10 }}>
              <button onClick={correrBulk} disabled={bulkCorriendo}
                style={{ background: C.orangeD, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: bulkCorriendo ? 'wait' : 'pointer' }}>
                {bulkCorriendo ? 'Ejecutando...' : 'Resetear todas las contraseñas ahora'}
              </button>
              {bulkResultado && <span style={{ marginLeft: 12, color: C.green, fontSize: 12 }}>{bulkResultado}</span>}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
