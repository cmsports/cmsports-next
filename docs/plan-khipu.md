# Plan maestro — Khipu en CMSports

Documento de estudio y plan de implementación. Escrito sobre la estructura real
del código, no sobre supuestos: cada afirmación acá se verificó leyendo el
archivo o la migración que se cita.

**Objetivo:** que un jugador pueda pagar por Khipu **todo lo que debe** —
mensualidad del mes, meses atrasados, meses por adelantado, clases
extraordinarias, matrícula, inscripción a liga e inscripción a torneo—, sin
quitarle al admin la posibilidad de marcar un pago a mano ni de eximir a un
becado.

---

## 1. Los cinco principios que ordenan todo el diseño

**1. La lógica de plata existe una sola vez.** Hoy cada cobro está resuelto en
un RPC atómico con lock, idempotencia y auditoría. Khipu no reimplementa nada:
entra por otro camino a la misma lógica. Si mañana se corrige un cálculo, se
corrige en un solo lugar.

**2. El monto nunca viene del cliente.** El navegador dice *qué* quiere pagar
(ids), nunca *cuánto*. El monto se lee de la base en el servidor. Si el monto
viajara desde el navegador, cualquiera pagaría $1 una mensualidad de $30.000.

**3. El club nunca viene de afuera.** Un webhook es un mensaje de un tercero. El
`club_id` se deriva de una fila que la propia app creó cuando el jugador tenía
sesión, jamás de lo que diga la notificación.

**4. Todo o nada.** Un carrito con mensualidad + inscripción es una sola
transacción. No puede quedar la mensualidad pagada y la inscripción debiendo.

**5. Nada invisible.** Si un webhook se pierde, el sistema tiene que darse
cuenta solo. Plata que entró y el sistema no registró es peor que un error
visible.

---

## 2. El obstáculo central

Todos los RPC de cobro empiezan igual
(`supabase/migrations/039_finanzas_atomicas.sql:69`):

```sql
SELECT c.club_id, c.user_id, c.nombre
FROM public._finanzas_admin_contexto() c;
```

Y `_finanzas_admin_contexto()` exige:

```sql
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
... WHERE p.id = auth.uid() AND p.rol = 'admin'
```

**Un webhook de Khipu llega sin cookie de sesión.** No hay `auth.uid()`, así que
la función aborta antes de hacer nada. Este es el problema real a resolver, y
todo lo demás es plomería conocida.

### Las tres formas de resolverlo, y por qué solo una sirve

| Opción | Veredicto |
|---|---|
| Copiar el RPC cambiando el contexto | **No.** Dos implementaciones de la lógica de plata; un arreglo futuro se aplicaría a una y no a la otra. |
| Agregar un parámetro `p_es_khipu` al RPC actual | **No.** Toca código de pago que hoy funciona, con riesgo sobre lo que más duele. |
| **Extraer el núcleo** | **Sí.** El núcleo queda una sola vez; los dos caminos le entran con su propio contexto. |

```
_registrar_pago_mensualidad_core(p_club_id, p_actor_id, p_actor_nombre, p_origen, ...)
        ↑                                              ↑
   admin: _finanzas_admin_contexto()          khipu: contexto desde khipu_pagos
```

`registrar_pago_mensualidad_atomico` queda como un envoltorio de cinco líneas.
**Su firma, su retorno y su conducta no cambian**: los tests actuales deben
pasar sin tocarlos. Si alguno cambia, el refactor está mal hecho.

---

## 3. Los cinco conceptos cobrables

No todos funcionan igual. Dos rompen el molde y necesitan decisión antes de
codearse.

| Concepto | Tabla | RPC | Patrón |
|---|---|---|---|
| Mensualidad | `mensualidades` | `registrar_pago_mensualidad_atomico` | Pagar = ingreso inmediato |
| Clases extra | `clases_extraordinarias` | `registrar_pago_clases_extra_atomico` | Lote de ids, un solo jugador |
| Matrícula | — | `registrar_pago_matricula_atomico` | Misma familia |
| **Liga** | — | `registrar_pago_liga_atomico` | **Abonos parciales** (`monto_total` + `monto_abono`) |
| **Torneo** | `torneo_pagos` | `subir_pagos_torneo_a_finanzas_atomico` | **Dos pasos separados** |

