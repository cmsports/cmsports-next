# CmSports 2.0 — Plan de 15 pasos iterativos

Cada paso es una sesión independiente de Claude Code. Al iniciar una sesión, indica:
**"Ejecuta el paso N del PLAN-15-PASOS.md"**

---

## Paso 1 — Tipos generados de Supabase y limpieza de `any`
- Generar tipos con `supabase gen types typescript` y guardar en `src/types/database.ts`.
- Reemplazar todos los `any` en archivos existentes por los tipos generados.
- Crear `src/types/index.ts` con tipos de dominio derivados (`Perfil`, `Jugador`, `Clase`, `Torneo`, etc.).
- **Validación**: `npm run build` sin errores de tipo.

## Paso 2 — Cliente Supabase SSR + middleware de autenticación
- Reemplazar el patrón actual (cada página crea su propio `createClient` con anon key) por `@supabase/ssr` centralizado.
- Crear `src/lib/supabase/server.ts` (server component), `src/lib/supabase/client.ts` (client component), `src/lib/supabase/middleware.ts`.
- Implementar `middleware.ts` real en la raíz: verificar sesión, redirigir a `/login` si no autenticado, proteger rutas por rol (`/dashboard` solo admin, `/dashboard-profesor` solo profesor, etc.).
- **Validación**: acceder a `/dashboard` sin sesión redirige a `/login`.

## Paso 3 — Row Level Security (RLS) en Supabase
- Auditar las ~17 tablas y documentar cuáles tienen RLS habilitado y cuáles no.
- Crear políticas RLS por `club_id` + rol en todas las tablas críticas: `perfiles`, `jugadores`, `mensualidades`, `movimientos`, `torneos`, `solicitudes_jugador`.
- Migrar operaciones sensibles (aprobar solicitudes, registrar pagos, calcular ELO) a funciones RPC `security definer` o Server Actions.
- Crear archivo `supabase/migrations/001_rls_policies.sql` con todas las políticas.
- **Validación**: un jugador autenticado NO puede insertar/actualizar en tablas de admin desde la consola del navegador.

## Paso 4 — Sistema de componentes UI base
- Crear `src/components/ui/` con: `Button`, `Card`, `StatCard`, `Modal`, `Badge`, `Table`, `Input`, `Select`, `EmptyState`, `Skeleton`.
- Usar Tailwind 4 (ya instalado pero no usado) con tokens del dark theme actual: fondo `#0f1117`, superficie `#14161f`, primario `#6c63ff`/`#a78bfa`.
- Instalar Lucide React y reemplazar emojis de navegación por iconos vectoriales.
- Documentar uso básico en comentarios del componente.
- **Validación**: importar `Card` y `Button` en una página existente y verificar que renderizan.

## Paso 5 — Refactor del layout y navegación
- Refactorizar `layout-app.tsx` (actualmente ~200 líneas de estilos inline) usando los componentes UI del paso 4.
- Extraer la sidebar, mobile-nav y menú "Más" en componentes separados.
- Implementar bottom-sheet para el menú "Más" en móvil (reemplazar el grid flotante actual).
- Aplicar `tabular-nums` a todos los valores numéricos.
- **Validación**: navegación funcional en desktop y móvil, sin regresiones visuales.

## Paso 6 — Refactor de login + onboarding
- Migrar `login/page.tsx` a usar el cliente SSR del paso 2.
- Agregar validación con Zod en el formulario de login.
- Refactorizar el flujo de invitación/solicitud para usar Server Actions (hoy es insert directo desde el cliente).
- Agregar manejo de errores y estados de carga con Skeleton.
- **Validación**: login funcional, invitación por link funcional, sin inserts directos desde cliente.

## Paso 7 — Capa de dominio (lógica de negocio pura)
- Crear `src/lib/domain/elo.ts`: cálculo ELO con K-factor, funciones puras testeables.
- Crear `src/lib/domain/finanzas.ts`: COA, margen por alumno, tasa de morosidad, proyección de ingresos.
- Crear `src/lib/domain/torneos.ts`: round-robin, seeding por ELO, generación de bracket.
- Extraer constantes mágicas a `src/lib/config.ts`: mensualidad base (25000), ELO inicial (1200), límite sesiones (12), K-factor.
- **Validación**: las funciones retornan resultados correctos con datos de prueba manuales.

## Paso 8 — Refactor del Dashboard admin
- Migrar a Server Component con data-fetching en el servidor.
- Crear vista SQL `dashboard_kpis(club_id)` que retorne todos los KPIs en 1 llamada (hoy son 5-10 queries secuenciales).
- Usar `StatCard` con sparklines (tendencia vs mes anterior).
- Implementar centro de acciones: deudores con botón WhatsApp con mensaje pre-redactado, solicitudes aprobables inline.
- **Validación**: dashboard carga en <2s, KPIs correctos, botón WhatsApp genera link correcto.

