# Plan del módulo técnico de video y estadísticas por jugador

Estado: **MVP listo para piloto real (Spinhouse)**. Actualizado 2026-08-11.

Club piloto: Spinhouse (`2d8e7c36-0dd1-4b78-8f2f-8b5f3b7c9a41`).
No existe un sistema externo que debamos esperar o copiar.

## Avance actual (para continuar en otro chat)

### Hecho

- Módulo `tecnico` habilitado solo en Spinhouse; rutas `/tecnico/*` y nav.
- Migraciones 141–148 (base, club demo, RLS superadmin, jugadores demo, video original/análisis, objetivos, planes, 2.º jugador).
- Migración **150** aplicada: cuota + auditoría del asesor IA.
- Migración **151** aplicada: limpia externos de Spinhouse; quedan demos Matías/Valentina.
- Migración **152** (plan demo Spinhouse): plan activo “Base técnica inicial” + 4 ejercicios + asignación a Matías/Valentina — aplicar en SQL Editor si aún no está.
- Migración **153** (datos piloto 3 meses): sesiones publicadas + eventos + evaluaciones aleatorias con mejora gradual para Matías y Valentina — aplicar después de la 152.
- Enlace **Perfil técnico** desde la ficha admin del jugador (`/jugadores/[id]` → `/tecnico/jugadores/[id]`) si el club tiene módulo `tecnico`.
- Sesiones con video, tagging (golpe + zona 1–9 + resultado), **edición y borrado** de eventos, stats en vivo.
- Evaluación por sesión (borrador/publicar) + historial `/tecnico/jugadores/[id]`.
- Vista jugador: solo sesiones/evaluaciones **publicadas**.
- Planes + ejercicios + asignación de jugadores + **cumplimiento por ejercicio**.
- En detalle de plan: **editar y borrar** ejercicios (nombre, criterio, objetivo, etc.).
- Catálogo UI de objetivos: `/tecnico/objetivos`.
- Tipos de sesión: video libre / entrenamiento (plan+ejercicio) / competencia / evaluación.
- Cara a cara `/tecnico/comparar` con filtro de período/tipo, ratings, indicadores directos y % objetivos publicados.
- Historial con **gráficos** (evolución 6 meses, golpes), **mes actual vs anterior**, avance de objetivos.
- **Asesor IA** (`POST /api/tecnico/asesor`) con cuota (5/5min, 30/día) y auditoría `tecnico_asesor_consultas`.
- **Alertas de planes atrasados** en `/tecnico`, cards de jugador, listado de planes y detalle.
- Home técnico con KPIs, **actividad reciente** y videos pendientes de optimizar.
- Home técnico escalable: bloque **Necesitan atención**, lista compacta de jugadores con buscador, filtros (atención / alerta / sin revisión) y “Mostrar más” de a 20.
- **Marcador en vivo** (`/tecnico/marcador` + `/tecnico/marcador/[id]`): scoreboard tipo tablet (puntos, games bo3/bo5/bo7, timer, tarjetas, challenge). Migración **154** — aplicar en SQL Editor. Enlace desde home técnico.
- Pipeline FFmpeg: botón **Optimizar video** en la sesión (`POST /api/tecnico/procesar-video`) + fallback CLI.
- Subida con barra de progreso y redirección directa a la sesión creada.
- Badge de estado de procesamiento del video en la sesión.
- **Export CSV** de eventos y **Export PDF** de informe de sesión + progreso histórico del jugador.
- Indicadores ampliados: efectividad por golpe, mapa/bandas de zona, % en juego / puntos decisivos, racha de errores, consistencia, calidad de muestra, tipos de error (red/largo/fuera), fase (servicio/peloteo/punto decisivo), nota numérica 0–100 en objetivos, filtro entrenamiento vs partido en historial.

### Backlog (fuera del piloto inmediato)

