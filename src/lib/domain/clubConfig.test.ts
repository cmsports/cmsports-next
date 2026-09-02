import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLAVES_CONFIG,
  CLAVES_SOLO_SUPERADMIN,
  CONFIG_CLUB,
  CONFIG_POR_DEFECTO,
  clavesEditablesPor,
  crearLectorConfig,
  esClaveConfig,
  normalizarValor,
  puedeEditarClave,
  valorPorDefecto,
} from './clubConfig'

/**
 * Los defaults son el contrato con producción.
 *
 * Un club sin filas en `club_config` —que hoy son TODOS, incluido Buin— se
 * comporta según estos valores. Cambiar uno acá no es refactorizar: es
 * cambiarle el comportamiento a un club en producción sin tocar su base.
 *
 * Por eso están escritos uno por uno y no derivados del catálogo: si alguien
 * edita `clubConfig.ts`, esta prueba falla y lo obliga a decir por qué.
 */
describe('los defaults son el comportamiento actual de Buin', () => {
  it('cupos: se cuenta el número escrito a mano, no las mesas', () => {
    // `bloques_horario.cupo_maximo`, migración 073.
    expect(valorPorDefecto('cupos.modo')).toBe('numero')
  })

  it('mensualidad: monto libre por jugador, no plan', () => {
    // `jugadores.mensualidad`. `mensualidades.ts` explica por qué es a mano.
    expect(valorPorDefecto('mensualidad.modo')).toBe('monto_libre')
  })

  it('morosidad: NUNCA bloquea ni avisa solo', () => {
    // Buin bloquea a mano con `toggleEstadoJugador`. Estos dos ceros son lo
    // único que impide que un club en producción empiece a bloquear alumnos
    // de un día para otro. Si esta prueba falla, leer §7.4 del plan maestro
    // antes de tocar nada.
    expect(valorPorDefecto('morosidad.dias_aviso')).toBe(0)
    expect(valorPorDefecto('morosidad.dias_bloqueo')).toBe(0)
  })

  it('retención: no alerta ni marca inactivo a nadie', () => {
    expect(valorPorDefecto('retencion.faltas_alerta')).toBe(0)
    expect(valorPorDefecto('retencion.dias_inactivo')).toBe(0)
  })

  it('liga: 3 al ganador, 1 al perdedor jugado, 0 al walkover', () => {
    // Verificado contra `liga.ts`: `ganador.pts += 3` y
    // `perdedor.pts += p.esWalkover ? 0 : 1`.
    expect(valorPorDefecto('liga.puntos_victoria')).toBe(3)
    expect(valorPorDefecto('liga.puntos_derrota')).toBe(1)
    expect(valorPorDefecto('liga.puntos_walkover')).toBe(0)
  })

  it('inscripción: el alumno NO se inscribe solo', () => {
    // Encenderlo sin la función atómica deja que dos alumnos tomen el mismo
    // último cupo. Ver §10.6 del plan maestro.
    expect(valorPorDefecto('inscripcion.autoservicio')).toBe('off')
  })
})

/**
 * Los defaults de la liga están copiados de `liga.ts`, que los tiene como
 * números sueltos. Mientras esa copia exista, alguien puede cambiar uno de los
 * dos lados y dejarlos distintos — y la tabla de posiciones de Buin cambiaría
 * sin que ninguna prueba se queje.
 *
 * Esto no arregla la duplicación (eso pasa cuando la liga lea la config), pero
 * la caza. Es el mismo patrón de `rutas-protegidas.test.ts`: leer el archivo y
 * comprobar la regla, en vez de confiar en que alguien se acuerde.
 */
describe('el puntaje de liga.ts sigue siendo el default', () => {
  const liga = readFileSync(join(__dirname, 'liga.ts'), 'utf8')

  it('el ganador suma lo que dice el catálogo', () => {
    const m = liga.match(/ganador\.pts\s*\+=\s*(\d+)/)
    expect(m, 'no se encontró la línea que suma puntos al ganador en liga.ts').toBeTruthy()
    expect(Number(m![1])).toBe(valorPorDefecto('liga.puntos_victoria'))
  })

  it('el perdedor y el walkover suman lo que dice el catálogo', () => {
    const m = liga.match(/perdedor\.pts\s*\+=\s*p\.esWalkover\s*\?\s*(\d+)\s*:\s*(\d+)/)
    expect(m, 'no se encontró la línea que suma puntos al perdedor en liga.ts').toBeTruthy()
    expect(Number(m![1])).toBe(valorPorDefecto('liga.puntos_walkover'))
    expect(Number(m![2])).toBe(valorPorDefecto('liga.puntos_derrota'))
  })
})

