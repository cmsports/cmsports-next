# Avance: Archivar oficiales + simulación 40 (Demostración)

**Repo:** `cmsports-next`  
**Última actualización:** 2026-08-11  
**Club demo:** Demostración TDM `0884dbef-798d-4ce3-9e7a-deace0b4aa95`  
**NO tocar Buin** `ec1ef215-0ab5-43c6-abf4-fc5578b17bcc`

Documento para retomar en otro chat: pegar esta ruta.

## Estado actual del torneo simulado

| Campo | Valor |
|-------|--------|
| Campeonato | **Simulación Manual JG — 40 inscritos** |
| ID | `70e9ac10-1b13-4892-855e-f2cd8e9ab948` |
| Evento | `/torneo-oficial/evento/682cc3a8-81e3-4a4c-928b-7b7ac88cf6c1` |
| Inscritos | 40 |
| Grupos | **13** (12×3 + 1×4) — sin grupos de 2 |
| Partidos grupo | 42 (todos programados, 8 mesas) |
| Resultados muestra | 14 con `ganador_id` + sets |
| Marcador bridge | 1 partido con `marcador_id` → `tecnico_partidos` + sets sync |
| Cuadro esperado | 26 clasificados → llave 32, **6 BYE**, 16vos |

## A — Marcador end-to-end

### Veredicto: **sí sirve** (con fixes)

Flujo real:

1. UI 🎯 → `abrirMarcadorOficial` crea/reusa `tecnico_partidos` y guarda `oficial_partidos.marcador_id`
2. Bridge `/torneo-oficial/marcador/[partidoId]` → `/tecnico/marcador/{id}`
3. Al cerrar el partido en tablet (`finPartido`) → `sincronizarResultadoDesdeMarcador`
4. Eso escribe `ganador_id`, `sets`, `tipo_cierre`, dispara standings/llaves (`sincronizarLlavesOficial` en fase grupos) y sync de tarjetas → `oficial_sanciones`

### Bugs fijados (este corte)

| Bug | Fix |
|-----|-----|
| Sync usaba `requireAdmin` (solo rol `admin`) y **tragaba** auth con `return {}` | `requireStaffMarcadorOficial` (admin/profesor/superadmin) + `{ error }` visible; core en `aplicarResultadoOficialDb` |
| Profesor en tablet cerraba partido y **no** anotaba en oficial | Mismo fix de staff |

### Migración 179

Sigue siendo necesaria para el FK `marcador_id → tecnico_partidos`.  
**Proba en Demostración OK** (vínculo + resultado escritos). Si en otro entorno falla el update de `marcador_id`, pegar `179_oficial_marcador_tecnico_fk.sql`.

Prueba script:

```bash
node scripts/simular-oficial-40.mjs --limpiar
node scripts/simular-oficial-40.mjs --resultados --probar-marcador
```

## B — Grupos según Manual JG §2.2 (CRÍTICO)

### Problema

`Math.ceil(N/3)` con N=40 → **14 grupos** → varios de **tamaño 2**. Eso viola el espíritu del manual (~3 jugadores; orden ITTF tipificado para 3 y 4).

### Regla implementada

`calcularNumGruposOficial` en `src/lib/domain/oficial-ittf.ts`:

- Preferir grupos de **3**
- Usar **4** cuando el resto lo exija
- **Evitar grupos de 2** (salvo N < 3)
- Fórmula: `G = floor(N/3)` para N≥3 → tamaños solo en {3,4}

Con **40**: 13 grupos = 12×3 + 1×4.

`formarGruposOficial` usa esa función + `seedingSerpenteoConClubes` (cupos balanceados).  
Script y modal de inscripción alineados.  
Tests: `oficial-ittf.test.ts` + `oficial-simulacion-40.test.ts`.

## C — Torneo como real (Demostración)

Hecho en seed:

- Grupos correctos + partidos ITTF + numeración ITTF (si col. 181)
- Programa greedy 8 mesas (42/42)
- 13 resultados de muestra (1 por grupo) + 1 vía bridge marcador
- Listo para seguir cargando resultados / generar llaves desde UI

Pendiente opcional en UI: cerrar resto de grupos → sync llaves → jugar cuadro.

## D — Migraciones a pegar

Orden en SQL Editor:

1. `179_oficial_marcador_tecnico_fk.sql` (si falta)
2. `180_oficial_cierre_sanciones_programa.sql` (o `docs/pegar-recuperar-180-oficial.sql`)
3. `181_oficial_sorteo_numero_arbitro.sql`

**No hay migración 182** en este corte (solo dominio/UI/script).

## Cómo verlo

1. Pegar 179–181 si aún no están.
2. Login club **Demostración TDM**.
3. **Torneo oficial** → **Simulación Manual JG — 40 inscritos**.
4. Probar 🎯 en un partido abierto → tablet → cerrar → volver y ver sets/ganador.
5. Archivar / Ver archivados sigue disponible.

## Re-seed

```bash
node scripts/simular-oficial-40.mjs --limpiar
node scripts/simular-oficial-40.mjs --resultados --probar-marcador
```

SQL solo inscritos: `docs/pegar-simular-oficial-40-demo.sql` → luego **Formar grupos** en UI (usa algoritmo nuevo → 13 grupos).

## Archivos clave

- `src/lib/domain/oficial-ittf.ts` — `calcularNumGruposOficial`, `tamanosGruposOficial`
- `src/app/actions/torneo-oficial.ts` — formar grupos + sync marcador staff
- `src/components/torneo-oficial/InscripcionOficialModal.tsx` — estimado de grupos
- `scripts/simular-oficial-40.mjs`
- `docs/pegar-simular-oficial-40-demo.sql`

## Verificación

```bash
npx vitest run src/lib/domain/oficial-ittf.test.ts src/lib/domain/oficial-simulacion-40.test.ts
```

## Cómo continuar

```
Seguir desde docs/avance-simular-oficial-40.md
Hecho: grupos 3–4, marcador sync staff, seed 40 con resultados
Opcional UI: terminar grupos → llaves → cuadro
Deferred: lucky loser; catálogo árbitros; retiro desde tablet
```
