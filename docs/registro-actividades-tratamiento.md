# Registro de actividades de tratamiento

Borrador generado a partir del esquema de la base al 2026-08-20. Es el
inventario que exige la ley de protección de datos personales (vigente desde
el 1 de diciembre de 2026): qué dato se guarda, con qué fin, quién lo puede
ver y cuánto dura. **No reemplaza la revisión de alguien con título legal** —
la columna "base legal" en particular necesita esa revisión antes de
considerarse definitiva.

Alcance: Asociación TDM Buin y Paine (`club_id =
ec1ef215-0ab5-43c6-abf4-fc5578b17bcc`). Hay otros clubes en la misma base;
este documento describe el sistema, no un club en particular.

Este documento se desactualiza solo. Cada vez que una migración agregue una
tabla o columna con datos personales nuevos, hay que sumarla acá en la misma
tanda de trabajo — si no, deja de ser confiable.

---

## 1. Identidad y ficha del jugador

| | |
|---|---|
| **Tablas** | `jugadores`, `perfiles` |
| **Datos** | nombre completo, RUT, fecha de nacimiento, teléfono, dirección, comuna, foto, talla de polera/short, nombre y teléfono de contacto de emergencia |
| **Finalidad** | Identificar al jugador, gestionar su inscripción y su credencial de acceso al sistema |
| **Quién accede** | Admin y profesor del mismo club (RLS por `club_id`); el propio jugador ve su ficha |
| **Origen** | Formulario de inscripción (`crear_solicitud_jugador`) o carga directa del admin |
| **Retención** | Mientras el jugador esté activo en el club. Al eliminarlo, `eliminar_jugador_atomico` borra la ficha pero conserva los movimientos financieros con `jugador_id = NULL` (ver sección 4) |
| **Base legal (a confirmar)** | Ejecución de la relación con el club / consentimiento del apoderado si es menor |

## 2. Datos de salud del jugador

| | |
|---|---|
| **Tabla** | `jugadores.indicaciones_medicas` |
| **Datos** | Texto libre con condiciones médicas relevantes para entrenar |
| **Finalidad** | Seguridad del jugador durante la actividad física |
| **Quién accede** | Admin y profesor del mismo club |
| **Retención** | Misma que la ficha del jugador |
| **Base legal (a confirmar)** | **Dato sensible — requiere consentimiento explícito por separado.** Hoy no existe ese consentimiento registrado en ninguna tabla. Es el hallazgo más importante de este documento. |

## 3. Credenciales de acceso

| | |
|---|---|
| **Tabla** | `credencial_visible` |
| **Datos** | Usuario de login y **contraseña en texto plano** |
| **Finalidad** | Que el admin pueda imprimir o comunicar el acceso inicial a cada jugador |
| **Quién accede** | Solo admin/superadmin del mismo club (RLS). Vía pública: `consultar_credencial_por_rut`, limitada a una consulta exitosa por credencial desde la migración 205 |
| **Retención** | Mientras la cuenta exista. Se sobrescribe en cada reseteo de clave |
| **Base legal (a confirmar)** | Necesidad operativa del servicio. El riesgo asumido de guardar clave en texto plano está documentado en la migración 113 |

## 4. Movimientos financieros

| | |
|---|---|
| **Tablas** | `movimientos`, `mensualidades`, `clases_extraordinarias`, `liga_abonos`, `liga_jugador_pagos` |
| **Datos** | Monto, fecha, método de pago, vínculo al jugador (cuando corresponde) |
| **Finalidad** | Contabilidad del club |
| **Quién accede** | Admin del club; superadmin de la plataforma |
| **Retención** | **Indefinida por diseño** — es contabilidad. Al eliminar un jugador, `eliminar_jugador_atomico` deja `jugador_id = NULL` en vez de borrar la fila: el monto se conserva pero deja de estar vinculado a una persona identificable. Esto es, de hecho, el mecanismo de disociación de datos que la ley busca — ya existe y no hay que tocarlo |
| **Base legal (a confirmar)** | Obligación contable / interés legítimo del club |

## 5. Asistencia

