import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function getKeys() {
  const hex = process.env.ENCRYPTION_KEY
  const keys: Buffer[] = []
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) keys.push(Buffer.from(hex, 'hex'))

  // Vercel ya requiere esta clave para las tareas administrativas. Se deriva
  // una clave AES independiente para que el registro no falle si falta la
  // variable opcional ENCRYPTION_KEY.
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceRole) keys.push(createHash('sha256').update(`cmsports-solicitudes:${serviceRole}`).digest())
  if (!keys.length) throw new Error('No encryption key is configured')
  return keys
}

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', getKeys()[0], iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':')
  let ultimoError: unknown
  for (const key of getKeys()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
    } catch (error) {
      ultimoError = error
    }
  }
  throw ultimoError
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generarPassword(length = 10): string {
  const bytes = randomBytes(length)
  let pass = ''
  for (let i = 0; i < length; i++) pass += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length]
  return pass
}
