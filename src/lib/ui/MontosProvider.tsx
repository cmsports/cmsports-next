'use client'

/**
 * Mostrar u ocultar los montos de toda la aplicación con un solo interruptor.
 *
 * Existe porque las pantallas de plata se revisan con gente al lado —en la
 * cancha, en una reunión, mostrándole el sistema a alguien— y no siempre
 * corresponde que se vean los ingresos del club, la deuda de un jugador o los
 * sueldos. El ojito tapa las cifras sin salir de la pantalla ni perder el
 * contexto: los rótulos, las categorías y el resto de la interfaz siguen ahí.
 *
 * La preferencia se guarda en el navegador y arranca visible: ocultar es una
 * decisión puntual, no el estado normal de trabajo.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const CLAVE = 'cmsports_montos_ocultos'

type MontosContextValue = {
  ocultos: boolean
  alternar: () => void
}

const MontosContext = createContext<MontosContextValue>({
  ocultos: false,
  alternar: () => {},
})

export function MontosProvider({ children }: { children: React.ReactNode }) {
  // Arranca visible siempre y recién después lee la preferencia guardada: si se
  // leyera localStorage durante el render inicial, el servidor y el cliente
  // dibujarían cosas distintas y React tiraría un error de hidratación.
  const [ocultos, setOcultos] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) === '1') setOcultos(true)
    } catch { /* modo incógnito o storage bloqueado: queda visible */ }
  }, [])

  const alternar = useCallback(() => {
    setOcultos(previo => {
      const siguiente = !previo
      try {
        if (siguiente) localStorage.setItem(CLAVE, '1')
        else localStorage.removeItem(CLAVE)
      } catch { /* si no se puede guardar, igual funciona en esta sesión */ }
      return siguiente
    })
  }, [])

  return (
    <MontosContext.Provider value={{ ocultos, alternar }}>
      {children}
    </MontosContext.Provider>
  )
}

export function useMontos() {
  return useContext(MontosContext)
}
