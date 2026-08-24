# Plan: Módulo Ligas de Fútbol — CmSports

> Módulo para gestionar ligas amateur/comerciales de fútbol (7, 11, etc.).
> Pensado para productoras y organizadores que abren cupos, cobran inscripción,
> programan fechas semanales, llevan tabla de posiciones y playoffs.

## Contexto técnico

- El módulo de Liga TDM existente (`liga_*` tablas) es para jugadores individuales
  con round-robin y Bo5. **No se reutiliza** — el modelo es fundamentalmente distinto.
- Nuevo módulo key: `liga_futbol` en `modulos.ts`.
- Tablas nuevas con prefijo `lf_` (liga fútbol) para no colisionar con `liga_*`.
- El club que usa este módulo se crea desde superadmin con `deporte: 'futbol'`.
- Se respeta el patrón existente: Client Components, `useEnVivo`, `cachedFetch`,
  Server Actions, migraciones manuales con `_migracion_nueva`.

---

## Parte 1 — Modelo de datos y migración base

**Objetivo:** Crear todas las tablas del módulo y el RPC de inscripción.

### Tablas

```
lf_ligas
├── id (uuid PK)
├── club_id (FK clubes)
├── nombre ("Apertura 2026")
├── deporte_variante ("futbol_7" | "futbol_11" | "futsal")
├── categoria ("todo_competidor" | "senior" | "sub_20" | "femenino" | "mixto" | custom text)
├── formato ("todos_vs_todos" | "grupos_playoffs" | "liga_playoffs")
├── max_equipos (int)
├── ruedas (int, default 1 = solo ida)
├── dia_juego (text, ej "domingo")
├── horarios (text[], ej ["19:00","20:00","21:00"])
├── cancha (text)
├── direccion_cancha (text)
├── monto_inscripcion (int, pesos)
├── fecha_inicio (date)
├── fecha_fin (date)
├── estado ("inscripcion" | "en_curso" | "playoffs" | "finalizada" | "cancelada")
├── reglas_wo (jsonb, ej {"puntos_ganador":3,"goles_favor":3,"goles_contra":0})
├── puntos_victoria (int, default 3)
├── puntos_empate (int, default 1)
├── puntos_derrota (int, default 0)
├── puntos_wo_perdedor (int, default 0)
├── creado_en (timestamptz)
└── actualizado_en (timestamptz)

lf_grupos (solo si formato = grupos_playoffs)
├── id (uuid PK)
├── liga_id (FK lf_ligas)
├── nombre ("Grupo A")
├── orden (int)
└── clasifican (int, cuántos pasan a playoffs)

lf_equipos
├── id (uuid PK)
├── liga_id (FK lf_ligas)
├── grupo_id (FK lf_grupos, nullable)
├── nombre ("Real United")
├── logo_url (text)
├── color_principal (text)
├── color_secundario (text)
├── delegado_nombre (text)
├── delegado_telefono (text)
├── delegado_email (text)
├── estado_inscripcion ("pendiente" | "abonado" | "pagado")
├── monto_pagado (int, default 0)
├── observaciones (text)
├── orden_tabla (int, para desempates manuales)
└── creado_en (timestamptz)

lf_jugadores
├── id (uuid PK)
├── equipo_id (FK lf_equipos)
├── nombre (text)
├── rut (text)
├── numero (int)
├── posicion ("arquero"|"defensa"|"mediocampista"|"delantero"|null)
├── fecha_nacimiento (date)
├── foto_url (text)
├── estado ("activo" | "suspendido" | "retirado")
├── sancionado_hasta_fecha_id (uuid FK lf_fechas, nullable)
└── creado_en (timestamptz)

lf_fechas
├── id (uuid PK)
├── liga_id (FK lf_ligas)
├── numero (int)
├── nombre (text, ej "Fecha 1", "Semifinal 1")
├── fecha (date)
├── es_playoff (bool, default false)
├── fase_playoff ("cuartos"|"semifinal"|"final"|"tercer_lugar"|null)
├── estado ("pendiente" | "en_curso" | "finalizada" | "suspendida")
└── creado_en (timestamptz)

lf_partidos
├── id (uuid PK)
├── liga_id (FK lf_ligas)
├── fecha_id (FK lf_fechas)
├── grupo_id (FK lf_grupos, nullable)
├── equipo_local_id (FK lf_equipos)
├── equipo_visita_id (FK lf_equipos)
├── goles_local (int)
├── goles_visita (int)
├── hora (time)
├── cancha (text, override de liga si hay varias)
├── estado ("programado"|"en_curso"|"finalizado"|"wo"|"suspendido"|"reprogramado")
├── equipo_wo_id (FK lf_equipos, nullable — quién no se presentó)
├── nueva_fecha (date, si reprogramado)
├── nueva_hora (time)
├── observaciones (text)
└── creado_en (timestamptz)

lf_goles
├── id (uuid PK)
├── partido_id (FK lf_partidos)
├── jugador_id (FK lf_jugadores)
├── equipo_id (FK lf_equipos)
├── minuto (int)
├── tipo ("normal" | "penal" | "autogol")
└── creado_en (timestamptz)

lf_tarjetas
├── id (uuid PK)
├── partido_id (FK lf_partidos)
├── jugador_id (FK lf_jugadores)
├── equipo_id (FK lf_equipos)
├── tipo ("amarilla" | "roja" | "doble_amarilla")
├── minuto (int)
├── motivo (text)
└── creado_en (timestamptz)

lf_sanciones
├── id (uuid PK)
├── liga_id (FK lf_ligas)
├── jugador_id (FK lf_jugadores)
├── equipo_id (FK lf_equipos)
├── tarjeta_id (FK lf_tarjetas, nullable)
├── tipo ("suspension_fechas" | "suspension_permanente" | "multa" | "amonestacion")
├── fechas_suspension (int, cantidad)
├── fecha_desde_id (FK lf_fechas, nullable)
├── fecha_hasta_id (FK lf_fechas, nullable)
├── motivo (text)
├── estado ("activa" | "cumplida" | "anulada")
└── creado_en (timestamptz)
```

