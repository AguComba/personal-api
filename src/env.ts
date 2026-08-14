import { z } from 'zod'

const schema = z.object({
  // RNF-S3: por defecto loopback. En la Pi se fija a la IP de la tailnet.
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/personal.sqlite'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variables de entorno inválidas:', z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = {
  host: parsed.data.HOST,
  port: parsed.data.PORT,
  databasePath: parsed.data.DATABASE_PATH,
  nodeEnv: parsed.data.NODE_ENV,
}
