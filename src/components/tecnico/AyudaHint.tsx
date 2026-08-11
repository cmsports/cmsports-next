'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'

const ANCHO = 240
const MARGEN = 10

/** Circulito "?" con tooltip al pasar el mouse (y focus para teclado). */
export default function AyudaHint({
  titulo,
  significado,
  comoSeCalcula,
}: {
  titulo: string
  significado: string
  comoSeCalcula: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const id = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!abierto || !btnRef.current) {
      setPos(null)
      return
    }
    const rect = btnRef.current.getBoundingClientRect()
    const tipH = tipRef.current?.offsetHeight ?? 120
    const maxLeft = window.innerWidth - ANCHO - MARGEN
    const left = Math.max(MARGEN, Math.min(rect.left + rect.width / 2 - ANCHO / 2, maxLeft))
    let top = rect.bottom + 8
    if (top + tipH > window.innerHeight - MARGEN && rect.top - tipH - 8 >= MARGEN) {
      top = rect.top - tipH - 8
    }
    setPos({ top, left })
  }, [abierto, titulo, significado, comoSeCalcula])

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={`Ayuda: ${titulo}`}
        aria-describedby={abierto ? id : undefined}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          border: '1px solid #94a3b8',
          background: '#f8fafc',
          color: '#475569',
          fontSize: 10,
          fontWeight: 800,
          lineHeight: '14px',
          padding: 0,
          cursor: 'help',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        ?
      </button>
      {abierto && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            zIndex: 1000,
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: ANCHO,
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 10,
            padding: '10px 11px',
            boxShadow: '0 10px 30px rgba(15,23,42,0.35)',
            fontSize: 11,
            lineHeight: 1.45,
            fontWeight: 500,
            pointerEvents: 'none',
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <span style={{ display: 'block', fontWeight: 800, marginBottom: 4 }}>{titulo}</span>
          <span style={{ display: 'block', opacity: 0.95 }}>{significado}</span>
          <span style={{ display: 'block', marginTop: 6, color: '#cbd5e1' }}>
            Cómo se calcula: {comoSeCalcula}
          </span>
        </span>
      )}
    </span>
  )
}