### Migración

- Archivo: `1XX_liga_futbol_base.sql` (número según la secuencia actual)
- Usa `_migracion_nueva` como portazo
- Agrega todas las tablas con FKs, índices en `liga_id` y `equipo_id`
- Agrega las tablas a `supabase_realtime` (para `useEnVivo`)
- RLS: filtrar por `club_id` vía join con `lf_ligas`

### Cambios en código existente

- `modulos.ts`: agregar `{ key: 'liga_futbol', label: 'Liga Fútbol' }`
- `database.ts`: agregar tipos de las 8 tablas nuevas

### Entregable

- [ ] Migración SQL lista para pegar en Supabase
- [ ] Tipos actualizados en `database.ts`
- [ ] Módulo registrado en `modulos.ts`

---

## Parte 2 — CRUD de Liga + Equipos + Jugadores

**Objetivo:** Poder crear una liga, inscribir equipos y armar plantillas.

### Server Actions (`actions/liga-futbol.ts`)

```
crearLigaFutbol(data)        — crea liga con config completa
editarLigaFutbol(id, data)   — editar antes de iniciar
eliminarLigaFutbol(id)       — solo en estado "inscripcion"
crearEquipo(ligaId, data)    — inscribir equipo
editarEquipo(equipoId, data)
eliminarEquipo(equipoId)     — solo si no hay partidos jugados
registrarPagoEquipo(equipoId, monto) — actualiza monto_pagado y estado
crearJugador(equipoId, data)
editarJugador(jugadorId, data)
eliminarJugador(jugadorId)
crearGrupo(ligaId, data)     — solo si formato = grupos_playoffs
asignarEquipoAGrupo(equipoId, grupoId)
```

### Páginas

```
/liga-futbol                      — lista de ligas del club
/liga-futbol/nueva                — formulario crear liga (wizard simple)
/liga-futbol/[id]                 — dashboard de la liga (tabs)
/liga-futbol/[id]/equipos         — gestión de equipos
/liga-futbol/[id]/equipos/[eqId]  — plantilla del equipo
```

### UI del wizard "Nueva Liga"

Paso 1: Datos básicos
- nombre, deporte_variante, categoria, dia_juego, cancha, dirección

Paso 2: Formato
- formato (selector visual de los 3 tipos)
- max_equipos, ruedas
- Si grupos_playoffs: cantidad de grupos, equipos por grupo, cuántos clasifican

