import { describe, it, expect } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { crearZip, crc32 } from './zip'

// El zip se arma a mano, así que el test lee los headers por su cuenta (no
// usando los mismos offsets del código) y reconstruye el contenido: si una
// longitud u offset queda mal, un descompresor real también fallaría.
function leerZip(zip: Buffer) {
  const total = zip.readUInt16LE(zip.length - 22 + 10)
  let cd = zip.readUInt32LE(zip.length - 22 + 16)
  const salida: { nombre: string; contenido: string }[] = []
  for (let i = 0; i < total; i++) {
    expect(zip.readUInt32LE(cd)).toBe(0x02014b50)
    const nombreLen = zip.readUInt16LE(cd + 28)
    const compLen = zip.readUInt32LE(cd + 20)
    const crcEsperado = zip.readUInt32LE(cd + 16)
    const offset = zip.readUInt32LE(cd + 42)
    const nombre = zip.subarray(cd + 46, cd + 46 + nombreLen).toString('utf8')

    expect(zip.readUInt32LE(offset)).toBe(0x04034b50)
    const inicioDatos = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28)
    const datos = inflateRawSync(zip.subarray(inicioDatos, inicioDatos + compLen))
    expect(crc32(datos)).toBe(crcEsperado)
    salida.push({ nombre, contenido: datos.toString('utf8') })
    cd += 46 + nombreLen + zip.readUInt16LE(cd + 30) + zip.readUInt16LE(cd + 32)
  }
  return salida
}

describe('crearZip', () => {
  it('crc32 coincide con el valor conocido', () => {
    expect(crc32(Buffer.from('hello'))).toBe(0x3610a686)
  })

  it('empaqueta varios archivos y se pueden volver a leer', () => {
    const archivos = [
      { nombre: 'Club Ñuñoa/movimientos.json', contenido: JSON.stringify([{ monto: 1000 }]) },
      { nombre: 'Club Ñuñoa/jugadores.json', contenido: JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ i }))) },
      { nombre: '_global/tareas.json', contenido: '[]' },
    ]
    expect(leerZip(crearZip(archivos))).toEqual(archivos)
  })
})
