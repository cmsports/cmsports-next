# Landing pública CMsports — dominio y entrada

**Archivo para retomar en otro chat:** `docs/plan-landing-publica-cmsports.md`

## Objetivo

Que `cmsportschile.cl` se vea como una página informativa de lo que hace CMsports (tono visual tipo [clubdeportivousb.cl](https://clubdeportivousb.cl/)), y que desde ahí se pueda entrar al software.

No es clonar el sitio de Unión San Bernardo: ese es un club (historia, donaciones, horarios). CMsports es el sistema de gestión.

## Decisión de dominio

**No hace falta comprar otro dominio ahora.** Seguir con `cmsportschile.cl`.

| Opción | Qué es | Decisión |
|---|---|---|
| Misma raíz | `/` = vitrina, `/login` = software | **Elegida** |
| Subdominio `app.` | `www` = vitrina, `app.cmsportschile.cl` = software | Después, si se quiere separar más |
| Otro dominio | Comprar `cmsports.cl` u otro | No: la marca, el correo y las propuestas ya usan este |

La raíz ya es la vitrina pública (`src/app/page.tsx`). `/login` sigue siendo la entrada al software.

## Cómo se siente

- **Visitante / club nuevo:** entra a `cmsportschile.cl`, ve qué es el producto, pulsa *Ingresar* → `/login` o *Contacto*.
- **Usuario que ya usa el sistema:** si tiene sesión y escribe la raíz, va a su pantalla (dashboard / perfil). Si no, ve la vitrina y pulsa *Ingresar*. Los links a `/login` no se rompen.

## Estado

| Parte | Estado |
|---|---|
| 1. Decisión de dominio y arquitectura | Hecho |
| 2. Copy y estructura de secciones | Hecho (borrador abajo) |
| 3. Implementar `/` como vitrina pública | Hecho en código (local; sin deploy) |
| 4. Ajustar `src/proxy.ts` para que `/` sea pública | Hecho (`pathname === '/'`, no `startsWith`) |
| 5. Link de vuelta desde `/login` a la vitrina | Hecho (“← Inicio”) |
| 6. Revisar visual / copy en local | En curso — landing ampliada |
| 7. Deploy a producción | Pendiente (cuando aprueben) |

## Contenido actual de la vitrina

1. Hero + CTA HoverBorderGradient  
2. Carrusel de deportes  
3. Qué es + card 3D  
4. Cómo ayuda  
5. Módulos (Tabs)  
6. Implementación (línea de tiempo)  
7. Resultados 3 / 6 / 12 meses  
8. Servicios futuros (apps, pagos, IA, a medida)  
9. Chile/LATAM + Buin y Paine + soporte Lun–Vie  
10. Misión, visión, cofounders + Instagram  
11. Contacto  

## Archivos tocados

- `src/components/landing/LandingPublica.tsx`
- `src/components/landing/landing.module.css`
- `src/components/landing/LandingModulesTabs.tsx`
- `src/components/ui/tabs.tsx` + `tabs.module.css`
- `src/components/ui/3d-card.tsx`
- `src/components/ui/hover-border-gradient.tsx`
- `src/lib/utils.ts`
- `public/preview-dashboard-cmsports.png`, `public/cmsports-logo.png`
- `src/proxy.ts`, `src/app/login/page.tsx`

## Videos demo

- `public/videos/demo-cmsports-1.mp4` (~4 MB)
- `public/videos/demo-cmsports-2.mp4` (~13 MB)
- Sección en la landing: `#demo` (“Mirá CMsports en acción”)
- Nav: enlace **Demo**

Fuente: `docs/presentacion-cmsports.html` y `docs/propuesta-comercial-spinhouse.md`.

---

## Borrador de copy y estructura

### Cabecera (fija)

| Elemento | Texto |
|---|---|
| Logo | CMsports |
| Nav | Qué es · Cómo ayuda · Módulos · Contacto |
| CTA derecha | **Ingresar** → `/login` |

### 1. Hero

| Campo | Texto |
|---|---|
| Eyebrow | Gestión deportiva profesional |
| Título | Ordenamos la operación del club para que ustedes se concentren en formar deportistas. |
| Subtítulo | CMsports es el sistema de gestión para clubes y asociaciones: plantel, asistencia, finanzas, torneos y reportes en un solo lugar. |
| Botón primario | **Ingresar al sistema** → `/login` |
| Botón secundario | **Contacto** → ancla `#contacto` o `mailto:contacto@cmsportschile.cl` |
| Nota chica (opcional) | Ya en producción en clubes de tenis de mesa. |

### 2. Qué es CMsports

| Campo | Texto |
|---|---|
| Título | Qué es CMsports |
| Párrafo 1 | Empresa chilena de tecnología deportiva. Desarrollamos software de gestión para clubes y asociaciones. |
| Párrafo 2 | Nacimos para digitalizar lo que hoy vive en planillas, WhatsApp y cuadernos: plantel, asistencia, cobros, torneos y comunicación. |
| Cierre | Nos encargamos de la administración, para que el club se concentre en formar deportistas. |

### 3. Cómo ayuda al club

| Campo | Texto |
|---|---|
| Título | Cómo ayuda al club |
| Intro | Una sola fuente de verdad para la operación diaria. |

| # | Beneficio | Detalle |
|---|---|---|
| 01 | Unifica plantel, asistencia, cobros y torneos | Deja de repartir la información entre planillas y chats. |
| 02 | Roles claros: admin, profesor y jugador | Cada persona ve solo lo que le corresponde. |
| 03 | Menos fricción en cobros y comunicación | Estado de cuenta, avisos y WhatsApp integrados. |
| 04 | Crece con el club, módulo a módulo | Sin migrar de sistema ni perder datos. |

**Mini línea de día a día** (opcional, al costado o debajo):

- Mañana — Admin revisa cobros y plantel  
- Entrenamiento — Profesor pasa asistencia en cancha  
- Pagos — Jugador ve estado de cuenta  
- Torneo — Llaves y vista en vivo para el público  

### 4. Módulos (lo que ya está en producción)

| Campo | Texto |
|---|---|
| Título | Lo que el club puede usar desde el día uno |
| Intro | Módulos activables según la necesidad del club. |

**Bloque principal (4 cards):**

| Módulo | Texto |
|---|---|
| Jugadores | Ficha completa, datos médicos, apoderados, categorías e inscripción online. |
| Asistencia | Lista por sesión desde el celular. Historial y alertas por inactividad. |
| Finanzas | Mensualidades, morosidad, ingresos y egresos. Estado de cuenta y trazabilidad. |
| Torneos | Llaves, grupos, ranking y vista en vivo para espectadores sin cuenta. |

**Complementos** (fila secundaria, más corta):

| Módulo | Texto |
|---|---|
| Clases y horarios | Bloques de entrenamiento, agenda del profesor y vista del jugador. |
| Liga | Divisiones, fechas, clasificación e inscripción conectada a finanzas. |
| Calendario y reportes | Actividades unificadas e informes de operación, asistencia y torneos. |
| WhatsApp y central de pago | Contacto operativo, comprobantes y datos de transferencia del club. |

### 5. Para quién

| Campo | Texto |
|---|---|
| Título | Para quién es |
| Intro | Pensado para clubes y asociaciones que necesitan ordenar oficina y cancha. |

| Rol | Texto |
|---|---|
| Administradores | Plantel, cobros, reportes y configuración del club en un solo panel. |
| Profesores | Asistencia, horarios y grupos del día, desde el celular. |
| Jugadores y apoderados | Estado de cuenta, horario e información del club sin depender del chat. |

**Nota institucional (una línea):**  
Hoy operamos con clubes de tenis de mesa. La plataforma está pensada para crecer con cada institución.

### 6. Cierre / Contacto

| Campo | Texto |
|---|---|
| Título | Conversemos sobre su club |
| Párrafo | Si quieren conocer CMsports o evaluar una implementación, escríbannos. |
| Correo | **contacto@cmsportschile.cl** |
| Botón | **Ingresar al sistema** → `/login` |
| Pie | CMsports · CMESTUDIOS Limitada · cmsportschile.cl |

### Qué no va en la landing (por ahora)

- Precios / UF / IVA (eso va en propuesta comercial).
- Nombres de clubes clientes (salvo que ustedes lo aprueben después).
- Promesas de apps o pagos en línea como “ya incluidos” si aún no están listos para mostrarlo al público.
- Historia, donaciones u horarios de un club concreto (eso sería sitio por club, otro producto).

---

## Fuera de alcance

- Sitio público por club (tipo USB para Buin / Spinhouse). Eso sería otro producto.
- Comprar dominio nuevo.
- Subdominio `app.` en este primer paso.
- Deploy / DNS: se puede construir y probar en local; producción se publica cuando el copy y el diseño estén listos.
