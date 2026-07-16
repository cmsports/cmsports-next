function partesChile(fecha: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).reduce<Record<string, string>>((partes, parte) => {
    if (parte.type !== 'literal') partes[parte.type] = parte.value
    return partes
  }, {})
}

export function fechaChile(fecha = new Date()) {
  const p = partesChile(fecha)
  return `${p.year}-${p.month}-${p.day}`
}

export function horaChile(fecha = new Date()) {
  const p = partesChile(fecha)
  return `${p.hour}:${p.minute}`
}
