import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((linea) => linea.includes('='))
    .map((linea) => {
      const indice = linea.indexOf('=')
      return [linea.slice(0, indice).trim(), linea.slice(indice + 1).trim()]
    })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: clubes, error } = await supabase
  .from('clubes')
  .select('id,nombre,ciudad,deporte,creado_en')
  .order('creado_en', { ascending: true })
if (error) throw error

for (const club of clubes) {
  const { count } = await supabase.from('jugadores').select('id', { count: 'exact', head: true }).eq('club_id', club.id)
  console.log(JSON.stringify({ ...club, jugadores: count }))
}
