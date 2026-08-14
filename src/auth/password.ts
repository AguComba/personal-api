import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto'

// promisify(scrypt) resuelve a la sobrecarga sin opciones, así que la promesa va
// a mano. Un throw sincrónico de scrypt (parámetros inválidos) sale como rechazo.
const derivar = (texto: string, salt: Buffer, largo: number, opciones: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(texto, salt, largo, opciones, (err, clave) => {
      if (err) reject(err)
      else resolve(clave)
    })
  })

// Parámetros de hoy. Van dentro del hash, así que subirlos mañana no invalida
// los hashes viejos: cada uno se verifica con los suyos.
const N = 16384 // ~16 MB de memoria (128 * N * r), lejos del maxmem por defecto
const R = 8
const P = 1
const LARGO_CLAVE = 32

/** Formato propio: `scrypt$N$r$p$saltHex$hashHex`. */
export const hashearPassword = async (texto: string) => {
  const salt = randomBytes(16)
  const clave = await derivar(texto, salt, LARGO_CLAVE, { N, r: R, p: P })

  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${clave.toString('hex')}`
}

export const verificarPassword = async (texto: string, hash: string) => {
  const partes = hash.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false

  const [, n, r, p, saltHex, claveHex] = partes
  const parametros = { N: Number(n), r: Number(r), p: Number(p) }
  if (!Number.isInteger(parametros.N) || !Number.isInteger(parametros.r)) return false
  if (!Number.isInteger(parametros.p) || parametros.N < 2) return false

  const salt = Buffer.from(saltHex, 'hex')
  const esperada = Buffer.from(claveHex, 'hex')
  if (salt.length === 0 || esperada.length === 0) return false

  // scrypt tira si N no es potencia de dos o si los parámetros piden más memoria
  // que maxmem: un PASSWORD_HASH corrupto tiene que dar "no autorizado", no un 500.
  let calculada: Buffer
  try {
    calculada = await derivar(texto, salt, esperada.length, parametros)
  } catch {
    return false
  }

  // timingSafeEqual tira si los largos difieren, y acá siempre coinciden porque
  // se derivó con esperada.length. El chequeo queda igual por si el hash miente.
  return calculada.length === esperada.length && timingSafeEqual(calculada, esperada)
}