Paso 3: Reglas
- puntos victoria/empate/derrota
- reglas W.O.
- monto inscripción

Paso 4: Fechas
- fecha_inicio, fecha_fin
- horarios disponibles

### Entregable

- [ ] Server Actions completas
- [ ] Páginas con formularios funcionales
- [ ] Vista de equipos con estado de pago (badge verde/amarillo/rojo)
- [ ] Vista de plantilla por equipo

---

## Parte 3 — Fixture y Calendario

**Objetivo:** Generar automáticamente el calendario de partidos.

### Lógica de dominio (`lib/domain/liga-futbol.ts`)

```typescript
// Formato A: todos vs todos
generarFixtureTodosVsTodos(equipos, ruedas) → lf_partidos[]

// Formato B: fase de grupos
generarFixtureGrupos(grupos, ruedas) → lf_partidos[]

// Asignar partidos a fechas y horarios
programarPartidos(partidos, fechas, horarios) → lf_partidos[] con fecha_id y hora

// Formato C: generar bracket de playoffs
generarBracketPlayoffs(clasificados, tipo) → lf_fechas[] + lf_partidos[]
```

**Algoritmo de fixture:**
- Round-robin clásico (rotación de Berger) — el mismo concepto que ya existe
  en `generarRoundRobin` de torneos.ts, pero adaptado a equipos.
- Si hay número impar de equipos, uno descansa por fecha.
- Distribución de local/visita equilibrada.

**Asignación de horarios:**
- Se reparten los partidos de cada fecha en los horarios disponibles.
- Si hay más partidos que horarios, se necesitan varias canchas o se reparten
  en bloques (ej: 3 partidos a las 19:00, 20:00, 21:00).

### Server Actions

```
generarFixtureLiga(ligaId)          — genera partidos + fechas
reprogramarPartido(partidoId, data) — cambiar fecha/hora
intercambiarLocalVisita(partidoId)  — swap
```

### Páginas

```
/liga-futbol/[id]/fixture    — vista del fixture completo (por fecha)
/liga-futbol/[id]/calendario — vista calendario (mes/semana)
```

### Entregable

- [ ] Generador de fixture para los 3 formatos
- [ ] Programación automática en horarios
- [ ] Vista fixture agrupada por fecha
- [ ] Reprogramación de partidos individuales

---

## Parte 4 — Resultados, Goles y Tarjetas

**Objetivo:** Registrar lo que pasa en cada partido.

### Server Actions

```
iniciarPartido(partidoId)
registrarResultado(partidoId, {golesLocal, golesVisita})
registrarGol(partidoId, {jugadorId, equipoId, minuto, tipo})
eliminarGol(golId)
registrarTarjeta(partidoId, {jugadorId, equipoId, tipo, minuto, motivo})
eliminarTarjeta(tarjetaId)
registrarWO(partidoId, equipoWoId)
suspenderPartido(partidoId, observaciones)
finalizarPartido(partidoId)
terminarFecha(fechaId)   — marca fecha como finalizada si todos los partidos están cerrados
```

### Lógica de sanciones automáticas

- Roja directa → suspensión automática X fechas (configurable en liga)
- Doble amarilla = roja → misma sanción
- Acumulación: 5 amarillas en la liga → 1 fecha de suspensión
- Al crear tarjeta roja, se crea automáticamente un registro en `lf_sanciones`

### Páginas

```
/liga-futbol/[id]/fecha/[fechaId]  — detalle de fecha con todos los partidos
  └── Modal/panel por partido: marcador, goles, tarjetas, W.O.
```

### UI del partido

```
┌─────────────────────────────────────┐
│  Real United    4  -  2  Galácticos │
│  ────────────────────────────────── │
│  ⚽ 12' J.Pérez          ⚽ 23' Soto│
│  ⚽ 34' J.Pérez (P)      ⚽ 67' Díaz│
│  ⚽ 56' González                    │
│  ⚽ 78' López                       │
│  🟨 45' Muñoz            🟥 55' Ruiz│
└─────────────────────────────────────┘
```

### Entregable

- [ ] Registro completo de partidos con goles y tarjetas
- [ ] W.O. con puntos automáticos según regla de la liga
- [ ] Sanciones automáticas por tarjetas
- [ ] Vista de fecha con todos los partidos y sus detalles

