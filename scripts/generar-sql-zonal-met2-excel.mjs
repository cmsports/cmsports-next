#!/usr/bin/env node
/**
 * Lee el xlsx Koidan y escribe docs/pegar-zonal-met2-excel.sql
 * con el zonal real (inscritos, grupos del Excel, partidos ITTF, mural, llaves).
 * El xlsx no se commitea.
 *
 *   node scripts/generar-sql-zonal-met2-excel.mjs [ruta.xlsx]
 */
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

const xlsxPath = process.argv[2] || '/tmp/met2.xlsx'
const outPath = path.resolve('docs/pegar-zonal-met2-excel.sql')
const buf = fs.readFileSync(xlsxPath)
const wb = XLSX.read(buf, { cellDates: true, type: 'buffer' })

const CLUB = '7c4e9a12-8b3d-4f61-9e20-d5a7c8b1f430'
const CAMP_NOMBRE = '2do ZONAL INDIVIDUAL MET2 Costa'
const SAB = '2026-06-20'
const DOM = '2026-06-21'

const ALIAS_EVENTO = {
  'Juv V': 'Juv V', 'Juv D': 'Juv D',
  'Pen V': 'Pen V', 'Pen D': 'Pen D',
  'INF V': 'Inf V', 'INF D': 'Inf D',
  'Pre V': 'Pinf V', 'Pre D': 'Pinf D',
}

/** Players.Categoria → evento en la app (nombres del Excel / Prog). */
const EVENTOS = [
  { cat: 'U-19 V', clave: 'Juv V', nombre: 'Juv V', categoria: 'Juvenil', genero: 'varones', fecha: SAB, tamano: 64, koSheet: 'JUV V' },
  { cat: 'U-19 D', clave: 'Juv D', nombre: 'Juv D', categoria: 'Juvenil', genero: 'damas', fecha: SAB, tamano: 16, koSheet: 'JUV D' },
  { cat: 'U-11 V', clave: 'Pen V', nombre: 'Pen V', categoria: 'Peneca', genero: 'varones', fecha: SAB, tamano: 16, koSheet: 'PEN V' },
  { cat: 'U-11 D', clave: 'Pen D', nombre: 'Pen D', categoria: 'Peneca', genero: 'damas', fecha: SAB, tamano: 16, koSheet: 'PEN D' },
  { cat: 'U-15 V', clave: 'Inf V', nombre: 'Inf V', categoria: 'Infantil', genero: 'varones', fecha: DOM, tamano: 64, koSheet: null },
  { cat: 'U-13 V', clave: 'Pinf V', nombre: 'Pinf V', categoria: 'Preinfantil', genero: 'varones', fecha: DOM, tamano: 32, koSheet: null },
  { cat: 'U-13 D', clave: 'Inf D', nombre: 'Inf D', categoria: 'Preinfantil', genero: 'damas', fecha: DOM, tamano: 16, koSheet: null },
  { cat: 'U-15 D', clave: 'Pinf D', nombre: 'Pinf D', categoria: 'Infantil', genero: 'damas', fecha: DOM, tamano: 16, koSheet: null },
]

const FASE_KO = {
  '1/64': 'avance',
  '1/32': '32vos',
  '1/16': '16vos',
  '1/8': '8vos',
  QF: 'cuartos',
  SF: 'semis',
  F: 'final',
  '3 Y 4': 'tercer_lugar',
}

const PROG_KO_FASE = {
  '1/64': 'avance',
  '1/32': '32vos',
  '1/16': '16vos',
  '1/8': '8vos',
  '1/4': 'cuartos',
  SF: 'semis',
  Final: 'final',
  '3°': 'tercer_lugar',
  '3º': 'tercer_lugar',
}

