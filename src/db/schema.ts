import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { COLORES } from '../dominio/colores.ts'

// El modelo completo del alcance §4. Está entero desde la etapa 0 aunque varias
// tablas recién se usen más adelante: `link` no se consulta hasta la etapa 5.
//
// Convenciones (alcance §4):
// - Los montos son enteros en centavos (RNF-D1). Nunca `real`.
// - Las fechas son texto ISO 8601 (RNF-D2). Los timestamps guardan el instante
//   completo; `task.due_date` y `transaction.date` guardan la fecha civil
//   `YYYY-MM-DD`. La timezone fija America/Argentina/Cordoba se aplica al
//   formatear, no al guardar.
// - Los borrados son físicos, salvo notas y tareas (RNF-D3).

const ahora = () => new Date().toISOString()

// La tabla virtual FTS5 que indexa `title` y `content` no se declara acá: se crea
// con una migración custom (drizzle/0002_notas_fts.sql) y se consulta con el
// template `sql`. Ver el README y el CLAUDE.md.
export const note = sqliteTable(
  'note',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    createdAt: text('created_at').notNull().$defaultFn(ahora),
    updatedAt: text('updated_at').notNull().$defaultFn(ahora),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  // RF-N4 ordena el listado por fecha de modificación, siempre.
  (t) => [index('note_updated_at_idx').on(t.updatedAt)],
)

export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  // Un slug de la lista cerrada, no un hex: ver src/dominio/colores.ts.
  color: text('color', { enum: COLORES }).notNull(),
})

export const noteTag = sqliteTable(
  'note_tag',
  {
    noteId: integer('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.tagId] }),
    // La PK ya cubre las búsquedas por nota; este índice es para el sentido inverso.
    index('note_tag_tag_id_idx').on(t.tagId),
  ],
)

// Una sola entidad para tareas y eventos: con `due_date` aparece en el
// calendario, sin él, en la lista de pendientes.
export const task = sqliteTable(
  'task',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().$defaultFn(ahora),
  },
  (t) => [index('task_due_date_idx').on(t.dueDate)],
)

export const account = sqliteTable('account', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // `text` con enum, no un enum de TS: `erasableSyntaxOnly` no lo dejaría pasar.
  type: text('type', { enum: ['efectivo', 'debito', 'credito'] }).notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const category = sqliteTable('category', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['ingreso', 'egreso'] }).notNull(),
  color: text('color', { enum: COLORES }).notNull(),
})

export const transaction = sqliteTable(
  'transaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Centavos (RNF-D1).
    amount: integer('amount').notNull(),
    date: text('date').notNull(),
    description: text('description'),
    accountId: integer('account_id')
      .notNull()
      .references(() => account.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id),
  },
  (t) => [
    index('transaction_date_idx').on(t.date),
    index('transaction_account_id_idx').on(t.accountId),
  ],
)

// Relación genérica entre entidades: polimórfica y sin foreign keys a propósito.
// Permite vincular cualquier cosa con cualquier cosa sin tocar el esquema, y los
// vínculos se leen en los dos sentidos, por eso los dos índices.
export const link = sqliteTable(
  'link',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(ahora),
  },
  (t) => [
    index('link_source_idx').on(t.sourceType, t.sourceId),
    index('link_target_idx').on(t.targetType, t.targetId),
  ],
)
