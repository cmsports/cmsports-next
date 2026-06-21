import { NextRequest, NextResponse } from 'next/server'

// 'chatgpt-image-latest' es el mismo snapshot que usa ChatGPT, pero requiere
// verificar la organización en OpenAI. Mientras tanto usamos 'gpt-image-1'.
const MODELO_IMAGEN = 'gpt-image-1'

interface Categoria { nombre: string; precio: string; hora: string }

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar la imagen: ' + url)
  return res.blob()
}

export async function POST(req: NextRequest) {
  try {
    const {
      tipoEvento, nombreEvento, fecha, categorias, premios, notas,
      clubNombre, direccion, telefono, referenciaUrl, fotoUrl, logoUrl,
    }: {
      tipoEvento: string; nombreEvento: string; fecha: string; categorias: Categoria[]
      premios?: string; notas?: string; clubNombre: string; direccion?: string; telefono?: string
      referenciaUrl: string; fotoUrl: string; logoUrl?: string
    } = await req.json()

    if (!nombreEvento) return NextResponse.json({ error: 'Falta el nombre del evento' }, { status: 400 })
    if (!referenciaUrl) return NextResponse.json({ error: 'Selecciona un flyer de referencia' }, { status: 400 })
    if (!fotoUrl) return NextResponse.json({ error: 'Selecciona una foto de la galería' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

    const titulo = `${tipoEvento} ${nombreEvento}`.trim().toUpperCase()
    const subtitulo = (fecha || '').toUpperCase()

    const lineas: string[] = []
    for (const c of categorias || []) {
      if (!c.nombre) continue
      const partes = [c.nombre]
      if (c.precio) partes.push(`Inscripción $${c.precio}`)
      if (c.hora) partes.push(`Inicio ${c.hora}`)
      lineas.push(partes.join(' — '))
    }
    if (premios) lineas.push(`Premios: ${premios}`)
    if (direccion) lineas.push(direccion)
    if (telefono) lineas.push(`Contacto: ${telefono}`)
    if (notas) notas.split('\n').filter(Boolean).forEach(l => lineas.push(l.trim()))

    const [referenciaBlob, fotoBlob, logoBlob] = await Promise.all([
      urlToBlob(referenciaUrl),
      urlToBlob(fotoUrl),
      logoUrl ? urlToBlob(logoUrl) : Promise.resolve(null),
    ])

    const lineasTexto = lineas.map(l => `- ${l}`).join('\n')

    const textoPrompt = `Usa EXACTAMENTE el diseño, layout, tipografía, paleta de colores y composición de la PRIMERA imagen como plantilla de referencia.
Reemplaza a la persona de la primera imagen por la persona de la SEGUNDA imagen, integrándola de forma natural en la misma posición y estilo.
Actualiza los textos del flyer a estos datos del evento (todo en español):
- Título: "${titulo}"
- Subtítulo/fecha: "${subtitulo}"
- Nombre del club: "${clubNombre || ''}"

IMPORTANTE: el panel de información del flyer debe incluir TODAS estas líneas, sin omitir ninguna (amplía o reorganiza el panel de info si es necesario para que entren todas, pero no elimines ningún dato):
${lineasTexto}
${logoBlob ? '\nSe entrega una TERCERA imagen con el logo/escudo oficial del club: colócalo en el mismo lugar y tamaño donde la primera imagen tiene su badge/logo de club, reemplazando ese elemento (no inventes otro logo, usa exactamente el de la tercera imagen).' : ''}

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