function varn(clave) {
  return clave.replace(/\s/g, '')
}
function esc(s) {
  return String(s ?? '').replace(/'/g, "''")
}
function sqlStr(s) {
  if (s == null || s === '') return 'NULL'
  return `'${esc(s)}'`
}
function sqlTs(fecha, hora) {
  if (!fecha || !hora) return 'NULL'
  return `('${fecha} ${hora}'::timestamp AT TIME ZONE 'America/Santiago')`
}
function sqlInscrito(clave, code) {
  if (code == null || code === '') return 'NULL'
  return `(SELECT id FROM oficial_inscritos WHERE evento_id = v_${varn(clave)} AND codigo_federativo = ${sqlStr(code)} LIMIT 1)`
}
function padHora(h) {
  return h.length === 4 ? `0${h}` : h
}
function resolverClave(alias) {
  const norm = String(alias || '').replace(/\s+/g, ' ')
  return ALIAS_EVENTO[norm] || ALIAS_EVENTO[Object.keys(ALIAS_EVENTO).find(k => k.toLowerCase() === norm.toLowerCase())]
}
function esBye(x) {
  const v = String(x ?? '').trim()
  return !v || ['0', '-', 'X', 'x', 'bye', 'BYE'].includes(v)
}
function ordenIttf(ids) {
  const n = ids.length
  if (n === 3) return [[ids[0], ids[2]], [ids[0], ids[1]], [ids[1], ids[2]]]
  if (n === 4) {
    return [
      [ids[0], ids[2]], [ids[1], ids[3]], [ids[0], ids[1]],
      [ids[2], ids[3]], [ids[0], ids[3]], [ids[1], ids[2]],
    ]
  }
  const out = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([ids[i], ids[j]])
  return out
}

const playerRows = XLSX.utils.sheet_to_json(wb.Sheets.Players, { defval: '' })
const jugadores = []
for (const r of playerRows) {
  const nombre = String(r.NAME || '').trim()
  if (!nombre || esBye(nombre) || nombre.toLowerCase() === 'partner wanted') continue
  const cat = String(r.Categoria || '').trim()
  const grupo = String(r.grupo || '').trim()
  if (!cat || !grupo) continue
  const ev = EVENTOS.find(e => e.cat === cat)
  if (!ev) continue
  jugadores.push({
    cat,
    clave: ev.clave,
    nombre,
    asoc: String(r.COD || r.ASSOCIATION || '').trim() || null,
    codigo: String(r.FCTM_ID || r.Player_Number || '').trim() || null,
    num: String(r.Player_Number || r.FCTM_ID || '').trim(),
    gender: String(r.GENDER || '').trim() === 'D' ? 'D' : 'V',
    grupo: Number(grupo),
  })
}

function parseProg() {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Prog (4)'], { header: 1, defval: '', raw: false })
  const slots = []
  const koSlots = []
  const especiales = []
  let fecha = SAB
  for (const r of rows) {
    const c2 = String(r[2] || '').trim()
    const joined = r.map(x => String(x)).join(' ')
    if (/Programación Domingo/i.test(joined)) fecha = DOM
    if (/Programación Sabado/i.test(joined)) fecha = SAB
    if (!/^\d{1,2}:\d{2}$/.test(c2)) continue
    const hora = padHora(c2)
    const cells = r.slice(3, 15).map(x => String(x || '').trim())
    const etiqueta = cells.find(Boolean) || ''
    if (/apertura|calentamiento/i.test(etiqueta)) {
      especiales.push({ fecha, hora, duracion: 30, tipo: 'apertura', etiqueta: 'Apertura y calentamiento' })
      continue
    }
    if (/receso/i.test(etiqueta)) {
      especiales.push({ fecha, hora, duracion: 40, tipo: 'receso', etiqueta: 'Receso' })
      continue
    }
    if (/t[eé]rmino|premiaci[oó]n/i.test(etiqueta)) {
      especiales.push({ fecha, hora, duracion: 40, tipo: 'premiacion', etiqueta: etiqueta.slice(0, 80) || 'Premiación' })
      continue
    }
    cells.forEach((txt, i) => {
      if (!txt) return
      const g = txt.match(/^(Juv V|Juv D|Pen V|Pen D|INF V|INF D|Pre V|Pre D)\s+GR?(\d+)/i)
      if (g) {
        const clave = resolverClave(g[1])
        if (clave) slots.push({ clave, grupo: Number(g[2]), mesa: i + 1, fecha, hora })
        return
      }
      const k = txt.match(/^(1\/64|1\/32|1\/16|1\/8|1\/4|SF|Final|3[°º])\s+(Juv V|Juv D|Pen V|Pen D|INF V|INF D|Pre V|Pre D)/i)
      if (!k) return
      const faseKey = Object.keys(PROG_KO_FASE).find(x => x.toLowerCase() === k[1].toLowerCase()) || k[1]
      const fase = PROG_KO_FASE[faseKey] || PROG_KO_FASE[k[1]]
      const clave = resolverClave(k[2])
      if (!fase || !clave) return
      koSlots.push({ clave, fase, mesa: i + 1, fecha, hora })
    })
  }
  return { slots, koSlots, especiales }
}

function parseKo(sheetName) {
  if (!sheetName || !wb.Sheets[sheetName]) return []
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false })
  const out = []
  for (const r of rows.slice(2)) {
    const match = String(r[0] || '').trim()
    const round = String(r[1] || '').trim()
    const fase = FASE_KO[round]
    if (!match || !fase) continue
    const a = String(r[6] || '').trim()
    const b = String(r[7] || '').trim()
    if (esBye(a) && esBye(b)) continue
    out.push({
      orden: Number(match) || out.length + 1,
      fase,
      a: esBye(a) ? null : a,
      b: esBye(b) ? null : b,
      mesa: Number(String(r[4] || '').trim()) || null,
    })
  }
  return out
}

