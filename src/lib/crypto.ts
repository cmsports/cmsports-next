import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be a 64-char hex string')
  return Buffer.from(hex, 'hex')
}

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
