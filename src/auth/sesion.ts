import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CookieOptions, Request } from 'express'
import { env } from '../env.ts'

export const NOMBRE_COOKIE = 'sesion'

/** 30 días. No hay renovación deslizante: re-loguearse una vez al mes está bien. */
export const DURACION_MS = 30 * 24 * 60 * 60 * 1000

export const opcionesCookie: CookieOptions = {
  httpOnly: true, // que ningún script del front pueda leerla
  sameSite: 'lax', // alcanza como anti-CSRF: bloquea el POST cross-site
  path: '/',
  secure: env.cookieSecure,
}

const firmar = (payload: string) =>
  createHmac('sha256', env.sessionSecret).update(payload).digest('base64url')

/**
 * La sesión no tiene estado: el token es su propio vencimiento firmado.
 * No hay nada más que guardar porque hay un solo usuario y no hay roles.
 */
export const firmarToken = (venceEn: number) => `${venceEn}.${firmar(String(venceEn))}`

export const verificarToken = (token: string | undefined) => {
  if (!token) return false

  const corte = token.indexOf('.')
  if (corte === -1) return false

  const payload = token.slice(0, corte)
  const firma = Buffer.from(token.slice(corte + 1))
  const esperada = Buffer.from(firmar(payload))

  if (firma.length !== esperada.length || !timingSafeEqual(firma, esperada)) return false

  const venceEn = Number(payload)

  return Number.isFinite(venceEn) && venceEn > Date.now()
}

/** Express 5 no parsea cookies solo, y cookie-parser sería una dependencia por seis líneas. */
export const leerCookie = (req: Request, nombre: string) => {
  const header = req.headers.cookie
  if (!header) return undefined

  for (const par of header.split(';')) {
    const corte = par.indexOf('=')
    if (corte === -1) continue

    if (par.slice(0, corte).trim() === nombre) {
      return decodeURIComponent(par.slice(corte + 1).trim())
    }
  }

  return undefined
}

export const haySesion = (req: Request) => verificarToken(leerCookie(req, NOMBRE_COOKIE))
