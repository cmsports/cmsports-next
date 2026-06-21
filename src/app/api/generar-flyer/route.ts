import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const { prompt, clubContexto } = await req.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt requerido' }, { status: 400 })
    }

    const contexto = clubContexto || {
      nombre: 'Club Deportivo',
      deporte: 'Deporte',
      colores: ['#4f46e5', '#ffffff'],
    }

    const mensaje = `Eres un diseñador de redes sociales especializado en clubes deportivos.
Genera exactamente 3 variantes de flyer para la siguiente publicación deportiva.

Contexto del club:
- Nombre: ${contexto.nombre}
- Deporte: ${contexto.deporte}
- Colores: ${contexto.colores?.join(', ') || '#4f46e5'}

Prompt del usuario: "${prompt}"

Responde ÚNICAMENTE con un JSON array válido con exactamente 3 objetos. Sin texto adicional. Formato:
[
  {
    "titulo": "texto principal corto e impactante (máx 30 chars)",
    "subtitulo": "texto secundario (máx 60 chars)",
    "descripcion": "texto de cuerpo opcional (máx 80 chars, puede ser vacío)",
    "hashtags": "#hashtag1 #hashtag2 #hashtag3",
    "layout": "hero",
    "colorAcento": "#hexcolor",
    "colorTexto": "#ffffff",
    "tono": "celebratorio"
  }
]

Reglas:
- El layout de cada variante DEBE ser diferente. Usa exactamente: "hero", "split", "minimal" (uno por variante, en ese orden)
- El tono de cada variante debe ser diferente: "celebratorio", "formal", "hype"
- colorAcento debe ser un color hexadecimal vibrante que combine con el deporte
- Los textos deben estar en español, ser concisos y poderosos
- Adapta el contenido al tipo de publicación (torneo, logro, aviso, convocatoria, etc.)`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: mensaje }],
    })

    const texto = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extraer JSON del texto (por si viene con markdown)
    const jsonMatch = texto.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Respuesta inválida de la IA' }, { status: 500 })
    }

    const variantes = JSON.parse(jsonMatch[0])

    return NextResponse.json({ variantes })
  } catch (error: any) {
    console.error('Error generando flyer:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
