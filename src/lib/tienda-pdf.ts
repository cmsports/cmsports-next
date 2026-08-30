// PDF de catálogo de una tienda (Tienda del profe / Tienda Buin) — pensado
// para que el profesor lo mande a gente externa: se arma como un catálogo de
// venta con marca del club, no como una planilla de control interno.
//
// ── Por qué es un SVG rasterizado y no dibujo directo con jsPDF ───────────
// La primera versión dibujaba todo con las primitivas de jsPDF (rect, circle,
// texto en Helvetica). Servía, pero Helvetica no tiene degradados reales, ni
// sombras, ni emoji — cualquier 🏓 salía como un cuadrado roto. Acá cada
// página se arma como SVG (degradados, sombras con feDropShadow, la
// tipografía del sistema, emoji de verdad), el navegador la rasteriza a un
// PNG de alta resolución (mismo truco que `qr-invitacion-pdf.ts`) y esa
// imagen se pega a página completa en el PDF. Los botones de WhatsApp siguen
// siendo clickeables de verdad: se dibujan en el PNG y además se registra un
// `doc.link()` invisible exactamente encima, en las mismas coordenadas
// convertidas a milímetros.
//
// ── Por qué no hay un precio tachado ──────────────────────────────────────
// Se pidió explícitamente un "antes" inventado, más caro, tachado al lado
// del precio real, para simular un descuento que no existe. No se hizo:
// quien recibe este catálogo puede comprar con esa información, y un "antes"
// que nunca existió es un engaño real a esa persona, no un detalle de
// diseño. En su lugar se usa un posicionamiento verdadero — "Precio
// Asociación" — que vende sin inventar un descuento.
//
// Las fotos (de producto y el logo del club) se traen y se reducen ANTES de
// construir nada: se descargan, se redibujan en un canvas a un tamaño chico
// (manteniendo su proporción real) y quedan listas como base64. Una foto que
// no carga no frena el catálogo — esa tarjeta sale con un recuadro vacío — y
// si el catálogo entero falla por otra razón, se avisa con un error real en
// vez de no hacer nada.

export type ProductoTiendaPdf = {
  nombre: string
  descripcion: string | null
  categoria: string
  color: string | null
  stock: number
  precio: number | null
  imagen_url: string | null
}

type Opciones = {
  logoUrl?: string | null
  contactoWhatsapp?: string | null
}

const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
const FUENTE = "'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif"

// Un emoji por categoría — antes no se podían usar (Helvetica no los dibuja,
// salían como cuadrados rotos), pero acá el texto lo renderiza el propio
// navegador antes de rasterizar, así que un emoji es un emoji de verdad.
const EMOJI_CATEGORIA: Record<string, string> = {
  maderos: '🏓', gomas: '🔴', pelotas: '⚪', accesorios: '🎒', vestimenta: '👕', otros: '🏅',
}
function emojiCategoria(categoria: string): string { return EMOJI_CATEGORIA[categoria] ?? '🛍️' }

// Un color de marca por categoría, elegido a mano: así "Gomas" siempre es
// rojo (el color del caucho) y "Vestimenta" siempre es azul, catálogo tras
// catálogo, en vez de que le toque un color al azar.
const COLOR_CATEGORIA: Record<string, string> = {
  maderos: '#8a5a2b', gomas: '#c8102e', pelotas: '#d97706', accesorios: '#7c3aed', vestimenta: '#152a52', otros: '#0d9488',
}
function colorCategoria(categoria: string): string {
  if (COLOR_CATEGORIA[categoria]) return COLOR_CATEGORIA[categoria]
  let h = 0
  for (const c of categoria) h = (h * 31 + c.charCodeAt(0)) | 0
  const PALETA = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  return PALETA[Math.abs(h) % PALETA.length]
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

type Foto = { data: string; ancho: number; alto: number }

/** Tamaño máximo del lado largo, en píxeles. Una foto de celular pesa varios
 *  MB y a este catálogo le sobra con un tercio de eso. */
const LADO_MAX_PX = 480

/** Descarga una imagen, la reduce y la deja lista para incrustar en el SVG.
 *  Devuelve también el ancho y alto ya reducidos, para poder encajarla
 *  "contain" dentro de su recuadro sin estirarla. */
async function imagenAFotoReducida(url: string): Promise<Foto | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height))
    const ancho = Math.max(1, Math.round(bitmap.width * escala))
    const alto = Math.max(1, Math.round(bitmap.height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return null }
    // Fondo blanco: un PNG con transparencia se ve con manchas negras al
    // exportarse como JPEG si no se rellena antes de dibujar encima.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bitmap, 0, 0, ancho, alto)
    bitmap.close()
    return { data: canvas.toDataURL('image/jpeg', 0.85), ancho, alto }
  } catch {
    return null
  }
}

