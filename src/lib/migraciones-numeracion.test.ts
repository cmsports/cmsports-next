import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Dos migraciones no pueden compartir número.
 *
 * No rompe la base —el portazo `_migracion_nueva` registra el nombre completo,
 * así que "180_una" y "180_otra" son dos registros distintos y las dos corren—,
 * pero sí rompe a la persona: las migraciones se pegan a mano en el SQL Editor,
 * y con dos archivos "180" no hay forma de saber cuál se corrió.
 *
 * Pasa cuando dos ramas crean una migración a la vez: las dos miran el último
 * número, ven el mismo, y las dos suman uno.
 *
 * Los pares de abajo son los que ya existían cuando se escribió esta prueba.
 * Renombrarlos ahora sería peor —ya están aplicados en producción con ese
 * nombre— así que quedan documentados. La lista NO debe crecer: si esta prueba
 * falla, elegí el siguiente número libre antes de subir la migración.
 */
const DUPLICADOS_HISTORICOS = new Set([
  '047', '054', '100', '105', '126', '127', '128', '129', '180',
  // 256: dos ramas a la vez —`256_pagos_clubes_monto_neto` (finanzas CmSports)
  // y `256_perfil_tecnico_solo_staff` (Spinhouse)—. Las DOS se corrieron ya en
  // producción con ese nombre, así que renumerar una la dejaría mintiendo
  // sobre lo que se ejecutó y el portazo `_migracion_nueva` rechazaría la
  // nueva igual. Queda documentada, como las de arriba.
  '256',
])

describe('numeración de migraciones', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const numeroDe = (archivo: string) => archivo.match(/^(\d+)_/)?.[1] ?? null

  it('no hay números repetidos nuevos', () => {
    const porNumero = new Map<string, string[]>()
    for (const archivo of readdirSync(dir)) {
      if (!archivo.endsWith('.sql')) continue
      const n = numeroDe(archivo)
      if (!n) continue
      porNumero.set(n, [...(porNumero.get(n) ?? []), archivo])
    }

    const repetidosNuevos = [...porNumero.entries()]
      .filter(([n, archivos]) => archivos.length > 1 && !DUPLICADOS_HISTORICOS.has(n))
      .map(([n, archivos]) => `${n}: ${archivos.join(' + ')}`)

    expect(repetidosNuevos).toEqual([])
  })

  it('toda migración nueva arranca con el portazo', () => {
    // Desde la 128 —la que creó el registro— es obligatorio. Ver CLAUDE.md: la
    // 089 se corrió dos veces y borró plata real de producción.
    const sinPortazo: string[] = []
    for (const archivo of readdirSync(dir)) {
      if (!archivo.endsWith('.sql')) continue
      const n = Number(numeroDe(archivo))
      if (!Number.isFinite(n) || n < 129) continue
      if (!readFileSync(join(dir, archivo), 'utf8').includes('_migracion_nueva')) {
        sinPortazo.push(archivo)
      }
    }
    expect(sinPortazo).toEqual([])
  })
})