function parsePreLlave() {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Pre llave Juv V'], { header: 1, defval: '', raw: false })
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const tag = String(r[1] || '').trim()
    const num = String(r[2] || '').trim()
    if (!/^\d+a$/i.test(tag) || esBye(num)) continue
    const a = num
    let b = null
    for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
      const t2 = String(rows[j][1] || '').trim()
      const n2 = String(rows[j][2] || '').trim()
      if (/^\d+b$/i.test(t2) && !esBye(n2)) { b = n2; break }
    }
    out.push({ orden: out.length + 1, a, b })
  }
  return out
}

const { slots, koSlots, especiales } = parseProg()
const pre = parsePreLlave()

const lines = []
const L = (s) => lines.push(s)

L(`-- Zonal REAL desde DesarrolloTorneo 2da Fecha Individual Sub19 MET2 2026.xlsx`)
L(`-- Club Juez MET2 Costa. NO toca Buin. Idempotente (borra solo este campeonato / MET2-20).`)
L(`-- NO es migración: no usa _migracion_nueva. Pegar entero en SQL Editor de Supabase.`)
L(`-- App: Juez MET2 Costa → Torneo oficial → ${CAMP_NOMBRE}`)
L(`-- Vivo: /torneo-oficial/vivo/MET2-20`)
L(`-- 319 inscritos, 8 eventos, grupos del Excel, mural Prog sáb/dom, pre-llave Juv V, llaves sáb.`)
L(`-- Domingo Inf/Pinf: grupos + mural; las hojas KO del Excel vienen vacías.`)
L(``)
L(`BEGIN;`)
L(``)
L(`DO $$`)
L(`DECLARE`)
L(`  v_club uuid := '${CLUB}';`)
L(`  v_camp uuid;`)
for (const e of EVENTOS) L(`  v_${varn(e.clave)} uuid;`)
L(`BEGIN`)
L(`  IF NOT EXISTS (SELECT 1 FROM clubes WHERE id = v_club) THEN`)
L(`    RAISE EXCEPTION 'Club juez MET2 Costa no encontrado. Pegá 194 primero.';`)
L(`  END IF;`)
L(``)
L(`  DELETE FROM oficial_campeonatos`)
L(`  WHERE club_id = v_club`)
L(`    AND (`)
L(`      nombre IN (${sqlStr(CAMP_NOMBRE)}, '2da Fecha Individual Sub19 MET2 2026')`)
L(`      OR codigo_publico IN ('MET2-20', 'MET2-01')`)
L(`    );`)
L(``)
L(`  INSERT INTO oficial_campeonatos (`)
L(`    club_id, nombre, sede, zona, fecha_inicio, fecha_fin, estado,`)
L(`    mesas_count, bloque_minutos, bloque_grupo_minutos, hora_inicio, codigo_publico, notas`)
L(`  ) VALUES (`)
L(`    v_club, ${sqlStr(CAMP_NOMBRE)},`)
L(`    'Centro Deportivo Mi Club La Reina',`)
L(`    'Metropolitana 2 - Costa',`)
L(`    '${SAB}', '${DOM}', 'en_curso',`)
L(`    12, 25, 70, '09:00:00', 'MET2-20',`)
L(`    'Importado del Excel Koidan (grupos, mural sáb/dom, pre-llave Juv V, llaves Juv/Pen).'`)
L(`  ) RETURNING id INTO v_camp;`)
L(``)

