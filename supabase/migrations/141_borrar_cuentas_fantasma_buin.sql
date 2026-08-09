-- Borra las 8 cuentas de prueba que no se podían borrar desde ninguna pantalla.
--
-- ── POR QUÉ SEGUÍAN AHÍ DESPUÉS DE "BORRARLAS" VARIAS VECES ───────────────
-- Porque nunca estuvieron donde se las buscaba. Estas cuentas viven en
-- `auth.users` y `perfiles`, y NO tienen fila en `jugadores`: su jugador se
-- borró en algún momento y el perfil sobrevivió.
--
-- La pantalla de Jugadores lista `jugadores`. Al no tener fila ahí, estas
-- cuentas no aparecen: no hay ningún lugar en el sistema desde donde el admin
-- pueda verlas ni eliminarlas. Cada intento de borrarlas fue, necesariamente,
-- borrar otra cosa.
--
-- Eso además explica por qué `eliminar_jugador_atomico` no las alcanza: esa
-- función arranca desde un `jugador_id` y borra su perfil de paso. Sin jugador
-- no hay por dónde entrar.
--
-- ── LA CONDICIÓN ES TRIPLE, Y ESO ES A PROPÓSITO ──────────────────────────
-- Se borra solo lo que cumple LAS TRES cosas:
--
--   1. el correo está en la lista de abajo,
--   2. su rol es 'jugador',
--   3. su `jugador_id` apunta a un jugador que YA NO EXISTE.
--
-- Con las tres juntas es imposible tocar a un administrador aunque un correo
-- estuviera mal escrito: los admin del club tienen rol 'admin' y `jugador_id`
-- nulo, así que fallan 2 y 3.
--
-- Importa especialmente por un parecido peligroso:
--
--     rsalazar@cmsports.cl   → rol jugador, cuenta de prueba  → SE BORRA
--     rsalazarf@cmsports.cl  → rol admin, con la F            → NO SE TOCA
--
-- Un dedo de más en el correo y se borraba al administrador del club.
--
-- ── Qué se borra de verdad ────────────────────────────────────────────────
-- Se borra la fila de `perfiles` y el usuario de `auth.users`. Sin lo segundo
-- la cuenta sigue pudiendo iniciar sesión, que es la mitad del problema.
--
-- EJECUCIÓN MANUAL: Supabase Dashboard > SQL Editor.
-- Corrida el: ____________  (anotar la fecha al aplicarla)

BEGIN;

SELECT _migracion_nueva('141_borrar_cuentas_fantasma_buin');


-- ══ 1. Quiénes son, exactamente ═══════════════════════════════════════════
-- Vista temporal con la condición triple. Todo lo de abajo trabaja sobre esta
-- misma lista, así que el conteo, el respaldo y el borrado no pueden
-- desalinearse entre sí.
CREATE TEMP TABLE _fantasmas ON COMMIT DROP AS
SELECT p.id, p.nombre, p.email, p.rol, p.jugador_id, p.club_id
FROM public.perfiles p
WHERE p.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND p.rol = 'jugador'
  AND p.jugador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = p.jugador_id)
  AND lower(btrim(p.email)) IN (
    'etapia@cmsports.cl',
    'msalazar@cmsports.cl',
    'denise@cmsports.cl',
    'bcardenas@cmsports.cl',
    'jorellana@cmsports.cl',
    'esanchez@cmsports.cl',
    'rsalazar@cmsports.cl',    -- OJO: sin la F. El admin es rsalazarf@
    'asalazar@cmsports.cl'
  );


-- ══ 2. El número tiene que ser el esperado ════════════════════════════════
-- Si no son 8, algo cambió desde la auditoría: aborta antes de borrar nada.
DO $$
DECLARE v_n integer; v_admins integer;
BEGIN
  SELECT count(*) INTO v_n FROM _fantasmas;
  RAISE NOTICE 'Cuentas fantasma encontradas: %', v_n;

  IF v_n <> 8 THEN
    RAISE EXCEPTION 'Se esperaban 8 cuentas y hay %. Revisar la lista antes de borrar.', v_n;
  END IF;

  -- Cinturón sobre el tirante: que ni una sola sea admin o superadmin.
  SELECT count(*) INTO v_admins FROM _fantasmas WHERE rol IN ('admin', 'superadmin');
  IF v_admins > 0 THEN
    RAISE EXCEPTION 'Hay % cuenta(s) admin en la lista. No se borra nada.', v_admins;
  END IF;
END $$;


-- ══ 3. Respaldo ═══════════════════════════════════════════════════════════
-- Nombre único y SIN `IF NOT EXISTS`: una segunda corrida falla con "relation
-- already exists" y aborta antes del DELETE. El error es la protección, que es
-- lo que le faltó a la 089.
--
-- Se guarda también el correo desde auth.users: es lo único que permitiría
-- recrear la cuenta si alguna resultara no ser de prueba.
CREATE TABLE _respaldo_cuentas_fantasma_20260809 AS
SELECT f.*, u.email AS email_auth, u.created_at AS creada_en
FROM _fantasmas f
LEFT JOIN auth.users u ON u.id = f.id;

COMMENT ON TABLE _respaldo_cuentas_fantasma_20260809 IS
  'Cuentas de prueba de Buin borradas por la 141: perfiles + usuarios de auth cuyo jugador ya no existía. Eran invisibles para toda la interfaz.';


-- ══ 4. Borrar ═════════════════════════════════════════════════════════════
-- Primero el perfil y después el usuario, sin depender de que el ON DELETE
-- CASCADE de la 126 esté puesto: si lo está, el segundo DELETE no encuentra
-- nada y no pasa nada; si no lo está, igual quedan las dos cosas borradas.
DELETE FROM public.perfiles
WHERE id IN (SELECT id FROM _fantasmas);

DELETE FROM auth.users
WHERE id IN (SELECT id FROM _fantasmas);

COMMIT;


-- ── Verificación ──────────────────────────────────────────────────────────

-- 1) Ninguna de las 8 quedó viva. Tiene que dar 0 en las dos columnas.
SELECT
  (SELECT count(*) FROM public.perfiles
    WHERE lower(btrim(email)) IN ('etapia@cmsports.cl','msalazar@cmsports.cl','denise@cmsports.cl',
      'bcardenas@cmsports.cl','jorellana@cmsports.cl','esanchez@cmsports.cl',
      'rsalazar@cmsports.cl','asalazar@cmsports.cl'))            AS perfiles_deberia_ser_cero,
  (SELECT count(*) FROM auth.users
    WHERE lower(btrim(email)) IN ('etapia@cmsports.cl','msalazar@cmsports.cl','denise@cmsports.cl',
      'bcardenas@cmsports.cl','jorellana@cmsports.cl','esanchez@cmsports.cl',
      'rsalazar@cmsports.cl','asalazar@cmsports.cl'))            AS auth_deberia_ser_cero;

-- 2) LOS ADMIN SIGUEN AHÍ. Esta es la que hay que mirar con cuidado:
--    tienen que aparecer los dos, rsalazarf@ y csalazarr@.
SELECT email, rol FROM public.perfiles
WHERE club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND rol IN ('admin', 'superadmin')
ORDER BY email;

-- 3) Lo que se respaldó, por si alguna no era de prueba.
SELECT nombre, email, creada_en FROM _respaldo_cuentas_fantasma_20260809 ORDER BY email;

-- 4) Y que no quede ninguna otra cuenta huérfana en el club.
SELECT p.email, p.rol
FROM public.perfiles p
WHERE p.club_id = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
  AND p.jugador_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.jugadores j WHERE j.id = p.jugador_id);
