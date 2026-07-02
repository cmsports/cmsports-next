import { NextRequest, NextResponse } from 'next/server'

const TEAM_ID = 'team_tEBVANHI3s1u7391NCICmVfi'
const PROJECT_ID = 'prj_vX8jugAB0oF30JEJzL4SyftY89m1'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(request: NextRequest) {
  // Preferir header Authorization (no queda en logs de acceso); el query
  // param se mantiene por compatibilidad con el cron ya configurado.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const secret = bearer || request.nextUrl.searchParams.get('secret')
  const MONITOR_SECRET = process.env.MONITOR_SECRET
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const VERCEL_MONITOR_TOKEN = process.env.VERCEL_MONITOR_TOKEN

  if (!MONITOR_SECRET || secret !== MONITOR_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!RESEND_API_KEY || !VERCEL_MONITOR_TOKEN) {
    return NextResponse.json({ error: 'Missing env vars' }, { status: 500 })
  }

  try {
    const now = Date.now()
    const since24h = now - 86_400_000

    // 1. Obtener deployments de las últimas 24h
    const deplRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&since=${since24h}&limit=50`,
      { headers: { Authorization: `Bearer ${VERCEL_MONITOR_TOKEN}` } }
    )
    const deplData = await deplRes.json()
    const deployments: Array<{ state: string; created: number; meta?: { githubCommitMessage?: string } }> =
      deplData.deployments ?? []

    const total = deployments.length
    const exitosos = deployments.filter((d) => d.state === 'READY').length
    const fallidos = deployments.filter((d) => d.state === 'ERROR' || d.state === 'CANCELED').length

    const ultimo = deployments[0]
    const ultimoHora = ultimo
      ? new Date(ultimo.created).toISOString().slice(11, 16) + ' UTC'
      : 'N/A'
    const ultimoCommit = escapeHtml(ultimo?.meta?.githubCommitMessage?.split('\n')[0] ?? 'N/A')

    // 2. Obtener logs de error/warning de las últimas 24h
    const logsRes = await fetch(
      `https://api.vercel.com/v1/projects/${PROJECT_ID}/runtime-logs?teamId=${TEAM_ID}&level=error&level=fatal&level=warning&limit=50`,
      { headers: { Authorization: `Bearer ${VERCEL_MONITOR_TOKEN}` } }
    )
    const logsData = await logsRes.json()
    type LogEntry = { timestamp?: string | number; method?: string; path?: string; statusCode?: number; message?: string; level?: string }
    const allLogs: LogEntry[] = logsData.logs ?? logsData.output ?? []

    // Filtrar los AuthApiError normales (sesiones expiradas en GET / con status 200)
    const criticalLogs = allLogs.filter((log) => {
      const msg = log.message ?? ''
      const isNormalAuth = msg.includes('AuthApiError') && log.path === '/' && log.statusCode === 200
      return !isNormalAuth
    })

    // 3. Determinar estado
    let estadoEmoji = '✅'
    let estadoTexto = 'Todo bien'
    let resumenLinea = `${total} deploys exitosos, sin errores críticos en las últimas 24h`
    let accion = 'Ninguna. La app está operando correctamente.'

    if (fallidos > 0) {
      estadoEmoji = '🔴'
      estadoTexto = 'Deploy fallido'
      resumenLinea = `${fallidos} deploy(s) fallido(s) en las últimas 24h`
      accion = `Revisar deploy fallido en Vercel dashboard. Commit: "${ultimoCommit}"`
    } else if (criticalLogs.length > 5) {
      estadoEmoji = '⚠️'
      estadoTexto = 'Errores repetidos'
      resumenLinea = `${criticalLogs.length} errores críticos detectados`
      accion = 'Revisar logs de runtime en Vercel y verificar funcionalidad afectada.'
    }

    // 4. Construir sección de errores
    let seccionErrores = '<p style="color: #22c55e; font-size: 14px; margin: 0;">✅ Sin errores críticos</p>'
    const normalAuthCount = allLogs.length - criticalLogs.length
    if (normalAuthCount > 0) {
      seccionErrores += `<p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">Nota: ${normalAuthCount} AuthApiError en GET / (status 200) — sesiones expiradas, comportamiento normal.</p>`
    }
    if (criticalLogs.length > 0) {
      seccionErrores = `<table style="width:100%; font-size:12px; border-collapse:collapse;">
        <tr style="background:#f8fafc;"><th style="text-align:left;padding:4px 8px;">Hora</th><th style="text-align:left;padding:4px 8px;">Ruta</th><th style="text-align:left;padding:4px 8px;">Mensaje</th><th style="text-align:left;padding:4px 8px;">Status</th></tr>
        ${criticalLogs.slice(0, 10).map((log) => {
          const hora = log.timestamp ? new Date(Number(log.timestamp)).toISOString().slice(11, 19) : 'N/A'
          const msg = escapeHtml((log.message ?? '').slice(0, 60))
          const path = escapeHtml(log.path ?? '/')
          return `<tr><td style="padding:4px 8px;border-top:1px solid #e2e8f0;">${hora}</td><td style="padding:4px 8px;border-top:1px solid #e2e8f0;">${path}</td><td style="padding:4px 8px;border-top:1px solid #e2e8f0;">${msg}</td><td style="padding:4px 8px;border-top:1px solid #e2e8f0;">${log.statusCode ?? '-'}</td></tr>`
        }).join('')}
      </table>`
    }

    // 5. Construir fecha
    const now_date = new Date()
    const fechaStr = now_date.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
    const horaStr = now_date.toISOString().slice(11, 16) + ' UTC'

    // 6. Construir HTML
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; background: #f1f5f9; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #4f46e5; padding: 20px 24px;">
      <h1 style="color: white; margin: 0; font-size: 18px;">CmSports Monitor</h1>
      <p style="color: #c7d2fe; margin: 4px 0 0; font-size: 13px;">${fechaStr} — ${horaStr}</p>
    </div>
    <div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0;">
      <div style="font-size: 28px; margin-bottom: 8px;">${estadoEmoji}</div>
      <div style="font-size: 20px; font-weight: bold; color: #1e293b;">${estadoTexto}</div>
      <div style="color: #64748b; font-size: 14px; margin-top: 4px;">${resumenLinea}</div>
    </div>
    <div style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0;">
      <h2 style="font-size: 14px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px;">Deployments (24h)</h2>
      <div style="display: flex; gap: 16px;">
        <div style="text-align: center;"><div style="font-size: 22px; font-weight: bold; color: #1e293b;">${total}</div><div style="font-size: 12px; color: #94a3b8;">Total</div></div>
        <div style="text-align: center;"><div style="font-size: 22px; font-weight: bold; color: #22c55e;">${exitosos}</div><div style="font-size: 12px; color: #94a3b8;">Exitosos</div></div>
        <div style="text-align: center;"><div style="font-size: 22px; font-weight: bold; color: #ef4444;">${fallidos}</div><div style="font-size: 12px; color: #94a3b8;">Fallidos</div></div>
      </div>
      <div style="margin-top: 12px; font-size: 13px; color: #475569;">
        <strong>Último:</strong> ${ultimoHora} — <em>"${ultimoCommit}"</em>
      </div>
    </div>
    <div style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0;">
      <h2 style="font-size: 14px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px;">Errores runtime (24h)</h2>
      ${seccionErrores}
    </div>
    <div style="padding: 16px 24px;">
      <h2 style="font-size: 14px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px;">Acción requerida</h2>
      <p style="font-size: 14px; color: #1e293b; margin: 0;">${accion}</p>
    </div>
    <div style="background: #f8fafc; padding: 12px 24px; text-align: center;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">CmSports — Monitor automático vía Cowork</p>
    </div>
  </div>
</body>
</html>`

    // 7. Enviar email via Resend
    const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CmSports Monitor <onboarding@resend.dev>',
        to: ['cmsportschile@gmail.com'],
        subject: `CmSports ${estadoEmoji} ${estadoTexto} — ${today}`,
        html,
      }),
    })

    const emailData = await emailRes.json()

    if (!emailRes.ok || !emailData.id) {
      return NextResponse.json(
        { error: 'Resend error', detail: emailData },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      estado: estadoTexto,
      deployments: { total, exitosos, fallidos },
      erroresCriticos: criticalLogs.length,
      emailId: emailData.id,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
