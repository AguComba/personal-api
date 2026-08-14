import { createApp } from './app.ts'
import { env } from './env.ts'

const server = createApp().listen(env.port, env.host, () => {
  console.log(`personal-api escuchando en http://${env.host}:${env.port}`)
})

// systemd manda SIGTERM en `systemctl restart` (RNF-5)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
