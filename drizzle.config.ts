import { defineConfig } from 'drizzle-kit'
import { env } from './src/env.ts'

// La ruta de la base sale de env.ts, no de process.env: una sola fuente.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.databasePath },
})
