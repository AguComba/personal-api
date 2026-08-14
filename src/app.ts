import { sql } from 'drizzle-orm'
import express, { type ErrorRequestHandler } from 'express'
import { requerirSesion } from './auth/requerir-sesion.ts'
import { rutasAuth } from './auth/rutas.ts'
import { db } from './db/index.ts'

// Express 5 propaga los errores de handlers async solo: no hace falta envolverlos.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
}

export const createApp = () => {
  const app = express()

  app.use(express.json())

  // --- Público (RNF-S2) ---------------------------------------------------
  app.use('/api/auth', rutasAuth)

  // Toca la base a propósito: lo que importa saber después de un `systemctl
  // restart` es si el proceso vive *y* la base abre. Un 503 explícito, no el 500
  // del errorHandler, para poder distinguir los dos casos desde el celular.
  // Queda pública: sirve justamente para chequear la Pi sin tener que loguearse.
  app.get('/api/health', (_req, res) => {
    const uptime = process.uptime()

    try {
      db.get(sql`select 1`)
    } catch (err) {
      console.error(err)
      res.status(503).json({ status: 'degradado', uptime, db: 'error' })
      return
    }

    res.json({ status: 'ok', uptime, db: 'ok' })
  })

  // --- Barrera (RNF-S2) ---------------------------------------------------
  // Todo lo que se registre debajo nace protegido. Va montada en `/api` y no en
  // la app entera para que el futuro catch-all del SPA siga sirviendo el HTML
  // sin sesión: el login tiene que poder cargar.
  app.use('/api', requerirSesion)

  app.use((_req, res) => {
    res.status(404).json({ error: 'No encontrado' })
  })

  app.use(errorHandler)

  return app
}
