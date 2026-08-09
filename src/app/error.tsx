'use client'

// La red que faltaba debajo de toda la app.
//
// POR QUÉ EXISTE. El 2026-08-09 dos componentes de la pestaña Mensualidades
// pidieron el mismo canal de tiempo real, supabase-js lanzó una excepción
// durante el montaje, y la pantalla quedó en "This page couldn't load": blanco,
// sin explicación y sin salida más que escribir otra URL a mano.
//
// El bug se arregló, pero lo que dejó a la vista es que no había ningún
// boundary: en toda la app había un solo `error.tsx`, y en una ruta secundaria.
// Cualquier excepción de cualquier componente se llevaba puesta la pantalla
// entera. En un sistema donde el admin está cobrando plata, eso es la
// diferencia entre "reintentá" y "no sé qué pasó ni a quién avisarle".
//
// NO REINTENTA SOLO. La pantalla del torneo en vivo sí lo hace, y ahí tiene
// sentido: se cae por datos que cambian solos y se arregla en el próximo
// render. Acá un error suele ser de código, y reintentar en bucle contra una
// excepción que se repite deja la pantalla parpadeando sin decir nada.

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: 'app' } })
  }, [error])

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f1f5f9', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 30, textAlign: 'center', background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 4px 20px rgba(15,23,42,0.10)' }}>

        <div style={{ fontSize: 38, marginBottom: 10 }}>🏓</div>
        <h1 style={{ margin: 0, color: '#0f172a', fontSize: 19, fontWeight: 700 }}>Esta pantalla se cayó</h1>
        <p style={{ margin: '10px 0 20px', color: '#64748b', fontSize: 13, lineHeight: 1.6 }}>
          No es algo que hayas hecho mal, y no se perdió nada de lo que ya estaba guardado.
          Probá de nuevo; si vuelve a pasar, avisale al administrador del sistema.
        </p>

        <button onClick={reset}
          style={{ width: '100%', padding: 13, border: 0, borderRadius: 10, marginBottom: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Reintentar
        </button>
        <button onClick={() => { window.location.href = '/' }}
          style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #e2e8f0',
            background: 'transparent', color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
          Volver al inicio
        </button>

        {/* El digest es lo único que permite encontrar este error concreto en
            Sentry. Sin mostrarlo, el reporte del usuario es "se cayó" y no hay
            forma de saber cuál de todos fue. */}
        {error.digest && (
          <div style={{ marginTop: 16, fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
            Código del error: {error.digest}
          </div>
        )}
      </div>
    </div>
  )
}
