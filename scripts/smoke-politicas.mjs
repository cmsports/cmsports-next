// Revisa las políticas de acceso de todas las tablas.
//
// Las políticas de Postgres se suman con OR: una sola permisiva anula a todas
// las restrictivas de la misma tabla. Así fue como la 095 no cerró nada —había
// quedado viva una `USING (true)` de la 001— y hubo que escribir la 096.
//
// Busca tres cosas:
//   · tablas sin RLS, que quedan abiertas de par en par
//   · políticas que dejan pasar a cualquiera
//   · tablas con RLS y sin ninguna política, que no responden a nadie
//
//   node scripts/smoke-politicas.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await db.rpc('_auditoria_politicas')
if (error) {
  console.log('Falta la función de apoyo en la base. Corré esto una vez en el SQL Editor:\n')
  console.log(`CREATE OR REPLACE FUNCTION public._auditoria_politicas()
RETURNS TABLE (tabla text, rls boolean, politica text, comando text, expresion text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT c.relname::text, c.relrowsecurity,
         p.polname::text, p.polcmd::text,
         pg_get_expr(p.polqual, p.polrelid)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE c.relkind = 'r'
  ORDER BY c.relname, p.polname;
$$;
REVOKE EXECUTE ON FUNCTION public._auditoria_politicas() FROM PUBLIC, anon, authenticated;`)
  process.exit(1)
}

const porTabla = new Map()
for (const f of data) {
  if (!porTabla.has(f.tabla)) porTabla.set(f.tabla, { rls: f.rls, politicas: [] })
  if (f.politica) porTabla.get(f.tabla).politicas.push(f)
}

const sinRls = [], abiertas = [], mudas = []
for (const [tabla, info] of [...porTabla].sort()) {
  if (!info.rls) { sinRls.push(tabla); continue }
  if (info.politicas.length === 0) { mudas.push(tabla); continue }
  for (const p of info.politicas) {
    const e = (p.expresion ?? '').trim().toLowerCase()
    // `true` a secas deja pasar a cualquiera con la llave pública.
    if (e === 'true') abiertas.push(`${tabla} · ${p.politica} (${p.comando})`)
  }
}

console.log(`Revisadas ${porTabla.size} tablas\n`)
if (sinRls.length)   console.log('SIN RLS — abiertas a cualquiera:\n  ' + sinRls.join('\n  ') + '\n')
if (abiertas.length) console.log('POLÍTICA QUE DEJA PASAR A TODOS:\n  ' + abiertas.join('\n  ') + '\n')
if (mudas.length)    console.log('CON RLS Y SIN POLÍTICAS — no responden a nadie:\n  ' + mudas.join('\n  ') + '\n')

if (!sinRls.length && !abiertas.length && !mudas.length) {
  console.log('Ninguna tabla queda abierta ni muda.')
}
process.exit(sinRls.length || abiertas.length ? 1 : 0)
