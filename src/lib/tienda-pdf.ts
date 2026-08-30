// PDF de catálogo de una tienda (Tienda del profe / Tienda Buin) — pensado
// para que el profesor lo mande a gente externa: se arma como un catálogo de
// venta con marca del club, no como una planilla de control interno.
//
// ── Por qué no hay una oferta con precio tachado ───────────────────────────
// Se pidió explícitamente un "antes/ahora" falso — un precio más alto
// inventado, tachado, al lado del precio real, para que pareciera que hay un
// descuento que no existe. No se hizo: quien recibe este catálogo puede
// comprar con esa información, y un "antes" que nunca existió es un engaño
// real a esa persona, no un detalle de diseño. En su lugar se usa un
// posicionamiento verdadero — "Precio Asociación" — y una llamada a la acción
// por WhatsApp, que venden sin inventar un descuento.
//
// ── Por qué no hay emoji ────────────────────────────────────────────────
// jsPDF dibuja con Helvetica, que no trae glifos de emoji: salen como
// cuadrados rotos (ya documentado en ranking-pdf.ts). Todo lo que en la
// pantalla es un emoji, acá es una forma o un color.
//
// Las fotos (de producto y el logo del club) se traen y se reducen ANTES de
// dibujar nada: se descargan, se redibujan en un canvas a un tamaño chico
// (manteniendo su proporción real) y quedan listas en memoria. Una foto que
// no carga no frena el catálogo — esa tarjeta sale con un recuadro vacío — y
// si el catálogo entero falla por otra razón, se avisa con un error real en
// vez de no hacer nada.

import { tituloSeccion, colorPorNombre, tinte, type RGB } from '@/lib/pdf/estilo'

export type ProductoTiendaPdf = {
  nombre: string
  descripcion: string | null
  categoria: string
  color: string | null
  stock: number
  precio: number | null
  imagen_url: string | null
}

// Paleta de marca — la misma que ya usan las pantallas /tienda-buin y
// /tienda-profe (fondo azul marino, acento rojo).
const NAVY: RGB       = [21, 42, 74]
const NAVY_OSC: RGB   = [11, 24, 45]
const ROJO: RGB       = [200, 16, 46]
const VERDE: RGB      = [22, 163, 74]
const BLANCO: RGB     = [255, 255, 255]
const MUTED: RGB      = [100, 116, 139]
const TENUE: RGB      = [180, 188, 199]
const BORDE: RGB      = [226, 232, 240]

// Un color por categoría, elegido a mano en vez de derivado por hash: así
// "Gomas" siempre es rojo (el color del caucho) y "Vestimenta" siempre es
// azul, catálogo tras catálogo, en vez de que le toque un color al azar.
const COLOR_CATEGORIA: Record<string, RGB> = {
  maderos: [146, 98, 45],
  gomas: [200, 16, 46],
  pelotas: [217, 119, 6],
  accesorios: [124, 58, 237],
  vestimenta: [21, 42, 74],
  otros: [13, 148, 136],
}
function colorCategoria(categoria: string): RGB {
  return COLOR_CATEGORIA[categoria] ?? colorPorNombre(categoria)
}

const fmt = (n: number) => '$' + n.toLocaleString('es-CL')

type Foto = { data: string; ancho: number; alto: number }

/** Tamaño máximo del lado largo, en píxeles. Una foto de celular pesa varios
 *  MB y a este catálogo le sobra con un tercio de eso — bajarla acá evita un
 *  PDF de 40 MB que tarda un minuto en generarse y no lo abre nadie por
 *  WhatsApp. */
const LADO_MAX_PX = 480

/**
 * Descarga una imagen, la reduce y la deja lista para `doc.addImage`.
 *
 * Devuelve también el ancho y alto ya reducidos: sin eso no hay forma de
 * dibujarla "contain" dentro de su recuadro más adelante, y se terminaría
 * estirando cualquier foto que no fuera cuadrada.
 */
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

/** Coordenadas para dibujar `foto` centrada y completa (nunca recortada)
 *  dentro del cuadro [x, y, lado, lado] — mismo criterio "contain" que usa la
 *  pantalla para las fotos de producto. */
