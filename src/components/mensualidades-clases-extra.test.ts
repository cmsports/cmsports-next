import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (ruta: string) => readFileSync(resolve(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n')

const panel = leer('src/components/MensualidadesPanel.tsx')

describe('la tabla de mensualidades avisa de las clases extra sin sumarlas', () => {
  it('el aviso existe', () => {
    // Jonathan salia con $35.000 pelado teniendo ademas $3.000 de una clase
    // extra: el admin no tenia como enterarse desde esta pantalla.
    expect(panel).toContain('clases_extraordinarias')
    expect(panel).toContain('clase extra')
  })

  it('NO suma la clase extra al monto de la mensualidad', () => {
    // Es lo peligroso de este arreglo. "Marcar pagado" registra un pago de
    // mensualidad y nada mas; una fila que dijera $38.000 haria creer que se
    // cobraron los $3.000, que se cobran aparte con su propio movimiento, y
    // esa plata quedaria sin registrar. La 099 lo dejo escrito.
    //
    // Se busca en el archivo entero y no en una ventana: lo que hay que
    // prohibir es la aritmetica, la haga donde la haga.
    expect(panel).not.toMatch(/extrasPorJugador\.get\([^)]*\)[^\n]*[+][^\n]*monto/)
    expect(panel).not.toMatch(/monto[^\n]*[+][^\n]*extrasPorJugador/)
    expect(panel).not.toMatch(/mens\.monto\s*\+\s*extra/i)
  })

  it('el monto mostrado sigue saliendo de la cuota, no del total', () => {
    // El badge se pinta DESPUES del monto y en su propio div: es un aviso al
    // lado, no un reemplazo del numero.
    // Se ancla en el emoji del badge y no en el texto "clase extra", que
    // aparece antes en los comentarios del archivo.
    const iMonto = panel.indexOf('? fmt(mens.monto)')
    const iBadge = panel.indexOf('🟡 + ')
    expect(iMonto).toBeGreaterThan(-1)
    expect(iBadge).toBeGreaterThan(iMonto)
  })

  it('el modal de pago sigue proponiendo solo la cuota', () => {
    // Si el monto sugerido incluyera la extra, el admin registraria un ingreso
    // de mensualidad por plata que no es de la mensualidad.
    const i = panel.indexOf('const esperado = montoEsperado(j, mens)')
    expect(i).toBeGreaterThan(-1)
    const abrir = panel.slice(i, i + 260)
    expect(abrir).toContain('setMontoPago(esperado')
    expect(abrir).not.toContain('extrasPorJugador')
  })

  it('solo cuenta las extras con precio', () => {
    // Una extra sin monto asignado no es deuda todavia: anunciarla como "+$0"
    // o con un numero inventado seria peor que no decir nada.
    expect(panel).toMatch(/e\.monto == null \|\| e\.monto <= 0\) continue/)
  })

  it('no filtra las extras por el mes que se esta mirando', () => {
    // Si quedo impaga, se debe, y el aviso tiene que salir igual mirando agosto.
    const consulta = panel.slice(panel.indexOf("from('clases_extraordinarias')"))
    expect(consulta.slice(0, 220)).toContain("is('pagada_en', null)")
    expect(consulta.slice(0, 220)).not.toContain("eq('mes'")
  })

  it('el aviso lleva al panel donde se cobra', () => {
    // Sin esto el admin sabe que debe una clase extra y no sabe donde cobrarla:
    // el panel esta en la misma pestaña pero debajo de cien y pico de filas.
    expect(panel).toContain("getElementById('clases-extra')")
    expect(panel).toContain('scrollIntoView')
  })

  it('el destino existe en la pagina de finanzas', () => {
    const finanzas = leer('src/app/finanzas/page.tsx')
    expect(finanzas).toContain('id="clases-extra"')
    // Y el panel de cobro esta adentro de ese contenedor.
    const i = finanzas.indexOf('id="clases-extra"')
    expect(finanzas.slice(i, i + 220)).toContain('PanelClasesExtra')
  })

  it('se refresca cuando le ponen precio desde la otra pestaña', () => {
    expect(panel).toContain('useEnVivo')
    expect(panel).toContain('recargarExtras')
  })

  it('el refresco en vivo no dispara la generacion de mensualidades', () => {
    // cargarMensualidades de paso crea las cuotas del mes que falten. Colgar
    // eso de un evento en tiempo real es pedir una escritura cada vez que
    // alguien toca una clase extra en otra pantalla.
    const i = panel.indexOf('useEnVivo([')
    expect(i).toBeGreaterThan(-1)
    // Hasta el cierre de la llamada, no 200 caracteres a ojo: la funcion que
    // viene despues se llama cargarMensualidades y ensuciaba la ventana.
    const envivo = panel.slice(i, panel.indexOf('})', i) + 2)
    expect(envivo).toContain('recargarExtras')
    expect(envivo).not.toContain('cargarMensualidades')
  })
})
