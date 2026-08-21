#!/usr/bin/env bash
# Capa A de la auditoría de migraciones: chequeos mecánicos sobre los archivos.
# No prueba que el SQL compile (eso es `supabase db reset`, capa B) ni revisa
# lógica (capa C). Busca los patrones que ya mordieron a este repo antes.
#
#   bash scripts/auditar-migraciones.sh
#
# Cada regla usa UN solo grep sobre todos los archivos y filtra en awk: crear un
# proceso por archivo en Windows cuesta ~100ms y hacía que el script no
# terminara.

set -uo pipefail
cd "$(dirname "$0")/../supabase/migrations" || exit 1

CUENTA=$(mktemp); echo 0 > "$CUENTA"
titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
reportar() {
  local n=0
  while IFS= read -r l; do [ -n "$l" ] && { printf '    %s\n' "$l"; n=$((n+1)); }; done
  # El contador vive en un archivo: `reportar` corre al final de un pipe, o sea
  # en un subshell, y cualquier variable que incremente ahí se pierde al volver.
  if [ "$n" -eq 0 ]; then printf '    ok\n'; else echo $(( $(cat "$CUENTA") + n )) > "$CUENTA"; fi
}
# El registro de migraciones nació en la 128; antes de eso la ausencia de guarda
# es historia, no un defecto que se pueda arreglar hoy.
REGISTRO_DESDE=128

titulo "A1 · migración posterior a la $REGISTRO_DESDE sin _migracion_nueva()"
grep -Li '_migracion_nueva' ./*.sql \
  | awk -v d=$REGISTRO_DESDE '{n=$0; sub(/.*\//,"",n); if (substr(n,1,3)+0 >= d) print n}' \
  | reportar

titulo "A2 · número de migración duplicado (el orden entre ellas es indeterminado)"
ls ./*.sql | sed 's|.*/||' \
  | awk '{k=substr($0,1,3); v[k]=(k in v ? v[k]" "$0 : $0); c[k]++}
         END {for (k in c) if (c[k]>1) print k" → "v[k]}' | sort | reportar

titulo "A3 · fecha UTC sin AT TIME ZONE 'America/Santiago' (ignora comentarios)"
# Se descartan las líneas de comentario: media docena de migraciones EXPLICAN en
# prosa el bug de current_date y aparecían como si lo cometieran.
grep -nE 'current_date|CURRENT_DATE|now\(\)::date' ./*.sql \
  | grep -viE 'america/santiago' \
  | awk -F: '{ linea=$0; sub(/^[^:]*:[^:]*:/,"",linea); if (linea !~ /^[[:space:]]*--/) print }' \
  | sed 's|^\./||' | reportar
titulo "A4 · archivo que consulta asistencia sin filtrar estado = 'presente'"
grep -lE 'FROM (public\.)?asistencia' ./*.sql > /tmp/_aud_a && \
grep -lE "estado[[:space:]]*=[[:space:]]*'presente'" ./*.sql > /tmp/_aud_b
comm -23 <(sort /tmp/_aud_a) <(sort /tmp/_aud_b) | sed 's|^\./||' | reportar

titulo "A5 · respaldo con IF NOT EXISTS antes de operar destructivo (patrón 089)"
grep -lEi 'CREATE TABLE IF NOT EXISTS.*(respaldo|backup|bkp)' ./*.sql \
  | sed 's|^\./||' | reportar

titulo "A6 · DELETE / TRUNCATE / DROP TABLE sin ningún respaldo en el archivo"
grep -lEi '^[[:space:]]*(DELETE FROM|TRUNCATE|DROP TABLE)' ./*.sql > /tmp/_aud_a && \
grep -lEi 'respaldo|backup|bkp' ./*.sql > /tmp/_aud_b
comm -23 <(sort /tmp/_aud_a) <(sort /tmp/_aud_b) | sed 's|^\./||' | reportar

titulo "A7 · BEGIN sin su COMMIT (se tolera el BOM UTF-8 al inicio del archivo)"
awk 'FNR==1{b=0;c=0} /^(\xef\xbb\xbf)?[[:space:]]*BEGIN[[:space:]]*;/{b++}
     /^[[:space:]]*COMMIT[[:space:]]*;/{c++}
     ENDFILE{if(b!=c){n=FILENAME; sub(/.*\//,"",n); print n"  BEGIN="b" COMMIT="c}}' ./*.sql \
  | reportar

titulo "A8 · tabla creada que nunca se publicó en supabase_realtime (informativo)"
# Informativo, no falla: la mayoría de estas tablas no necesitan realtime. Sirve
# para revisar si alguna pantalla en vivo se suscribe a una que está muda.
# Se filtran los comentarios antes de extraer: tres migraciones EXPLICAN en prosa
# el patrón `CREATE TABLE IF NOT EXISTS` y cortan la frase justo ahí, así que
# aparecían las palabras IF y AS listadas como si fueran nombres de tabla.
sin_comentarios() { grep -hv '^[[:space:]]*--' ./*.sql; }
publicadas=$(sin_comentarios | grep -oiP 'ADD TABLE\s+(public\.)?\K[a-z_][a-z0-9_]*' | sort -u)
sin_comentarios \
  | grep -oiP 'CREATE TABLE\s+(IF NOT EXISTS\s+)?(public\.)?\K[a-z_][a-z0-9_]*' \
  | grep -v '^_' | sort -u | grep -vxF "$publicadas" | reportar
titulo "A9 · archivo que toca tablas multi-club sin nombrar club_id"
grep -lE 'FROM (public\.)?(jugadores|movimientos|asistencia|bloques)' ./*.sql > /tmp/_aud_a && \
grep -liE 'club_id' ./*.sql > /tmp/_aud_b
comm -23 <(sort /tmp/_aud_a) <(sort /tmp/_aud_b) | sed 's|^\./||' | reportar

rm -f /tmp/_aud_a /tmp/_aud_b
printf '\n\033[1m%d hallazgo(s).\033[0m Capa A no prueba sintaxis ni lógica.\n' "$(cat "$CUENTA")"
n=$(cat "$CUENTA"); rm -f "$CUENTA"; [ "$n" -eq 0 ]