for (const e of EVENTOS) {
  const nJ = jugadores.filter(j => j.clave === e.clave).length
  const fase = e.koSheet ? 'llaves' : 'grupos'
  L(`  INSERT INTO oficial_eventos (`)
  L(`    club_id, campeonato_id, nombre, categoria, genero,`)
  L(`    formato_partido, fase, estado, clasifican_por_grupo, fecha_juego, tamano_cuadro`)
  L(`  ) VALUES (`)
  L(`    v_club, v_camp, ${sqlStr(e.nombre)}, ${sqlStr(e.categoria)}, ${sqlStr(e.genero)},`)
  L(`    'bo5', '${fase}', 'en_curso', 2, '${e.fecha}', ${e.tamano}`)
  L(`  ) RETURNING id INTO v_${varn(e.clave)}; -- ${nJ} inscritos`)
}

L(``)
L(`  INSERT INTO oficial_inscritos (`)
L(`    club_id, evento_id, nombre, asociacion, codigo_federativo, genero, ranking, cabeza_numero, orden_inscripcion`)
L(`  ) VALUES`)

const inscVals = []
for (const e of EVENTOS) {
  const js = jugadores.filter(j => j.clave === e.clave)
    .sort((a, b) => a.grupo - b.grupo || jugadores.indexOf(a) - jugadores.indexOf(b))
  const firstOfGroup = new Set()
  let i = 0
  for (const j of js) {
    i++
    const cabeza = !firstOfGroup.has(j.grupo)
    if (cabeza) firstOfGroup.add(j.grupo)
    inscVals.push(`    (v_club, v_${varn(e.clave)}, ${sqlStr(j.nombre)}, ${sqlStr(j.asoc)}, ${sqlStr(j.codigo)}, '${j.gender}', ${Number(j.num) || i}, ${cabeza ? j.grupo : 'NULL'}, ${i})`)
  }
}
L(inscVals.join(',\n') + ';')

L(``)
L(`  -- Grupos y miembros tal como en la hoja Players`)
for (const e of EVENTOS) {
  const js = jugadores.filter(j => j.clave === e.clave)
  const grupos = [...new Set(js.map(j => j.grupo))].sort((a, b) => a - b)
  for (const g of grupos) {
    L(`  INSERT INTO oficial_grupos (club_id, evento_id, nombre, orden)`)
    L(`  VALUES (v_club, v_${varn(e.clave)}, '${g}', ${g - 1});`)
  }
}

L(``)
L(`  INSERT INTO oficial_grupo_inscritos (club_id, grupo_id, inscrito_id, orden) VALUES`)
const miem = []
for (const e of EVENTOS) {
  const js = jugadores.filter(j => j.clave === e.clave)
  const byG = new Map()
  for (const j of js) {
    if (!byG.has(j.grupo)) byG.set(j.grupo, [])
    byG.get(j.grupo).push(j)
  }
  for (const [g, ps] of byG) {
    ps.forEach((j, ord) => {
      miem.push(
        `    (v_club, (SELECT id FROM oficial_grupos WHERE evento_id = v_${varn(e.clave)} AND nombre = '${g}'),` +
        ` ${sqlInscrito(e.clave, j.codigo)}, ${ord})`,
      )
    })
  }
}
L(miem.join(',\n') + ';')

