import express, { type ErrorRequestHandler } from 'express'

// Express 5 propaga los errores de handlers async solo: no hace falta envolverlos.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
}

export const createApp = () => {
  const app = express()

  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.use((_req, res) => {
    res.status(404).json({ error: 'No encontrado' })
  })

  app.use(errorHandler)

  return app
}
