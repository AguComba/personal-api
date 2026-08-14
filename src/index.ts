import { createApp } from './app.ts'
import { sqlite } from './db/index.ts'
import { migrarDb } from './db/migrar.ts'
import { env } from './env.ts'

// Antes del listen: si el esquema no queda al día, no hay servicio que valga.
migrarDb()

const server = createApp().listen(env.port, env.host, () => {
  console.log(`personal-api escuchando en http://${env.host}:${env.port}`)
})

// systemd manda SIGTERM en `systemctl restart` (RNF-5)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      sqlite.close() // checkpointea el WAL antes de salir
      process.exit(0)
    })
  })
}
