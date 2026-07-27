'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/**
 * Campo de contraseña con ojito para verla.
 *
 * Existe porque escribir a ciegas en un teclado de celular es la forma más
 * común de no poder entrar: uno no sabe si se equivocó o si la contraseña está
 * mal. El ojito arranca cerrado, así que a nadie se le muestra por accidente
 * si alguien le está mirando la pantalla.
 */
export default function CampoContrasena({
  value, onChange, placeholder, style, onKeyDown, autoComplete, disabled, id,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  autoComplete?: string
  disabled?: boolean
  id?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        // Espacio a la derecha para que el texto no pase por debajo del botón.
        style={{ ...style, paddingRight: 42 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        title={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
        aria-label={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          color: '#94a3b8', display: 'flex', alignItems: 'center', lineHeight: 0,
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  )
}
