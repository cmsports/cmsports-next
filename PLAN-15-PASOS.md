# CmSports 2.0 — Plan de pasos iterativos

Cada paso es una sesión independiente de Claude Code. Al iniciar una sesión, indica:
**"Ejecuta el paso N del PLAN-15-PASOS.md"**

---

## ✅ Completados

- [x] Paso 1 — Tipos generados de Supabase
- [x] Paso 2 — Cliente Supabase SSR + proxy de autenticación
- [x] Paso 3 — Row Level Security (RLS)
- [x] Paso 4 — Sistema de componentes UI base
- [x] Paso 5 — Refactor del layout y navegación
- [x] Paso 6 — Refactor de login + onboarding
- [x] Paso 7 — Capa de dominio (lógica de negocio pura)
- [x] Paso 10 — Refactor de Torneos
- [x] Paso 11 — Alerta de retención en dashboard admin
- [x] Paso 14 — PWA + optimización móvil
- [x] Paso 15 — Auditoría final, performance y deploy

---

## Paso 11 — Alerta de retención en dashboard admin

Agregar en el dashboard del admin una alerta de retención de jugadores con 2 o más semanas sin asistir.

- Consultar la tabla de asistencia para detectar jugadores que no asisten hace 14+ días
- Mostrar un botón al lado de "Solicitudes" en el dashboard, **solo visible cuando hay jugadores en esta situación**
- Al hacer clic, se despliega la lista con nombre, última asistencia y días sin venir
- El botón debe tener badge con el número de jugadores afectados (igual que solicitudes)
- **Validación**: un jugador con última asistencia hace 15+ días aparece en la alerta; uno con 10 días no aparece.

---

## Paso 12 — Automatizaciones (cron, alertas, emails)

- Configurar `pg_cron` en Supabase para generar mensualidades automáticamente el día 1 de cada mes
- Implementar recargos configurables por atraso
- Automatizar alertas de retención (jugadores inactivos) como notificaciones in-app
- Verificar que el botón WhatsApp del dashboard genera mensajes pre-redactados con monto y mes
- Agregar envío de email a jugadores al crear un torneo (usando Resend API key ya configurada: `re_K5P5qgEs_7Gktt8MR3ySYtAK3cwHQajgL`, destino configurable por club)
- **Validación**: simular cambio de mes, verificar que se generan mensualidades y alertas.

---

## Paso 14 — PWA + optimización móvil ✅ Completado

Hacer la app instalable y optimizar la experiencia móvil para los 3 perfiles (admin, profesor, jugador).

- Crear `manifest.json` y service worker para hacer la app instalable en el celular (pantalla de inicio, sin barra del navegador)
- Implementar cache offline para la toma de asistencia (caso real: gimnasio sin señal), con sincronización al recuperar conexión
- Revisar y corregir todos los módulos en vista móvil para los 3 roles: tablas que se cortan, botones pequeños, formularios difíciles de usar en touch
- Priorizar las vistas que más usan los jugadores y profesores en su celular: perfil, ranking, torneos en vivo, asistencia
- **Validación**: app instalable en móvil (iOS y Android), asistencia funciona offline, todos los módulos usables en pantalla de 390px.

> Nota: la arquitectura multi-club (tabla `clubes`, selector en login) se trabajará en una sesión separada cuando se incorpore el primer club cliente.

---

## Paso 15 — Auditoría final, performance y deploy ✅ Completado

- Correr `npm audit fix` y resolver vulnerabilidades de dependencias
- Auditoría de seguridad: verificar que todas las rutas están protegidas, RLS activo en todas las tablas, no hay inserts directos desde cliente en operaciones sensibles
- Performance: Lighthouse score >90, verificar que no hay N+1 queries ni waterfalls
- Limpiar código muerto, archivos no usados, `console.log` olvidados
- Actualizar `README.md` con instrucciones de setup, variables de entorno necesarias y arquitectura
- Tag de release `v2.0.0`
- **Validación**: build exitoso, deploy a Vercel sin errores, Lighthouse >90.

---

## Cómo usar este plan

1. Abre una sesión de Claude Code.
2. Di: **"Ejecuta el paso N del PLAN-15-PASOS.md"** (donde N es el paso actual).
3. Claude leerá este archivo, entenderá el contexto y ejecutará ese paso.
4. Al terminar, marca el paso como completado agregando `[x]` al título.
5. Cada paso es independiente pero acumulativo — respeta el orden.

### Orden recomendado
```
11 (alerta retención) → 12 (automatizaciones + emails) → 14 (PWA + móvil) → 15 (auditoría final)
```