describe('el catálogo está sano', () => {
  it('no hay claves repetidas', () => {
    expect(new Set(CLAVES_CONFIG).size).toBe(CONFIG_CLUB.length)
  })

  it('las claves usan el formato que acepta el CHECK de la migración 248', () => {
    // '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' — una clave que no calce se
    // rechaza al insertarla, y eso se descubriría recién en producción.
    for (const clave of CLAVES_CONFIG) {
      expect(clave, `la clave "${clave}" no pasaría el CHECK de la base`)
        .toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/)
    }
  })

  it('todo default cae dentro de su propio rango', () => {
    for (const def of CONFIG_CLUB) {
      if (def.tipo === 'entero') {
        expect(def.defecto, `${def.clave}: el default está fuera de su rango`)
          .toBeGreaterThanOrEqual(def.min)
        expect(def.defecto).toBeLessThanOrEqual(def.max)
      } else {
        expect(def.opciones as readonly string[], `${def.clave}: el default no es una opción válida`)
          .toContain(def.defecto)
      }
    }
  })

  it('toda clave tiene su label en español', () => {
    for (const def of CONFIG_CLUB) {
      expect(def.label.length, `${def.clave}: sin label`).toBeGreaterThan(0)
    }
  })
})

/**
 * Quién edita qué.
 *
 * La regla: casi todo es del admin, porque son decisiones sobre su propio
 * club. El superadmin se queda solo con las claves que tienen una PRECONDICIÓN
 * TÉCNICA —código que puede no existir todavía—, no con las graves.
 */
describe('permisos de edición', () => {
  it('el admin puede tocar lo operativo de su club', () => {
    expect(puedeEditarClave('cupos.por_mesa_grupal', 'admin')).toBe(true)
    expect(puedeEditarClave('liga.puntos_victoria', 'admin')).toBe(true)
    expect(puedeEditarClave('retencion.faltas_alerta', 'admin')).toBe(true)
  })

  it('el admin puede fijar el bloqueo por morosidad, aunque sea grave', () => {
    // Que una decisión sea grave no la vuelve del superadmin: la vuelve algo
    // que la pantalla tiene que explicar bien. Un permiso no es el lugar donde
    // se pide pensar.
    expect(puedeEditarClave('morosidad.dias_bloqueo', 'admin')).toBe(true)
  })

  it('el admin NO puede tocar las que tienen precondición técnica', () => {
    expect(puedeEditarClave('mensualidad.modo', 'admin')).toBe(false)
    expect(puedeEditarClave('inscripcion.autoservicio', 'admin')).toBe(false)
  })

  it('el superadmin puede con todo', () => {
    for (const clave of CLAVES_CONFIG) {
      expect(puedeEditarClave(clave, 'superadmin')).toBe(true)
    }
  })

  it('el profesor y el jugador no pueden con nada', () => {
    for (const rol of ['profesor', 'jugador', null, undefined, '']) {
      for (const clave of CLAVES_CONFIG) {
        expect(puedeEditarClave(clave, rol)).toBe(false)
      }
    }
  })

  it('la mayoría de las claves las edita el admin', () => {
    // Si esto se invierte, alguien se pasó de cauto y el club volvió a
    // depender de pedir cambios por WhatsApp.
    expect(clavesEditablesPor('admin').length).toBeGreaterThan(CLAVES_CONFIG.length / 2)
  })
})

/**
 * La lista de claves reservadas vive en dos lados —el catálogo de TypeScript y
 * la función SQL de la migración 250— y no hay forma de derivar una de la otra.
 *
 * Es el mismo problema que `rutas-protegidas.test.ts`: dos listas en archivos
 * distintos que alguien va a actualizar de a una. Y la consecuencia de que se
 * separen es silenciosa en la dirección peligrosa: si el catálogo dice `admin`
 * y el SQL la tiene reservada, el admin ve el control, aprieta, y recibe un
 * error de RLS que no explica nada.
 */
describe('el catálogo y la migración 250 dicen lo mismo', () => {
  const sql = readFileSync(
    join(__dirname, '../../../supabase/migrations/250_club_config_la_edita_el_admin.sql'),
    'utf8',
  )

  const enSql = [...sql.matchAll(/^\s*'([a-z][a-z0-9_.]*)',?\s*$/gm)].map(m => m[1])

  it('la migración lista alguna clave', () => {
    expect(enSql.length, 'no se encontró la lista en el SQL; ¿cambió el formato?')
      .toBeGreaterThan(0)
  })

  it('las dos listas coinciden exactamente', () => {
    expect([...enSql].sort()).toEqual([...CLAVES_SOLO_SUPERADMIN].sort())
  })

  it('toda clave del SQL existe en el catálogo', () => {
    for (const clave of enSql) {
      expect(esClaveConfig(clave), `la migración 250 reserva "${clave}", que no existe`).toBe(true)
    }
  })
})

