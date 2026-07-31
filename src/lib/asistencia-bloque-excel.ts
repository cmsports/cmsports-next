// Excel de asistencia por bloque: una hoja por mes, y dentro cada sede con sus
// bloques, para que el profe vea de un vistazo si a un bloque le conviene
// seguir existiendo. Mismo motor que Panorama (historialAsistencia.ts) y
// mismo patrón de estilos que reportesMes-excel.ts (xlsx-js-style).

import { calendarioJugador, indexar, type DatosHistorial } from '@/lib/domain/historialAsistencia'

const MORADO = '4F46E5'
const LILA = 'EDE9FE'
const LILA_TXT = '3730A3'
const VERDE_BG = 'F0FDF4'
const VERDE_TXT = '166534'
const ROJO_BG = 'FEF2F2'
const ROJO_TXT = 'B91C1C'
const AMBAR_BG = 'FFFBEB'
const AMBAR_TXT = 'B45309'
const BORDE = 'E2E8F0'

const borde = { style: 'thin', color: { rgb: BORDE } } as const
const bordes = { top: borde, bottom: borde, left: borde, right: borde }

const S = {
  titulo: { font: { bold: true, sz: 15, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center' } },
  sede: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '312E81' } }, alignment: { horizontal: 'left', vertical: 'center' } },
  bloque: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'left', vertical: 'center' } },
  header: { font: { bold: true, sz: 10, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: 'F5F3FF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  label: { font: { bold: true, color: { rgb: LILA_TXT } } },
  texto: { alignment: { vertical: 'center', wrapText: true }, font: { sz: 11 } },
  celda: { border: bordes, alignment: { vertical: 'center' } },
  celdaCentro: { border: bordes, alignment: { horizontal: 'center', vertical: 'center' } },
  buena: { fill: { fgColor: { rgb: VERDE_BG } }, font: { bold: true, color: { rgb: VERDE_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  media: { fill: { fgColor: { rgb: AMBAR_BG } }, font: { bold: true, color: { rgb: AMBAR_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
  mala: { fill: { fgColor: { rgb: ROJO_BG } }, font: { bold: true, color: { rgb: ROJO_TXT } }, alignment: { horizontal: 'center', vertical: 'center' }, border: bordes },
} as const

function estiloPct(pct: number | null) {
  if (pct === null) return S.celdaCentro
  return pct >= 75 ? S.buena : pct >= 50 ? S.media : S.mala
}

const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
function mesLabel(mesKey: string) {
  const [anio, mes] = mesKey.split('-').map(Number)
  return `${nombresMes[mes - 1]} ${anio}`
}

// Nombre corto de sede para los títulos. 'paine' es la comuna; la cancha es
// el Centro Deportivo Fátima, que es como el profe la reconoce.
const SEDE_CORTA: Record<string, string> = { buin: 'Buin', paine: 'Fátima', ambos: 'Buin y Fátima' }
function sedeCorta(v: string | null | undefined) {
  if (!v) return 'Sin sede'
  return SEDE_CORTA[v] ?? v.charAt(0).toUpperCase() + v.slice(1)
}

const DIA_ORDEN: Record<string, number> = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7 }
const DIA_LARGO: Record<string, string> = { lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves', vie: 'Viernes', sab: 'Sábado', dom: 'Domingo' }

type Jugador = { id: string; nombre: string; categoria: string | null; grupo: string | null; sede: string | null }

type Args = {
  clubNombre: string
  desde: string
  hasta: string
  meses: number
  datos: DatosHistorial
  jugadores: Jugador[]
}

type Conteo = { presentes: number; ausentes: number; pendientes: number }
function conteoVacio(): Conteo { return { presentes: 0, ausentes: 0, pendientes: 0 } }
function pctDe(c: Conteo): number | null {
  return c.presentes + c.ausentes > 0 ? Math.round((c.presentes / (c.presentes + c.ausentes)) * 100) : null
}
function razon(c: Conteo): string {
  return `${c.presentes} de ${c.presentes + c.ausentes}`
}

export async function descargarExcelAsistenciaPorBloque({ clubNombre, desde, hasta, meses, datos, jugadores }: Args) {
  const XLSX = await import('xlsx-js-style')
  const { utils, writeFile } = XLSX
  const wb = utils.book_new()

  const set = (ws: any, r: number, c: number, style: any) => {
    const ref = utils.encode_cell({ r, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = style
  }
  const setFila = (ws: any, r: number, cols: number, style: any) => {
    for (let c = 0; c < cols; c++) set(ws, r, c, style)
  }

  // El mismo motor que Panorama: el calendario de cada jugador se arma una
  // sola vez para todo el período, y de ahí se reparte por mes y por bloque —
  // no se recalcula por cada combinación.
  const indice = indexar(datos)
  const diasPorJugador = new Map(jugadores.map(j => [j.id, calendarioJugador(j.id, desde, hasta, datos, indice)]))
  const jugadorPorId = new Map(jugadores.map(j => [j.id, j]))
  const bloquePorNombre = new Map(datos.bloques.map(b => [b.nombre, b]))

  // porMesBloqueJugador[mes][bloque.id][jugador.id] = conteo ese mes en ese bloque.
  // Un jugador en dos bloques el mismo día suma en los dos: es la misma regla
  // que ya usa Panorama al repartir asistencia por grupo.
  const porMesBloqueJugador = new Map<string, Map<string, Map<string, Conteo>>>()
  // porBloqueJugador = lo mismo pero sumado en todo el período, para el resumen.
  const porBloqueJugador = new Map<string, Map<string, Conteo>>()
  const mesesConDatos = new Set<string>()

  for (const [jugadorId, dias] of diasPorJugador) {
    for (const dia of dias) {
      if (dia.estado === 'extraordinaria') continue
      const mesKey = dia.fecha.slice(0, 7)
      mesesConDatos.add(mesKey)
      for (const nombreBloque of dia.bloques) {
        const bloque = bloquePorNombre.get(nombreBloque)
        if (!bloque) continue

        let porBloque = porMesBloqueJugador.get(mesKey)
        if (!porBloque) { porBloque = new Map(); porMesBloqueJugador.set(mesKey, porBloque) }
        let porJugador = porBloque.get(bloque.id)
        if (!porJugador) { porJugador = new Map(); porBloque.set(bloque.id, porJugador) }
        const c = porJugador.get(jugadorId) ?? conteoVacio()
        if (dia.estado === 'presente') c.presentes++
        else if (dia.estado === 'ausente') c.ausentes++
        else c.pendientes++
        porJugador.set(jugadorId, c)

        let totalJugador = porBloqueJugador.get(bloque.id)
        if (!totalJugador) { totalJugador = new Map(); porBloqueJugador.set(bloque.id, totalJugador) }
        const ct = totalJugador.get(jugadorId) ?? conteoVacio()
        if (dia.estado === 'presente') ct.presentes++
        else if (dia.estado === 'ausente') ct.ausentes++
        else ct.pendientes++
        totalJugador.set(jugadorId, ct)
      }
    }
  }

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
  utils.book_append_sheet(wb, wsExp, 'Cómo leer esto')

  // — Hoja 2: Resumen — el total de cada bloque en todo el período, para
  // decidir de un vistazo si conviene mantenerlo. —
  const bloquesConDatos = [...porBloqueJugador.keys()]
    .map(id => datos.bloques.find(b => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .sort((a, b) => (DIA_ORDEN[a.dia_semana] ?? 9) - (DIA_ORDEN[b.dia_semana] ?? 9) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))

  let totClub = conteoVacio()
  const filasResumen: any[][] = [['Bloque', 'Sede', 'Día', 'Hora', 'Jugadores', 'Asistencia', '%']]
  for (const bloque of bloquesConDatos) {
    const porJugador = porBloqueJugador.get(bloque.id)!
    const total = [...porJugador.values()].reduce((acc, c) => ({
      presentes: acc.presentes + c.presentes, ausentes: acc.ausentes + c.ausentes, pendientes: acc.pendientes + c.pendientes,
    }), conteoVacio())
    totClub = { presentes: totClub.presentes + total.presentes, ausentes: totClub.ausentes + total.ausentes, pendientes: totClub.pendientes + total.pendientes }
    filasResumen.push([
      bloque.nombre, sedeCorta(bloque.sede), DIA_LARGO[bloque.dia_semana] ?? bloque.dia_semana, (bloque.hora_inicio ?? '').slice(0, 5),
      porJugador.size, razon(total), pctDe(total),
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
  setFila(wsResumen, 0, 7, S.titulo)
  set(wsResumen, 2, 0, S.label); set(wsResumen, 3, 0, S.label)
  const filaHeaderResumen = 5
  setFila(wsResumen, filaHeaderResumen, 7, S.header)
  for (let r = filaHeaderResumen + 1; r < resumen.length; r++) {
    setFila(wsResumen, r, 7, S.celda)
    set(wsResumen, r, 6, estiloPct(resumen[r][6] as number | null))
  }
  utils.book_append_sheet(wb, wsResumen, 'Resumen')

  // — Una hoja por mes, más reciente primero —
  const ordenSedes = ['buin', 'paine']
  for (const mesKey of [...mesesConDatos].sort().reverse()) {
    const porBloque = porMesBloqueJugador.get(mesKey)
    if (!porBloque) continue

    const bloquesDelMes = [...porBloque.keys()]
      .map(id => datos.bloques.find(b => b.id === id))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .sort((a, b) => (DIA_ORDEN[a.dia_semana] ?? 9) - (DIA_ORDEN[b.dia_semana] ?? 9) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))

    const sedesDelMes = [...new Set(bloquesDelMes.map(b => b.sede ?? ''))]
      .sort((a, b) => {
        const ia = ordenSedes.indexOf(a), ib = ordenSedes.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })

    const filas: any[][] = [[mesLabel(mesKey), clubNombre || 'CmSports']]
    const estilos: { row: number; fn: () => void }[] = []
    estilos.push({ row: 0, fn: () => { setFila(ws, 0, 6, S.titulo) } })
    filas.push([])

    for (const sede of sedesDelMes) {
      const filaSede = filas.length
      filas.push([sedeCorta(sede)])
      estilos.push({ row: filaSede, fn: () => { setFila(ws, filaSede, 6, S.sede) } })

      for (const bloque of bloquesDelMes.filter(b => (b.sede ?? '') === sede)) {
        const porJugador = porBloque.get(bloque.id)!
        const total = [...porJugador.values()].reduce((acc, c) => ({
          presentes: acc.presentes + c.presentes, ausentes: acc.ausentes + c.ausentes, pendientes: acc.pendientes + c.pendientes,
        }), conteoVacio())

        const filaBloque = filas.length
        const horario = `${DIA_LARGO[bloque.dia_semana] ?? bloque.dia_semana} ${(bloque.hora_inicio ?? '').slice(0, 5)}`
        filas.push([`${bloque.nombre} — ${horario}`, '', `Total: ${razon(total)}`, `${pctDe(total) ?? '—'}%`])
        estilos.push({ row: filaBloque, fn: () => { setFila(ws, filaBloque, 6, S.bloque) } })

        const filaHeader = filas.length
        filas.push(['Jugador', 'Asistió', 'Faltó', 'Sin registrar', 'Asistencia', '%'])
        estilos.push({ row: filaHeader, fn: () => { setFila(ws, filaHeader, 6, S.header) } })

        const ordenados = [...porJugador.entries()]
          .map(([jugadorId, c]) => ({ jugador: jugadorPorId.get(jugadorId), c }))
          .filter((x): x is { jugador: Jugador; c: Conteo } => !!x.jugador)
          .sort((a, b) => (pctDe(a.c) ?? -1) - (pctDe(b.c) ?? -1) || a.jugador.nombre.localeCompare(b.jugador.nombre))

        for (const { jugador, c } of ordenados) {
          const filaDato = filas.length
          filas.push([jugador.nombre, c.presentes, c.ausentes, c.pendientes, razon(c), pctDe(c)])
          estilos.push({
            row: filaDato,
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

    // El nombre de hoja no admite / \ ? * [ ] ni pasar 31 caracteres.
    const nombreHoja = mesLabel(mesKey).slice(0, 31)
    utils.book_append_sheet(wb, ws, nombreHoja)
  }

  const nombreArchivo = `asistencia_por_bloque_${(clubNombre || 'club').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${meses}m.xlsx`
  writeFile(wb, nombreArchivo)
}