| | |
|---|---|
| **Tablas** | `asistencia`, `auditoria_asistencia` |
| **Datos** | Jugador, fecha, hora, estado (presente/ausente), quién hizo la corrección manual y por qué |
| **Finalidad** | Control del cupo del plan y seguimiento pedagógico |
| **Quién accede** | Admin y profesor del club; el jugador ve su propia asistencia |
| **Retención** | Indefinida hoy. No hay política de purga |
| **Base legal (a confirmar)** | Ejecución de la relación con el club |

## 6. Video y evaluación técnica

| | |
|---|---|
| **Tablas** | `tecnico_videos`, `tecnico_evaluaciones`, `tecnico_evaluacion_items`, `tecnico_sesiones`, `tecnico_eventos` |
| **Datos** | Video del jugador entrenando o compitiendo, evaluaciones de su desempeño técnico |
| **Finalidad** | Seguimiento técnico-deportivo (módulo con IA asociada, ver `consumir_cuota_asesor_tecnico_ia`) |
| **Quién accede** | Profesor y admin del club |
| **Retención** | Sin política definida |
| **Base legal (a confirmar)** | Consentimiento — un video de una persona (mayoritariamente menor de edad) es un dato con tratamiento más delicado que una ficha de texto. Merece revisión legal específica |

## 7. Solicitudes de inscripción

| | |
|---|---|
| **Tabla** | `solicitudes_jugador` |
| **Datos** | Nombre, RUT, email, teléfono de quien pide entrar al club, antes de ser aceptado |
| **Finalidad** | Gestionar el ingreso de nuevos jugadores |
| **Quién accede** | Admin del club destino |
| **Retención** | Sin política definida — quedan aunque la solicitud ya se haya resuelto |
| **Base legal (a confirmar)** | Consentimiento del solicitante (lo entrega él mismo al pedir el ingreso) |

## 8. Torneos — vista pública

| | |
|---|---|
| **Función** | `torneo_publico(codigo)`, `oficial_campeonato_publico(codigo)` |
| **Datos** | Nombre de los jugadores inscritos, resultados de partidos |
| **Finalidad** | Página de resultados en vivo, sin necesidad de login, para que cualquiera con el código del torneo siga los resultados |
| **Quién accede** | **Público sin autenticar** — es el diseño intencional de la función |
| **Retención** | Mientras el torneo exista en el sistema |
| **Base legal (a confirmar)** | Interés legítimo / naturaleza pública de una competencia deportiva. Vale la pena confirmar que el nombre completo (y no solo el de pila) es necesario para este fin |

## 9. Límites de tasa (rate limiting)

| | |
|---|---|
| **Tabla** | detrás de `_consumir_limite_publico` |
| **Datos** | El RUT consultado queda como parte de la clave de conteo (ej. `'credencial-rut:' \|\| club_id \|\| ':' \|\| rut`) |
| **Finalidad** | Frenar abuso de las funciones públicas (`consultar_credencial_por_rut`, `registrar_asistencia_rut`) |
| **Quién accede** | Nadie directamente; es un contador interno |
| **Retención** | Ventanas cortas (60–600 segundos), se autolimpia por diseño |
| **Base legal (a confirmar)** | Interés legítimo (seguridad del servicio). Bajo riesgo por ser de vida muy corta |

## 10. Respaldos (`_respaldo_*`)

| | |
|---|---|
| **Finalidad** | Copia de seguridad puntual antes de una migración destructiva |
| **Quién accede** | Nadie por la API (RLS deny-all desde la 197) |
| **Retención** | **Con política desde la migración 207**: 90 días salvo los tres respaldos de la 089, que se conservan indefinidamente como evidencia del incidente de julio |
| **Base legal (a confirmar)** | Continuidad operativa / obligación de seguridad de la información |

---

## Lo que este documento deja pendiente

No es un reemplazo de:
- **Confirmación legal** de cada "base legal" marcada como "a confirmar" — ninguna de esas frases es una afirmación jurídica, son mi lectura de ingeniería de para qué se usa el dato.
- **El mecanismo de consentimiento** para datos de salud y video (secciones 2 y 6) — hoy no existe, este documento solo señala dónde falta.
- **El canal de derechos ARCOP** — este documento identifica qué datos existen para responder una solicitud, pero no crea el canal para recibirla.
