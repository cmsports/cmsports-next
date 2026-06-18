# Plan: Torneo en Vivo para Jugadores

## Archivo principal a continuar en nueva sesión
```
C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-next\PLAN-TORNEO-EN-VIVO.md
```

---

## Qué se está construyendo

Panel de torneo en vivo en `/perfil` del jugador:
- Aparece debajo del cuadro azul solo cuando hay un torneo activo
- Muestra primero el grupo propio del jugador
- Actualización en tiempo real sin recargar (Supabase Realtime)
- Avisos animados: "¡A jugar!", ganaste/perdiste, felicitaciones al campeón
- El link "Torneos" del sidebar desaparece para el rol jugador

---

## Partes del trabajo

### [x] Parte 1 — Panel básico en /perfil ✅ COMPLETADO 2026-06-18
**Archivo editado:** `src/app/perfil/page.tsx`

- [x] 4 nuevos estados: `torneoActivo`, `miGrupo`, `gruposT`, `misPartidosPendientes`
- [x] Queries en `cargar()`: busca torneo activo → grupos → grupo del jugador → partidos pendientes
- [x] Panel `TorneoEnVivoBanner` insertado en el JSX después del hero azul
- [x] Componente `TorneoEnVivoBanner` añadido al final del archivo
- [x] Muestra: badge "EN VIVO", tu grupo arriba (destacado), "¡A jugar!" si hay partidos pendientes, botón para ver otros grupos

---

### [x] Parte 2 — Supabase Realtime (actualización sin recargar) ✅ COMPLETADO 2026-06-18
**Archivo a editar:** `src/app/perfil/page.tsx`

Qué agregar:
- Suscripción a `torneo_partidos` con `supabase.channel('torneo-en-vivo')`
- Suscripción a `torneos` para detectar cambio de fase
- Al detectar cambio: recargar solo los datos del torneo (función `recargarTorneo()`)
- Cleanup del canal en el `useEffect` return

Código base:
```ts
useEffect(() => {
  if (!torneoActivo?.id) return
  const canal = supabase
    .channel(`torneo-${torneoActivo.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'torneo_partidos', filter: `torneo_id=eq.${torneoActivo.id}` }, () => recargarTorneo())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'torneos', filter: `id=eq.${torneoActivo.id}` }, () => recargarTorneo())
    .subscribe()
  return () => { supabase.removeChannel(canal) }
}, [torneoActivo?.id])
```

---

### [x] Parte 3 — Avisos animados ✅ COMPLETADO 2026-06-18
**Archivo a editar:** `src/app/perfil/page.tsx`

Qué agregar:
- Estado `avisos: Aviso[]` donde `Aviso = { tipo: 'jugar'|'ganaste'|'perdiste'|'campeon', texto: string, puntos?: number }`
- Función `detectarAvisoNuevo(partidoAnterior, partidoNuevo)` que compara el estado anterior con el nuevo
- Toast/banner animado que aparece 8 segundos y desaparece
- Tipos de aviso:
  - `jugar`: "⚡ ¡A jugar! vs [nombre] · Mesa [número]"
  - `ganaste`: "🎉 ¡Enhorabuena! Pasas a [fase] · +[pts] puntos · ELO: [nuevo]"
  - `perdiste`: "Para la próxima será · +[pts] puntos ganados en el ranking"
  - `campeon`: banner especial solo cuando `torneo.fase === 'finalizado'`

---

### [x] Parte 4 — Felicitaciones al campeón + ocultar torneos del sidebar ✅ COMPLETADO 2026-06-18
**Archivos a editar:**
- `src/app/perfil/page.tsx` — botón de felicitaciones
- `src/app/layout-app.tsx` — quitar "Torneos" de `navJugador` y `mobileNavJugador`

Qué agregar:
- Nueva tabla en Supabase o usar columna `torneo_pagos`/campo en `torneos`: guardar felicitaciones
- Botón "🎊 Enviar felicitaciones a [campeón]" visible para todos cuando el torneo finaliza
- Contador de felicitaciones enviadas
- En `layout-app.tsx`: remover la entrada `{ label: 'Torneos', icon: Trophy, href: '/torneos' }` de `navJugador` y `mobileNavJugador`

---

## Notas técnicas

- **Stack**: Next.js 16 + React 19 + Supabase + inline styles
- **Supabase project ref**: `datjbrohbkqduhzjtmwy`
- **No usar Server Components** (feedback guardado: mantener Client Components)
- **Tablas relevantes**: `torneos`, `torneo_grupos`, `grupo_jugadores`, `torneo_partidos`
- **Tabla torneos**: `estado = 'en_curso'`, `fase` puede ser `grupos | llaves | semis | final`
- **Tabla grupo_jugadores**: join con `jugadores(id, nombre, elo)` para obtener los jugadores de cada grupo
- **Realtime**: Supabase Realtime ya está activo en el proyecto — solo hay que suscribirse

## Instrucción para nueva sesión

Pega la ruta del archivo en el chat nuevo:
```
C:\Users\Marcela Sandoval\Documents\CMSPORTS\cmsports-next\PLAN-TORNEO-EN-VIVO.md
```
Y di: "Lee este plan y continúa con la Parte [número]"