describe('esClaveConfig', () => {
  it('reconoce las del catálogo', () => {
    expect(esClaveConfig('cupos.modo')).toBe(true)
  })

  it('descarta lo que no conoce', () => {
    expect(esClaveConfig('cupos.inventado')).toBe(false)
    expect(esClaveConfig('')).toBe(false)
  })
})

/**
 * `normalizarValor` es la frontera con la base: lo que entra por acá lo
 * escribió una persona en una tabla. Nunca puede lanzar, y ante cualquier duda
 * devuelve el default — que es el comportamiento actual, o sea que el peor
 * caso de un valor corrupto es "se comporta como antes".
 */
describe('normalizarValor no deja pasar basura', () => {
  it('acepta una opción válida', () => {
    expect(normalizarValor('cupos.modo', 'por_mesas')).toBe('por_mesas')
  })

  it('devuelve el default ante una opción que no existe', () => {
    expect(normalizarValor('cupos.modo', 'por_canchas')).toBe('numero')
  })

  it('acepta un entero dentro del rango', () => {
    expect(normalizarValor('morosidad.dias_bloqueo', 30)).toBe(30)
  })

  it('rechaza un entero fuera de rango', () => {
    expect(normalizarValor('morosidad.dias_bloqueo', 9999)).toBe(0)
    expect(normalizarValor('morosidad.dias_bloqueo', -1)).toBe(0)
  })

  it('rechaza un decimal: los días son enteros', () => {
    expect(normalizarValor('morosidad.dias_bloqueo', 30.5)).toBe(0)
  })

  it('rechaza el número escrito como texto', () => {
    // jsonb '"30"' y jsonb '30' se ven casi iguales en el editor de Supabase.
    expect(normalizarValor('morosidad.dias_bloqueo', '30')).toBe(0)
  })

  it.each([null, undefined, NaN, Infinity, {}, [], true])(
    'rechaza %p sin lanzar',
    entrada => {
      expect(() => normalizarValor('morosidad.dias_bloqueo', entrada)).not.toThrow()
      expect(normalizarValor('morosidad.dias_bloqueo', entrada)).toBe(0)
    },
  )
})

describe('crearLectorConfig', () => {
  it('un club sin filas usa todos los defaults', () => {
    // Esta es LA prueba: hoy todos los clubes están así, Buin incluido.
    for (const def of CONFIG_CLUB) {
      expect(CONFIG_POR_DEFECTO(def.clave)).toBe(def.defecto)
    }
  })

  it('una fila guardada gana sobre el default', () => {
    const config = crearLectorConfig([{ clave: 'cupos.modo', valor: 'por_mesas' }])
    expect(config('cupos.modo')).toBe('por_mesas')
  })

  it('las demás claves siguen en su default', () => {
    const config = crearLectorConfig([{ clave: 'cupos.modo', valor: 'por_mesas' }])
    expect(config('mensualidad.modo')).toBe('monto_libre')
    expect(config('morosidad.dias_bloqueo')).toBe(0)
  })

  it('descarta una clave que el catálogo no conoce, sin lanzar', () => {
    // Pasa de verdad durante un despliegue: la base ya tiene la fila nueva y
    // el código viejo todavía no conoce la clave.
    const config = crearLectorConfig([
      { clave: 'clave.del.futuro', valor: 'lo que sea' },
      { clave: 'cupos.modo', valor: 'por_mesas' },
    ])
    expect(config('cupos.modo')).toBe('por_mesas')
  })

  it('una fila con valor corrupto cae al default en vez de romper', () => {
    const config = crearLectorConfig([{ clave: 'morosidad.dias_bloqueo', valor: 'treinta' }])
    expect(config('morosidad.dias_bloqueo')).toBe(0)
  })

  it('la configuración de Spinhouse no cambia la de un club sin filas', () => {
    const spinhouse = crearLectorConfig([
      { clave: 'cupos.modo', valor: 'por_mesas' },
      { clave: 'mensualidad.modo', valor: 'por_plan' },
      { clave: 'morosidad.dias_bloqueo', valor: 30 },
      { clave: 'liga.puntos_victoria', valor: 2 },
    ])
    expect(spinhouse('cupos.modo')).toBe('por_mesas')
    expect(spinhouse('morosidad.dias_bloqueo')).toBe(30)
    expect(spinhouse('liga.puntos_victoria')).toBe(2)

    // Y Buin, en el mismo proceso, sigue igual.
    expect(CONFIG_POR_DEFECTO('cupos.modo')).toBe('numero')
    expect(CONFIG_POR_DEFECTO('morosidad.dias_bloqueo')).toBe(0)
    expect(CONFIG_POR_DEFECTO('liga.puntos_victoria')).toBe(3)
  })
})
