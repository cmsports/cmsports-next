# Auditoría del módulo de torneos — 11 de octubre de 2026

La inscripción, los grupos, las llaves y el avance hasta el campeón completaron las simulaciones. Se encontraron fallos en recuperación ante interrupciones, reinscripción y conexión con Finanzas. Las correcciones están preparadas en el repositorio; **no están desplegadas ni se aplicó la migración en producción**.

El alcance solicitado es el módulo general utilizado por Asociación TDM Buin y Paine. Internos y externos comparten motor. Se conservan las diferencias existentes: club de procedencia por inscripción y separación preferente de clubes en externos; categoría, ranking interno y partido automático por tercer lugar en internos. La separación de clubes es una preferencia y no garantiza evitar todos los cruces cuando la distribución no lo permite.

## Hallazgos y correcciones

| Prioridad | Situación encontrada | Corrección preparada |
|---|---|---|
| Alta | Generar o regenerar grupos borraba la inscripción original antes de confirmar el reparto. Un INSERT fallido podía dejar el torneo sin participantes. | Conservar los participantes y su club en MESA hasta confirmar grupos y partidos. Las lecturas fallidas detienen el cierre. Reintentar recupera el reparto sin duplicar jugadores. |
| Alta | Retirar y reinscribir a una persona intentaba crear otro pago, chocaba con la restricción única y cancelaba la inscripción. | Reutilizar el historial; conservar pagos o exenciones y avisarlo. Un pendiente se puede cobrar al reinscribir. |
| Alta | Se podía cambiar estado o método de un pago ya enviado a Finanzas, desalineando el torneo y el ingreso. | Protección en la acción y filtro contra cambios concurrentes; migración 303 agrega protección en PostgreSQL. |
| Alta | El RPC de premios permitía otra salida de dinero con una clave de operación diferente, por ejemplo desde otra pestaña. | Migración 303 impide volver a registrar premios ya guardados. Repetir la misma clave sigue devolviendo el resultado anterior. |
| Alta | El traspaso contaba pagos y luego marcaba las filas mediante otra evaluación del filtro. Un cobro intermedio podía marcarse como enviado sin integrar el monto. | Migración 303 captura y bloquea los IDs elegibles; cuenta y marca exactamente ese conjunto. Lo nuevo queda para el siguiente traspaso. |
| Alta | La limpieza de externos trataba errores al leer otras inscripciones o resultados como listas vacías. | Ante cualquier lectura fallida, detener la limpieza y devolver un aviso, conservando fichas e inscripciones. |
| Media | El autocompletado de torneos externos excluía visitas existentes; ante homónimos, el servidor pedía elegir una ficha que la lista ocultaba. | Incluir visitas activas, identificarlas y permitir declarar el club aunque se seleccione una ficha existente. |

## Verificación realizada

- Suite completa: **143 archivos, 1851 pruebas aprobadas**.
- TypeScript: `npx tsc --noEmit`, aprobado.
- Compilación de producción: `npm run build`, aprobada con variables ficticias, como CI.
- ESLint: aprobado sin errores; reportó 817 advertencias.
- `git diff --check`: aprobado.
- Archivo nuevo de simulaciones: **37 pruebas**, incluidas 20 secuencias completas con las acciones reales y almacenamiento simulado: 7, 11, 12, 14, 20, 25, 29, 30, 64 y 128 participantes, tanto internos como externos.
- Las secuencias comprueban participantes únicos, conservación del club declarado, resultados de grupos, armado de llaves, BYE, propagación, una sola final, campeón, cierre e historial conservado. El tercer lugar interno queda incluido cuando corresponde.
- Dos torneos externos simultáneos comparten jugadores y completan sus cuadros y cierres sin perder participantes ni mezclar finales.
- Fallos de INSERT en grupos, miembros y partidos, y un fallo durante regeneración: se conservan los inscritos y el reintento termina correctamente.
- Reinscripciones con estados pendiente, pagado y exento; cobro por efectivo y transferencia; rechazo de inscripción repetida; lectura fallida de pagos; protección de pagos enviados.
- PostgreSQL 17 aislado: se cargaron las definiciones reales de los RPC del repositorio y se aplicó la migración 303 sobre tablas de prueba. Se verificaron ingresos por método, exclusión de pendientes y exentos, reintentos idempotentes, pagos nuevos, premios, gastos, fecha de Chile y rechazo de pagos contabilizados modificados.
- Prueba concurrente SQL: se detuvo temporalmente la creación del movimiento; otra conexión incorporó un nuevo pago. El nuevo pago quedó sin marcar y el monto del primero coincidió con lo traspasado.

Para repetir las pruebas SQL, levantar un contenedor PostgreSQL desechable llamado `cmsports-torneos-audit-pg` y ejecutar:

```sh
python scripts/test-torneos-finanzas-postgres.py cmsports-torneos-audit-pg
```

El script crea una base de nombre aleatorio dentro de ese contenedor y la elimina al terminar. No usa credenciales de Supabase. La identidad de prueba y las tablas son fixtures; no sustituye la verificación del RLS completo de producción.

## Comprobación de datos reales, solo lectura

Los cinco torneos confirmados pertenecen a Buin, siguen en inscripción y no tienen partidos generados ni resultados:

| Torneo | Inscritos | Cabezas | Pagados | Pendientes de inscritos |
|---|---:|---:|---:|---:|
| TC | 29 | 0 | 1 | 28 |
| SUB25 | 12 | 0 | 0 | 12 |
| 60 A 69 | 14 | 5 | 1 | 13 |
| 70+ | 7 | 3 | 0 | 7 |
| 30+ | 11 | 0 | 2 | 9 |

No se encontraron inscripciones duplicadas, fichas ausentes, inscritos sin fila de pago ni cabezas ajenas a la inscripción. En «60 A 69» hay además dos registros pendientes de personas que ya no están inscritas; no se han enviado a Finanzas. El diseño conserva ese historial al retirar jugadores. No se borraron ni se cobraron esas filas.

## Publicación y límites

1. Publicar los cambios de la aplicación después de revisar el diff.
2. Aplicar manualmente `supabase/migrations/303_torneos_integridad_financiera.sql`, según el procedimiento del repositorio. No elimina ni modifica datos históricos.
3. La migración ajusta la definición actual del RPC de traspaso, en lugar de reemplazarla entera por una copia. Si la definición no coincide con el patrón revisado, aborta toda la transacción; hay que revisar esa diferencia antes de aplicarla.
4. Hacer la comprobación visual final con sesión de administrador: inscripción, selección de visita, club declarado, resultados y panel de pagos. No se ejecutó una sesión de navegador autenticada en esta auditoría.

Las simulaciones de acciones sustituyen Supabase por almacenamiento en memoria; no validan latencia, realtime ni todos los triggers/RLS de producción. La prueba PostgreSQL valida los RPC financieros del repositorio, no demuestra que sean idénticos a los actualmente desplegados. La conservación en MESA permite recuperar las interrupciones probadas, pero el armado completo todavía consta de varias escrituras: no equivale a una única transacción ni certifica dos regeneraciones simultáneas del mismo torneo.

No se iniciaron los torneos reales, no se registraron resultados ficticios, no se movió dinero y no se cambiaron sus fechas.
