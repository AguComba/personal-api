import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { db } from './index.ts'

// Ruta absoluta a propósito: no depende del cwd con el que se haya arrancado el
// proceso, que en el contenedor lo fija el WORKDIR del Dockerfile.
const migrationsFolder = join(import.meta.dirname, '../../drizzle')

// Se llama explícitamente desde index.ts: importar este módulo no debe migrar nada.
export const migrarDb = () => {
  migrate(db, { migrationsFolder })
}
