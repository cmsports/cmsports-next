// PDF de catálogo de una tienda (Tienda del profe / Tienda Buin) — pensado
// para que el profesor lo mande a gente externa: se arma como un catálogo de
// venta (tarjetas con foto grande), no como una planilla de control interno.
//
// Las fotos se traen y se reducen ANTES de dibujar nada: autoTable no entra
// acá (una tabla de datos es lo que este catálogo dejó de ser), pero la razón
// de fondo es la misma — no hay await dentro del dibujo. Cada foto se
// descarga, se redibuja en un canvas a un tamaño chico (manteniendo su
// proporción real, así no sale estirada) y se guarda ya lista. Una foto que
// no carga no frena el catálogo: esa tarjeta sale con un recuadro vacío, no
// se cae el PDF entero — y si el catálogo entero falla por otra razón, se
// avisa con un error real en vez de no hacer nada.

import { encabezado, piePagina, filaTarjetas, tituloSeccion, asegurarEspacio, COLOR } from '@/lib/pdf/estilo'

export type ProductoTiendaPdf = {
  nombre: string
  descripcion: string | null
  categoria: string
  color: string | null
  stock: number
  precio: number | null
  imagen_url: string | null
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
 * estirando cualquier foto que no fuera cuadrada — que es exactamente lo que
 * se veía mal en la versión anterior.
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
 *  dentro del cuadro [x, y, lado, lado] — el mismo criterio de "contain" que
 *  usa la pantalla para las fotos de producto. */
function encajar(foto: Foto, x: number, y: number, lado: number) {
  const escala = Math.min(lado / foto.ancho, lado / foto.alto)
  const w = foto.ancho * escala
  const h = foto.alto * escala
  return { x: x + (lado - w) / 2, y: y + (lado - h) / 2, w, h }
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
) {
  if (productos.length === 0) throw new Error('No hay productos para exportar.')

  const { default: jsPDF } = await import('jspdf')

  const fotos = new Map<string, Foto>()
  await Promise.all(
    productos
      .filter((p): p is ProductoTiendaPdf & { imagen_url: string } => !!p.imagen_url)
      .map(async p => {
        const foto = await imagenAFotoReducida(p.imagen_url)
        if (foto) fotos.set(p.imagen_url, foto)
      }),
  )

  const doc = new jsPDF()
  const cab = { club: clubNombre, titulo: tiendaNombre, subtitulo: `Generado el ${new Date().toLocaleDateString('es-CL')}` }
  let y = encabezado(doc, cab)

  const disponibles = productos.filter(p => p.stock > 0)
  const agotados = productos.length - disponibles.length
  const valorInventario = productos.reduce((s, p) => s + (p.precio ?? 0) * p.stock, 0)

  y = filaTarjetas(doc, y, [
    { valor: String(productos.length), etiqueta: 'Productos en catálogo' },
    { valor: String(disponibles.length), etiqueta: 'Con stock disponible', color: COLOR.verde },
    { valor: String(agotados), etiqueta: 'Agotados', color: agotados > 0 ? COLOR.rojo : COLOR.mutado },
    { valor: fmt(valorInventario), etiqueta: 'Valor del inventario', color: COLOR.primario },
  ])

  // Categorías con productos, en el mismo orden que los filtros de la
  // pantalla; una categoría que no esté en esa lista (dato viejo, o la
  // pantalla cambió) igual aparece, al final y ordenada alfabéticamente, en
  // vez de perderse en silencio.
  const presentes = new Set(productos.map(p => p.categoria))
  const conocidas = categoriasOrden.filter(c => presentes.has(c))
  const desconocidas = [...presentes].filter(c => !categoriasOrden.includes(c)).sort()
  const categorias = [...conocidas, ...desconocidas]

  const W = doc.internal.pageSize.getWidth()
  const MARGEN = 14
  const COLS = 3
  const GAP = 5
  const ANCHO_TARJETA = (W - 2 * MARGEN - GAP * (COLS - 1)) / COLS
  const LADO_FOTO = ANCHO_TARJETA
  const ALTO_TEXTO = 24
  const ALTO_TARJETA = LADO_FOTO + ALTO_TEXTO

  for (const cat of categorias) {
    const deLaCategoria = productos.filter(p => p.categoria === cat)
    y = asegurarEspacio(doc, y, 24, cab)
    y = tituloSeccion(doc, y, catLabel(cat), `${deLaCategoria.length} producto${deLaCategoria.length !== 1 ? 's' : ''}`)

    for (let i = 0; i < deLaCategoria.length; i += COLS) {
      y = asegurarEspacio(doc, y, ALTO_TARJETA + GAP, cab)
      for (let k = 0; k < COLS; k++) {
        const p = deLaCategoria[i + k]
        if (!p) continue
        const x = MARGEN + k * (ANCHO_TARJETA + GAP)

        doc.setFillColor(...COLOR.blanco)
        doc.setDrawColor(...COLOR.borde)
        doc.roundedRect(x, y, ANCHO_TARJETA, ALTO_TARJETA, 2.5, 2.5, 'FD')

        // Foto — o un recuadro vacío si no hay o no cargó.
        doc.setFillColor(...COLOR.fondoSuave)
        doc.roundedRect(x, y, ANCHO_TARJETA, LADO_FOTO, 2.5, 2.5, 'F')
        const foto = p.imagen_url ? fotos.get(p.imagen_url) : undefined
        if (foto) {
          const pos = encajar(foto, x + 2, y + 2, LADO_FOTO - 4)
          try {
            doc.addImage(foto.data, 'JPEG', pos.x, pos.y, pos.w, pos.h)
          } catch {
            // Formato que jsPDF no reconoce: la tarjeta sigue completa, sin foto.
          }
        }

        // Nombre — se trunca a dos líneas: una tarjeta de catálogo no es el
        // lugar para la descripción completa, esa vive en la pantalla.
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
        doc.setTextColor(...COLOR.texto)
        const lineasNombre = doc.splitTextToSize(p.nombre, ANCHO_TARJETA - 6).slice(0, 2)
        doc.text(lineasNombre, x + ANCHO_TARJETA / 2, y + LADO_FOTO + 6, { align: 'center' })

        // Color, si aplica — chico y gris, debajo del nombre.
        let yTexto = y + LADO_FOTO + 6 + lineasNombre.length * 3.6
        if (p.color) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
          doc.setTextColor(...COLOR.mutado)
          doc.text(p.color, x + ANCHO_TARJETA / 2, yTexto + 2.5, { align: 'center', maxWidth: ANCHO_TARJETA - 6 })
          yTexto += 4
        }

        // Precio y stock, al pie de la tarjeta — lo primero que alguien de
        // afuera necesita ver para decidir si le interesa.
        const yPie = y + ALTO_TARJETA - 4
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
        doc.setTextColor(...(p.stock > 0 ? COLOR.primario : COLOR.tenue))
        doc.text(p.precio ? fmt(p.precio) : '—', x + 4, yPie)

        doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
        doc.setTextColor(...(p.stock > 0 ? COLOR.verde : COLOR.rojo))
        doc.text(p.stock > 0 ? `${p.stock} disp.` : 'Agotado', x + ANCHO_TARJETA - 4, yPie, { align: 'right' })
      }
      y += ALTO_TARJETA + GAP
    }
    y += 6
  }

  piePagina(doc, `${clubNombre} · ${tiendaNombre}`)
  doc.save(`${tiendaNombre.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '_')}.pdf`)
}