**Torneo** (`src/app/actions/torneos.ts:1674` y `:1728`): marcar pagado y
registrar el ingreso son dos momentos distintos, a propósito — el admin revisa
antes de que la plata entre al libro.

**Liga** (`039_finanzas_atomicas.sql:143`): acepta abonos, valida que el abono no
supere el total. Un jugador puede deber $30.000 y pagar $10.000 hoy.

---

## 4. El vocabulario de estados, unificado

Hoy cada módulo tiene el suyo. `exento` existe **solo en torneos**, agregado por
la migración 192. Para mensualidades no hay equivalente, y eso deja un agujero
real.

| Estado | Significado | ¿Se debe? | ¿Genera ingreso? |
|---|---|---|---|
| `pendiente` | Emitido, sin pagar | Sí | — |
| `atrasado` | Venció sin pagar | Sí | — |
| `pagado` | Entró plata | No | Sí |
| `exento` | No se cobra: beca, condonación, retiro | No | **No** |

### Por qué `exento` importa aunque Khipu nunca se implemente

El RPC rechaza monto cero
(`supabase/migrations/116_timezone_pagos_y_vigencia.sql:56`):

```sql
IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero';
```

Entonces un becado hoy queda en uno de dos lugares malos:

- **Deudor eterno** — nunca pasa a `pagado`, contamina la tasa de morosidad del
  dashboard y aparece siempre en la lista de deudores.
- **Con un pago inventado** — se registra plata que nunca entró y Finanzas
  miente.

`exento` resuelve las dos: sale de los deudores **sin generar un movimiento**.

---

## 5. Reglas de negocio confirmadas contra el código

**Cambio de cuota → aplica al mes siguiente.** Ya funciona así.
`montoEsperado()` (`src/lib/domain/mensualidades.ts:21`) prioriza el monto ya
emitido del mes por sobre la cuota del jugador. Cambiar `jugadores.mensualidad`
no altera meses ya emitidos. **No hay nada que hacer.**

**Pagar meses por adelantado.** El RPC solo valida `mes BETWEEN 1 AND 12` y
`anio BETWEEN 2000 AND 2100`; no compara contra la fecha actual, y si la fila no
existe la crea. El cron de emisión usa `ON CONFLICT DO NOTHING`
(`107_emitir_mensualidades_automatico.sql:49`), así que **no pisa un mes ya
pagado por adelantado**. La base lo aguanta hoy.

**Reversa.** `revertir_pago_mensualidad_atomico` ya reabre la cuota. Falta que
la pantalla avise que **la devolución del dinero es manual desde el panel de
Khipu**, y que quede registrado que se reversó un pago electrónico y no uno en
efectivo.

**Jugador eliminado o bloqueado.** Las cuotas dejan de correr y se reasignan al
reactivar. Interactúa con dos reglas del proyecto: borrar un jugador deja sus
movimientos con `jugador_id = NULL` (migración 127) y la plata de un mes cerrado
no cambia. Un `khipu_pagos` huérfano tiene que resistir eso, y hay que impedir
generar un cobro para alguien bloqueado.

---

## 6. Plan de implementación

### Fase A — Fundaciones (no dependen de Khipu, valen solas)

**A1 · Estado `exento` para mensualidades y clases extra**
Migración con el portazo `_migracion_nueva`, usando la 192 como molde.
El becado sale de la tasa de morosidad. Botón en `MensualidadesPanel` con
confirmación. **No genera `movimiento`.** Reversible.
*Es el único paso de todo el plan que no depende de la cuenta de Khipu.*

**A2 · Extraer los núcleos**
`_registrar_pago_mensualidad_core`, `_registrar_pago_clases_extra_core`,
`_registrar_pago_matricula_core`, `_registrar_pago_liga_core`.
Los RPC públicos quedan como envoltorios. `REVOKE EXECUTE` de los `_core` a
`PUBLIC, anon, authenticated`, igual que `_finanzas_admin_contexto` hoy.
**Criterio de aceptación: los tests actuales pasan sin modificarse.**