function encajar(foto: Foto, x: number, y: number, lado: number) {
  const escala = Math.min(lado / foto.ancho, lado / foto.alto)
  const w = foto.ancho * escala
  const h = foto.alto * escala
  return { x: x + (lado - w) / 2, y: y + (lado - h) / 2, w, h }
}

/** Logo del club dentro de un círculo blanco — recortado con un `clip`
 *  circular, no con una forma "contain" cuadrada: en una insignia redonda una
 *  foto rectangular sin recortar se ve como una estampilla pegada de más. */
function dibujarLogoCircular(doc: any, foto: Foto, cx: number, cy: number, r: number) {
  doc.setFillColor(...BLANCO)
  doc.circle(cx, cy, r, 'F')
  doc.saveGraphicsState()
  doc.circle(cx, cy, r - 1.2, null)
  doc.clip()
  doc.discardPath()
  // "cover", no "contain": dentro de una insignia un logo recortado a lo
  // ancho se ve mejor que uno chico flotando en el medio con bordes blancos.
  const escala = Math.max((r * 2) / foto.ancho, (r * 2) / foto.alto)
  const w = foto.ancho * escala
  const h = foto.alto * escala
  try { doc.addImage(foto.data, 'JPEG', cx - w / 2, cy - h / 2, w, h) } catch { /* logo ilegible: queda el círculo blanco */ }
  doc.restoreGraphicsState()
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

type Opciones = {
  logoUrl?: string | null
  contactoWhatsapp?: string | null
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

  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  const MARGEN = 14

  // ── Encabezado de marca ───────────────────────────────────────────────
  // Uno propio y no el `encabezado()` genérico del resto de los reportes:
  // esto no es un informe para el club, es una vidriera para quien lo reciba.
  const ALTO_CAB = 40
  const wa = (opciones.contactoWhatsapp ?? '').replace(/\D/g, '')

  function cabecera(continuacion: boolean): number {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, ALTO_CAB, 'F')
    // Cuña más oscura en la esquina — la profundidad que el degradado plano
    // no da con las primitivas básicas de jsPDF.
    doc.setFillColor(...NAVY_OSC)
    doc.triangle(W, 0, W, ALTO_CAB, W - 46, 0, 'F')
    // Resplandor rojo detrás del logo: opacidad real vía GState, no un color
    // sólido — un círculo rojo sólido ahí se vería como un error de recorte.
    doc.saveGraphicsState()
    doc.setGState(new (doc as any).GState({ opacity: 0.35 }))
    doc.setFillColor(...ROJO)
    doc.circle(28, ALTO_CAB / 2, 20, 'F')
    doc.restoreGraphicsState()

    if (logo) dibujarLogoCircular(doc, logo, 28, ALTO_CAB / 2, 13)
    else {
      doc.setFillColor(...BLANCO)
      doc.circle(28, ALTO_CAB / 2, 13, 'F')
      doc.setTextColor(...NAVY)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
      doc.text(iniciales(clubNombre), 28, ALTO_CAB / 2 + 4.5, { align: 'center' })
    }

    const xTexto = 48
    // Eyebrow: "CATÁLOGO OFICIAL" en una píldora roja.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    const eyebrow = continuacion ? 'CATÁLOGO OFICIAL (CONT.)' : 'CATÁLOGO OFICIAL'
    const anchoEyebrow = doc.getTextWidth(eyebrow) + 8
    doc.setFillColor(...ROJO)
    doc.roundedRect(xTexto, 8, anchoEyebrow, 6.5, 3.2, 3.2, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(eyebrow, xTexto + 4, 12.4)

    doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.setTextColor(...BLANCO)
    doc.text((tiendaNombre || clubNombre).toUpperCase(), xTexto, 24, { maxWidth: W - xTexto - 55 })

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.setTextColor(...tinte(BLANCO, 0.75))
    doc.text(clubNombre, xTexto, 31)

    // Fecha, arriba a la derecha — chica, no compite con el título.
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.setTextColor(...tinte(BLANCO, 0.6))
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')}`, W - MARGEN, 10, { align: 'right' })

    // Franja roja al pie de la cabecera: mismo remate que usa el resto de los
    // reportes, pero en el color de acento en vez de un tinte del mismo tono.
    doc.setFillColor(...ROJO)
    doc.rect(0, ALTO_CAB - 2, W, 2, 'F')

    return ALTO_CAB + 10
  }

  let y = cabecera(false)

  // ── Subcabecera: cuántos hay + llamado a WhatsApp ──────────────────────
  const disponibles = productos.filter(p => p.stock > 0).length
  doc.setFillColor(...ROJO)
  doc.circle(MARGEN + 1.3, y - 1.2, 1.3, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(`${disponibles} producto${disponibles !== 1 ? 's' : ''} disponible${disponibles !== 1 ? 's' : ''}`, MARGEN + 6, y)

  if (wa) {
    const texto = 'ESCRÍBENOS POR WHATSAPP →'
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
    const anchoBoton = doc.getTextWidth(texto) + 12
    const xBoton = W - MARGEN - anchoBoton
    doc.setFillColor(...VERDE)
    doc.roundedRect(xBoton, y - 6.5, anchoBoton, 9, 4.5, 4.5, 'F')
    doc.setTextColor(...BLANCO)
    doc.text(texto, xBoton + anchoBoton / 2, y - 0.6, { align: 'center' })
    doc.link(xBoton, y - 6.5, anchoBoton, 9, { url: `https://wa.me/${wa}` })
  }
  y += 12

  // Categorías con productos, en el mismo orden que los filtros de la
  // pantalla; una categoría que no esté en esa lista (dato viejo, o la
  // pantalla cambió) igual aparece, al final y ordenada alfabéticamente, en
  // vez de perderse en silencio.
  const presentes = new Set(productos.map(p => p.categoria))
  const conocidas = categoriasOrden.filter(c => presentes.has(c))
  const desconocidas = [...presentes].filter(c => !categoriasOrden.includes(c)).sort()
  const categorias = [...conocidas, ...desconocidas]

  const COLS = 3
  const GAP = 5
  const ANCHO_TARJETA = (W - 2 * MARGEN - GAP * (COLS - 1)) / COLS
  const LADO_FOTO = ANCHO_TARJETA
  const ALTO_TEXTO = 27
  const ALTO_TARJETA = LADO_FOTO + ALTO_TEXTO

  // Reemplaza a `asegurarEspacio()` del sistema de estilo genérico: acá el
  // salto de página tiene que repetir ESTA cabecera de marca, no la barra
  // simple de los informes.
  function espacioPara(alto: number) {
    const H = doc.internal.pageSize.getHeight()
    const PIE = 16
    if (y + alto <= H - PIE) return
    doc.addPage()
    y = cabecera(true)
  }

  for (const cat of categorias) {
    const deLaCategoria = productos.filter(p => p.categoria === cat)
    const colorCat = colorCategoria(cat)
    espacioPara(24)
    y = tituloSeccion(doc, y, catLabel(cat), `${deLaCategoria.length} producto${deLaCategoria.length !== 1 ? 's' : ''}`, colorCat)

    for (let i = 0; i < deLaCategoria.length; i += COLS) {
      espacioPara(ALTO_TARJETA + GAP)
      for (let k = 0; k < COLS; k++) {
        const p = deLaCategoria[i + k]
        if (!p) continue
        const x = MARGEN + k * (ANCHO_TARJETA + GAP)

        // "Sombra": un rectángulo tenue apenas corrido, detrás de la tarjeta.
        doc.setFillColor(...tinte(NAVY, 0.06))
        doc.roundedRect(x + 0.8, y + 1.2, ANCHO_TARJETA, ALTO_TARJETA, 3, 3, 'F')

        doc.setFillColor(...BLANCO)
        doc.setDrawColor(...BORDE)
        doc.roundedRect(x, y, ANCHO_TARJETA, ALTO_TARJETA, 3, 3, 'FD')

        // Franja de color de categoría, arriba de la tarjeta.
        doc.setFillColor(...colorCat)
        doc.roundedRect(x, y, ANCHO_TARJETA, 2.6, 1.3, 1.3, 'F')
        doc.rect(x, y + 1.3, ANCHO_TARJETA, 1.3, 'F')

        // Foto, con un fondo tintado del color de la categoría.
        doc.setFillColor(...tinte(colorCat, 0.06))
        doc.roundedRect(x + 1.5, y + 4, ANCHO_TARJETA - 3, LADO_FOTO - 5.5, 2, 2, 'F')
        const foto = p.imagen_url ? fotos.get(p.imagen_url) : undefined
        if (foto) {
          const pos = encajar(foto, x + 3, y + 5.5, LADO_FOTO - 8)
          try { doc.addImage(foto.data, 'JPEG', pos.x, pos.y, pos.w, pos.h) } catch { /* sigue sin foto */ }
        }

        if (p.stock > 0) {
          // Píldora verde "Disponible" — un hecho de ahora mismo, no una oferta.
          const txt = 'DISPONIBLE'
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6)
          const aw = doc.getTextWidth(txt) + 5
          doc.setFillColor(...VERDE)
          doc.roundedRect(x + ANCHO_TARJETA - aw - 3, y + 6, aw, 5, 2.5, 2.5, 'F')
          doc.setTextColor(...BLANCO)
          doc.text(txt, x + ANCHO_TARJETA - aw / 2 - 3, y + 9.3, { align: 'center' })
        } else {
          // Sello diagonal "AGOTADO": un velo oscuro sobre la foto y el
          // texto rotado encima, mismo recurso que cualquier tienda online.
          doc.saveGraphicsState()
          doc.setGState(new (doc as any).GState({ opacity: 0.45 }))
          doc.setFillColor(...NAVY_OSC)
          doc.roundedRect(x + 1.5, y + 4, ANCHO_TARJETA - 3, LADO_FOTO - 5.5, 2, 2, 'F')
          doc.restoreGraphicsState()
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
          doc.setTextColor(...BLANCO)
          doc.text('AGOTADO', x + ANCHO_TARJETA / 2, y + LADO_FOTO / 2 + 1.5, { align: 'center', angle: 18 })
        }

        // Nombre — se trunca a dos líneas: una tarjeta de catálogo no es el
        // lugar para la descripción completa, esa vive en la pantalla.
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
        doc.setTextColor(...NAVY)
        const lineasNombre = doc.splitTextToSize(p.nombre, ANCHO_TARJETA - 6).slice(0, 2)
        doc.text(lineasNombre, x + ANCHO_TARJETA / 2, y + LADO_FOTO + 5.5, { align: 'center' })

        const yTexto = y + LADO_FOTO + 5.5 + lineasNombre.length * 3.6
        if (p.color) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
          doc.setTextColor(...MUTED)
          doc.text(p.color, x + ANCHO_TARJETA / 2, yTexto + 2.2, { align: 'center', maxWidth: ANCHO_TARJETA - 6 })
        }

        // Precio, al pie — "Precio Asociación" en vez de un antes/ahora
        // inventado: vende por venir de la Asociación, no por un descuento
        // que no existió.
        const yPie = y + ALTO_TARJETA - 4.5
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5)
        doc.setTextColor(...(p.stock > 0 ? ROJO : TENUE))
        doc.text(p.precio ? fmt(p.precio) : 'Consultar', x + ANCHO_TARJETA / 2, yPie, { align: 'center' })
        if (p.precio) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6)
          doc.setTextColor(...TENUE)
          doc.text('PRECIO ASOCIACIÓN', x + ANCHO_TARJETA / 2, yPie + 3.6, { align: 'center' })
        }
      }
      y += ALTO_TARJETA + GAP
    }
    y += 6
  }

  // ── Pie de página propio, con el mismo llamado a WhatsApp en cada hoja ──
  const H = doc.internal.pageSize.getHeight()
  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...BORDE); doc.setLineWidth(0.2)
    doc.line(MARGEN, H - 14, W - MARGEN, H - 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    doc.setTextColor(...TENUE)
    doc.text(`${clubNombre} · ${tiendaNombre}`, MARGEN, H - 9)
    if (wa) {
      const texto = `WhatsApp: +${wa.replace(/^56/, '56 ')}`
      doc.setTextColor(...VERDE)
      doc.text(texto, W / 2, H - 9, { align: 'center' })
      const anchoLink = doc.getTextWidth(texto)
      doc.link(W / 2 - anchoLink / 2, H - 13, anchoLink, 5, { url: `https://wa.me/${wa}` })
    }
    doc.setTextColor(...TENUE)
    doc.text(`Página ${i} de ${totalPaginas}`, W - MARGEN, H - 9, { align: 'right' })
  }

  doc.save(`${tiendaNombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '_')}.pdf`)
}
