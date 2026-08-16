// Afiche con el QR del link de inscripción, para imprimir y pegar en el club.
//
// ── Por qué NO usa el sistema de estilo de los otros PDF ──────────────────
// El resto de los reportes (ranking, informe de torneo) son documentos: barra
// de encabezado, tablas, pie. Este no es un documento, es un afiche de pared,
// y dibujado con las primitivas de jsPDF quedaba pobre — sin degradados, sin
// sombras reales, con la Helvetica que trae la librería.
//
// Acá el afiche se arma como SVG (degradados, curvas, tipografía del sistema),
// el navegador lo rasteriza a 4x —unos 290 DPI en A4, de sobra para imprimir—
// y esa imagen se pega a sangre completa en el PDF. Todo pasa en el cliente:
// no hay red de por medio.

const W = 595
const H = 842

/** El SVG es XML: un '&' crudo del link (?club=..&code=..) o de un nombre de
 *  club con '&' rompe el parseo entero y la imagen no carga. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * Paleta de tenis de mesa.
 *
 * Los HOMBROS CÓNCAVOS —las dos curvas que barren hacia adentro entre la pala
 * y el mango— son lo que distingue una paleta de un chupete: el mango no nace
 * de golpe del borde de la pala, se estrecha desde ella. Y va angosto (27% del
 * ancho de la pala): con el mango ancho la figura se lee como globo con
 * pedestal, y con el mango fino y largo, como lupa. Las tres versiones se
 * probaron antes de llegar a esta.
 *
 * El dibujo natural ocupa y ∈ [-16.4, 21.5]; `alto` es el alto final deseado y
 * de ahí sale la escala, para poder encajarlo exacto dentro del círculo limpio
 * que se le deja al centro del QR.
 */
const PALETA_ALTO = 37.9
function paleta(cx: number, cy: number, alto: number, op = 1, giro = -16): string {
  const s = alto / PALETA_ALTO
  return `<g transform="translate(${cx} ${cy}) rotate(${giro}) scale(${s}) translate(0 -2.55)" opacity="${op}">
    <path d="M -6.5 4.5 Q -5.5 9.5 -2.9 10.5 L -2.9 19.5 Q -2.9 21.5 -0.9 21.5
             L 0.9 21.5 Q 2.9 21.5 2.9 19.5 L 2.9 10.5 Q 5.5 9.5 6.5 4.5 Z" fill="#7a4f26"/>
    <ellipse cx="0" cy="-5" rx="10.6" ry="11.4" fill="#c08a4e"/>
    <ellipse cx="0" cy="-5" rx="9.9" ry="10.6" fill="#cf3a30"/>
  </g>`
}