/** Encaja `foto` completa (nunca recortada) dentro del recuadro [x,y,w,h]. */
function encajar(foto: Foto, x: number, y: number, w: number, h: number) {
  const escala = Math.min(w / foto.ancho, h / foto.alto)
  const aw = foto.ancho * escala
  const ah = foto.alto * escala
  return { x: x + (w - aw) / 2, y: y + (h - ah) / 2, w: aw, h: ah }
}

/** Cubre el círculo por completo (puede recortar bordes) — para un logo, que
 *  se ve mejor lleno que flotando chico en el medio con bordes en blanco. */
function cubrirCirculo(foto: Foto, cx: number, cy: number, r: number) {
  const escala = Math.max((r * 2) / foto.ancho, (r * 2) / foto.alto)
  const w = foto.ancho * escala
  const h = foto.alto * escala
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** Envuelve texto a un ancho máximo usando el mismo motor de fuentes que va
 *  a rasterizar la página — medir con jsPDF/Helvetica hubiera dado anchos
 *  distintos a los reales, porque acá se dibuja con la fuente del sistema. */
/** Recorta una sola línea con "…" si no entra en `maxAncho` — para el pie de
 *  página, donde el nombre del club no lo controla este archivo y uno largo
 *  no puede terminar pisando el botón de WhatsApp del medio. */
function truncarLinea(texto: string, maxAncho: number, pesoYTam: string): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${pesoYTam} ${FUENTE}`
  if (ctx.measureText(texto).width <= maxAncho) return texto
  let recorte = texto
  while (recorte.length > 1 && ctx.measureText(recorte + '…').width > maxAncho) recorte = recorte.slice(0, -1)
  return recorte.trimEnd() + '…'
}

/** Ancho real de un texto con la fuente del sistema — para dimensionar
 *  formas (la pestaña de categoría) sin adivinar a partir de la cantidad de
 *  letras, que con un emoji adelante queda corto o largo según el caso. */
function medirAncho(texto: string, pesoYTam: string): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${pesoYTam} ${FUENTE}`
  return ctx.measureText(texto).width
}