1. Aplicar `154_tecnico_marcador_partidos.sql` (tablas `tecnico_partidos` / `tecnico_partido_eventos` + realtime).
2. Aplicar `152_plan_demo_spinhouse.sql` y luego `153_datos_piloto_3meses_spinhouse.sql` si aún no están.
3. Procesamiento de video en cloud/cola (hoy el botón Optimizar requiere FFmpeg local + `npm run dev`) — en propuesta comercial se asume optimización como capacidad del módulo.
4. ~~Propuesta comercial~~ → HTML/PDF en `docs/propuesta-comercial-spinhouse.*` (avance: `docs/propuesta-comercial-spinhouse-avance.md`). Pendiente: revisión dueños + contrato Spinhouse.

### Cómo probar

1. Login `spinhouse@cmsports.cl` → ficha admin de Matías → **Perfil técnico**
2. Pegar `152` y `153` en SQL Editor (en ese orden) si aún no hay plan/datos demo
3. Historial: gráficos 6 meses, mes vs mes, objetivos; Cara a cara Matías vs Valentina
4. Abrir plan “Base técnica inicial”: cumplimiento, editar/borrar ejercicio
5. Nueva sesión (opcional) → taggear, exportar CSV/PDF, optimizar video (FFmpeg local)
6. Asesor IA con `OPENAI_API_KEY` en `.env.local`
7. Gestionar catálogo en `/tecnico/objetivos`
8. Marcador: pegar `154` → home técnico → **Marcador en vivo** → crear partido Matías vs Valentina → sumar puntos en tablet

Archivo de continuidad: `docs/plan-modulo-tecnico-video-estadisticas.md`  
Manual de uso para admin/profesor: `docs/manual-modulo-tecnico-spinhouse.md`  
También en la app: `/tecnico/manual` (botón en home técnico e historial del jugador).

## 1. Objetivo

Crear en CMsports un módulo técnico independiente, conectado a la ficha administrativa
de cada jugador, para:

- subir y administrar videos de entrenamiento o competencia;
- revisar el video con controles de reproducción y línea de tiempo;
- registrar eventos técnicos con timestamp;
- parametrizar golpes, zonas de mesa, resultado y contexto;
- evaluar objetivos técnicos por jugador;
- comparar la evolución histórica;
- entregar información útil al profesor, administrador y eventualmente al jugador;
- exportar informes y datos sin mezclar el módulo técnico con finanzas, asistencia o ranking.

La fuente de verdad del módulo será la evaluación humana. Sensores o inteligencia
artificial podrán incorporarse después como fuentes auxiliares, siempre identificadas
como estimaciones y no como datos oficiales hasta ser validadas.

## 2. Lo que ya existe en CMsports y se reutiliza

- `jugadores`: identidad y ficha administrativa del deportista.
- `perfiles`: relación de usuarios con club, rol y jugador.
- roles actuales: `admin`, `profesor`, `jugador`, `superadmin`.
- módulos activables por club mediante `modulos_habilitados`.
- control de acceso en rutas y Server Actions.
- Storage privado y URLs firmadas para archivos sensibles.
- `useEnVivo` para refrescar datos sin recargar.
- `cachedFetch` para evitar datos obsoletos y consultas repetidas.
- dashboard del profesor, bloques, alumnos y feedback.
- infraestructura de migraciones manuales con portazo `_migracion_nueva`.

No se debe duplicar la identidad del jugador ni crear un segundo perfil administrativo.
El perfil técnico debe ser una vista/módulo relacionado al mismo `jugador_id`.

## 3. Modelo funcional propuesto

### 3.1 Perfil administrativo

Mantiene la información actual:

- datos personales y contacto;
- estado, matrícula y mensualidad;
- asistencia, bloques, torneos y ranking;
- documentos y credenciales;
- permisos de cuenta.

El administrador verá un acceso adicional: **Perfil técnico**.

### 3.2 Perfil técnico

Vista dedicada con:

