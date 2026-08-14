import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { env } from '../env.ts'
import * as schema from './schema.ts'

// `data/` está gitignoreado, así que en un clon limpio no existe. better-sqlite3
// no crea el directorio: sin esto el primer arranque muere con SQLITE_CANTOPEN.
mkdirSync(dirname(env.databasePath), { recursive: true })

export const sqlite = new Database(env.databasePath)

// Los cuatro pragmas van antes de cualquier query (stack.md §2).
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON') // sin esto las FK del schema son decorativas y SQLite no avisa
sqlite.pragma('busy_timeout = 5000') // evita SQLITE_BUSY durante el backup diario
sqlite.pragma('synchronous = NORMAL') // suficiente con WAL, menos desgaste de la SD

export const db = drizzle(sqlite, { schema })
