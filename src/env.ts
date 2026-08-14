import { z } from 'zod'

const schema = z.object({
  // RNF-S3: por defecto loopback. En la Pi se fija a la IP de la tailnet.
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/personal.sqlite'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // RNF-S2: los dos secretos van sin default a propósito. Un default silencioso
  // dejaría el backend abierto, que es justo lo que esto viene a cerrar.
  PASSWORD_HASH: z.string().min(1), // generar con `pnpm hash-password`
  SESSION_SECRET: z.string().min(32), // generar con `openssl rand -hex 32`

  // La tailnet se sirve por HTTP plano: una cookie Secure ahí se descarta sin
  // aviso. Pasa a true el día que haya HTTPS (Tailscale Serve).
  // z.stringbool() y no z.coerce.boolean(), que convierte el string 'false' en true.
  COOKIE_SECURE: z.stringbool().default(false),
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
  passwordHash: parsed.data.PASSWORD_HASH,
  sessionSecret: parsed.data.SESSION_SECRET,
  cookieSecure: parsed.data.COOKIE_SECURE,
}