---

## Parte 5 — Tabla de Posiciones, Goleadores y Estadísticas

**Objetivo:** Calcular y mostrar standings, tabla de goleadores y stats.

### Lógica de dominio

```typescript
// Tabla de posiciones
calcularTablaPosiciones(liga, partidos) → Array<{
  equipo, pj, pg, pe, pp, gf, gc, dg, pts,
  ultimos5: ('V'|'E'|'D')[]
}>

// Desempate configurable:
// 1. Puntos
// 2. Diferencia de gol
// 3. Goles a favor
// 4. Enfrentamiento directo
// 5. Menos tarjetas rojas
// 6. Menos tarjetas amarillas

// Tabla de goleadores
calcularGoleadores(goles) → Array<{
  jugador, equipo, goles, penales, autogoles
}>

// Tabla de tarjetas
calcularTarjetas(tarjetas) → Array<{
  jugador, equipo, amarillas, rojas, doble_amarilla
}>

// Tabla fairplay
calcularFairPlay(tarjetas) → Array<{
  equipo, amarillas, rojas, puntos_fairplay
}>
```

### Páginas

```
/liga-futbol/[id]/tabla      — tabla de posiciones (o por grupo)
/liga-futbol/[id]/goleadores — ranking de goleadores
/liga-futbol/[id]/tarjetas   — tarjetas por jugador
/liga-futbol/[id]/sanciones  — sanciones activas/historial
/liga-futbol/[id]/stats      — resumen estadístico general
```

### Entregable

- [ ] Tabla de posiciones con desempate correcto
- [ ] Tabla por grupo (si formato con grupos)
- [ ] Top goleadores
- [ ] Tabla de tarjetas y fairplay
- [ ] Últimos 5 resultados por equipo (VVDVE)

---

## Parte 6 — Playoffs

**Objetivo:** Cuando termina la fase regular, generar y gestionar la fase final.

### Lógica

```typescript
// Determinar clasificados según formato
clasificarEquipos(liga, tabla) → equipoId[]

// Generar bracket
// Liga + playoffs: top N de tabla general
// Grupos + playoffs: top N de cada grupo
generarPlayoffs(clasificados, formato) → {
  fechas: lf_fechas[],     // cuartos, semi, final, tercer lugar
  partidos: lf_partidos[]  // con equipo_local/visita según bracket
}

// Avanzar ganador al siguiente partido del bracket
avanzarGanadorPlayoff(partidoId)
```

### UI

- Bracket visual (cuartos → semi → final)
- Al finalizar un partido de playoff, el ganador avanza automáticamente
- El organizador puede configurar:
  - ¿Hay tercer lugar?
  - ¿Los playoffs son ida/vuelta o partido único?
  - ¿Hay gol de visita? ¿Penales en empate?

### Entregable

- [ ] Generación automática de bracket
- [ ] Avance automático de ganadores
- [ ] Vista bracket visual
- [ ] Soporte para playoff ida/vuelta (global en liga, no por llave)

---

## Parte 7 — Pagos e Inscripciones

**Objetivo:** Control financiero de inscripciones de equipos.

### Vista

```
/liga-futbol/[id]/pagos  — estado de pago de todos los equipos
```

### UI

```
┌──────────────────────────────────────────────────┐
│  Liga Apertura 2026 — Inscripciones              │
│  ────────────────────────────────────────────     │
│  12 cupos | 11 inscritos | 1 disponible          │
│  Total esperado: $7.800.000                      │
│  Total recaudado: $5.850.000                     │
│  Pendiente: $1.950.000                           │
│  ────────────────────────────────────────────     │
│  🟢 Real United     $650.000  Pagado             │
│  🟡 Galácticos      $650.000  Abonado $300.000   │
│  🟢 FC Santiago     $650.000  Pagado             │
│  🔴 Deportivo Sur   $650.000  Pendiente          │
│  ...                                             │
└──────────────────────────────────────────────────┘
```

### Server Actions

```
registrarPagoInscripcion(equipoId, monto, metodo, comprobante?)
  → actualiza monto_pagado, cambia estado si monto_pagado >= inscripción
  → registra movimiento en tabla movimientos (si módulo finanzas activo)
```

