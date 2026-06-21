import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const imagenFile = formData.get('imagen') as File | null

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
    if (!imagenFile) return NextResponse.json({ error: 'Imagen requerida' }, { status: 400 })

    const arrayBuffer = await imagenFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imagenFile.type || 'image/jpeg'

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: 'text',
                text: `Analyze this sports club social media graphic design and extract its complete visual brand identity. Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "colores": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "colorFondo": "#hex",
  "colorPrincipal": "#hex",
  "colorAcento": "#hex",
  "mood": "one of: cinematic | bold | elegant | hype | minimal | professional",
  "estilo": "2-3 sentence description of the overall design style and visual approach",
  "tipografia": "describe font style: weight, condensed/expanded, case usage, hierarchy",
  "efectos": "describe visual effects: overlays, gradients, lighting, particle effects, glows",
  "composicion": "describe layout composition: where text sits, where athlete/image sits, badge placement",
  "prompt_addition": "A detailed English paragraph (60-80 words) describing this exact visual style to inject into an AI image generation prompt. Include: color palette, lighting style, typography style, compositional approach, mood, and any signature visual techniques. Be very specific and descriptive."
}

Extract the actual dominant hex colors precisely from the image. Be accurate.`,
              },
            ],
          },
        ],
        max_tokens: 1200,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI error:', err)
      return NextResponse.json({ error: 'Error de OpenAI: ' + err }, { status: response.status })
    }

    const data = await response.json()
    const content: string = data.choices?.[0]?.message?.content || ''

    // Extract JSON from response (handle markdown code blocks too)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'No se pudo extraer el análisis de la imagen' }, { status: 500 })
    }

    const brandData = JSON.parse(jsonMatch[0])
    return NextResponse.json({ brand: brandData })

  } catch (error: any) {
    console.error('Error analizando marca:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