1. resumen técnico actual;
2. videos y sesiones de análisis;
3. objetivos asignados;
4. evaluaciones;
5. estadísticas agregadas;
6. evolución por período;
7. observaciones y acuerdos de trabajo;
8. historial de cambios y quién evaluó.

### 3.3 Sesión de análisis

Una sesión representa una revisión concreta de un video o una evaluación presencial:

- jugador;
- club;
- título y tipo de sesión;
- fecha en hora de Chile;
- video opcional;
- profesor responsable;
- estado: borrador, en revisión, publicada o archivada;
- notas generales;
- eventos técnicos;
- evaluaciones y objetivos relacionados.

Esto permite trabajar incluso sin video, pero el video será el centro del nivel 3.

## 4. Captura de datos

### Nivel A: evaluación resumida

Formulario rápido posterior a una sesión:

- objetivo trabajado;
- logrado, parcialmente logrado o no logrado;
- escala configurable por el club;
- observación;
- próxima acción.

Debe tomar pocos minutos y ser usable desde celular.

### Nivel B: tagging de eventos en video

Reproductor con:

- play/pausa;
- salto de algunos segundos;
- velocidad de reproducción;
- línea de tiempo;
- marca visual por evento;
- teclado y botones grandes;
- selección de jugador;
- tipo de golpe;
- posición 1-9 de la mesa;
- resultado;
- fase del punto o ejercicio;
- mano, lado o contexto si el club lo habilita;
- edición y eliminación de eventos;
- exportación CSV.

El flujo mínimo debe ser: seleccionar parámetros, pulsar una zona o tecla,
guardar evento y continuar reproduciendo. No se debe obligar al profesor a escribir
texto por cada golpe.

### Nivel C: evaluación avanzada

Para cada evento o secuencia se podrán agregar:

- comentario;
- clip de inicio y fin;
- objetivo relacionado;
- etiqueta positiva o correctiva;
- prioridad;
- evidencia del video;
- revisión posterior por otro profesor.

## 5. Parametrización técnica

El club debe poder configurar catálogos, sin que los valores queden codificados
directamente en la interfaz:

- tipos de golpe: servicio, derecho, revés, bloqueo, remate, error, etc.;
- zonas de mesa 1-9;
- resultados: punto ganado, punto perdido, en juego, error forzado/no forzado;
- fases: servicio, resto, peloteo, transición, defensa, ataque;
- objetivos técnicos;
- dimensiones de evaluación;
- escalas y criterios de logro;
- niveles de jugador;
- etiquetas personalizadas.

La plataforma debe traer una plantilla inicial de tenis de mesa, pero cada club
podrá activar, renombrar o agregar parámetros. Los códigos internos deben ser
estables para no romper estadísticas históricas.

## 6. Estadísticas y reportes

Primera versión:

- total de eventos por tipo de golpe;
- distribución por zona;
- errores por tipo;
- puntos ganados/perdidos;
- efectividad por golpe;
- comparación entre períodos;
- objetivos logrados y pendientes;
- cantidad de sesiones y minutos analizados;
- evolución por dimensión técnica.

Estas cifras son indicadores descriptivos, no una medición completa de progreso.
Por ejemplo, la efectividad actual se calcula como:

`puntos ganados / (puntos ganados + puntos perdidos)`

Los eventos marcados como `en_juego` no entran en ese porcentaje. Esto sirve para
validar la captura, pero no permite afirmar por sí solo que un jugador mejoró.

### Medición profesional del progreso

Cada sesión debe registrar contexto y objetivos:

- ejercicio o situación: servicio, resto, peloteo, partido, multibola, etc.;
- nivel de dificultad;
- rival o compañero, cuando corresponda;
- duración y cantidad de intentos;
- objetivo técnico trabajado;
- profesor responsable;
- si el video está completo o es una muestra parcial.

### Planes de entrenamiento y tipos de sesión

El módulo tendrá dos niveles:

**Plan de entrenamiento:** plantilla reutilizable creada por el profesor. Define
objetivo general, nivel, duración, ejercicios ordenados, objetivos técnicos,
repeticiones, tiempos, dificultad y criterios de éxito.

**Sesión ejecutada:** instancia concreta realizada por un jugador o grupo. Puede
crearse desde un plan o de forma independiente y conserva lo que realmente ocurrió:
asistencia, duración, observaciones, video, eventos y evaluación.

Tipos de sesión:

- **Entrenamiento planificado:** vinculado a un plan y sus ejercicios.
- **Entrenamiento libre:** no requiere plan, pero permite objetivos y tagging.
- **Análisis de partido:** rival, torneo, fecha, marcador, sets, resultado y video.
- **Análisis de ejercicio:** una tarea específica con intentos y criterio medible.
- **Evaluación técnica:** revisión formal del progreso del jugador.

Un partido y un entrenamiento no deben compartir automáticamente la misma métrica.
En un partido interesa, por ejemplo, eficacia de servicio, resto, errores no
forzados y puntos por fase. En un entrenamiento interesa cumplimiento del ejercicio,
repeticiones logradas, calidad técnica y avance respecto del criterio del plan.

La creación de una sesión debe ofrecer:

1. elegir jugador o grupo;
2. elegir tipo de sesión;
3. elegir un plan o ejercicio, si corresponde;
4. adjuntar uno o más videos;
5. definir objetivos;
6. analizar y etiquetar;
7. cerrar la sesión con evaluación;
8. publicar el informe según permisos.

El administrador podrá consultar el progreso desde el jugador, el plan, el período
o el tipo de sesión. El profesor verá además el detalle operativo y podrá duplicar
un plan para reutilizarlo.

Los reportes deben comparar sesiones equivalentes, no mezclar un ejercicio de
entrenamiento con un partido. Las métricas principales serán:

- **volumen:** cantidad de intentos y eventos válidos;
- **éxito:** acciones logradas / intentos evaluables;
- **error:** errores / intentos evaluables;
- **efectividad por golpe:** resultado favorable por tipo de golpe;
- **distribución:** zonas, golpes y fases utilizadas;
- **consistencia:** variación entre bloques o repeticiones comparables;
- **objetivo:** estado y puntaje de la dimensión evaluada;
- **progreso:** cambio respecto de la línea base y del período anterior.

No se debe mostrar una mejora con una muestra insuficiente. Todo porcentaje debe
mostrar cantidad de eventos, período, contexto y fuente. Una sesión con cinco
golpes no debe pesar igual que una con cien.

### Reportes que verá cada rol

**Profesor:** sesión detallada, timeline, eventos, clips, objetivos, comentarios
y acciones para la próxima práctica.

**Administrador:** resumen por jugador, cumplimiento de sesiones, evolución por
período, objetivos pendientes, comparaciones del plantel y exportación PDF/CSV.
No necesita editar cada evento para consultar el progreso.

**Jugador:** solo evaluaciones publicadas, objetivos compartidos, avances y
comentarios autorizados.

El flujo recomendado es de dos pasadas: tagging rápido durante la revisión y
evaluación detallada después. Así la captura sigue siendo rápida, pero el informe
final puede ser minucioso y profesional.

Reglas importantes:

- diferenciar datos observados de datos calculados;
- guardar la versión de la parametrización usada en cada evaluación;
- no modificar silenciosamente una evaluación publicada;
- conservar autor, fecha y última modificación;
- mostrar tamaño de muestra para evitar conclusiones con pocos eventos;
- no presentar porcentajes como rendimiento oficial si la sesión no tiene suficiente
  volumen o fue marcada como incompleta.

## 7. Permisos

### Administrador

- activar/desactivar el módulo;
- configurar catálogos y escalas;
- ver todos los jugadores del club;
- ver, editar, publicar y archivar análisis;
- administrar almacenamiento y límites;
- exportar informes;
- definir qué puede ver el jugador.

