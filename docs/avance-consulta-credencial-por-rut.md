# Consulta de credencial por RUT (Buin)

Documento para retomar en otro chat. Última actualización: 2026-08-13.

## Qué hicimos

Link público (como el de inscripción): el jugador pone su RUT y ve **su**
usuario y contraseña. El admin copia el link desde Credenciales y lo manda
al grupo, en vez del PDF con todas las claves.

## Archivos

- Página: `src/app/mi-acceso/[clubId]/page.tsx`
- RPC: `supabase/migrations/180_consultar_credencial_por_rut.sql`
- Botón en admin: `src/app/credenciales/page.tsx`
- Proxy: `src/proxy.ts` (deja pasar `/mi-acceso/...` sin sesión)
- Cruce Excel/PDF/base: hecho el 2026-08-13

## Match Excel + PDF + base (Buin)

Excel 116 = PDF 116 jugadores = DB 116 internos. Nadie faltó, nadie de más,
nombres y RUT coinciden, los 116 tienen cuenta y clave espejada.

Incoherencias (no bloquean el lookup, pero conviene saberlas):

1. RUT con dígito verificador inválido — **corregidos en 182** (ya pegada):
   - Alan máximo Imilqueo Altamirano `23208195-7` → `23208195-3`
   - Randy Leonardo Rivera Morales `2405786-K` → `2405786-0`
   - VICTOR SOTO `17168286-1` → `17168286-K`
2. Usuario sintético de RUT (entran con ese correo, no con un gmail):
   - Alberto HONORES → `72016734@rut.cmsports.cl`
   - MATIAS RIVAS → `237483561@rut.cmsports.cl`
3. Typo en el correo de login (así está en la cuenta):
   - Juan pablo Parra Gonzalez → `vivian.andregon@gmail.co` (falta la m)
   - Victor Rodríguez Mardones → `vsrm0196@gmail.con` (n en vez de m)
4. Tres jugadores bloqueados (igual pueden consultar la clave; al entrar
   van a `/cuenta-bloqueada`): Alberto Andrés Vergara Sánchez, Alvaro Moya
   Obregón, Juan Carlos Kania Kuhl.
5. **8 logins desalineados** (el lookup mostraba `@cmsports.cl` y Auth tenía
   el gmail/hotmail de la ficha). Corregidos en producción el 2026-08-13;
   migración `183_alinear_login_con_auth_buin.sql`. Incluye a Colomba
   (`nayareth2901@gmail.com`, único).
6. **Ficha = credencial = Auth** en los 116 (migración `184` + corrida en
   producción). Ningún correo de login repetido.

## PDF admin y cambios de perfil (2026-08-13, tarde)

Los 116 de Buin ya estaban alineados. El hueco era hacia adelante:

1. Abrir/descargar Credenciales **regeneraba la clave** si el espejo tenía un
   login distinto de `perfiles.email` (caso Colomba). Ahora, si ya hay espejo,
   solo corrige `usuario_login`. La clave nueva se genera solo si no hay espejo.
2. Cambiar la contraseña en Configuración iba directo a Auth y **no tocaba el
   espejo**. `/crear-contrasena` sí usaba `cambiarPasswordPropia`. Configuración
   ahora también.
3. Cambiar el correo en el perfil actualizaba Auth, `perfiles` y `jugadores`,
   **no** `credencial_visible.usuario_login`. `sincronizarEmailAuth` ahora
   alinea el espejo siempre, aunque Auth no haya cambiado. Lo usa el perfil,
   editar ficha y el reset.

Migraciones: no hay SQL nuevo. Las 180/182/183/184 ya están pegadas.

## Cómo seguir

Link público:

`https://www.cmsportschile.cl/mi-acceso/ec1ef215-0ab5-43c6-abf4-fc5578b17bcc`

RUT de prueba: Colomba `19313040-2`, Agustín Calderón `24171067-K`.

