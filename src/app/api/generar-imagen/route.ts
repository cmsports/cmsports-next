import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Prompts de fondo visual por layout (sin texto, Canvas lo agrega encima)
const ESTILOS: Record<string, string> = {
  hero: `Professional table tennis tournament sports photography background.
    A male athlete in intense competition pose, mid-action serving or smashing,
    wearing dark sports jersey, dramatic studio lighting with ELECTRIC CYAN and BLUE radial spotlight/backlight halo behind the player,
    dark navy background (#060e1e), neon cyan-blue glow radiating from behind the player like a spotlight,
    cinematic sports photography style, player centered slightly left,
    dark gradient at bottom 40% of image for text overlay area,
    photorealistic, high-end sports marketing quality,
    no text, no watermarks, no logos.`,

  split: `Professional table tennis action sports photography for poster background.
    Dynamic player in full action shot, forehand attack motion with paddle extended,
    dark navy blue background, player positioned on RIGHT side of frame,
    LEFT side of frame is darker with blue atmospheric haze and diagonal speed lines/motion blur effect,
    electric cyan accent lighting from left edge,
    dramatic diagonal composition splitting dark left panel from player right side,
    cinematic wide shot, professional sports event poster quality,
    no text, no watermarks, no logos.`,

  minimal: `Dramatic table tennis athlete full-body action shot for tournament poster.
    Player in explosive forehand smash pose, fully visible from head to toe,
    INTENSE RADIAL BACKLIGHT of electric blue and cyan creating a powerful halo/spotlight effect behind the player,
    deep navy dark background with the bright backlight glow,
    player is the hero of the composition centered in frame,
    top 20% dark for header text, bottom 30% darker for info strip,
    photorealistic cinematic quality like Red Bull or Nike sports marketing,
    no text, no watermarks, no logos.`,
}

export async function POST(req: NextRequest) {
  try {
    const { layout, tono, clubNombre } = await req.json()

    if (!layout) {
      return NextResponse.json({ error: 'Layout requerido' }, { status: 400 })
    }

    const estiloBase = ESTILOS[layout] || ESTILOS.hero
    const tonoExtra = tono === 'hype'
      ? 'Ultra high energy, explosive dynamic pose, aggressive competitive energy.'
      : tono === 'celebratorio'
      ? 'Triumphant celebratory energy, victorious atmosphere, confetti or winning moment.'
      : 'Professional competitive atmosphere, focused intensity.'

    const prompt = `${estiloBase}
    Club sport: table tennis / ping pong.
    Atmosphere: ${tonoExtra}
    Color palette: Deep navy blue, electric cyan, bright white highlights.
    Style reference: Top European sports club marketing, ESPN magazine quality.
    Square 1:1 ratio composition optimized for Instagram post.`

    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
      quality: 'high',
    })

    const imageData = response.data[0]
    const base64 = imageData.b64_json
      ? `data:image/png;base64,${imageData.b64_json}`
      : imageData.url || ''

    return NextResponse.json({ imagen: base64 })
  } catch (error: any) {
    console.error('Error generando imagen:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
