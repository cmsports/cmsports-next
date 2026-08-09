'use client'

// El último recurso: cuando lo que falla es el layout raíz.
//
// `error.tsx` cubre las pantallas, pero vive DENTRO del layout. Si la
// excepción ocurre en el layout mismo —el provider de perfil, el de montos, el
// tema— no hay ningún boundary encima y el usuario ve la página muerta del
// navegador, sin siquiera un botón.
//
// Este archivo reemplaza el documento entero, y por eso trae su propio
// `<html>` y su `<body>`: cuando corre, el layout raíz no llegó a montarse y
// nada de lo que aquel define existe todavía. Por lo mismo va con estilos
// escritos a mano y sin importar componentes: cualquier dependencia que
// tampoco cargue lo dejaría a él también sin renderizar, que es exactamente el
// problema que viene a resolver.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: 'layout-raiz' } })
  }, [error])

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f1f5f9', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, padding: 30, textAlign: 'center', background: '#fff',
            border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 20px rgba(15,23,42,0.10)' }}>

            <div style={{ fontSize: 38, marginBottom: 10 }}>🏓</div>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 19, fontWeight: 700 }}>CmSports no pudo iniciar</h1>
            <p style={{ margin: '10px 0 20px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
              Algo falló antes de que la aplicación terminara de cargar. Tus datos están a salvo.
              Probá recargar; si sigue igual, avisale al administrador del sistema.
            </p>

            <button onClick={reset}
              style={{ width: '100%', padding: 13, border: 0, borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Recargar
            </button>

            {error.digest && (
              <div style={{ marginTop: 16, fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
                Código del error: {error.digest}
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