**A3 · Vista consolidada de deuda**
Hoy **ningún lugar del sistema muestra todo lo que debe un jugador**.
`cuentaDelJugador` (`src/lib/domain/estadoCuenta.ts:63`) suma mensualidad +
clases extra, pero no matrícula, liga ni torneo.
Función de dominio que junte las cinco fuentes. Sirve para el carrito de Khipu,
para la pantalla del jugador y para el panel del admin.

### Fase B — Khipu, núcleo

**B0 · Cuenta de desarrollo**
Registro en khipu.com → activar modo desarrollador → crear cuenta de cobro de
desarrollo. Bancos simulados, sin plata real. **Bloquea todo lo demás y es lo
único que depende de un trámite externo.**

**B1 · Credenciales por club**
Tabla `club_khipu`: `club_id` PK, `receiver_id`, `secret`, `modo (dev|prod)`,
`activo`. RLS: solo el admin de ese club. Pantalla en Configuración.

**B2 · El método `khipu`**
En los `_core`: ampliar a `IN ('efectivo','transferencia','khipu')`.
En `src/lib/validation/finanzas.ts`: **`METODOS_PAGO` NO se toca** — es lo que
el admin elige, y agregarle `khipu` permitiría marcar a mano un pago
electrónico que nunca existió. Se agrega aparte:

```ts
export const METODOS_PAGO_SISTEMA = [...METODOS_PAGO, 'khipu'] as const
```

Revisar cada pantalla que pinta el método: Finanzas, estado de cuenta,
`MensualidadesPanel`, export Excel y PDF.

**B3 · Tablas de Khipu**

```
khipu_pagos       id, club_id, jugador_id, khipu_payment_id UNIQUE,
                  monto_total, estado(creado|pagado|fallido|expirado),
                  creado_en, confirmado_en
khipu_pago_items  pago_id, tipo(mensualidad|clase_extra|matricula|liga|torneo),
                  referencia_id, mes, anio, monto_congelado
```

RLS: el jugador ve los suyos, el admin los de su club.
**Si alguna pantalla las escucha en vivo, publicarlas en `supabase_realtime` en
esta misma migración** — suscribirse a una tabla no publicada no da error, se
conecta y no llega nada nunca (pasó tres veces en este proyecto).

**B4 · El orquestador**

```sql
registrar_pago_khipu_atomico(p_khipu_payment_id text, p_idempotency_key uuid)
```

1. Busca `khipu_pagos` por `khipu_payment_id` → de ahí saca `club_id` y `jugador_id`
2. Rechaza si el estado no es `creado`
3. Reclama idempotencia con `_finanzas_reclamar_operacion`
4. Recorre los items **en una sola transacción**, enrutando cada uno a su `_core`
5. Marca el pago como `pagado`
6. Si cualquier item falla → **rollback completo**

**B5 · El carrito**
`src/app/actions/khipu.ts` siguiendo el patrón exacto de
`src/app/actions/mensualidades.ts`: validar con zod → `requirePerfil()` →
operar → `{success}` o `{error}`. Esquemas en `src/lib/validation/khipu.ts`.

Verifica que el `jugador_id` del perfil coincida, lee los montos de la base,
rechaza lo ya pagado, lo exento y lo de otro club.

**B6 · El webhook**
`src/app/api/khipu/webhook/route.ts`. Patrón de referencia:
`src/app/api/monitor-email/route.ts`, el único endpoint del proyecto que se
autentica sin sesión.

Identifica el pago → obtiene el secreto del club → **verifica la firma HMAC** →
firma inválida devuelve 401 sin tocar nada → llama al orquestador con el cliente
admin.

**B7 · Reconciliación**
`src/app/api/khipu/conciliar/route.ts`, autenticado por secreto y disparado por
cron. Revisa los `creado` con más de N minutos y le pregunta a Khipu. La
idempotencia hace seguro que el webhook llegue después.

**B8 · Interfaz**
Jugador: botón en `src/app/estado-cuenta/page.tsx`.
Admin: panel de pagos Khipu, con los que quedaron en limbo.
Ambas con `useEnVivo` y `cachedFetch` declarando tablas.

### Fase C — Cobertura total

**C1 · Matrícula.** Misma familia que mensualidad, entra casi gratis.

