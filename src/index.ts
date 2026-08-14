import { createApp } from './app.ts'
import { sqlite } from './db/index.ts'
import { migrarDb } from './db/migrar.ts'
import { env } from './env.ts'

// Antes del listen: si el esquema no queda al día, no hay servicio que valga.
migrarDb()

const server = createApp().listen(env.port, env.host, () => {
  console.log(`personal-api escuchando en http://${env.host}:${env.port}`)
})

// Docker manda SIGTERM al parar o reiniciar el contenedor (RNF-5). Llega al
// proceso directo porque el CMD del Dockerfile es `node`, sin pnpm ni shell.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      sqlite.close() // checkpointea el WAL antes de salir
      process.exit(0)
    })
  })
}
