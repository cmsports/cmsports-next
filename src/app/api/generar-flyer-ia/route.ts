import { NextRequest, NextResponse } from 'next/server'

// Mismo snapshot de imagen que usa ChatGPT (requiere organización verificada en OpenAI).
const MODELO_IMAGEN = 'chatgpt-image-latest'

interface Categoria { nombre: string; precio: string; hora: string }
interface Premio { lugar: string; monto: string }

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar la imagen: ' + url)
  return res.blob()
}

function formatMoney(raw: string) {
  const num = Number(String(raw || '').replace(/\D/g, ''))
  return num ? `$${num.toLocaleString('es-CL')}` : ''
}

function formatHora(time24: string) {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const sufijo = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`
}

function formatFecha(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const {
      tipoEvento, nombreEvento, fecha, categorias, premios, notas,
      clubNombre, direccion, telefono, referenciaUrl, fotoUrl, logoUrl,
    }: {
      tipoEvento: string; nombreEvento: string; fecha: string; categorias: Categoria[]
      premios?: Premio[]; notas?: string; clubNombre: string; direccion?: string; telefono?: string
      referenciaUrl: string; fotoUrl: string; logoUrl?: string
    } = await req.json()

    if (!nombreEvento) return NextResponse.json({ error: 'Falta el nombre del evento' }, { status: 400 })
    if (!referenciaUrl) return NextResponse.json({ error: 'Selecciona un flyer de referencia' }, { status: 400 })
    if (!fotoUrl) return NextResponse.json({ error: 'Selecciona una foto de la galería' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

    const titulo = `${tipoEvento} ${nombreEvento}`.trim().toUpperCase()
    const subtitulo = formatFecha(fecha)

    const lineasCategorias: string[] = []
    for (const c of categorias || []) {
      if (!c.nombre) continue
      const partes = [c.nombre]
      const precioFmt = formatMoney(c.precio)
      const horaFmt = formatHora(c.hora)
      if (precioFmt) partes.push(`Inscripción ${precioFmt}`)
      if (horaFmt) partes.push(`Inicio ${horaFmt}`)
      lineasCategorias.push(partes.join(' — '))
    }

    const lineasPremios: string[] = []
    for (const p of premios || []) {
      const montoFmt = formatMoney(p.monto)
      if (p.lugar && montoFmt) lineasPremios.push(`${p.lugar}: ${montoFmt}`)
    }

    const lineasContacto: string[] = []
    if (direccion) lineasContacto.push(direccion)
    if (telefono) lineasContacto.push(`Contacto: ${telefono}`)

    const lineasExtra: string[] = []
    if (notas) notas.split('\n').filter(Boolean).forEach(l => lineasExtra.push(l.trim()))

    const [referenciaBlob, fotoBlob, logoBlob] = await Promise.all([
      urlToBlob(referenciaUrl),
      urlToBlob(fotoUrl),
      logoUrl ? urlToBlob(logoUrl) : Promise.resolve(null),
    ])

    const bloque = (titulo: string, lineas: string[]) => lineas.length ? `\n${titulo}:\n${lineas.map(l => `- ${l}`).join('\n')}` : ''

    const textoPrompt = `La PRIMERA imagen es SOLO un molde de diseño: usa de ella EXCLUSIVAMENTE el layout, la tipografía, la paleta de colores, la composición y la posición de los elementos. Ignora y descarta por completo cualquier texto, título, nombre de club, badge o logo que aparezca escrito en la primera imagen — son de OTRO club y NO deben aparecer en el resultado final, ni siquiera parcialmente. El resultado final debe tener el 100% del texto y branding nuevo, según los datos de abajo.
Reemplaza a la persona de la primera imagen por la persona de la SEGUNDA imagen, integrándola de forma natural en la misma posición y estilo.
Estos son los ÚNICOS textos y datos que debe mostrar el flyer (todo en español):
- Título: "${titulo}"
- Subtítulo/fecha: "${subtitulo}"
- Nombre del club: "${clubNombre || ''}"

REGLA CRÍTICA: reproduce cada línea de texto EXACTAMENTE como está escrita aquí, carácter por carácter (números, signos $, puntos y dos puntos incluidos). No agregues, quites ni cambies dígitos. No inventes información para rellenar espacios vacíos del diseño, y no copies ningún texto, dato o número que estuviera en la imagen de referencia original. Los bloques de abajo son independientes entre sí — el bloque de PREMIOS va en su propia sección, NO se repite ni se mezcla dentro de las filas de CATEGORÍAS.
${bloque('CATEGORÍAS (una fila por categoría)', lineasCategorias)}
${bloque('PREMIOS (sección separada, no por categoría)', lineasPremios)}
${bloque('CONTACTO Y UBICACIÓN', lineasContacto)}
${bloque('INFORMACIÓN ADICIONAL', lineasExtra)}
${logoBlob
  ? '\nSe entrega una TERCERA imagen con el logo/escudo oficial del club: colócalo en el mismo lugar y tamaño donde la primera imagen tiene su badge/logo de club, reemplazando ese elemento por completo (no dejes el logo original de la referencia, no inventes otro logo, usa exactamente el de la tercera imagen).'
  : '\nNo se entregó logo del club: NO incluyas ningún logo, escudo o badge de club en el resultado (ni el original de la referencia ni uno inventado) — deja esa zona del diseño vacía o solo con el nombre del club en texto.'}

REGLA DE ENCUADRE (muy importante): TODO el contenido — la foto de la persona, el título, y cada fila de texto de los bloques anteriores — debe quedar COMPLETAMENTE dentro del lienzo cuadrado, con un margen de seguridad de al menos 4% en los cuatro bordes. Ninguna fila de texto puede quedar cortada, recortada o fuera de cuadro en el borde inferior. Si hay mucha información, reduce el tamaño de letra o compacta el espaciado entre líneas para que todo entre completo — nunca sacrifiques que algo se corte.

Mantén el mismo formato cuadrado 1:1 para Instagram. No agregues marcas de agua.`

    const openAIForm = new FormData()
    openAIForm.append('model', MODELO_IMAGEN)
    openAIForm.append('prompt', textoPrompt)
    openAIForm.append('image[]', referenciaBlob, 'referencia.png')
    openAIForm.append('image[]', fotoBlob, 'foto.png')
    if (logoBlob) openAIForm.append('image[]', logoBlob, 'logo.png')
    openAIForm.append('size', '1024x1024')
    openAIForm.append('quality', 'high')
    openAIForm.append('n', '1')

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openAIForm,
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Error de OpenAI:', err)
      return NextResponse.json({ error: 'Error de OpenAI: ' + err }, { status: response.status })
    }

    const data = await response.json()
    const imageData = data.data?.[0]
    const imagen = imageData?.b64_json
      ? `data:image/png;base64,${imageData.b64_json}`
      : imageData?.url || ''

    return NextResponse.json({ imagen })
  } catch (error: any) {
    console.error('Error generando flyer IA:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
