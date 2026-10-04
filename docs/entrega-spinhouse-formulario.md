# Entrega del formulario Spinhouse

Alcance: exclusivamente Spinhouse. Las migraciones habilitan los módulos nuevos
solo para ese club. Los demás mantienen sus módulos, reglas y valores por defecto.
El fallback de módulos de la interfaz excluye las funciones nuevas si no hay
confirmación de habilitación.

## Funciones entregadas

- Finanzas: tarifas por entrenador/tipo/rol/vigencia, horas confirmadas, márgenes
  por línea y bloque, liquidación mensual y proyección de cobros.
- Morosidad y retención: avisos de deuda, tres faltas consecutivas, bloqueo de
  origen automático y estado de inactividad separado del bloqueo manual.
  Padrón, indicadores y nuevas cuotas excluyen los inactivos de Spinhouse.
- Calendario: clases propias, partidos de liga con horario, actividades especiales,
  torneos externos con nómina y agenda pública sin datos de participantes.
- Ficha paralímpica: clases 1–11, accesibilidad y consentimiento de salud privado,
  con firma del apoderado para menores.
- Exportación de partidos: CSV y JSON para torneos, liga y equipos, con sets y
  parciales disponibles; autorización del staff del mismo club.
- Altas/bajas: historial de altas, retiro declarado, inactividad y reingreso.
  Un cambio de bloque o bloqueo por deuda no cuenta como baja del club.

## Puesta en marcha de la base

GitHub/Vercel despliegan el código; **no ejecutan estas migraciones de Supabase**.
Las nuevas pantallas permanecen deshabilitadas hasta aplicar el SQL de Spinhouse.
Aplicar los siguientes archivos en el SQL Editor, en este orden, una sola vez:

1. `293_finanzas_spinhouse.sql`
2. `294_retencion_automatica_spinhouse.sql`
3. `295_calendario_integrado_spinhouse.sql`
4. `296_ficha_paralimpica_spinhouse.sql`
5. `297_exportacion_partidos_spinhouse.sql`
6. `298_spinhouse_indicador_permanencia.sql`

Los archivos están en `supabase/migrations/`. Cada uno conserva sus guardas de
repetición y de destinatario. No ejecutar migraciones antiguas para completar
supuestos huecos de numeración. Producción tiene un registro 287 que no figura
en este checkout; esta entrega usa 293–298 para evitar esa colisión.

Comprobar el registro y los módulos sin consultar información de otros clubes:

```sql
SELECT nombre, aplicada_en
FROM public._migraciones_aplicadas
WHERE nombre IN (
  '293_finanzas_spinhouse', '294_retencion_automatica_spinhouse',
  '295_calendario_integrado_spinhouse', '296_ficha_paralimpica_spinhouse',
  '297_exportacion_partidos_spinhouse', '298_spinhouse_indicador_permanencia'
) ORDER BY nombre;

SELECT nombre, modulos_habilitados
FROM public.clubes WHERE nombre = 'Spinhouse';
```

## Configuración operativa

En Finanzas → Márgenes y liquidaciones, cargar las tarifas reales. Las marcas
nuevas congelan minutos; las históricas requieren confirmar duración y tipo de
clase. Asignar los ingresos al bloque correspondiente antes de interpretar sus
márgenes. La liquidación cerrada conserva los costos y registra su gasto de forma
atómica; repetirla no duplica el pago. La proyección requiere cuotas del mes
siguiente y un historial de cobros; no adivina tarifas ni gastos futuros.

Retención comienza en revisión: aviso a los 15 días, bloqueo al superar 30 días,
tres faltas para alerta y 60 días sin asistencia presente ni pago para inactividad.
El panel permite generar avisos y revisar candidatos. Los cambios automáticos de
estado requieren 30 días de revisión y activación expresa desde ese panel;
se pueden pausar. El motor no desbloquea bloqueos asumidos manualmente.

La migración 294 programa la tarea diaria si `pg_cron` está disponible. Si no,
muestra la instrucción para habilitarlo y programarla; el administrador puede
ejecutar la revisión desde el panel. Revisar `cron.job` para confirmar la tarea
`retencion-spinhouse` y sus ejecuciones antes de dar por activo el procesamiento.

La agenda pública muestra actividades marcadas como públicas y jornadas generales
de liga. No incluye nóminas, contactos ni descripciones privadas. No publicar
datos de jugadores en los títulos de actividades públicas.

Los parciales de torneos anteriores que no fueron guardados permanecen nulos.
No se reconstruyen resultados, altas ni horas históricas a partir de suposiciones.

## Verificación

Verificado en esta entrega: 1.785 pruebas en 140 archivos, TypeScript sin errores,
ESLint sin errores y compilación de producción aprobada. Las seis migraciones
y cinco suites SQL locales aprobaron; el agente de revisión independiente dio
el pase después de corregir los hallazgos.

Para repetir los controles: `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build`.
Las pruebas SQL de `scripts/tests/` son para una base local `spinhouse_check`:
usan datos sintéticos y rollback. No se ejecutan en producción. La comprobación
local usa PostgreSQL 17 y la estructura de tablas obtenida de metadata, sin copiar
datos personales. No sustituye aplicar las migraciones y comprobar los permisos
reales y la programación de `pg_cron` en Supabase.