async function construirSvg(clubNombre: string, link: string): Promise<string> {
  const QRCode = await import('qrcode')
  // Corrección de errores 'H': tolera hasta ~30% del código tapado, que es lo
  // que permite poner la paleta al centro sin romper el escaneo. La zona que
  // se despeja acá ronda el 11% del área.
  const qr = QRCode.create(link, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size

  const CARD = 336
  const CARD_X = (W - CARD) / 2
  const CARD_Y = 292
  const QPAD = 28
  const QR = CARD - QPAD * 2
  const QX = CARD_X + QPAD
  const QY = CARD_Y + QPAD
  const cell = QR / size
  const cxQ = QX + QR / 2
  const cyQ = QY + QR / 2
  const RLOGO = QR * 0.155

  // Los tres ojos de esquina se dibujan aparte, redondeados: es donde el lector
  // se ancla, y como puntitos sueltos se degradan.
  const enOjo = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7)

  let puntos = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!qr.modules.get(r, c) || enOjo(r, c)) continue
      const px = QX + c * cell + cell / 2
      const py = QY + r * cell + cell / 2
      if (Math.hypot(px - cxQ, py - cyQ) < RLOGO + cell * 1.6) continue
      puntos += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${(cell * 0.5).toFixed(2)}"/>`
    }
  }

  const ojo = (fila: number, col: number) => {
    const x = QX + col * cell
    const y = QY + fila * cell
    return `<rect x="${x}" y="${y}" width="${cell * 7}" height="${cell * 7}"
              rx="${cell * 2.1}" ry="${cell * 2.1}" fill="none" stroke="#1e1b4b" stroke-width="${cell}"/>
            <rect x="${x + cell * 2}" y="${y + cell * 2}" width="${cell * 3}" height="${cell * 3}"
              rx="${cell * 0.95}" ry="${cell * 0.95}" fill="#1e1b4b"/>`
  }
  const ojos = ojo(0, 0) + ojo(0, size - 7) + ojo(size - 7, 0)

  // Se muestra el link COMPLETO (sin el protocolo, que no hace falta tipear):
  // sin ?club=&code= la página de registro no sirve, así que imprimir una
  // versión corta sería pegar en la pared una dirección que no funciona.
  const linkVisible = link.replace(/^https?:\/\//, '')
  const yBase = CARD_Y + CARD

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, system-ui, -apple-system, Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#3b2f9e"/><stop offset="0.5" stop-color="#241f6b"/><stop offset="1" stop-color="#15123f"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.55"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.32"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0b0824" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#fondo)"/>
  <ellipse cx="${W * 0.86}" cy="88" rx="300" ry="260" fill="url(#glowA)"/>
  <ellipse cx="${W * 0.08}" cy="${H * 0.74}" rx="280" ry="260" fill="url(#glowB)"/>

  <g stroke="#ffffff" stroke-opacity="0.07" stroke-width="1">
    <path d="M -20 214 Q ${W / 2} 176 ${W + 20} 214" fill="none"/>
    <path d="M -20 ${H - 132} Q ${W / 2} ${H - 168} ${W + 20} ${H - 132}" fill="none"/>
  </g>

  <circle cx="72" cy="150" r="7" fill="#fbbf24" opacity="0.85"/>
  <circle cx="${W - 60}" cy="232" r="4.5" fill="#fbbf24" opacity="0.5"/>
  <circle cx="${W - 96}" cy="${H - 196}" r="9" fill="#fbbf24" opacity="0.7"/>
  ${paleta(78, H - 176, 82, 0.5, -34)}
  ${paleta(W - 74, 128, 66, 0.38, 24)}

  <rect x="${W / 2 - 152}" y="52" width="304" height="30" rx="15" fill="#ffffff" fill-opacity="0.12"/>
  <text x="${W / 2}" y="72" text-anchor="middle" fill="#ddd6fe" font-size="12.5" font-weight="600" letter-spacing="1.6">${esc((clubNombre || 'CmSports').toUpperCase())}</text>

  <text x="${W / 2}" y="152" text-anchor="middle" fill="#ffffff" font-size="43" font-weight="800" letter-spacing="-0.8">¿QUIERES JUGAR</text>
  <text x="${W / 2}" y="199" text-anchor="middle" fill="#a5b4fc" font-size="43" font-weight="800" letter-spacing="-0.8">TENIS DE MESA?</text>
  <text x="${W / 2}" y="248" text-anchor="middle" fill="#c7d2fe" font-size="15.5">Escanea el código y solicita tu inscripción al club</text>

  <g filter="url(#sombra)">
    <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD}" height="${CARD}" rx="26" fill="#ffffff"/>
  </g>
  <g fill="#1e1b4b">${puntos}</g>
  ${ojos}
  <circle cx="${cxQ}" cy="${cyQ}" r="${RLOGO + 3}" fill="#ffffff"/>
  ${paleta(cxQ, cyQ, RLOGO * 1.9)}

  <text x="${W / 2}" y="${yBase + 46}" text-anchor="middle" fill="#ffffff" font-size="17" font-weight="600">Apunta la cámara de tu celular</text>

  <rect x="${W / 2 - 244}" y="${yBase + 62}" width="488" height="40" rx="20" fill="#ffffff" fill-opacity="0.1"/>
  <rect x="${W / 2 - 244}" y="${yBase + 62}" width="488" height="40" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.16"/>
  <text x="${W / 2}" y="${yBase + 80}" text-anchor="middle" fill="#a5b4fc" font-size="9.5">o escribe esta dirección en tu navegador</text>
  <text x="${W / 2}" y="${yBase + 94}" text-anchor="middle" fill="#ddd6fe" font-size="8.2" font-weight="600" font-family="Consolas, Menlo, monospace">${esc(linkVisible)}</text>

  <g fill="#ffffff" fill-opacity="0.22">
    <circle cx="${W / 2 - 16}" cy="${H - 74}" r="3"/><circle cx="${W / 2}" cy="${H - 74}" r="3"/><circle cx="${W / 2 + 16}" cy="${H - 74}" r="3"/>
  </g>
  <text x="${W / 2}" y="${H - 44}" text-anchor="middle" fill="#ffffff" fill-opacity="0.34" font-size="10.5" letter-spacing="2.2">CMSPORTS · GESTIÓN DEPORTIVA</text>
</svg>`
}

/** Pasa el SVG a PNG usando el propio motor del navegador. 4x sobre A4 son
 *  ~2380x3368 px (≈290 DPI), que es lo que hace falta para que un afiche
 *  impreso no se vea pixelado. */
async function rasterizar(svg: string, escala: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo dibujar el afiche.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = W * escala
    canvas.height = H * escala
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo dibujar el afiche.')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function descargarQrInvitacionPdf(clubNombre: string, link: string) {
  const { default: jsPDF } = await import('jspdf')
  const svg = await construirSvg(clubNombre, link)
  const png = await rasterizar(svg, 4)

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.addImage(png, 'PNG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())
  doc.save(`invitacion_${(clubNombre || 'club').replace(/ /g, '_')}.pdf`)
}
