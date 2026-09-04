import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from './validation/finanzas'

/**
 * Una categoría de movimiento se agrega en TRES lugares, y esta prueba cuida el
 * tercero.
 *
 *   1. `domain/categoriasFinanzas.ts` — lo que el formulario OFRECE.
 *   2. `validation/finanzas.ts`       — lo que el servidor de Next ACEPTA.
 *   3. `registrar_movimiento_financiero_atomico` — lo que la BASE acepta,
 *      contra una lista blanca escrita dentro de la propia función.
 *
 * Las seis categorías propias de Spinhouse se agregaron en los dos primeros y
 * no en el tercero. Nada falló al compilar y ninguna prueba se puso roja: la
 * pantalla ofrecía "Arriendo de mesa" en un desplegable y la base contestaba
 * «Categoría incompatible con el tipo de movimiento» recién al guardar.
 *
 * La migración 099 ya lo había dejado escrito en su encabezado —"una categoría
 * nueva es rechazada hasta que esa lista la incluya"— y aun así volvió a pasar.
 * Un comentario en una migración de hace 160 números no lo lee nadie; esta
 * prueba sí se ejecuta.
 *
 * Lee la ÚLTIMA migración que redefine la función, que es la que quedó
 * aplicada: buscar en todas daría verde con que la categoría aparezca en
 * cualquier versión vieja, que es justo lo que no sirve.
 */
describe('las categorías del formulario las acepta el RPC', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const FUNCION = 'registrar_movimiento_financiero_atomico'

  const ultimaDefinicion = () => {
    const archivos = readdirSync(dir)
      .filter(a => a.endsWith('.sql'))
      .filter(a => readFileSync(join(dir, a), 'utf8')
        .includes(`CREATE OR REPLACE FUNCTION public.${FUNCION}`))
      .sort()
    return { archivo: archivos.at(-1), archivos }
  }

  it('alguna migración define la función', () => {
    expect(ultimaDefinicion().archivo).toBeDefined()
  })

  it('la última definición acepta todas las categorías de ingreso', () => {
    const { archivo } = ultimaDefinicion()
    const sql = readFileSync(join(dir, archivo!), 'utf8')
    const faltantes = CATEGORIAS_INGRESO.filter(c => !sql.includes(`'${c}'`))
    expect({ archivo, faltantes }).toEqual({ archivo, faltantes: [] })
  })

  it('la última definición acepta todas las categorías de gasto', () => {
    const { archivo } = ultimaDefinicion()
    const sql = readFileSync(join(dir, archivo!), 'utf8')
    const faltantes = CATEGORIAS_GASTO.filter(c => !sql.includes(`'${c}'`))
    expect({ archivo, faltantes }).toEqual({ archivo, faltantes: [] })
  })
})
