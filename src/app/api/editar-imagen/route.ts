import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fotoFile = formData.get('foto') as File | null
    const layout = formData.get('layout') as string || 'hero'
    const tono = formData.get('tono') as string || 'hype'
    const clubNombre = formData.get('clubNombre') as string || 'Club Paine'
    const titulo = formData.get('titulo') as string || 'TORNEO'
    const subtitulo = formData.get('subtitulo') as string || ''
    const fecha = formData.get('fecha') as string || ''
    const brandContext = formData.get('brandContext') as string || ''

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
    }

    if (!fotoFile) {
      return NextResponse.json({ error: 'Foto requerida' }, { status: 400 })
    }

    const tonoDesc = tono === 'hype'
      ? 'ultra high energy, explosive fire and electricity effects, aggressive competitive energy'
      : tono === 'celebratorio'
      ? 'triumphant celebratory, gold confetti, victorious championship atmosphere'
      : 'professional competitive atmosphere, focused intensity'

    const layoutDesc = layout === 'hero'
      ? 'two athletes facing each other on opposite sides, dramatic split blue/red lighting'
      : layout === 'split'
      ? 'athlete on the right side, bold text panel on the left, diagonal composition'
      : 'full-bleed athlete centered, massive bold title overlay, dramatic backlight halo'

    const prompt = `Transform this photo into a professional sports tournament Instagram poster for a table tennis club.

Keep the person(s) from the original photo but place them in a dramatic sports marketing composition.

DESIGN:
- ${layoutDesc}
- Club badge/emblem at top: "${clubNombre}"
- Main title (large bold condensed white font): "${titulo}"
${subtitulo ? `- Subtitle below title: "${subtitulo}"` : ''}
${fecha ? `- Date badge: "${fecha}"` : ''}
- Dark navy blue background with electric cyan and blue neon accent lighting
- Dramatic radial backlight/spotlight halo behind the athlete
- Motion blur, energy trails, spark particles
- Info panel at bottom with icons (calendar, clock, trophy)
- ${tonoDesc}
- Professional sports marketing quality — like Red Bull, UFC, ESPN
- Square 1:1 format for Instagram
${brandContext ? `\nCLUB BRAND IDENTITY (apply strictly): ${brandContext}` : ''}

All text in Spanish. No watermarks. Photorealistic, cinematic quality.`

    // Convertir File a Blob para FormData
    const arrayBuffer = await fotoFile.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: fotoFile.type || 'image/png' })

    const openAIForm = new FormData()
    openAIForm.append('model', 'gpt-image-1')
    openAIForm.append('prompt', prompt)
    openAIForm.append('image', blob, 'foto.png')
    openAIForm.append('size', '1024x1024')
    openAIForm.append('quality', 'high')
    openAIForm.append('n', '1')

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: openAIForm,
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI error:', err)
      return NextResponse.json({ error: 'Error de OpenAI: ' + err }, { status: response.status })
    }

    const data = await response.json()
    const imageData = data.data?.[0]
    const base64 = imageData?.b64_json
      ? `data:image/png;base64,${imageData.b64_json}`
      : imageData?.url || ''

    return NextResponse.json({ imagen: base64 })
  } catch (error: any) {
    console.error('Error editando imagen:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