L(``)
L(`  -- Partidos de grupo, orden ITTF`)
L(`  INSERT INTO oficial_partidos (club_id, evento_id, grupo_id, fase, orden, inscrito_a_id, inscrito_b_id) VALUES`)
const parts = []
for (const e of EVENTOS) {
  const js = jugadores.filter(j => j.clave === e.clave)
  const byG = new Map()
  for (const j of js) {
    if (!byG.has(j.grupo)) byG.set(j.grupo, [])
    byG.get(j.grupo).push(j)
  }
  for (const [g, ps] of byG) {
    const ids = ps.map(j => j.codigo)
    ordenIttf(ids).forEach((pair, ord) => {
      parts.push(
        `    (v_club, v_${varn(e.clave)}, (SELECT id FROM oficial_grupos WHERE evento_id = v_${varn(e.clave)} AND nombre = '${g}'),` +
        ` 'grupos', ${ord},` +
        ` ${sqlInscrito(e.clave, pair[0])},` +
        ` ${sqlInscrito(e.clave, pair[1])})`,
      )
    })
  }
}
L(parts.join(',\n') + ';')

L(``)
L(`  -- Mural grupos: hora × mesa del Prog (grupo de 4 = dos bloques)`)
const slotsByGroup = new Map()
for (const s of slots) {
  const key = `${s.clave}|${s.grupo}`
  if (!slotsByGroup.has(key)) slotsByGroup.set(key, [])
  slotsByGroup.get(key).push(s)
}
for (const [key, list] of slotsByGroup) {
  const [clave, grupo] = key.split('|')
  const first = list[0]
  L(`  UPDATE oficial_partidos p SET mesa = ${first.mesa}, programado_en = ${sqlTs(first.fecha, first.hora)}`)
  L(`  FROM oficial_grupos g`)
  L(`  WHERE p.grupo_id = g.id AND g.evento_id = v_${varn(clave)} AND g.nombre = '${grupo}' AND p.fase = 'grupos' AND p.orden < 3;`)
  if (list[1]) {
    const second = list[1]
    L(`  UPDATE oficial_partidos p SET mesa = ${second.mesa}, programado_en = ${sqlTs(second.fecha, second.hora)}`)
    L(`  FROM oficial_grupos g`)
    L(`  WHERE p.grupo_id = g.id AND g.evento_id = v_${varn(clave)} AND g.nombre = '${grupo}' AND p.fase = 'grupos' AND p.orden >= 3;`)
  }
}

L(``)
L(`  INSERT INTO oficial_bloques_especiales (club_id, campeonato_id, fecha, hora, duracion_min, tipo, etiqueta) VALUES`)
L(especiales.map(e =>
  `    (v_club, v_camp, '${e.fecha}', '${e.hora}', ${e.duracion}, '${e.tipo}', ${sqlStr(e.etiqueta)})`,
).join(',\n') + ';')

if (pre.length) {
  L(``)
  L(`  -- Pre-llave Juv V (hoja Pre llave)`)
  L(`  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, avance_origen_orden) VALUES`)
  L(pre.map(m =>
    `    (v_club, v_JuvV, 'avance', ${m.orden}, ${sqlInscrito('Juv V', m.a)}, ${sqlInscrito('Juv V', m.b)}, ${m.orden})`,
  ).join(',\n') + ';')
}

const koByEvent = new Map()
for (const e of EVENTOS) {
  if (!e.koSheet) continue
  const kos = parseKo(e.koSheet)
  if (!kos.length) continue
  koByEvent.set(e.clave, kos)
  L(``)
  L(`  -- Llaves ${e.nombre} (${e.koSheet})`)
  L(`  INSERT INTO oficial_partidos (club_id, evento_id, fase, orden, inscrito_a_id, inscrito_b_id, mesa) VALUES`)
  L(kos.map(m =>
    `    (v_club, v_${varn(e.clave)}, '${m.fase}', ${m.orden}, ${sqlInscrito(e.clave, m.a)}, ${sqlInscrito(e.clave, m.b)}, ${m.mesa ?? 'NULL'})`,
  ).join(',\n') + ';')
}

