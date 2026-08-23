'use client'

import { useRouter, usePathname } from 'next/navigation'

const ink = '#0f172a'
const muted = '#64748b'
const green = '#059669'

const ITEMS = [
  { label: '🏠 Resumen', slug: '' },
  { label: '📅 Fixture', slug: '/fixture' },
  { label: '📊 Tabla', slug: '/tabla' },
  { label: '⚽ Goleadores', slug: '/goleadores' },
  { label: '🟨🟥 Disciplina', slug: '/tarjetas' },
  { label: '🏆 Playoffs', slug: '/playoffs' },
]

/** Navegación horizontal compartida entre todas las subpáginas de una liga de fútbol. */
export default function LigaFutbolNav({ ligaId }: { ligaId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const base = `/liga-futbol/${ligaId}`

  return (
    <div style={{
      display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto',
      borderBottom: '2px solid #e2e8f0', paddingBottom: 0,
    }}>
      {ITEMS.map(item => {
        const href = base + item.slug
        const activo = pathname === href
        return (
          <button
            key={item.slug}
            onClick={() => router.push(href)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: activo ? 700 : 500,
              color: activo ? green : muted, background: 'none', border: 'none',
              borderBottom: activo ? `3px solid ${green}` : '3px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -2,
            }}>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