function envolver(texto: string, maxAncho: number, pesoYTam: string, maxLineas: number): string[] {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${pesoYTam} ${FUENTE}`
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  let i = 0
  while (i < palabras.length) {
    const palabra = palabras[i]
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (!actual || ctx.measureText(prueba).width <= maxAncho) {
      actual = prueba
      i++
    } else {
      lineas.push(actual)
      actual = ''
      if (lineas.length === maxLineas) break
    }
  }
  if (lineas.length < maxLineas && actual) { lineas.push(actual); actual = '' }
  const truncado = i < palabras.length || actual !== ''
  if (truncado && lineas.length > 0) {
    let ultima = lineas[lineas.length - 1]
    while (ctx.measureText(ultima + '…').width > maxAncho && ultima.length > 1) ultima = ultima.slice(0, -1)
    lineas[lineas.length - 1] = ultima.trimEnd() + '…'
  }
  return lineas
}

/** Convierte el SVG de una página a un PNG de alta resolución, vía canvas —
 *  mismo mecanismo que usa `qr-invitacion-pdf.ts` para su afiche. */
async function rasterizar(svg: string, anchoPx: number, altoPx: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo dibujar una página del catálogo.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = anchoPx
    canvas.height = altoPx
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo dibujar una página del catálogo.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, anchoPx, altoPx)
    ctx.drawImage(img, 0, 0, anchoPx, altoPx)
    return canvas.toDataURL('image/jpeg', 0.92)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Geometría del diseño, en un lienzo virtual de 1000×1414 (proporción A4)
const W = 1000
const H = 1414
const MARGEN = 50
const HERO_H = 240
const SUBHEADER_H = 90
const CONT_H = 130
const RESPIRO_CONT = 40
const FOOTER_H = 70
const TITULO_CAT_H = 70
const COLS = 3
const GAP = 30
const OUTER_W = 280
const CARD_INSET = 6
const CARD_W = OUTER_W - CARD_INSET * 2
const FOTO_H = 210
const TEXTO_H = 160
const CARD_H = FOTO_H + TEXTO_H
const OUTER_H = CARD_H + CARD_INSET * 2
const ROW_GAP = 26
const PASO_FILA = OUTER_H + ROW_GAP
const Y_INICIO_P1 = HERO_H + SUBHEADER_H
const Y_INICIO_CONT = CONT_H + RESPIRO_CONT
const LIMITE_INFERIOR = H - FOOTER_H

type Bloque =
  | { tipo: 'titulo'; categoria: string; cantidad: number }
  | { tipo: 'fila'; productos: (ProductoTiendaPdf | undefined)[] }

/** Decide en qué página cae cada título de categoría y cada fila de
 *  productos, simulando el mismo alto que se va a dibujar de verdad más
 *  adelante. Separarlo del dibujo evita tener que "adivinar" cuántas
 *  páginas van a hacer falta antes de saberlo. */
function planificarPaginas(productos: ProductoTiendaPdf[], categorias: string[]): Bloque[][] {
  const paginas: Bloque[][] = []
  let actual: Bloque[] = []
  let y = Y_INICIO_P1

  function nuevaPagina() {
    paginas.push(actual)
    actual = []
    y = Y_INICIO_CONT
  }
  function asegurar(alto: number) {
    if (y + alto > LIMITE_INFERIOR) nuevaPagina()
  }

  for (const cat of categorias) {
    const deLaCategoria = productos.filter(p => p.categoria === cat)
    if (deLaCategoria.length === 0) continue
    asegurar(TITULO_CAT_H + OUTER_H)
    actual.push({ tipo: 'titulo', categoria: cat, cantidad: deLaCategoria.length })
    y += TITULO_CAT_H
    for (let i = 0; i < deLaCategoria.length; i += COLS) {
      asegurar(PASO_FILA)
      actual.push({ tipo: 'fila', productos: [deLaCategoria[i], deLaCategoria[i + 1], deLaCategoria[i + 2]] })
      y += PASO_FILA
    }
    y += 20
  }
  paginas.push(actual)
  return paginas.filter(p => p.length > 0)
}

type Clicable = { x: number; y: number; w: number; h: number; url: string }

function construirCabeceraHero(clubNombre: string, tiendaNombre: string, logo: Foto | null, fecha: string): string {
  const cx = 95, cy = 120, r = 50
  const logoImg = logo
    ? (() => {
        const pos = cubrirCirculo(logo, cx, cy, r)
        return `<clipPath id="logoClip"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath>
          <image href="${logo.data}" x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" clip-path="url(#logoClip)"/>`
      })()
    : `<text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#152a52" font-size="34" font-weight="800" font-family="${FUENTE}">${esc(iniciales(clubNombre))}</text>`

  return `
    <rect width="${W}" height="${HERO_H}" fill="url(#hero)"/>
    <ellipse cx="${W - 120}" cy="60" rx="220" ry="180" fill="url(#glowGold)"/>
    <ellipse cx="120" cy="120" rx="180" ry="180" fill="url(#glowRed)"/>
    <text x="${W - 30}" y="200" text-anchor="end" font-size="230" opacity="0.07" transform="rotate(-14 ${W - 120} 120)">🏓</text>
    <g filter="url(#sombraLogo)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/></g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f5b942" stroke-width="2.5"/>
    ${logoImg}
    <rect x="172" y="52" width="230" height="34" rx="17" fill="#c8102e" stroke="#f5b942" stroke-width="1.2"/>
    <text x="287" y="74" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="700" letter-spacing="2" font-family="${FUENTE}">🏆 CATÁLOGO OFICIAL</text>
    <text x="172" y="150" fill="#ffffff" font-size="52" font-weight="800" letter-spacing="-1" font-family="${FUENTE}">${esc(truncarLinea(tiendaNombre, 748, '800 52px'))}</text>
    <rect x="174" y="164" width="130" height="5" rx="2.5" fill="url(#stripe)"/>
    <text x="172" y="196" fill="#c7d2e6" font-size="20" font-family="${FUENTE}">${esc(truncarLinea(clubNombre, 748, '20px'))}</text>
    <text x="${W - 36}" y="44" text-anchor="end" fill="#8fa0c4" font-size="14" font-family="${FUENTE}">Generado el ${esc(fecha)}</text>
    <rect x="0" y="${HERO_H - 4}" width="${W}" height="4" fill="url(#stripe)"/>`
}

