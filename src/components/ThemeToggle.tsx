'use client'

import { useState, useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 7,
        background: 'transparent', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer',
        transition: 'color 0.15s, background 0.15s',
        ...style,
      }}
    >
      {dark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  )
}
