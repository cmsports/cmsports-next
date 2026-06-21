import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { layout, tono, clubNombre, titulo, subtitulo, fecha } = await req.json()

    if (!layout) {
      return NextResponse.json({ error: 'Layout requerido' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
    }

    const club = clubNombre || 'Club de Tenis de Mesa'
    const titleText = titulo || 'TORNEO'
    const subtitleText = subtitulo || ''
    const fechaText = fecha || ''

    const tonoExtra = tono === 'hype'
      ? 'Ultra aggressive energy, fire and electric sparks, explosive action, neon glitch effects'
      : tono === 'celebratorio'
      ? 'Gold and confetti, triumphant mood, championship glory, radiant warm light'
      : 'Professional, sharp, focused, competitive tension'

    // 3 prompts muy distintos en composición
    const prompts: Record<string, string> = {
      hero: `Create a FULL professional sports tournament Instagram poster (1:1 square). This must look like a top-tier ESPN or Red Bull sports event graphic — not a template, but a designed poster.

COMPOSITION: TWO table tennis players in explosive action, one on each side of the image, facing center in dramatic attack poses, paddles extended. Between them in the center, bold tournament title text.
TITLE TEXT visible in the image: "${titleText}" — massive white bold condensed font with metallic or glowing effect, centered.
${subtitleText ? `SUBTITLE TEXT: "${subtitleText}" — smaller, below title, cyan color.` : ''}
${fechaText ? `DATE BADGE: "${fechaText}" — inside a dark rounded pill/badge element.` : ''}
CLUB BADGE: "${club}" as a badge/emblem at the top center with a small table tennis paddle icon.
INFO PANEL: A semi-transparent dark panel in the lower third showing the event info in organized layout with small icons (calendar, clock, location pin, trophy).

VISUAL STYLE:
- Dark background split: electric BLUE on left side, deep RED on right side, blending in the center with dramatic light rays
- Photorealistic athletes, dynamic motion blur
- Neon glow accents, particle effects, speed lines
- Premium sports marketing quality — like UFC Fight Night or FIFA World Cup posters
- ${tonoExtra}

All text must be in Spanish. Square 1080x1080px format. No watermarks.`,

      split: `Create a FULL professional sports event Instagram poster (1:1 square). Style: premium Latin American sports club marketing.

COMPOSITION: Single powerful table tennis player in full-body explosive forehand smash, positioned center-right. LEFT SIDE: dark panel with all text information. TOP: club logo/badge area.
MAIN TITLE in image: "${titleText}" — huge white Impact/Barlow Condensed font, bold, on the left dark panel, multiple lines if needed.
${subtitleText ? `SUBTITLE: "${subtitleText}" — cyan colored text below title.` : ''}
${fechaText ? `DATE: "${fechaText}" — cyan pill badge.` : ''}
CLUB NAME: "${club}" — top left corner, small elegant text with underline.

VISUAL DETAILS:
- Deep navy blue/black background
- Dramatic cyan and blue spotlight lighting on the player
- Motion blur and speed trails behind the paddle
- Left panel: subtle tech/grid texture, vertical cyan accent bar on far left
- Small geometric design elements (hexagons, diagonal lines)
- Bottom: hashtags in small cyan text
- ${tonoExtra}
- Professional, cinematic — like a boxing match promotion poster

All text in Spanish. 1:1 square. No watermarks.`,

      minimal: `Create a FULL stunning sports tournament poster for Instagram (1:1 square). Must look like a viral social media graphic — high contrast, bold, impossible to scroll past.

COMPOSITION: Full-bleed table tennis player in DRAMATIC low-angle shot, arms extended mid-smash, ball visible in air. Player occupies most of the frame. Text overlaid.
TOP: "${club}" club name small at top center with decorative line.
CENTER-BOTTOM TITLE: "${titleText}" — MASSIVE white condensed font (largest element in design), bold, with subtle drop shadow or outline glow.
${subtitleText ? `Below title: "${subtitleText}" — inside a bright cyan rounded badge.` : ''}
${fechaText ? `Date line: "${fechaText}" — white text, smaller.` : ''}
BOTTOM: decorative horizontal cyan line, hashtags.

VISUAL STYLE:
- Ultra dramatic backlight: intense cyan/electric blue radial glow BEHIND the player like a god ray
- Dark vignette edges making the center pop
- High contrast, cinematic color grading
- Player silhouette partially glowing from backlight
- Feels like a Red Bull athlete campaign or Nike sport ad
- ${tonoExtra}

All text in Spanish. Square 1:1. Photorealistic. No watermarks.`,
    }

    const prompt = prompts[layout] || prompts.hero

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        quality: 'high',
        n: 1,
      }),
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
    console.error('Error generando imagen:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
