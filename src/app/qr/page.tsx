'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { useModulos } from '@/lib/hooks/useModulos'
import { categoriaLabel } from '@/lib/domain/categoriaBuin'

const QRCodeSVG = dynamic(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })), { ssr: false })

// La hoja con el QR para imprimir y pegar en la sede.
//
//   /qr?tipo=login                         → lleva al login de la app
//   /qr?tipo=ranking&categoria=X&genero=Y  → lleva al ranking público de esa
//                                            categoría, siempre actualizado
//
// Es una página aparte —sin menú— para que salga limpia por la impresora: el
// botón de imprimir y el aviso desaparecen con @media print. Solo la ve el
// admin de un club con el módulo `qr_publico` (hoy Buin); el proxy ya exige
// sesión de admin y `modulos-rutas.ts` el módulo.

const text = '#0f172a', muted = '#64748b', hint = '#94a3b8'

const generoLabel = (g: string) => g === 'varones' ? 'Varones' : g === 'damas' ? 'Damas' : g === 'mixto' ? 'Mixto' : ''

export default function QrPage() {
  return (
    <Suspense fallback={null}>
      <HojaQr />
    </Suspense>
  )
}

function HojaQr() {
  const { perfil, loading: authLoading } = usePerfil()
  const { tiene, cargando: cargandoModulos } = useModulos()
  const search = useSearchParams()
  const router = useRouter()

  const tipo = search.get('tipo') === 'ranking' ? 'ranking' : 'login'
  const categoria = search.get('categoria') ?? ''
  const genero = search.get('genero') ?? ''

  type Club = { nombre: string; codigo_publico: string | null; logo_url: string | null }
  // El origen (https://cmsportschile.cl) se toma en el navegador junto con el
  // club: en el servidor no hay `window`, y ponerlo en el render de entrada
  // haría que el texto de la URL no coincidiera entre servidor y navegador.
  const [club, setClub] = useState<(Club & { origen: string }) | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!perfil) { router.push('/login'); return }
    if (!perfil.club_id) return
    const supabase = createClient()
    // `codigo_publico` no está en los tipos generados (migración 270).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('clubes').select('nombre,codigo_publico,logo_url').eq('id', perfil.club_id).single()
      .then(({ data }: { data: Club | null }) => {
        if (data) setClub({ ...data, origen: window.location.origin })
      })
  }, [authLoading, perfil, router])

  if (authLoading || cargandoModulos || !club) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: hint }}>Preparando la hoja…</div>
  }

  if (!tiene('qr_publico')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', color: muted, fontSize: 14 }}>
          Este club no tiene activado el módulo de códigos QR.
        </div>
      </div>
    )
  }

  const faltaCodigo = tipo === 'ranking' && !club.codigo_publico
  const url = tipo === 'login'
    ? `${club.origen}/login`
    : `${club.origen}/ranking-publico/${club.codigo_publico ?? ''}?categoria=${encodeURIComponent(categoria)}&genero=${encodeURIComponent(genero)}`

  const titulo = tipo === 'login' ? 'Entra a la app del club' : 'Ranking'
  const subtitulo = tipo === 'login'
    ? 'Escanea para iniciar sesión en CmSports'
    : `${categoriaLabel(categoria)}${genero ? ` · ${generoLabel(genero)}` : ''} — escanea para ver el ranking actualizado`

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fa', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-imprimir { display: none !important; }
          .hoja-qr { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <div className="no-imprimir" style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => window.print()} disabled={faltaCodigo}
          style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: faltaCodigo ? 'not-allowed' : 'pointer', opacity: faltaCodigo ? 0.5 : 1 }}>
          🖨️ Imprimir
        </button>
        <button onClick={() => window.close()} style={{ background: '#fff', color: muted, border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 13, cursor: 'pointer' }}>
          Cerrar
        </button>
        <span style={{ fontSize: 12, color: hint }}>Tamaño carta, vertical. El QR sale nítido a cualquier tamaño.</span>
      </div>

      {faltaCodigo ? (
        <div className="no-imprimir" style={{ maxWidth: 460, textAlign: 'center', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16, fontSize: 13 }}>
          El club todavía no tiene su código público (lo genera la migración 270). Sin él, el QR del ranking no tiene a dónde apuntar.
        </div>
      ) : (
        <div className="hoja-qr" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: '40px 36px', width: '100%', maxWidth: 560, textAlign: 'center', boxShadow: '0 8px 32px rgba(15,23,42,0.12)' }}>
          {club.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logo_url} alt="" style={{ width: 84, height: 84, objectFit: 'contain', marginBottom: 10 }} />
          )}
          <div style={{ fontSize: 13, color: muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 6 }}>{club.nombre}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: text, lineHeight: 1.15, marginBottom: 8 }}>{titulo}</div>
          <div style={{ fontSize: 15, color: muted, marginBottom: 28 }}>{subtitulo}</div>
          <div style={{ display: 'inline-block', padding: 18, background: '#fff', border: '2px solid #0f172a', borderRadius: 16 }}>
            <QRCodeSVG value={url} size={300} level="M" includeMargin={false} />
          </div>
          <div style={{ fontSize: 12, color: hint, marginTop: 18, wordBreak: 'break-all', fontFamily: 'monospace' }}>{url}</div>
          <div style={{ fontSize: 12, color: hint, marginTop: 22 }}>CmSports</div>
        </div>
      )}
    </div>
  )
}
