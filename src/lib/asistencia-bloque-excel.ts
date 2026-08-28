// Excel de asistencia por bloque: una hoja por mes, y dentro cada sede con sus
// bloques, para que el profe vea de un vistazo si a un bloque le conviene
// seguir existiendo.
//
// El cálculo no vive acá: sale de `domain/asistenciaPorBloque`, el mismo que
// usa la versión PDF de este reporte. Acá solo se maqueta.

import { type DatosHistorial } from '@/lib/domain/historialAsistencia'
import {
  agruparPorBloque, horarioDeBloque, mesLabel, pctDe, razon, sedeCorta, DIA_LARGO,
  type JugadorDeBloque,
} from '@/lib/domain/asistenciaPorBloque'
import { S, estiloPct, nombreDeHoja, pintor } from '@/lib/excel/estilo'

type Args = {
  clubNombre: string
  desde: string
  hasta: string
  meses: number
  datos: DatosHistorial
  jugadores: JugadorDeBloque[]
}

export async function descargarExcelAsistenciaPorBloque({ clubNombre, desde, hasta, meses, datos, jugadores }: Args) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()
  const { set, setFila } = pintor(utils)
  const usados = new Set<string>()

  const agrupado = agruparPorBloque(datos, jugadores, desde, hasta)

  // — Hoja 1: Cómo leer esto —
  const explicacion: any[][] = [
    [clubNombre || 'CmSports', 'Asistencia por bloque'],
    [`Período: ${desde} al ${hasta} (${meses === 1 ? 'último mes' : `últimos ${meses} meses`})`],
    [],
    ['Una hoja por mes.', 'Adentro, primero Buin y después Fátima. Dentro de cada sede, un cuadro por bloque con su gente.'],
    ['El número "8 de 12"', 'Es asistió/programado: de 12 entrenamientos que le tocaban ese mes en ese bloque, vino a 8. El % de al lado es lo mismo, en porcentaje.'],
    ['Un día sin registrar', 'Si nadie pasó la lista ese día, cuenta como falta: un día que ya pasó y quedó sin marcar no es "no se sabe", es una falta sin anotar. Se corrige a mano en Asistencia histórica.'],
    ['El total del bloque', 'Arriba de cada cuadro, junto al nombre del bloque, va el total sumando a todos los inscritos: sirve para comparar bloques entre sí de un vistazo.'],
    ['Un jugador en dos bloques', 'Aparece en los dos, cada uno con su propia cuenta — no se le resta a uno por estar en el otro.'],
    [],
    ['Los colores', 'Verde 75% o más, ámbar entre 50% y 74%, rojo menos de 50%.'],
  ]
  const wsExp = utils.aoa_to_sheet(explicacion)
  wsExp['!cols'] = [{ wch: 22 }, { wch: 95 }]
  wsExp['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  set(wsExp, 0, 0, S.titulo); set(wsExp, 0, 1, S.titulo)
  for (let r = 3; r < explicacion.length; r++) {
    if (explicacion[r].length === 0) continue
    set(wsExp, r, 0, S.label)
    set(wsExp, r, 1, S.texto)
  }
  wsExp['!rows'] = explicacion.map((_, i) => (i === 0 ? { hpt: 28 } : { hpt: 26 }))
  utils.book_append_sheet(wb, wsExp, nombreDeHoja('Cómo leer esto', usados))

  // — Hoja 2: Resumen — el total de cada bloque en todo el período, para
  // decidir de un vistazo si conviene mantenerlo. —
  const totClub = agrupado.totalClub
  const filasResumen: any[][] = [['Bloque', 'Sede', 'Día', 'Hora', 'Jugadores', 'Asistencia', '%']]
  for (const { bloque, total, jugadores: jugs } of agrupado.periodo) {
    filasResumen.push([
      bloque.nombre, sedeCorta(bloque.sede), DIA_LARGO[bloque.dia_semana] ?? bloque.dia_semana,
      (bloque.hora_inicio ?? '').slice(0, 5), jugs.length, razon(total), pctDe(total),
    ])
  }
  const resumen: any[][] = [
    [clubNombre || 'CmSports', `Resumen del período — ${desde} al ${hasta}`],
    [],
    ['Asistencia del club', pctDe(totClub) === null ? '—' : `${pctDe(totClub)}%`, `(${razon(totClub)})`],
    ['Sin registrar en el período', totClub.pendientes],
    [],
    ...filasResumen,
  ]
  const wsResumen = utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 11 }, { wch: 13 }, { wch: 9 }]
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }]
  wsResumen['!freeze'] = { xSplit: 0, ySplit: 6 }
  setFila(wsResumen, 0, 7, S.titulo)
  set(wsResumen, 2, 0, S.label); set(wsResumen, 3, 0, S.label)
  set(wsResumen, 2, 1, S.cifra)
  const filaHeaderResumen = 5
  setFila(wsResumen, filaHeaderResumen, 7, S.header)
  for (let r = filaHeaderResumen + 1; r < resumen.length; r++) {
    setFila(wsResumen, r, 7, S.celda)
    set(wsResumen, r, 6, estiloPct(resumen[r][6] as number | null))
  }
  utils.book_append_sheet(wb, wsResumen, nombreDeHoja('Resumen', usados))

  // — Una hoja por mes, más reciente primero —
  for (const mesKey of agrupado.meses) {
    const bloquesDelMes = agrupado.porMes.get(mesKey) ?? []
    if (bloquesDelMes.length === 0) continue

    const filas: any[][] = [[mesLabel(mesKey), clubNombre || 'CmSports']]
    const estilos: { fn: () => void }[] = []
    estilos.push({ fn: () => setFila(ws, 0, 6, S.titulo) })
    filas.push([])

    const sedesDelMes = agrupado.sedes.filter(s => bloquesDelMes.some(r => (r.bloque.sede ?? '') === s))
    for (const sede of sedesDelMes) {
      const filaSede = filas.length
      filas.push([sedeCorta(sede)])
      estilos.push({ fn: () => setFila(ws, filaSede, 6, S.sede) })

      for (const { bloque, total, jugadores: jugs } of bloquesDelMes.filter(r => (r.bloque.sede ?? '') === sede)) {
        const filaBloque = filas.length
        filas.push([`${bloque.nombre} — ${horarioDeBloque(bloque)}`, '', `Total: ${razon(total)}`, `${pctDe(total) ?? '—'}%`])
        estilos.push({ fn: () => setFila(ws, filaBloque, 6, S.bloque) })

        const filaHeader = filas.length
        filas.push(['Jugador', 'Asistió', 'Faltó', 'Sin registrar', 'Asistencia', '%'])
        estilos.push({ fn: () => setFila(ws, filaHeader, 6, S.header) })

        for (const { jugador, conteo: c } of jugs) {
          const filaDato = filas.length
          filas.push([jugador.nombre, c.presentes, c.ausentes, c.pendientes, razon(c), pctDe(c)])
          estilos.push({
            fn: () => {
              setFila(ws, filaDato, 6, S.celda)
              set(ws, filaDato, 5, estiloPct(pctDe(c)))
            },
          })
        }
        filas.push([]) // separador entre bloques
      }
    }

    const ws = utils.aoa_to_sheet(filas)
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 9 }]
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }]
    for (const e of estilos) e.fn()

    utils.book_append_sheet(wb, ws, nombreDeHoja(mesLabel(mesKey), usados))
  }

  const nombreArchivo = `asistencia_por_bloque_${(clubNombre || 'club').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${meses}m.xlsx`
  writeFile(wb, nombreArchivo)
}
