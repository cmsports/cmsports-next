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
const CLUB_ORIGINAL = 'ec1ef215-0ab5-43c6-abf4-fc5578b17bcc'
const CLUB_DUPLICADO = 'c67260f1-17e1-490c-9d74-b90dcfeb399d'
const CORREOS = [
  'juaquin.orellana@cmsports.cl',
  'elian.tapia@cmsports.cl',
  'eduardo.sanchez@cmsports.cl',
  'rodrigo.salazar@cmsports.cl',
  'mauricio.salazar@cmsports.cl',
  'denise@cmsports.cl',
  'benjamin.cardenas@cmsports.cl',
]

const { data: jugadores, error: jugadoresError } = await supabase
  .from('jugadores').select('id,email').eq('club_id', CLUB_DUPLICADO).in('email', CORREOS)
if (jugadoresError) throw jugadoresError
if (jugadores.length !== 7) throw new Error(`Se esperaban 7 jugadores en el duplicado y se encontraron ${jugadores.length}`)

const { error: moverJugadoresError } = await supabase
  .from('jugadores').update({ club_id: CLUB_ORIGINAL }).in('id', jugadores.map((j) => j.id))
if (moverJugadoresError) throw moverJugadoresError

const { error: moverPerfilesError } = await supabase
  .from('perfiles').update({ club_id: CLUB_ORIGINAL }).eq('club_id', CLUB_DUPLICADO).in('email', CORREOS)
if (moverPerfilesError) throw moverPerfilesError

const { count, error: restantesError } = await supabase
  .from('jugadores').select('id', { count: 'exact', head: true }).eq('club_id', CLUB_DUPLICADO)
if (restantesError) throw restantesError
if (count !== 0) throw new Error(`El club duplicado aún tiene ${count} jugadores; no se eliminará`)

const { error: borrarError } = await supabase.from('clubes').delete().eq('id', CLUB_DUPLICADO).eq('nombre', 'Club Buin')
if (borrarError) throw borrarError

const { count: totalOriginal, error: verificarError } = await supabase
  .from('jugadores').select('id', { count: 'exact', head: true }).eq('club_id', CLUB_ORIGINAL).in('email', CORREOS)
if (verificarError) throw verificarError
console.log(`Corrección lista: ${totalOriginal} jugadores vinculados a Club Buín; duplicado eliminado.`)
