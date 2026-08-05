'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Desplegable con casillas: permite marcar varias opciones del mismo filtro
// (por ejemplo PENECA + PREINFANTIL + INFANTIL a la vez). Lo usan Jugadores y
// Finanzas, por eso vive acá y no dentro de una página.

const text = '#0f172a'
const hint = '#94a3b8'

export function setToggle(set: Set<string>, valor: string): Set<string> {
  const next = new Set(set)
  if (next.has(valor)) next.delete(valor)
  else next.add(valor)
  return next
}

export function setDesdeParam(searchParams: URLSearchParams, key: string): Set<string> {
  const raw = searchParams.get(key)
  return raw ? new Set(raw.split(',').filter(Boolean)) : new Set()
}

export default function FiltroMultiSelect({ label, options, selected, onChange, colorActivo }: {
  label: string
  options: { value: string; label: string }[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  colorActivo?: { bg: string; border: string; text: string }
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activo = selected.size > 0
  const c = colorActivo || { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }

  // El desplegable se saca de acá y se planta en <body> vía portal: la tarjeta
  // que lo contiene lleva `animation: entraTarjeta ... both`, y con fill-mode
  // "both" eso la convierte en su propio contexto de apilamiento para siempre
  // (no solo mientras dura la animación). Así, ningún z-index de un hijo
  // absoluto logra ganarle a la tarjeta siguiente en el DOM. Con portal +
  // position:fixed el menú se pinta directo sobre <body>, sin ese problema.
  const reposicionar = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 4, left: r.left })
  }

  useLayoutEffect(() => {
    if (!open) return
    reposicionar()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClickFuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      document.removeEventListener('mousedown', onClickFuera)
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [open])

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ background: activo ? c.bg : '#f4f7fa', border: `1px solid ${activo ? c.border : '#e2e8f0'}`, borderRadius:8, padding:'7px 10px', fontSize:13, color: activo ? c.text : hint, outline:'none', cursor:'pointer', fontWeight: activo ? 600 : 400, whiteSpace:'nowrap' }}
      >
        {activo ? `${label} (${selected.size})` : label} ⌄
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{ position:'fixed', top: coords.top, left: coords.left, zIndex:1000, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, boxShadow:'0 8px 24px rgba(15,23,42,0.12)', padding:8, minWidth:180, maxHeight:280, overflowY:'auto' }}>
          {activo && (
            <div
              onClick={() => onChange(new Set())}
              style={{ padding:'6px 8px', fontSize:12, color:'#dc2626', cursor:'pointer', borderBottom:'1px solid #f1f5f9', marginBottom:4 }}
            >
              Limpiar
            </div>
          )}
          {options.map(o => (
            <label key={o.value} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', fontSize:13, color: text, cursor:'pointer', borderRadius:6 }}>
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => onChange(setToggle(selected, o.value))} />
              {o.label}
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