**C2 · Liga.** Requiere decidir si Khipu paga el saldo completo o permite elegir
el abono.

**C3 · Torneo.** Requiere decidir si el ingreso entra a Finanzas de inmediato o
espera que el admin lo suba, como hoy.

---

## 7. Orden y dependencias

```
A1 (exento) ─── independiente, se puede hacer hoy

A2 (núcleos) ──> B2 (método) ──> B4 (orquestador) ──> B6 (webhook) ──> B7 (conciliar)
                                        ↑                                    ↓
B0 (cuenta dev) ──> B1 ──> B3 (tablas) ─┘                              B8 (UI)
                                        ↓
                            A3 (deuda) ──> B5 (carrito)

C1, C2, C3 ─── después de que B esté andando
```

**Primer entregable útil:** A1 solo. **Segundo:** A2 + A3, que dejan el código
mejor aunque Khipu se cancele.

---

## 8. Las pruebas que definen "intachable"

| Prueba | Qué demuestra |
|---|---|
| Los tests actuales de pago pasan sin cambios tras A2 | El refactor no alteró conducta |
| Webhook disparado dos veces → **un solo** `movimiento` | Idempotencia real |
| Carrito mixto que falla a mitad → **nada** quedó registrado | Atomicidad |
| Firma inválida → nada se toca | El webhook no es falsificable |
| Pago adelantado + cron del día 1 → la fila no se duplica ni se pisa | Convive con la emisión mensual |
| Webhook perdido + conciliación → el pago aparece | No hay plata invisible |
| Becado exento → sale de morosidad y **no** aparece en Finanzas | `exento` no inventa ingresos |
| Cobro para jugador bloqueado → rechazado | No se cobra a quien no corresponde |

---

## 9. Decisiones abiertas

1. **El secreto de Khipu.** Es la llave que firma la plata. El proyecto guarda
   contraseñas en texto plano a propósito (`credencial_visible`), pero esto no
   es una clave de kiosco. ¿Se cifra o se sigue la convención?

2. **Liga y abonos.** ¿Khipu paga el saldo completo, o el jugador elige cuánto
   abonar? Lo segundo es más flexible pero acerca el monto al cliente.

3. **Torneo y el ingreso diferido.** ¿El pago por Khipu entra a Finanzas al
   toque, o queda esperando que el admin suba el lote como hoy?
   *Recomendación: dejar el flujo actual intacto.*

4. **Monto congelado.** El cobro se crea con un monto. Si el admin cambia la
   cuota entremedio, llega un pago que no calza. ¿Se acepta con la diferencia
   visible, o se rechaza?

---

## 10. Riesgos, por gravedad

1. **Doble notificación → doble ingreso.** Mitigado por `finanzas_operaciones`,
   pero hay que **probarlo** disparando el mismo webhook dos veces.
2. **Pago parcial de un carrito.** Si el orquestador registra la mensualidad y
   falla en la inscripción, queda plata cobrada y deuda viva. Todo en una
   transacción o nada.
3. **Webhook falsificado.** Sin verificación de firma, cualquiera marca deudas
   como pagadas. La firma no es opcional.
4. **Refactor de A2 mal hecho.** Toca el código que mueve la plata de todos los
   clubes. El criterio de aceptación —tests actuales sin modificar— no es
   burocracia: es la red.

---
---

# Parte II — Cambios en la estructura del club

El código es la mitad del trabajo. La otra mitad no se programa: son requisitos
legales, bancarios, de proceso y de hábito. Varios **bloquean** la puesta en
marcha aunque el software esté impecable.

Las cifras de esta parte salen de la base de Buin al 2026-08-18 y sirven de
referencia; cada club tendrá las suyas.

## 11. Requisitos previos que no dependen del software

### 11.1 Personalidad jurídica y cuenta bancaria

Khipu deposita en una cuenta bancaria. Para operar como comercio, el club
necesita:

- **RUT de la organización** (no el RUT personal de un dirigente)
- **Cuenta bancaria a nombre del club**
- Un **titular responsable** ante Khipu y ante el banco

Esto es lo primero que hay que verificar, porque si el club cobra hoy a la
cuenta personal del tesorero, **Khipu obliga a formalizar** antes de poder
integrarse. No es un trámite de software y puede tomar semanas o meses.