### Integración con Finanzas

- Si el club tiene módulo `finanzas` habilitado, cada pago de inscripción se
  registra como ingreso en `movimientos` usando el RPC atómico existente.
- Categoría: "Inscripción liga" + nombre liga + nombre equipo.

### Entregable

- [ ] Dashboard de inscripciones con métricas
- [ ] Registro de pagos parciales
- [ ] Integración con módulo finanzas (si habilitado)

---

## Parte 8 — Navegación, Permisos y Sidebar

**Objetivo:** Integrar el módulo en la app existente.

### Cambios

1. **`layout-app.tsx`**: agregar item de navegación
   ```
   { href: '/liga-futbol', icon: TrophyIcon, label: 'Liga Fútbol', modulo: 'liga_futbol' }
   ```

2. **Superadmin**: al crear club con `deporte: 'futbol'`, ofrecer `liga_futbol`
   en los módulos disponibles.

3. **Dashboard**: widget resumen de liga activa (próxima fecha, tabla top 4).

4. **Tabs de la liga**: navegación horizontal dentro de `/liga-futbol/[id]/`
   ```
   Dashboard | Equipos | Fixture | Calendario | Tabla | Goleadores | Tarjetas | Sanciones | Pagos | Config
   ```

### Entregable

- [ ] Navegación integrada en sidebar
- [ ] Tabs dentro de la liga
- [ ] Widget en dashboard (si hay liga activa)

---

## Parte 9 — Vista pública (sin cuenta)

**Objetivo:** Página pública donde cualquiera puede ver tabla, fixture y resultados.

### Ruta

```
/liga/publica/[codigo]  — código corto tipo "APE2026" generado al crear la liga
```

### Contenido público

- Tabla de posiciones
- Fixture / calendario
- Resultados de cada fecha
- Goleadores
- Próxima fecha
- Sin login, sin cuenta, lectura pura

### Campo nuevo en `lf_ligas`

```
codigo_publico (text UNIQUE) — ej "APE2026", generado automáticamente
es_publica (bool, default true)
```

### Entregable

- [ ] Página pública responsive
- [ ] Código compartible (link o QR)
- [ ] Polling para actualizaciones en vivo

---

## Parte 10 — Pulido y extras

**Objetivo:** Detalles finales que completan la experiencia.

### Items

- [ ] Export PDF: tabla de posiciones, fixture, planilla de equipo
- [ ] Export Excel: estadísticas completas
- [ ] Notificaciones: próxima fecha (si se integra push)
- [ ] Historial de ligas pasadas del club
- [ ] Clonar liga (para crear Clausura basado en Apertura)
- [ ] Multi-división: una liga puede tener Primera, Segunda, Senior
  (cada división es una `lf_ligas` independiente, agrupadas por un campo `temporada_id`)
- [ ] Reglamento: campo de texto rico o PDF adjunto en la liga

---

## Orden de ejecución recomendado

```
Parte 1 → Parte 2 → Parte 3 → Parte 4 → Parte 5
                                              ↓
                               Parte 6 ← (necesita resultados)
                                              ↓
                    Parte 7 (pagos, independiente después de Parte 2)
                                              ↓
                               Parte 8 → Parte 9 → Parte 10
```

Las partes 1–5 son el core. Las partes 6–10 son mejoras incrementales.
Cada parte es una sesión de Claude Code (~1 sesión = 1 parte).

---

## Notas técnicas

- **No crear tabla `equipos` genérica.** Cada liga tiene sus propios equipos
  inscritos — un equipo en la Apertura no es automáticamente el mismo en la
  Clausura. Es más simple y correcto.
- **Fixture se regenera, no se edita.** Si cambian equipos antes de empezar,
  se borra y regenera. Después de empezar, solo se reprograman partidos individuales.
- **W.O. no es un resultado normal.** Tiene su propio estado y sus propios puntos.
  El marcador de W.O. es configurable (default 3-0).
- **Tabla de posiciones es cálculo puro, no se guarda.** Se computa cada vez
  desde los partidos finalizados. Eso evita desincronizaciones.
- **`useEnVivo`** en `lf_partidos` y `lf_goles` para que la vista pública
  se actualice en tiempo real durante los partidos.