L(``)
L(`  -- Mural llaves: hora × mesa del Prog (solo cruce con los dos jugadores)`)
const koScheduleWarn = []
function scheduleFase(clave, fase, matches) {
  const prog = koSlots.filter(s => s.clave === clave && s.fase === fase)
  const playable = matches.filter(m => m.a && m.b)
  if (prog.length !== playable.length) {
    koScheduleWarn.push(`${clave} ${fase}: prog ${prog.length} vs partidos ${playable.length}`)
  }
  const n = Math.min(prog.length, playable.length)
  for (let i = 0; i < n; i++) {
    const s = prog[i]
    const m = playable[i]
    L(`  UPDATE oficial_partidos SET mesa = ${s.mesa}, programado_en = ${sqlTs(s.fecha, s.hora)}`)
    L(`  WHERE evento_id = v_${varn(clave)} AND fase = '${fase}' AND orden = ${m.orden};`)
  }
}
if (pre.length) scheduleFase('Juv V', 'avance', pre.map(m => ({ ...m, a: m.a, b: m.b })))
for (const [clave, kos] of koByEvent) {
  const fases = [...new Set(kos.map(m => m.fase))]
  for (const fase of fases) scheduleFase(clave, fase, kos.filter(m => m.fase === fase))
}

L(``)
L(`  -- Numeración ITTF del programa`)
L(`  WITH ord AS (`)
L(`    SELECT p.id, row_number() OVER (ORDER BY p.programado_en NULLS LAST, p.mesa NULLS LAST, p.fase, p.orden) AS n`)
L(`    FROM oficial_partidos p`)
L(`    JOIN oficial_eventos e ON e.id = p.evento_id`)
L(`    WHERE e.campeonato_id = v_camp`)
L(`  )`)
L(`  UPDATE oficial_partidos p SET numero_ittf = ord.n FROM ord WHERE p.id = ord.id;`)
L(``)
L(`  RAISE NOTICE 'Listo campeonato % codigo MET2-20', v_camp;`)
L(`END $$;`)
L(``)
L(`COMMIT;`)
L(``)
L(`SELECT c.nombre, c.codigo_publico,`)
L(`  (SELECT count(*) FROM oficial_eventos e WHERE e.campeonato_id = c.id) AS eventos,`)
L(`  (SELECT count(*) FROM oficial_inscritos i JOIN oficial_eventos e ON e.id = i.evento_id WHERE e.campeonato_id = c.id) AS inscritos,`)
L(`  (SELECT count(*) FROM oficial_grupos g JOIN oficial_eventos e ON e.id = g.evento_id WHERE e.campeonato_id = c.id) AS grupos,`)
L(`  (SELECT count(*) FROM oficial_partidos p JOIN oficial_eventos e ON e.id = p.evento_id WHERE e.campeonato_id = c.id) AS partidos`)
L(`FROM oficial_campeonatos c`)
L(`WHERE c.club_id = '${CLUB}' AND c.nombre = ${sqlStr(CAMP_NOMBRE)};`)

fs.writeFileSync(outPath, lines.join('\n') + '\n')
console.log('Escrito', outPath)
console.log('inscritos', jugadores.length)
console.log('eventos', EVENTOS.map(e => `${e.clave}:${jugadores.filter(j => j.clave === e.clave).length}`).join(' '))
console.log('slots grupo', slots.length, 'ko prog', koSlots.length, 'especiales', especiales.length)
console.log('pre-llave', pre.length)
for (const e of EVENTOS) {
  if (e.koSheet) console.log('ko', e.koSheet, parseKo(e.koSheet).length)
}
if (koScheduleWarn.length) console.log('avisos mural KO', koScheduleWarn.join(' | '))
