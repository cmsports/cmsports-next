// PDF de catálogo de una tienda (Tienda del profe / Tienda Buin) — pensado
// para que el profesor lo mande a gente externa: foto, stock y precio de
// cada producto, agrupado por categoría, con un resumen del inventario arriba.
//
// Las fotos se traen desde el bucket público ANTES de dibujar la tabla:
// autoTable no permite awaits dentro de `didDrawCell`, así que primero se
// resuelven todas en paralelo (cada una con su propio tope de tiempo) y se
// dibujan con lo que haya llegado. Una foto que no carga no frena el
// reporte — esa fila sale con un recuadro vacío, no se cae el PDF entero.

import { encabezado, piePagina, filaTarjetas, tituloSeccion, estiloTabla, trasTabla, asegurarEspacio, COLOR } from '@/lib/pdf/estilo'

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

type Foto = { data: string; formato: 'JPEG' | 'PNG' }

/** Descarga una imagen y la pasa a base64. Se rinde a los 5s: una foto lenta
 *  o rota no puede trabar el resto del reporte. */
async function imagenABase64(url: string): Promise<Foto | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return null
    const blob = await res.blob()
    const formato: Foto['formato'] = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
      reader.readAsDataURL(blob)
    })
    return { data, formato }
  } catch {
    return null
  }
}

/**
 * Genera y descarga el catálogo. `categoriasOrden` es el orden en que la
 * propia pantalla muestra los filtros (Maderos, Gomas, ...) — así el PDF
 * agrupa igual que la pantalla en vez de caer en el orden alfabético en que
 * vienen de la base. `catLabel` traduce la clave interna ('maderos') al
 * nombre que ve la gente ('Maderos').
 */
export async function exportarTiendaPdf(
  clubNombre: string,
  tiendaNombre: string,
  productos: ProductoTiendaPdf[],
  categoriasOrden: string[],
  catLabel: (categoria: string) => string,
) {
  if (productos.length === 0) return

  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const fotos = new Map<string, Foto>()
  await Promise.all(
    productos
      .filter((p): p is ProductoTiendaPdf & { imagen_url: string } => !!p.imagen_url)
      .map(async p => {
        const foto = await imagenABase64(p.imagen_url)
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

  for (const cat of categorias) {
    const deLaCategoria = productos.filter(p => p.categoria === cat)
    y = asegurarEspacio(doc, y, 24, cab)
    y = tituloSeccion(doc, y, catLabel(cat), `${deLaCategoria.length} producto${deLaCategoria.length !== 1 ? 's' : ''}`)

    autoTable(doc, {
      startY: y,
      head: [['', 'Producto', 'Detalle', 'Color', 'Stock', 'Precio']],
      body: deLaCategoria.map(p => [
        '',
        p.nombre,
        p.descripcion || '—',
        p.color || '—',
        p.stock === 0 ? 'Agotado' : String(p.stock),
        p.precio ? fmt(p.precio) : '—',
      ]),
      ...estiloTabla(),
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 32, fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 24 },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: data => {
        if (data.section !== 'body') return
        if (data.column.index === 0) data.cell.styles.minCellHeight = 18
        if (data.column.index === 2) data.cell.styles.textColor = COLOR.mutado
        if (data.column.index === 4 && data.cell.raw === 'Agotado') data.cell.styles.textColor = COLOR.rojo
        if (data.column.index === 4 && data.cell.raw !== 'Agotado') data.cell.styles.textColor = COLOR.verde
      },
      didDrawCell: data => {
        if (data.section !== 'body' || data.column.index !== 0) return
        const producto = deLaCategoria[data.row.index]
        const foto = producto.imagen_url ? fotos.get(producto.imagen_url) : undefined
        const cx = data.cell.x + data.cell.width / 2
        const cy = data.cell.y + data.cell.height / 2
        const lado = Math.min(data.cell.width, data.cell.height) - 4
        if (foto) {
          try {
            doc.addImage(foto.data, foto.formato, cx - lado / 2, cy - lado / 2, lado, lado)
          } catch {
            // Imagen corrupta o en un formato que jsPDF no reconoce: la fila
            // sigue completa, solo queda sin foto.
          }
        } else {
          doc.setDrawColor(...COLOR.borde)
          doc.setFillColor(...COLOR.fondoSuave)
          doc.roundedRect(cx - lado / 2, cy - lado / 2, lado, lado, 1.5, 1.5, 'FD')
        }
      },
    })

    y = trasTabla(doc)
  }

  piePagina(doc, `${clubNombre} · ${tiendaNombre}`)
  doc.save(`${tiendaNombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_')}.pdf`)
}