### Profesor

- ver jugadores y grupos autorizados;
- subir videos;
- crear y editar sesiones propias;
- etiquetar eventos;
- evaluar objetivos;
- publicar o enviar a revisión según configuración del club.

### Jugador

- ver solo su perfil técnico;
- ver evaluaciones y videos publicados;
- ver comentarios y objetivos compartidos;
- no editar evaluaciones del profesor;
- descargar material solo si el club lo permite.

### Superadmin

- soporte y administración de plataforma;
- no debe recibir automáticamente permiso de escritura dentro de un club.

Las reglas deben implementarse en RLS y Server Actions, no solo ocultando botones.
Toda consulta debe filtrar por `club_id`.

## 8. Datos y Storage propuestos

Tablas iniciales:

- `tecnico_configuraciones`
- `tecnico_catalogos`
- `tecnico_catalogo_items`
- `tecnico_objetivos`
- `tecnico_jugador_objetivos`
- `tecnico_sesiones`
- `tecnico_videos`
- `tecnico_eventos`
- `tecnico_evaluaciones`
- `tecnico_evaluacion_items`
- `tecnico_comentarios`

Campos críticos:

- todos los registros con `club_id`;
- relaciones a `jugador_id`, `profesor_id` y, cuando corresponda, `sesion_id`;
- timestamps del video en milisegundos o décimas de segundo;
- fechas de negocio en hora de Chile;
- estado y versionado;
- `creado_por`, `actualizado_por`, `creado_en`, `actualizado_en`.

Los videos no deben guardarse en la base de datos. Se debe almacenar ruta, nombre,
mime, tamaño, duración, hash opcional y metadatos en un bucket privado separado
para el módulo técnico. Las reproducciones deben usar URLs firmadas con vencimiento.

Para videos largos de iPhone se conservarán dos archivos:

- original privado, incluso si viene en 4K;
- copia de análisis optimizada, normalmente MP4/H.264 en 720p.

El reproductor usará la copia optimizada cuando exista y el original mientras el
procesamiento esté pendiente. El original nunca se reemplaza. La conversión debe
ejecutarse en un worker FFmpeg separado o servicio de video; no se debe intentar
transcodificar 4K de 15–20 minutos dentro del navegador.

Antes de subir videos hay que definir límites de tamaño, formatos, retención,
eliminación, respaldo, costo de Storage y consentimiento de los deportistas,
especialmente si son menores de edad.

## 9. Arquitectura de pantallas

Rutas sugeridas:

- `/jugadores/[id]/tecnico`: resumen técnico del jugador;
- `/jugadores/[id]/tecnico/sesiones`: historial;
- `/jugadores/[id]/tecnico/sesiones/nueva`: crear sesión;
- `/tecnico/sesiones/[id]`: reproductor y tagging;
- `/tecnico/catalogos`: configuración del club;
- `/tecnico/objetivos`: biblioteca y asignaciones;
- `/tecnico/reportes`: estadísticas y exportaciones.

El acceso principal debe estar en la ficha del jugador y en el dashboard del profesor.
El módulo debe poder activarse como `tecnico` en el catálogo de módulos existente.

## 10. Implementación por fases

### Fase 0 — definición interna del producto

- convertir el diagnóstico de Alarcón y la conversación compartida en requisitos;
- separar funciones obligatorias, deseables y futuras;
- definir quién usa cada pantalla y qué datos son privados;
- validar nomenclatura técnica con un profesor de tenis de mesa;
- decidir límites de video y política de consentimiento;
- construir una taxonomía inicial simple, ampliable y editable por club;
- definir un conjunto pequeño de casos de uso reales para probar el módulo.

Salida: especificación funcional interna, matriz de permisos y alcance del MVP.

### Fase 1 — base del módulo

