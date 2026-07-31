// Excel de asistencia por bloque: cuánto viene cada grupo, quién falta, con
// explicación incluida para que se entienda sin tener que preguntar.
// Mismo motor que Panorama (historialAsistencia.ts) y mismo patrón de estilos
// que reportesMes-excel.ts / torneo-excel.ts (xlsx-js-style, ya instalado).

import { calendarioJugador, indexar, indicadores, type DatosHistorial } from '@/lib/domain/historialAsistencia'
import { vigenteEn } from '@/lib/domain/vigencia'

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
  titulo: { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  seccion: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: MORADO } }, alignment: { horizontal: 'left', vertical: 'center' } },
  header: { font: { bold: true, sz: 11, color: { rgb: LILA_TXT } }, fill: { fgColor: { rgb: LILA } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bordes },
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

type Jugador = { id: string; nombre: string; categoria: string | null; grupo: string | null; sede: string | null }

type Args = {
  clubNombre: string
  desde: string
  hasta: string
  meses: number
  datos: DatosHistorial
  jugadores: Jugador[]
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

  // El mismo motor que Panorama: se arman los índices una vez y se comparten
  // entre todos los jugadores, en vez de recorrer todo el club por cada uno.
  const indice = indexar(datos)
  const filas = jugadores.map(j => {
    const ind = indicadores(calendarioJugador(j.id, desde, hasta, datos, indice))
    return { jugador: j, ind }
  }).filter(f => f.ind.programados > 0)

  const totPresentes = filas.reduce((s, f) => s + f.ind.presentes, 0)
  const totAusentes = filas.reduce((s, f) => s + f.ind.ausentes, 0)
  const totPend = filas.reduce((s, f) => s + f.ind.pendientes, 0)
  const totProg = filas.reduce((s, f) => s + f.ind.programados, 0)
  const pctClub = totPresentes + totAusentes > 0 ? Math.round((totPresentes / (totPresentes + totAusentes)) * 100) : null

  // — Hoja 1: Cómo leer esto —
  const explicacion: any[][] = [
    [clubNombre || 'CmSports', 'Asistencia por bloque'],
    [`Período: ${desde} al ${hasta} (${meses === 1 ? 'último mes' : `últimos ${meses} meses`})`],
    [],
    ['Qué muestra cada hoja'],
    ['Resumen del club', 'El total del club: cuántos entrenamientos había que registrar, cuántos se registraron y el % de asistencia general. Abajo, la misma cuenta mes a mes, para ver si el club viene subiendo o bajando.'],
    ['Por bloque', 'Un grupo por fila: cuánta gente tiene inscrita, cuántos presentes y ausentes sumó en el período, y su % de asistencia. Sirve para comparar bloques entre sí.'],
    ['Detalle por bloque', 'Jugador por jugador, agrupado por bloque, ordenado del peor % al mejor. Incluye la racha de faltas seguidas: si un jugador lleva 3 o más, conviene hablar con él o su apoderado.'],
    [],
    ['Cómo se calcula el %'],
    ['El % de asistencia es presentes ÷ (presentes + ausentes), sobre los días que ya pasaron.'],
    ['Un día programado sin registrar (nadie pasó la lista) cuenta como falta: un día que ya pasó y quedó sin marcar no es "no se sabe", es una falta que no se anotó.'],
    ['Los días de hoy en adelante quedan "pendientes" y no entran en el %: todavía no pasaron.'],
    ['Las clases extraordinarias (alguien que vino a un grupo que no es el suyo) no suman ni restan al %: se cobran aparte y no son su obligación.'],
    [],
    ['Sobre "Por bloque" y "Detalle por bloque"'],
    ['Un jugador cuenta en el grupo al que pertenece hoy, con todo su historial del período. Si cambió de grupo a mitad de camino, su asistencia completa queda en el grupo actual, no repartida entre los dos.'],
    ['Un jugador inscrito en dos grupos aparece en ambos, con el mismo % en los dos: no se le resta a ninguno por estar en el otro.'],
  ]
  const wsExp = utils.aoa_to_sheet(explicacion)
  wsExp['!cols'] = [{ wch: 26 }, { wch: 95 }]
  wsExp['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } },
    { s: { r: 13, c: 0 }, e: { r: 13, c: 1 } },
  ]
  set(wsExp, 0, 0, S.titulo); set(wsExp, 0, 1, S.titulo)
  setFila(wsExp, 3, 2, S.seccion)
  setFila(wsExp, 8, 2, S.seccion)
  setFila(wsExp, 13, 2, S.seccion)
  for (const r of [4, 5, 6, 9, 10, 11, 12, 14, 15]) {
    set(wsExp, r, 0, S.label)
    set(wsExp, r, 1, S.texto)
  }
  wsExp['!rows'] = explicacion.map((_, i) => (i === 0 ? { hpt: 30 } : { hpt: 22 }))
  utils.book_append_sheet(wb, wsExp, 'Cómo leer esto')

  // — Hoja 2: Resumen del club —
  const meses_ = new Map<string, { presentes: number; ausentes: number; pendientes: number }>()
  for (const f of filas) {
    for (const m of f.ind.porMes) {
      const acc = meses_.get(m.mes) ?? { presentes: 0, ausentes: 0, pendientes: 0 }
      acc.presentes += m.presentes; acc.ausentes += m.ausentes; acc.pendientes += m.pendientes
      meses_.set(m.mes, acc)
    }
  }
  const resumen: any[][] = [
    [clubNombre || 'CmSports', `Resumen — ${desde} al ${hasta}`],
    [],
    ['Entrenamientos programados', totProg],
    ['Registrados (presentes + ausentes)', totPresentes + totAusentes],
    ['Sin registrar', totPend],
    ['Asistencia del club', pctClub === null ? '—' : `${pctClub}%`],
    ['Jugadores con actividad en el período', filas.length],
    [],
    ['Mes a mes', '', '', '', ''],
    ['Mes', 'Presentes', 'Ausentes', 'Sin registrar', '% Asistencia'],
    ...[...meses_.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, v]) => [
      mesLabel(mes), v.presentes, v.ausentes, v.pendientes,
      v.presentes + v.ausentes > 0 ? Math.round((v.presentes / (v.presentes + v.ausentes)) * 100) : null,
    ]),
  ]
  const wsResumen = utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
  wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 8, c: 0 }, e: { r: 8, c: 4 } }]
  setFila(wsResumen, 0, 5, S.titulo)
  setFila(wsResumen, 8, 5, S.seccion)
  for (let r = 2; r <= 6; r++) set(wsResumen, r, 0, S.label)
  setFila(wsResumen, 9, 5, S.header)
  for (let r = 10; r < resumen.length; r++) {
    setFila(wsResumen, r, 4, S.celda)
    set(wsResumen, r, 4, estiloPct(resumen[r][4] as number | null))
  }
  utils.book_append_sheet(wb, wsResumen, 'Resumen del club')

  // — Hoja 3 y 4: por bloque (mismo criterio que Panorama: el grupo actual del
  // jugador se lleva su asistencia completa del período) —
  const nombreBloque = new Map(datos.bloques.map(b => [b.id, b]))
  const deJugador = new Map(filas.map(f => [f.jugador.id, f]))
  const porBloque = new Map<string, { bloque: any; filas: typeof filas }>()
  const yaContado = new Set<string>() // `${bloqueId}|${jugadorId}`, un jugador no se duplica en el mismo grupo
  for (const i of datos.inscripciones) {
    if (!vigenteEn(i, hasta)) continue
    const f = deJugador.get(i.jugador_id)
    const b = nombreBloque.get(i.bloque_id)
    if (!f || !b) continue
    const clave = `${b.id}|${f.jugador.id}`
    if (yaContado.has(clave)) continue
    yaContado.add(clave)
    const acc = porBloque.get(b.id) ?? { bloque: b, filas: [] }
    acc.filas.push(f)
    porBloque.set(b.id, acc)
  }
  const bloquesOrdenados = [...porBloque.values()].sort((a, b) => a.bloque.nombre.localeCompare(b.bloque.nombre))

  const filasResumenBloque: any[][] = [['Bloque', 'Sede', 'Día', 'Jugadores', 'Presentes', 'Ausentes', 'Sin registrar', '% Asistencia']]
  for (const { bloque, filas: fs } of bloquesOrdenados) {
    const pres = fs.reduce((s, f) => s + f.ind.presentes, 0)
    const aus = fs.reduce((s, f) => s + f.ind.ausentes, 0)
    const pend = fs.reduce((s, f) => s + f.ind.pendientes, 0)
    const pct = pres + aus > 0 ? Math.round((pres / (pres + aus)) * 100) : null
    filasResumenBloque.push([bloque.nombre, bloque.sede ?? '—', bloque.dia_semana, fs.length, pres, aus, pend, pct])
  }
  const wsBloque = utils.aoa_to_sheet(filasResumenBloque)
  wsBloque['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 13 }]
  wsBloque['!freeze'] = { xSplit: 0, ySplit: 1 }
  setFila(wsBloque, 0, 8, S.header)
  for (let r = 1; r < filasResumenBloque.length; r++) {
    setFila(wsBloque, r, 8, S.celda)
    set(wsBloque, r, 7, estiloPct(filasResumenBloque[r][7] as number | null))
  }
  utils.book_append_sheet(wb, wsBloque, 'Por bloque')

  const filasDetalle: any[][] = [['Bloque', 'Jugador', 'Categoría', 'Sede', 'Presentes', 'Ausentes', 'Sin registrar', '% Asistencia', 'Faltas seguidas']]
  for (const { bloque, filas: fs } of bloquesOrdenados) {
    const ordenadas = [...fs].sort((a, b) => (a.ind.porcentaje ?? -1) - (b.ind.porcentaje ?? -1))
    for (const f of ordenadas) {
      filasDetalle.push([
        bloque.nombre, f.jugador.nombre, f.jugador.categoria ?? '—', f.jugador.sede ?? '—',
        f.ind.presentes, f.ind.ausentes, f.ind.pendientes,
        f.ind.porcentaje, f.ind.rachaAusentes > 0 ? f.ind.rachaAusentes : '—',
      ])
    }
  }
  const wsDetalle = utils.aoa_to_sheet(filasDetalle)
  wsDetalle['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 14 }]
  wsDetalle['!freeze'] = { xSplit: 0, ySplit: 1 }
  setFila(wsDetalle, 0, 9, S.header)
  for (let r = 1; r < filasDetalle.length; r++) {
    setFila(wsDetalle, r, 9, S.celda)
    set(wsDetalle, r, 7, estiloPct(filasDetalle[r][7] as number | null))
    if (typeof filasDetalle[r][8] === 'number' && filasDetalle[r][8] >= 3) set(wsDetalle, r, 8, S.mala)
  }
  utils.book_append_sheet(wb, wsDetalle, 'Detalle por bloque')

  const nombreArchivo = `asistencia_por_bloque_${(clubNombre || 'club').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${meses}m.xlsx`
  writeFile(wb, nombreArchivo)
}