> **Verificar por club:** ¿tiene personalidad jurídica vigente? ¿tiene cuenta
> bancaria a nombre de la organización? ¿quién figura como representante legal?

### 11.2 Quién administra las credenciales

El `receiver_id` y el `secret` de Khipu son la llave que firma el dinero. Hay
que definir:

- Quién los carga en el sistema (¿el admin del club? ¿el superadmin?)
- Qué pasa cuando esa persona deja el club
- Cómo se rotan si se filtran

Hoy los clubes tienen **5 admins** (caso Buin). Cualquiera de ellos podría
cambiar las credenciales si la pantalla se lo permite. Conviene decidir si eso
se restringe.

## 12. El costo, y quién lo paga

Khipu cobra **0,69% + IVA por transferencia**, o una tarifa fija de UF 0,0105,
con descuentos por volumen.

Con los datos reales de Buin en 2026 (124 mensualidades pagadas, $3.714.400
recaudados, mediana de $30.000):

| Esquema | Costo por una mensualidad de $30.000 | Costo anual si todo pasara por Khipu |
|---|---|---|
| Porcentaje (0,69% + IVA) | ~$246 | ~$30.500 |
| Tarifa fija (UF 0,0105) | ~$410 | ~$50.800 |

**Para este club conviene el esquema porcentual**, porque sus cuotas van de
$7.000 a $70.000 y en las bajas la tarifa fija pesa mucho más.

### La decisión de negocio

Alguien tiene que absorber esa comisión, y son solo dos opciones:

- **El club la absorbe** — recauda ~$246 menos por cuota. Es lo más simple y lo
  más transparente para el apoderado.
- **Se traspasa al apoderado** — la cuota sube $246. Requiere explicarlo y
  probablemente enojo, por una cifra que al club le cuesta poco.

**Recomendación: que la absorba el club.** A cambio de ~$30.000 al año se ahorra
trabajo administrativo y, sobre todo, se ataca el 45% de morosidad. Si eso baja
aunque sea diez puntos, el retorno es de otro orden de magnitud.

## 13. Cobertura de cuentas — verificado, no es un bloqueador

Una primera pasada de este análisis contó 149 "activos" y encontró 42 sin
cuenta (72% de cobertura), y los listó como riesgo. Al revisar esos 42 uno por
uno, ninguno tenía cuota asignada, mensualidad emitida ni asistencia
registrada — la sospecha correcta fue "¿estos jugadores existen de verdad?".

Sí existían, pero no eran socios: los 42 tienen `es_externo = true`. Son fichas
de jugadores visitantes, creadas por los scripts de datos de prueba
(`scripts/seed-*.mjs`) para simular inscripciones a torneos — de ahí nombres
como "Jose Antonio Kast" o "Gabriel Boric Font", que evidentemente no son
alumnos de Buin.

**La cifra real, filtrando por socios (`es_externo != true`): 107 de 107
activos tienen cuenta. 100%.**

No hay trabajo de cobertura pendiente. Sí sigue valiendo verificar cuántos
entran de verdad a la app en un mes normal — tener cuenta no es lo mismo que
usarla —, pero eso ya no bloquea el arranque.

## 14. Cómo cambia el trabajo de cada rol

| Rol | Hoy | Con Khipu |
|---|---|---|
| **Apoderado** | Transfiere por su banco, saca captura, la manda por WhatsApp | Entra a la app, ve lo que debe, aprieta pagar |
| **Admin** | Revisa WhatsApp, busca el jugador, marca pagado | No hace nada: el pago se registra solo |
| **Tesorero** | Cuadra la cartola del banco contra lo marcado | Cuadra la cartola contra Khipu y contra el sistema |
| **Profe** | No participa del cobro | Igual |

El cambio grande es para el **apoderado**, y ese es justamente el que no
controlas. El admin gana tiempo, pero el que tiene que cambiar el hábito es
quien paga.

### El pago en efectivo no desaparece

Muchos apoderados van a seguir pagando en efectivo en el club. **Los tres
caminos tienen que convivir indefinidamente:**

1. Efectivo o transferencia → el admin marca a mano (como hoy)
2. Beca o condonación → el admin marca `exento` (paso A1)
3. Khipu → se registra solo