- migración protegida;
- catálogo `tecnico`;
- tablas, índices, RLS y auditoría;
- acciones de servidor;
- integración con ficha del jugador;
- configuración inicial de catálogos;
- pruebas de aislamiento entre clubes y roles.

Salida: módulo vacío pero seguro, con configuración y perfil técnico.

### Fase 2 — sesiones y videos

- bucket privado;
- subida con validación;
- URLs firmadas;
- metadatos de video;
- crear, editar, archivar y publicar sesión;
- listado de videos por jugador;
- límites y mensajes de error claros.

Salida: profesor puede cargar y revisar un video asociado a un jugador.

### Fase 3 — tagging manual sobre video

- reproductor;
- timeline;
- eventos con timestamp;
- grilla 1-9;
- teclado;
- edición y borrado;
- guardado incremental;
- CSV;
- estadísticas básicas.

Salida: reemplazo realista del prototipo de la captura, persistente y multiusuario.

### Fase 4 — evaluación parametrizada

- objetivos y dimensiones;
- escalas configurables;
- evaluación por sesión;
- comentarios;
- historial;
- publicación al jugador;
- reportes de evolución.

Salida: perfil técnico completo.

### Fase 5 — robustez y producto comercial

- pruebas con profesores;
- medición de tiempo de tagging;
- rendimiento con videos grandes;
- accesibilidad móvil;
- auditoría de permisos;
- exportación PDF;
- límites por plan;
- documentación y soporte.

Salida: versión vendible.

## 11. Sensores e inteligencia artificial

No deben ser requisito de la primera versión.

Orden viable:

1. tagging humano y dataset propio;
2. piloto de sensor IMU en raqueta con sincronización al video;
3. comparación contra etiquetas humanas;
4. clasificación asistida, siempre editable;
5. automatización solo si la precisión y el ahorro de tiempo justifican el costo.

El sensor no identifica por sí solo “derecho” o “bloqueo”. Produce aceleración y
rotación; un modelo aprende las firmas usando ejemplos etiquetados. Por eso primero
se necesita una base de datos real, con cientos de ejemplos por golpe, jugadores,
estilos y condiciones. La IA debe sugerir etiquetas, no publicar estadísticas sin
validación humana.

## 12. Criterios de éxito

- un profesor puede subir y abrir un video sin ayuda;
- una sesión básica se crea en menos de dos minutos;
- registrar un evento toma uno o dos toques;
- el sistema no mezcla jugadores ni clubes;
- los datos se conservan aunque se edite un catálogo;
- el profesor puede corregir errores;
- el jugador solo ve contenido publicado;
- las estadísticas muestran la muestra y el período;
- el módulo no afecta el funcionamiento administrativo existente;
- cinco profesores piloto lo usan durante varias semanas.

## 13. Propuesta comercial: preparar después de validar el producto

La propuesta no debe fijar precio antes de cerrar:

- cantidad de clubes y jugadores;
- almacenamiento incluido;
- usuarios administrativos y profesores;
- retención de videos;
- soporte;
- personalización de catálogos;
- reportes y exportaciones;
- capacitación;
- migración desde Spinhouse;
- SLA y respaldo;
- funciones futuras de sensores o IA.

La estructura comercial recomendada será:

1. implementación inicial;
2. suscripción mensual por club;
3. límites de almacenamiento y usuarios;
4. módulos adicionales;
5. soporte y capacitación;
6. servicios de personalización;
7. condiciones de uso, privacidad, propiedad de datos y cancelación.

No se deben prometer sensores, reconocimiento automático ni precisión de IA dentro
del precio base hasta contar con un piloto validado.

## 14. Próximo paso real

El circuito vertical ya está armado en Spinhouse:

`jugador → video → sesión → evento técnico → evaluación → estadística → evolución`

Lo que falta para cerrar el MVP usable en cancha es robustez operativa (procesar
video sin script, editar eventos, cumplimiento de plan, exportaciones) y validar
el flujo con profesores reales. La propuesta comercial se redacta después.
