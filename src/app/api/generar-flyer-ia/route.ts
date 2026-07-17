import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  downloadImage,
  FlyerRequestError,
  parseFlyerPayload,
  readLimitedJson,
  reserveFlyerGeneration,
  validateStorageImageUrl,
} from '@/lib/security/flyer'

// Mismo snapshot de imagen que usa ChatGPT (requiere organización verificada en OpenAI).
const MODELO_IMAGEN = 'chatgpt-image-latest'

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
  let releaseQuota: (() => void) | undefined
  try {
    // Solo staff autenticado puede generar flyers (cada imagen cuesta dinero)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { data: perfil } = await supabase.from('perfiles').select('rol,club_id').eq('id', user.id).single()
    if (!perfil?.club_id || !['admin', 'profesor', 'superadmin'].includes(perfil.rol ?? '')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const body = parseFlyerPayload(await readLimitedJson(req))
    const {
      tipoEvento, nombreEvento, fecha, categorias, premios, notas, instrucciones,
      clubNombre, direccion, telefono, referenciaUrl, fotoUrl, logoUrl,
    } = body

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

    const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!storageBase) throw new FlyerRequestError('Storage no configurado', 500)
    const referenciaSegura = validateStorageImageUrl(referenciaUrl, 'flyer-referencias', perfil.club_id, storageBase)
    const fotoSegura = validateStorageImageUrl(fotoUrl, 'galeria-fotos', perfil.club_id, storageBase)
    const logoSeguro = logoUrl
      ? validateStorageImageUrl(logoUrl, 'flyer-referencias', perfil.club_id, storageBase)
      : ''

    const [referenciaDb, fotoDb, clubDb] = await Promise.all([
      supabase.from('flyer_referencias').select('id').eq('club_id', perfil.club_id).eq('url', referenciaUrl).maybeSingle(),
      supabase.from('fotos_galeria').select('id').eq('club_id', perfil.club_id).eq('url', fotoUrl).maybeSingle(),
      supabase.from('clubes').select('nombre,logo_url').eq('id', perfil.club_id).maybeSingle(),
    ])
    if (referenciaDb.error || !referenciaDb.data) throw new FlyerRequestError('Referencia no permitida')
    if (fotoDb.error || !fotoDb.data) throw new FlyerRequestError('Foto no permitida')
    if (clubDb.error || !clubDb.data) throw new FlyerRequestError('Club no encontrado')
    if (logoUrl && clubDb.data.logo_url !== logoUrl) throw new FlyerRequestError('Logo no permitido')

    releaseQuota = reserveFlyerGeneration(user.id)
    const quotaResult = await (supabase as unknown as {
      rpc: (name: string) => Promise<{ error: { code?: string; message: string } | null }>
    }).rpc('consumir_cuota_flyer_ia')
    // Permite desplegar el código antes de la migración; mientras tanto se
    // mantiene el límite local. Cualquier otro fallo de base detiene el gasto.
    if (quotaResult.error && quotaResult.error.code !== 'PGRST202') {
      if (quotaResult.error.message.includes('Límite')) {
        throw new FlyerRequestError('Alcanzaste el límite de generación de flyers', 429)
      }
      throw new FlyerRequestError('No se pudo verificar la cuota de generación', 503)
    }

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
      downloadImage(referenciaSegura),
      downloadImage(fotoSegura),
      logoSeguro ? downloadImage(logoSeguro) : Promise.resolve(null),
    ])

    const bloque = (titulo: string, lineas: string[]) => lineas.length ? `\n${titulo}:\n${lineas.map(l => `- ${l}`).join('\n')}` : ''

    const instruccionesBloque = instrucciones?.trim()
      ? `INSTRUCCIÓN PRIORITARIA DEL USUARIO (síguela por encima de cualquier otra indicación de diseño de este prompt, salvo que contradiga los textos exactos pedidos abajo): ${instrucciones.trim()}\n\n`
      : ''

    const textoPrompt = `URGENTE — NO REPITAS NINGUNA FRASE NI PALABRA: cada texto, título, frase o dato pedido abajo debe aparecer UNA SOLA VEZ en todo el flyer. Nunca dupliques el título, una categoría, un monto, el nombre del club o cualquier línea de texto en dos lugares distintos del diseño. Sé ordenado y meticuloso: organiza cada bloque de información en su propio espacio, alineado y prolijo, sin amontonar ni superponer textos.

${instruccionesBloque}La PRIMERA imagen es SOLO un molde de diseño: usa de ella EXCLUSIVAMENTE el layout, la tipografía, la paleta de colores, la composición y la posición de los elementos. Ignora y descarta por completo cualquier texto, título, nombre de club, badge o logo que aparezca escrito en la primera imagen — son de OTRO club y NO deben aparecer en el resultado final, ni siquiera parcialmente. El resultado final debe tener el 100% del texto y branding nuevo, según los datos de abajo.
Reemplaza a la persona de la primera imagen por la persona de la SEGUNDA imagen, integrándola de forma natural en la misma posición y estilo.
Estos son los ÚNICOS textos y datos que debe mostrar el flyer (todo en español):
- Título: "${titulo}"
- Subtítulo/fecha: "${subtitulo}"
- Nombre del club: "${clubDb.data.nombre || clubNombre || ''}"

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
      console.error('Error de OpenAI:', response.status, err.slice(0, 500))
      return NextResponse.json({ error: 'No fue posible generar el flyer' }, { status: 502 })
    }

    const data = await response.json()
    const imageData = data.data?.[0]
    const imagen = imageData?.b64_json
      ? `data:image/png;base64,${imageData.b64_json}`
      : imageData?.url || ''

    if (!imagen) throw new Error('OpenAI no devolvió una imagen')
    return NextResponse.json({ imagen }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    console.error('Error generando flyer IA:', error)
    const status = error instanceof FlyerRequestError ? error.status : 500
    const errorMessage = error instanceof FlyerRequestError ? error.message : 'Error interno'
    return NextResponse.json({ error: errorMessage }, { status, headers: { 'Cache-Control': 'no-store' } })
  } finally {
    releaseQuota?.()
  }
}