function construirCabeceraContinuacion(clubNombre: string, tiendaNombre: string): string {
  return `
    <rect width="${W}" height="${CONT_H}" fill="url(#hero)"/>
    <text x="${MARGEN}" y="66" fill="#ffffff" font-size="30" font-weight="800" font-family="${FUENTE}">${esc(truncarLinea(tiendaNombre, 550, '800 30px'))} <tspan fill="#c7d2e6" font-size="18" font-weight="400">(continuación)</tspan></text>
    <text x="${MARGEN}" y="94" fill="#8fa0c4" font-size="15" font-family="${FUENTE}">${esc(truncarLinea(clubNombre, 900, '15px'))}</text>
    <rect x="0" y="${CONT_H - 4}" width="${W}" height="4" fill="url(#stripe)"/>`
}

function construirTituloCategoria(categoria: string, cantidad: number, catLabel: (c: string) => string, y: number): string {
  const color = colorCategoria(categoria)
  const etiqueta = catLabel(categoria)
  const textoTab = `${emojiCategoria(categoria)} ${etiqueta}`
  // Ancho real + margen a cada lado (16 de padding izquierdo, 24 de sobra a
  // la derecha para que el emoji y la cuña no queden pegados al borde).
  const anchoTexto = Math.round(medirAncho(textoTab, '700 17px')) + 40
  return `
    <path d="M${MARGEN} ${y} h${anchoTexto} v34 l-16 16 h-${anchoTexto - 16} a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10 Z" fill="${color}"/>
    <text x="${MARGEN + 16}" y="${y + 23}" fill="#ffffff" font-size="17" font-weight="700" font-family="${FUENTE}">${esc(textoTab)}</text>
    <text x="${W - MARGEN}" y="${y + 23}" text-anchor="end" fill="#94a3b8" font-size="14" font-family="${FUENTE}">${cantidad} producto${cantidad !== 1 ? 's' : ''}</text>`
}

