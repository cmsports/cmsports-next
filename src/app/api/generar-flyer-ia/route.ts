import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 'chatgpt-image-latest' es el mismo snapshot que usa ChatGPT, pero requiere
// verificar la organización en OpenAI. Mientras tanto usamos 'gpt-image-1'.
const MODELO_IMAGEN = 'gpt-image-1'

async function generarCopy(prompt: string, clubNombre: string) {
  const mensaje = `Eres el diseñador de redes sociales de un club deportivo de tenis de mesa.
Club: ${clubNombre}
Prompt del usuario: "${prompt}"

Tu tarea es ORGANIZAR la información del prompt para un flyer, SIN OMITIR NINGÚN DATO
(teléfonos, direcciones, precios, horarios, categorías, redes sociales, streaming, etc.
todo debe quedar incluido en alguna línea).

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con esta forma:
{
  "titulo": "2-4 palabras MUY impactantes en mayúsculas (ej: GRAN TORNEO USB, CAMPEONES 2026)",
  "subtitulo": "fecha o eslogan corto (máx 50 chars)",
  "lineas": ["cada línea de información concreta del evento, una por dato: categoría+precio+hora, dirección, teléfono de contacto, streaming/redes, etc. — no inventes datos que no estén en el prompt, y no omitas ninguno de los que sí estén"],
  "hashtags": "#hashtag1 #hashtag2 #hashtag3"
}

Reglas: CERO emojis. Copy en español chileno, energético, directo. Las líneas deben ser cortas (máx 60 chars cada una) para que entren en un panel de info del flyer.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 768,
    messages: [{ role: 'user', content: mensaje }],
  })
  const texto = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = texto.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Respuesta inválida de la IA al redactar el copy')
  return JSON.parse(jsonMatch[0])
}

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar la imagen: ' + url)
  return res.blob()
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, clubNombre, referenciaUrl, fotoUrl, logoUrl } = await req.json()

    if (!prompt) return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 })
    if (!referenciaUrl) return NextResponse.json({ error: 'Selecciona un flyer de referencia' }, { status: 400 })
    if (!fotoUrl) return NextResponse.json({ error: 'Selecciona una foto de la galería' }, { status: 400 })

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

    const copy = await generarCopy(prompt, clubNombre || 'Club Deportivo')

    const [referenciaBlob, fotoBlob, logoBlob] = await Promise.all([
      urlToBlob(referenciaUrl),
      urlToBlob(fotoUrl),
      logoUrl ? urlToBlob(logoUrl) : Promise.resolve(null),
    ])

    const lineasTexto = (copy.lineas || []).map((l: string) => `- ${l}`).join('\n')

    const textoPrompt = `Usa EXACTAMENTE el diseño, layout, tipografía, paleta de colores y composición de la PRIMERA imagen como plantilla de referencia.
Reemplaza a la persona de la primera imagen por la persona de la SEGUNDA imagen, integrándola de forma natural en la misma posición y estilo.
Actualiza los textos del flyer a estos datos del evento (todo en español):
- Título: "${copy.titulo}"
- Subtítulo: "${copy.subtitulo || ''}"
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

    return NextResponse.json({ imagen, copy })
  } catch (error: any) {
    console.error('Error generando flyer IA:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
