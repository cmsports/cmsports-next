import { deflateRawSync } from 'node:zlib'

// ZIP mínimo (deflate, sin zip64) armado a mano: la única cosa que faltaba
// para el respaldo era empaquetar N archivos JSON, y zlib —que ya viene con
// Node— hace la parte difícil. Una dependencia nueva para 60 líneas no se
// justifica.

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function crearZip(archivos: { nombre: string; contenido: string }[]): Buffer {
  const partes: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const archivo of archivos) {
    const nombre = Buffer.from(archivo.nombre, 'utf8')
    const datos = Buffer.from(archivo.contenido, 'utf8')
    const comprimido = deflateRawSync(datos)
    const crc = crc32(datos)

    const local = Buffer.alloc(30 + nombre.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)     // versión mínima para extraer
    local.writeUInt16LE(0x800, 6)  // bit 11: nombres en UTF-8 (tildes en los nombres de club)
    local.writeUInt16LE(8, 8)      // método: deflate
    local.writeUInt16LE(0, 10)     // hora MS-DOS
    local.writeUInt16LE(0x21, 12)  // fecha MS-DOS: 1980-01-01, fija (la fecha real va en el nombre del zip)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(nombre.length, 26)
    local.writeUInt16LE(0, 28)     // extra
    nombre.copy(local, 30)

    const entrada = Buffer.alloc(46 + nombre.length)
    entrada.writeUInt32LE(0x02014b50, 0)
    entrada.writeUInt16LE(20, 4)
    entrada.writeUInt16LE(20, 6)
    entrada.writeUInt16LE(0x800, 8)
    entrada.writeUInt16LE(8, 10)
    entrada.writeUInt16LE(0, 12)
    entrada.writeUInt16LE(0x21, 14)
    entrada.writeUInt32LE(crc, 16)
    entrada.writeUInt32LE(comprimido.length, 20)
    entrada.writeUInt32LE(datos.length, 24)
    entrada.writeUInt16LE(nombre.length, 28)
    entrada.writeUInt16LE(0, 30)   // extra
    entrada.writeUInt16LE(0, 32)   // comentario
    entrada.writeUInt16LE(0, 34)   // disco
    entrada.writeUInt16LE(0, 36)   // atributos internos
    entrada.writeUInt32LE(0, 38)   // atributos externos
    entrada.writeUInt32LE(offset, 42)
    nombre.copy(entrada, 46)

    partes.push(local, comprimido)
    central.push(entrada)
    offset += local.length + comprimido.length
  }

  const directorio = Buffer.concat(central)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(0, 4)
  fin.writeUInt16LE(0, 6)
  fin.writeUInt16LE(archivos.length, 8)
  fin.writeUInt16LE(archivos.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(offset, 16)
  fin.writeUInt16LE(0, 20)

  return Buffer.concat([...partes, directorio, fin])
}
