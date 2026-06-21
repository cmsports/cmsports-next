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

    const mensaje = `Eres el diseñador de redes sociales de un club deportivo de tenis de mesa.
Tu estilo es como el de los mejores clubes deportivos chilenos: flyers energéticos, bold, con copy impactante estilo ESPN o deportes de alto rendimiento.

Contexto del club:
- Nombre: ${contexto.nombre}
- Deporte: ${contexto.deporte}

Prompt del usuario: "${prompt}"

Genera exactamente 3 variantes. Responde ÚNICAMENTE con un JSON array válido. Sin texto adicional:
[
  {
    "titulo": "2-4 palabras MUY impactantes en mayúsculas (ej: GRAN TORNEO USB, CAMPEONES 2026, ES TU MOMENTO)",
    "subtitulo": "info clave: fecha, hora, lugar o eslogan (máx 50 chars)",
    "descripcion": "detalle adicional opcional, máx 70 chars, puede ser vacío",
    "fecha": "fecha o info destacada si la hay (ej: SABADO 21 DE MAYO, INSCRIPCION $1.500), sino vacío",
    "hashtags": "#hashtag1 #hashtag2 #hashtag3",
    "layout": "hero",
    "colorAcento": "#hexcolor",
    "colorTexto": "#ffffff",
    "tono": "celebratorio"
  }
]

Reglas estrictas:
- layouts en ESTE ORDEN exacto: "hero", "split", "minimal"
- tonos diferentes: "celebratorio", "formal", "hype"
- colorAcento: azul/cyan vibrante preferido (#1d4ed8, #06b6d4, #0ea5e9, #2563eb, #22d3ee). Varía entre las 3 variantes.
- CERO emojis en cualquier campo — van a canvas y se rompen
- titulo: máximo 4 palabras, impacto máximo, estilo poster deportivo
- Si el prompt menciona fecha/hora/precio, ponlo en el campo "fecha"
- Copy en español chileno, energético, directo`

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