Esto no es una transición hacia Khipu; es **agregar una opción más**.

## 15. Conciliación contable

Hoy el tesorero mira la cartola del banco y compara contra lo que el admin
marcó. Con Khipu aparece una capa intermedia:

```
Apoderado paga → Khipu recibe → Khipu deposita (neto de comisión) → Banco del club
                      ↓
            El sistema marca pagado
```

Dos cosas nuevas que cuadrar:

- **El depósito llega neto de comisión.** El sistema dice que ingresaron
  $30.000 y al banco llegaron ~$29.754. Hay que decidir si esa diferencia se
  registra como gasto en Finanzas (categoría `otro_gasto`) o simplemente se
  acepta como descuadre conocido. **Recomendación: registrarla**, porque si no
  Finanzas nunca va a cuadrar con el banco.
- **Los depósitos pueden venir agrupados.** Khipu puede depositar varios pagos
  juntos, así que un depósito del banco no corresponde a un movimiento del
  sistema.

> **Decisión pendiente:** ¿se registra la comisión como gasto automáticamente al
> confirmarse cada pago, o se carga una vez al mes a mano?

## 16. Soporte: quién responde cuando falla

Con pago manual, si algo sale mal el apoderado le escribe al admin y se resuelve
por WhatsApp. Con Khipu aparecen casos nuevos:

| Situación | Quién responde |
|---|---|
| El pago se descontó y no aparece en la app | El admin, mirando el panel de pagos Khipu (paso B8) |
| El banco rechazó la transferencia | El apoderado con su banco; el club no puede hacer nada |
| Pagó de más o por error | El admin revierte y **devuelve la plata a mano** desde el panel de Khipu |
| Un pago quedó en limbo | Lo resuelve la conciliación automática (paso B7) |

**El club necesita a alguien que sepa entrar al panel de Khipu.** No es
opcional: sin eso, una devolución no se puede hacer.

## 17. Comunicación y puesta en marcha

**No lanzar a todo el club de una.** Orden sugerido:

1. **Piloto con 5 a 10 familias** que ya usan la app y entienden. Un mes.
2. **Ajustar** lo que aparezca — siempre aparece algo.
3. **Apertura general**, con el flujo manual intacto y sin obligar a nadie.
4. **Medir** a los tres meses: ¿bajó la morosidad? ¿bajó el trabajo del admin?

**Lo que hay que comunicarle al apoderado**, en su idioma:

- Que es opcional; puede seguir pagando como siempre
- Que paga con transferencia de su banco, **no con tarjeta de crédito**
- Que el pago queda registrado al instante, sin mandar captura
- Que si algo falla, le escribe al mismo admin de siempre

## 18. Cronograma realista

| Etapa | Depende de | Tiempo estimado |
|---|---|---|
| Verificar personalidad jurídica y cuenta bancaria | El club | **Semanas o meses** si falta formalizar |
| Cuenta de desarrollo Khipu | Registro simple | Días |
| Fase A del código (fundaciones) | Desarrollo | No bloqueada por lo anterior |
| Fase B del código (Khipu) | Cuenta de desarrollo | Después de B0 |
| Cuenta comercial Khipu | Personalidad jurídica + banco | Depende del trámite |
| Piloto | Todo lo anterior | 1 mes |
| Apertura general | Piloto exitoso | — |

**El camino crítico no es el código: es la formalización del club.** Eso puede
avanzar en paralelo al desarrollo, y conviene empezarlo antes. La cobertura de
cuentas ya no es parte del camino crítico: los 107 socios activos ya tienen
acceso.

## 19. Cuándo NO conviene implementarlo

Para ser honestos, hay clubes donde esto no vale la pena:

- **Clubes chicos** (menos de ~20 jugadores): el admin marca 20 pagos en cinco
  minutos. La complejidad no se paga.
- **Clubes sin personalidad jurídica**: el trámite cuesta más que el beneficio.
- **Clubes donde casi nadie usa la app**: se construye un camino que nadie
  recorre.

Con 107 socios activos, 45% de morosidad y 100% de cobertura de cuentas,
**Buin sí está en el rango donde conviene**, y sin bloqueador de cobertura.
