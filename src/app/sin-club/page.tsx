'use client'

// Adónde cae el jugador al que borraron del club.
//
// LO QUE PASABA ANTES. Eliminar un jugador borra su fila de `perfiles` y su
// usuario de Auth, pero el token que tiene en el navegador sigue siendo válido
// hasta que vence —una hora, más o menos—. En ese rato:
//
//   · El middleware usa `getClaims()`, que solo verifica la firma del token, no
//     que el usuario exista. Lo daba por logueado.
//   · No encontraba su fila en `perfiles`, y con `perfil?.rol ?? 'jugador'` le
//     inventaba el rol.
//   · La pantalla veía `perfil === null` y lo mandaba a /login.
//   · En /login el middleware volvía a verlo "con sesión", llamaba a
//     `getRolRedirect(null)` —que devuelve /perfil— y lo mandaba de vuelta.
//
// Resultado: un ida y vuelta infinito entre /login y /perfil. No es que la
// página tardara: nunca terminaba de decidir cuál mostrar.
//
// LO QUE HACE ESTA PANTALLA. Corta el ciclo cerrando la sesión de verdad. Sin
// eso el token muerto sigue en el navegador y el enredo vuelve al primer clic.
// Y le dice lo que pasó, que es lo mínimo: se quedó afuera sin enterarse.
//
// El botón lleva a /registro, que es la misma solicitud de ingreso de siempre.
// Puede volver a postular con el mismo correo porque al eliminarlo se borró su
// usuario de Auth: no queda nada ocupando ese mail.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CACHE_PERFIL = 'cmsports_perfil'

export default function SinClubPage() {
  const router = useRouter()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let activo = true

    async function salir() {
      const { data: { session } } = await supabase.auth.getSession()

      // Si todavía tiene perfil, no le corresponde esta pantalla: lo sacamos
      // sin cerrarle la sesión. Pasa si alguien escribe la URL a mano.
      if (session) {
        const { data: perfil } = await supabase
          .from('perfiles').select('id').eq('id', session.user.id).maybeSingle()
        if (perfil) { router.replace('/'); return }
      }

      // El perfil cacheado es lo que hacía que la app siguiera pintando datos
      // de alguien que ya no existe. Se va antes que la sesión.
      try { localStorage.removeItem(CACHE_PERFIL) } catch {}
      await supabase.auth.signOut({ scope: 'local' })

      if (activo) setListo(true)
    }

    void salir()
    return () => { activo = false }
  }, [router])

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9', display:'flex',
      alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16,
        boxShadow:'0 4px 20px rgba(15,23,42,0.10)', padding:32, maxWidth:420, width:'100%',
        textAlign:'center' }}>

        <div style={{ fontSize:44, marginBottom:14 }}>👋</div>

        <h1 style={{ fontSize:19, fontWeight:700, color:'#0f172a', margin:'0 0 10px' }}>
          Ya no formás parte del club
        </h1>

        <p style={{ fontSize:13, color:'#64748b', lineHeight:1.6, margin:'0 0 22px' }}>
          Tu cuenta fue dada de baja por el administrador, así que dejaste de tener
          acceso a las pantallas del club. Si creés que fue un error, o querés volver,
          podés enviar una solicitud de ingreso nueva.
        </p>

        <button
          onClick={() => router.push('/registro')}
          disabled={!listo}
          style={{ width:'100%', padding:'13px 20px', borderRadius:10, border:'none',
            background: listo ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#cbd5e1',
            color:'#fff', fontSize:14, fontWeight:700,
            cursor: listo ? 'pointer' : 'default', marginBottom:10 }}>
          {listo ? 'Enviar una solicitud nueva →' : 'Cerrando sesión...'}
        </button>

        <button
          onClick={() => router.push('/login')}
          disabled={!listo}
          style={{ width:'100%', padding:'11px 20px', borderRadius:10,
            border:'1px solid #e2e8f0', background:'transparent', color:'#64748b',
            fontSize:13, cursor: listo ? 'pointer' : 'default' }}>
          Ingresar con otra cuenta
        </button>
      </div>
    </div>
  )
}
