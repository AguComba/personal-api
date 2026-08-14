import { sql } from 'drizzle-orm'
import express, { type ErrorRequestHandler } from 'express'
import { db } from './db/index.ts'

// Express 5 propaga los errores de handlers async solo: no hace falta envolverlos.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
}

export const createApp = () => {
  const app = express()

  app.use(express.json())

  // Toca la base a propósito: lo que importa saber después de un `systemctl
  // restart` es si el proceso vive *y* la base abre. Un 503 explícito, no el 500
  // del errorHandler, para poder distinguir los dos casos desde el celular.
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

  app.use((_req, res) => {
    res.status(404).json({ error: 'No encontrado' })
  })

  app.use(errorHandler)

  return app
}