function construirTarjeta(p: ProductoTiendaPdf, x: number, y: number, fotos: Map<string, Foto>, idFoto: string): string {
  const color = colorCategoria(p.categoria)
  const cardX = x + CARD_INSET, cardY = y + CARD_INSET
  const zonaFoto = { x: cardX + 8, y: cardY + 8, w: CARD_W - 16, h: FOTO_H - 16 }
  const foto = p.imagen_url ? fotos.get(p.imagen_url) : undefined
  const clipId = `clip-${idFoto}`

  let contenidoFoto = ''
  if (foto) {
    const pos = encajar(foto, zonaFoto.x, zonaFoto.y, zonaFoto.w, zonaFoto.h)
    contenidoFoto = `<image href="${foto.data}" x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" width="${pos.w.toFixed(1)}" height="${pos.h.toFixed(1)}" clip-path="url(#${clipId})"/>`
  }

  const estado = p.stock > 0
    ? `<rect x="${cardX + CARD_W - 106}" y="${cardY + 18}" width="90" height="30" rx="15" fill="#16a34a"/>
       <text x="${cardX + CARD_W - 61}" y="${cardY + 38}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="${FUENTE}">✅ DISPONIBLE</text>`
    : `<rect x="${zonaFoto.x}" y="${zonaFoto.y}" width="${zonaFoto.w}" height="${zonaFoto.h}" rx="10" fill="#0b1f3a" opacity="0.5" clip-path="url(#${clipId})"/>
       <text x="${cardX + CARD_W / 2}" y="${cardY + FOTO_H / 2 + 10}" text-anchor="middle" fill="#ffffff" font-size="30" font-weight="800" font-family="${FUENTE}" transform="rotate(-16 ${cardX + CARD_W / 2} ${cardY + FOTO_H / 2})">AGOTADO</text>`

  const nombreLineas = envolver(p.nombre, CARD_W - 24, '700 22px', 2)
  const yNombreBase = cardY + FOTO_H + 34
  const nombreSvg = nombreLineas.map((linea, i) =>
    `<text x="${cardX + CARD_W / 2}" y="${yNombreBase + i * 26}" text-anchor="middle" fill="#152a52" font-size="22" font-weight="700" font-family="${FUENTE}">${esc(linea)}</text>`).join('')

  const yColor = yNombreBase + nombreLineas.length * 26 + (p.color ? 6 : -14)
  const colorSvg = p.color
    ? `<text x="${cardX + CARD_W / 2}" y="${yColor}" text-anchor="middle" fill="#8a97ab" font-size="15" font-family="${FUENTE}">${esc(p.color)}</text>`
    : ''

  const yPrecio = cardY + CARD_H - 34
  const precioSvg = p.precio
    ? `<text x="${cardX + CARD_W / 2}" y="${yPrecio}" text-anchor="middle" fill="#c8102e" font-size="30" font-weight="800" font-family="${FUENTE}">${esc(fmt(p.precio))}</text>
       <text x="${cardX + CARD_W / 2}" y="${yPrecio + 18}" text-anchor="middle" fill="#b7bec9" font-size="11" letter-spacing="1.5" font-family="${FUENTE}">PRECIO ASOCIACIÓN</text>`
    : `<text x="${cardX + CARD_W / 2}" y="${yPrecio}" text-anchor="middle" fill="#94a3b8" font-size="20" font-weight="700" font-family="${FUENTE}">Consultar</text>`

  return `
    <defs><clipPath id="${clipId}"><rect x="${zonaFoto.x}" y="${zonaFoto.y}" width="${zonaFoto.w}" height="${zonaFoto.h}" rx="10"/></clipPath></defs>
    <g filter="url(#sombraCard)"><rect x="${x}" y="${y}" width="${OUTER_W}" height="${OUTER_H}" rx="18" fill="${color}"/></g>
    <rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="#ffffff"/>
    <rect x="${zonaFoto.x}" y="${zonaFoto.y}" width="${zonaFoto.w}" height="${zonaFoto.h}" rx="10" fill="${tinte(color, 0.92)}"/>
    ${contenidoFoto}
    ${estado}
    ${nombreSvg}
    ${colorSvg}
    ${precioSvg}`
}

/** Mezcla un color hex con blanco — para el fondo tenue detrás de la foto. */
function tinte(hex: string, opacidadBlanco: number): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const mezcla = (c: number) => Math.round(255 * opacidadBlanco + c * (1 - opacidadBlanco))
  return `rgb(${mezcla(r)}, ${mezcla(g)}, ${mezcla(b)})`
}

