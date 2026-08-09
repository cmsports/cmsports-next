import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const hook = leer('src/lib/useEnVivo.ts')

// El 2026-08-09 la pestaña Mensualidades dejó de cargar en producción. La causa
// no estaba en esa pantalla:
//
//   supabase.channel(nombre) con un nombre que YA existe devuelve el mismo
//   canal, no uno nuevo. El segundo componente le hacía .on() a un canal ya
//   suscrito y supabase-js lanza:
//
//     Error: cannot add `postgres_changes` callbacks for realtime:<topic>
//     after `subscribe()`
//
//   Una excepción sin capturar durante el montaje mata el árbol de React
//   entero: "This page couldn't load".
//
// Comprobado contra Realtime: con el mismo nombre, el segundo canal tira
// excepción; con nombres distintos, los dos quedan SUBSCRIBED.

describe('useEnVivo: dos componentes pueden mirar la misma tabla', () => {
  it('el nombre del canal lleva un id por instancia', () => {
    expect(hook).toContain('useId')
    expect(hook).toMatch(/channel\(`envivo-\$\{clubId\}-\$\{clave\}-\$\{instancia\}`\)/)
  })

  it('el id entra en las dependencias del efecto', () => {
    // Es estable durante la vida del componente, así que no provoca
    // resuscripciones; dejarlo fuera sería una dependencia faltante.
    const deps = hook.slice(hook.lastIndexOf('}, ['))
    expect(deps).toContain('instancia')
  })

  it('el canal se cierra al desmontar', () => {
    // Sin esto, cambiar de pestaña deja canales colgados y el problema vuelve
    // por acumulación en vez de por colisión.
    expect(hook).toContain('removeChannel(canal)')
  })
})

describe('los componentes que hoy comparten tablas', () => {
  const archivos = [
    'src/components/MensualidadesPanel.tsx',
    'src/components/PanelClasesExtra.tsx',
  ]

  it('MensualidadesPanel y PanelClasesExtra escuchan la misma tabla', () => {
    // Es el par que rompió: los dos se montan juntos en la pestaña
    // Mensualidades. El test documenta que la convivencia es intencional y que
    // lo que la hace posible es el id por instancia del hook.
    for (const a of archivos) {
      expect(leer(a)).toMatch(/useEnVivo\(\[\s*'clases_extraordinarias'/)
    }
  })

  it('los dos se montan juntos en la pestaña de mensualidades', () => {
    const finanzas = leer('src/app/finanzas/page.tsx')
    const i = finanzas.indexOf("tabActivo === 'mensualidades'")
    const bloque = finanzas.slice(i, i + 900)
    expect(bloque).toContain('MensualidadesPanel')
    expect(bloque).toContain('PanelClasesExtra')
  })
})