## Paso 9 — Refactor de Mensualidades y Finanzas
- Migrar ambas páginas a Server Components + componentes UI.
- Unificar el flujo: registrar pago crea movimiento automáticamente (hoy son dos pasos manuales).
- Implementar estados derivados por fecha: al día / por vencer / atrasada, con badges de color.
- Agregar categorías de gasto y vista de presupuesto mensual.
- Preparar la función SQL para generación automática de mensualidades (el cron se activa en paso 12).
- **Validación**: registrar un pago actualiza mensualidad + crea movimiento en una sola acción.

## Paso 10 — Refactor de Torneos (unificación grupos + playoffs)
- Unificar `torneos/[id]/page.tsx` (52 KB) y `playoffs/page.tsx` (29 KB) en una sola página con tabs.
- Migrar lógica de sorteo y bracket a las funciones de `src/lib/domain/torneos.ts` (paso 7).
- Implementar seeding por ELO al generar grupos.
- Mover el cálculo ELO post-partido a una Server Action o función RPC (hoy es manipulable desde el cliente).
- **Validación**: torneo completo funcional (crear → grupos → partidos → playoffs → campeón), ELO actualizado server-side.

## Paso 11 — Refactor de Jugadores, Clases y Asistencia
- Migrar las páginas de jugadores, clases y asistencia a Server Components + componentes UI.
- Implementar control de cupos real en reservas (límite de sesiones se descuenta automáticamente).
- Mejorar el QR de asistencia: el profesor proyecta QR por clase, alumnos escanean para marcar.
- Implementar alerta de retención: jugador con 2+ semanas sin asistir genera tarea de seguimiento.
- **Validación**: reserva respeta cupo, QR marca asistencia, alerta aparece para inasistentes.

## Paso 12 — Automatizaciones (cron, alertas, WhatsApp)
- Configurar `pg_cron` en Supabase para generar mensualidades automáticamente el día 1 de cada mes.
- Implementar recargos configurables por atraso.
- Automatizar alertas de retención (jugadores inactivos) como notificaciones in-app.
- Verificar que el botón WhatsApp del dashboard genera mensajes pre-redactados con monto y mes.
- **Validación**: simular cambio de mes, verificar que se generan mensualidades y alertas.

## Paso 13 — Perfil del jugador + página pública de torneo
- Mejorar perfil del jugador: gráfico de evolución ELO (datos ya existen en `historial_elo`), radar de evaluaciones trimestrales.
- Agregar botón "informar pago" (sube comprobante → admin confirma).
- Crear página pública de torneo (`/torneos/[id]/publico`) — solo lectura, sin login, para compartir bracket y resultados.
- **Validación**: perfil muestra gráfico ELO, página pública accesible sin autenticación.

## Paso 14 — PWA + multi-club
- Crear `manifest.json` y service worker para hacer la app instalable.
- Implementar cache offline para la toma de asistencia (caso real: gimnasio sin señal) con sincronización al recuperar conexión.
- Desacoplar el club hardcodeado ("Club Unión San Bernardo"): tabla `clubes` con configuración (mensualidad base, ELO inicial, branding, deporte).
- Agregar selector de club en login para admins multi-club.
- **Validación**: app instalable en móvil, asistencia funciona offline, configuración por club respetada.

## Paso 15 — Auditoría final, performance y deploy
- Correr `npm audit fix` y resolver vulnerabilidades de dependencias.
- Auditoría de seguridad: verificar que todas las rutas están protegidas, RLS activo en todas las tablas, no hay inserts directos desde cliente en operaciones sensibles.
- Performance: Lighthouse score >90, verificar que no hay N+1 queries ni waterfalls.
- Limpiar código muerto, archivos no usados, `console.log` olvidados.
- Actualizar `README.md` con instrucciones de setup, variables de entorno necesarias y arquitectura.
- Tag de release `v2.0.0`.
- **Validación**: build exitoso, deploy a Vercel sin errores, Lighthouse >90.

---

## Cómo usar este plan

1. Abre una sesión de Claude Code.
2. Di: **"Ejecuta el paso N del PLAN-15-PASOS.md"** (donde N es el paso actual).
3. Claude leerá este archivo, entenderá el contexto y ejecutará ese paso.
4. Al terminar, marca el paso como completado agregando `[x]` al título.
5. Cada paso es independiente pero acumulativo — respeta el orden.

### Dependencias entre pasos
```
1 (tipos) ──→ 2 (SSR/middleware) ──→ 3 (RLS) ──→ 6 (login)
                                                     ↓
4 (componentes UI) ──→ 5 (layout) ──────────────→ 8-11 (refactors)
                                                     ↓
7 (dominio) ─────────────────────────────────────→ 10 (torneos)
                                                     ↓
                                              12 (automatización)
                                                     ↓
                                              13 (perfil/público)
                                                     ↓
                                              14 (PWA/multi-club)
                                                     ↓
                                              15 (auditoría final)
```