/** Iniciales del club para cuando no hay logo — mejor que un círculo vacío.
 *  Se saltan las palabras de relleno ("Asociación", "Club", "de") para que
 *  las iniciales salgan del nombre propio, no del tipo de institución. */
function iniciales(nombre: string): string {
  const RELLENO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'club', 'asociación', 'asociacion'])
  const todas = nombre.trim().split(/\s+/).filter(Boolean)
  const relevantes = todas.filter(p => !RELLENO.has(p.toLowerCase()))
  const base = relevantes.length > 0 ? relevantes : todas
  const letras = base.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  return letras || 'CT'
}

function construirFooter(clubNombre: string, tiendaNombre: string, wa: string, pagina: number, total: number): { svg: string; clicable: Clicable | null } {
  const y = H - FOOTER_H
  let botonSvg = ''
  let clicable: Clicable | null = null
  if (wa) {
    const texto = '💬  Escríbenos por WhatsApp'
    const anchoBoton = 300
    const xBoton = W / 2 - anchoBoton / 2
    const yBoton = y + 14
    botonSvg = `
      <rect x="${xBoton}" y="${yBoton}" width="${anchoBoton}" height="34" rx="17" fill="#16a34a"/>
      <text x="${W / 2}" y="${yBoton + 22}" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700" font-family="${FUENTE}">${texto}</text>`
    clicable = { x: xBoton, y: yBoton, w: anchoBoton, h: 34, url: `https://wa.me/${wa}` }
  }
  // El botón de WhatsApp arranca en el medio de la página; a la izquierda no
  // puede quedar menos separación que esa, sea cual sea el largo real del
  // nombre del club (eso no lo decide este archivo).
  const anchoMaxIzquierda = wa ? (W / 2 - 150) - MARGEN - 20 : 700
  const textoIzquierda = truncarLinea(`${clubNombre} · ${tiendaNombre}`, anchoMaxIzquierda, '13px')
  const svg = `
    <line x1="${MARGEN}" y1="${y}" x2="${W - MARGEN}" y2="${y}" stroke="#e2e8f0" stroke-width="1.5"/>
    <text x="${MARGEN}" y="${y + 55}" fill="#94a3b8" font-size="13" font-family="${FUENTE}">${esc(textoIzquierda)}</text>
    <text x="${W - MARGEN}" y="${y + 55}" text-anchor="end" fill="#94a3b8" font-size="13" font-family="${FUENTE}">Página ${pagina} de ${total}</text>
    ${botonSvg}`
  return { svg, clicable }
}

function construirDefs(): string {
  return `
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c1f3d"/><stop offset="0.55" stop-color="#152a52"/><stop offset="1" stop-color="#1f2f5c"/>
    </linearGradient>
    <radialGradient id="glowGold" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f5b942" stop-opacity="0.35"/><stop offset="1" stop-color="#f5b942" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowRed" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#e11d3c" stop-opacity="0.4"/><stop offset="1" stop-color="#e11d3c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stripe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f5b942"/><stop offset="0.5" stop-color="#e11d3c"/><stop offset="1" stop-color="#f5b942"/>
    </linearGradient>
    <filter id="sombraCard" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0c1f3d" flood-opacity="0.16"/>
    </filter>
    <filter id="sombraLogo" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.35"/>
    </filter>`
}

/**
 * Genera y descarga el catálogo. `categoriasOrden` es el orden en que la
 * propia pantalla muestra los filtros (Maderos, Gomas, ...) — así el PDF
 * agrupa igual que la pantalla en vez de caer en el orden alfabético en que
 * vienen de la base. `catLabel` traduce la clave interna ('maderos') al
 * nombre que ve la gente ('Maderos').
 *
 * Tira una excepción si algo sale mal — quien llama la muestra en pantalla en
 * vez de dejar que el botón no haga nada y parezca roto.
 */
