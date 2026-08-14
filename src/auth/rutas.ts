import { Router } from 'express'
import { z } from 'zod'
import { env } from '../env.ts'
import { verificarPassword } from './password.ts'
import { DURACION_MS, firmarToken, haySesion, NOMBRE_COOKIE, opcionesCookie } from './sesion.ts'

// El front copia este esquema a mano (el README es el contrato).
const loginSchema = z.object({
  password: z.string().min(1),
})

// Freno a la fuerza bruta. La contraseña es el único secreto y cualquiera en la
// tailnet puede golpear el login. El estado es global porque hay un solo usuario,
// y vive en memoria: se pierde al reiniciar, y no vale una tabla para eso.
const FALLOS_TOLERADOS = 5
const ESPERA_INICIAL_MS = 30_000
const ESPERA_MAXIMA_MS = 5 * 60 * 1000

let fallos = 0
let bloqueadoHasta = 0

const segundosRestantes = () => Math.ceil((bloqueadoHasta - Date.now()) / 1000)

const registrarFallo = () => {
  fallos += 1
  if (fallos < FALLOS_TOLERADOS) return

  // Cada fallo pasado el umbral duplica la espera, con techo.
  const espera = Math.min(ESPERA_INICIAL_MS * 2 ** (fallos - FALLOS_TOLERADOS), ESPERA_MAXIMA_MS)
  bloqueadoHasta = Date.now() + espera
}

export const rutasAuth = Router()

rutasAuth.post('/login', async (req, res) => {
  if (Date.now() < bloqueadoHasta) {
    res.status(429).json({ error: 'Demasiados intentos', reintentarEn: segundosRestantes() })
    return
  }

  const cuerpo = loginSchema.safeParse(req.body)
  if (!cuerpo.success) {
    res.status(400).json({ error: 'Falta la contraseña' })
    return
  }

  if (!(await verificarPassword(cuerpo.data.password, env.passwordHash))) {
    registrarFallo()
    res.status(401).json({ error: 'Contraseña incorrecta' })
    return
  }

  fallos = 0
  bloqueadoHasta = 0

  const venceEn = Date.now() + DURACION_MS
  res.cookie(NOMBRE_COOKIE, firmarToken(venceEn), { ...opcionesCookie, maxAge: DURACION_MS })
  res.json({ ok: true })
})

rutasAuth.post('/logout', (_req, res) => {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie)
  res.json({ ok: true })
})

// Pública a propósito: el front la usa al arrancar para saber si mostrar el
// login. Con un 401 habría que tratar "todavía no me logueé" como un error.
rutasAuth.get('/sesion', (req, res) => {
  res.json({ autenticado: haySesion(req) })
})
