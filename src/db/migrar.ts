import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './index.ts'

// Ruta absoluta a propósito: systemd arranca el servicio con su propio
// WorkingDirectory, así que un './drizzle' relativo al cwd no es confiable.
const migrationsFolder = join(import.meta.dirname, '../../drizzle')

// Se llama explícitamente desde index.ts: importar este módulo no debe migrar nada.
export const migrarDb = () => {
  migrate(db, { migrationsFolder })
}