export async function exportarTiendaPdf(
  clubNombre: string,
  tiendaNombre: string,
  productos: ProductoTiendaPdf[],
  categoriasOrden: string[],
  catLabel: (categoria: string) => string,
  opciones: Opciones = {},
) {
  if (productos.length === 0) throw new Error('No hay productos para exportar.')

  const { default: jsPDF } = await import('jspdf')

  const [fotos, logo] = await Promise.all([
    (async () => {
      const mapa = new Map<string, Foto>()
      await Promise.all(
        productos
          .filter((p): p is ProductoTiendaPdf & { imagen_url: string } => !!p.imagen_url)
          .map(async p => {
            const foto = await imagenAFotoReducida(p.imagen_url)
            if (foto) mapa.set(p.imagen_url, foto)
          }),
      )
      return mapa
    })(),
    opciones.logoUrl ? imagenAFotoReducida(opciones.logoUrl) : Promise.resolve(null),
  ])

  const presentes = new Set(productos.map(p => p.categoria))
  const conocidas = categoriasOrden.filter(c => presentes.has(c))
  const desconocidas = [...presentes].filter(c => !categoriasOrden.includes(c)).sort()
  const categorias = [...conocidas, ...desconocidas]

  const paginas = planificarPaginas(productos, categorias)
  const disponibles = productos.filter(p => p.stock > 0).length
  const fecha = new Date().toLocaleDateString('es-CL')
  const wa = (opciones.contactoWhatsapp ?? '').replace(/\D/g, '')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const ESCALA = 2.5
  const FACTOR_MM = 210 / W

  for (let idx = 0; idx < paginas.length; idx++) {
    const esPrimera = idx === 0
    let y = esPrimera ? Y_INICIO_P1 : Y_INICIO_CONT
    let cuerpo = esPrimera
      ? construirCabeceraHero(clubNombre, tiendaNombre, logo, fecha)
      : construirCabeceraContinuacion(clubNombre, tiendaNombre)

    if (esPrimera) {
      // Posición fija dentro de la franja de la subcabecera (HERO_H a
      // Y_INICIO_P1) — no usa el cursor `y` de las categorías: son dos cosas
      // distintas y compartir la variable fue justo lo que las hizo
      // superponerse la primera vez que se escribió esto.
      const ySubcabecera = HERO_H + 55
      cuerpo += `
        <circle cx="${MARGEN + 8}" cy="${ySubcabecera - 8}" r="8" fill="#c8102e"/>
        <text x="${MARGEN + 24}" y="${ySubcabecera}" fill="#152a52" font-size="26" font-weight="800" font-family="${FUENTE}">${disponibles} producto${disponibles !== 1 ? 's' : ''} disponible${disponibles !== 1 ? 's' : ''}</text>`
    }

    for (const bloque of paginas[idx]) {
      if (bloque.tipo === 'titulo') {
        cuerpo += construirTituloCategoria(bloque.categoria, bloque.cantidad, catLabel, y)
        y += TITULO_CAT_H
      } else {
        bloque.productos.forEach((p, col) => {
          if (!p) return
          const x = MARGEN + col * (OUTER_W + GAP)
          cuerpo += construirTarjeta(p, x, y, fotos, `p${idx}-${Math.round(y)}-${col}`)
        })
        y += PASO_FILA
      }
    }

    const { svg: footerSvg, clicable } = construirFooter(clubNombre, tiendaNombre, wa, idx + 1, paginas.length)
    cuerpo += footerSvg

    const svgCompleto = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" font-family="${FUENTE}">
      <defs>${construirDefs()}</defs>
      <rect width="${W}" height="${H}" fill="#faf8f3"/>
      ${cuerpo}
    </svg>`

    const png = await rasterizar(svgCompleto, W * ESCALA, H * ESCALA)
    if (idx > 0) doc.addPage()
    doc.addImage(png, 'JPEG', 0, 0, 210, 297)
    if (clicable) {
      doc.link(clicable.x * FACTOR_MM, clicable.y * FACTOR_MM, clicable.w * FACTOR_MM, clicable.h * FACTOR_MM, { url: clicable.url })
    }
  }

  doc.save(`${tiendaNombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '_')}.pdf`)
}
