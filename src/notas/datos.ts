import { eq, inArray, notExists, sql } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { note, noteTag, tag } from '../db/schema.ts'
import { colorPorNombre } from '../dominio/colores.ts'
import { expresionFts } from './consultas-fts.ts'

// Todo lo que toca la base del módulo de notas. Las rutas de `rutas.ts` validan
// y traducen a HTTP; acá adentro no hay `req` ni `res`.
//
// El driver es síncrono (better-sqlite3), así que las consultas se cierran con
// `.all()` / `.get()` / `.run()` y las transacciones son transacciones de verdad,
// sin await de por medio.

/** Los caracteres del contenido que viajan al listado. El front recorta y limpia. */
const LARGO_EXTRACTO = 240

/** La conexión dentro de una transacción abierta. Drizzle no la exporta con nombre. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type TagDeNota = { id: number; nombre: string; color: string }

export type NotaEnLista = {
  id: number
  titulo: string
  extracto: string
  modificadaEn: string
  archivada: boolean
  tags: TagDeNota[]
}

export type Nota = {
  id: number
  titulo: string
  contenido: string
  creadaEn: string
  modificadaEn: string
  archivada: boolean
  tags: TagDeNota[]
}

type FilaLista = {
  id: number
  titulo: string
  extracto: string
  modificadaEn: string
  archivada: number
}

/** Los tags de varias notas de una, para no hacer una consulta por fila. */
const tagsPorNota = (ids: number[]) => {
  const porNota = new Map<number, TagDeNota[]>(ids.map((id) => [id, []]))
  if (ids.length === 0) return porNota

  const filas = db
    .select({ noteId: noteTag.noteId, id: tag.id, nombre: tag.name, color: tag.color })
    .from(noteTag)
    .innerJoin(tag, eq(tag.id, noteTag.tagId))
    .where(inArray(noteTag.noteId, ids))
    .orderBy(tag.name)
    .all()

  for (const { noteId, ...tagDeNota } of filas) porNota.get(noteId)?.push(tagDeNota)

  return porNota
}

/**
 * RF-N4 (listado por fecha de modificación, filtrable por tag) y RF-N5 (búsqueda).
 *
 * Son dos consultas distintas porque el orden lo es: con búsqueda manda `rank`
 * —lo más parecido a lo buscado primero—, y sin búsqueda, la fecha.
 *
 * El extracto también cambia: buscando sale de `snippet()`, que devuelve el
 * pedazo del texto donde apareció el término. Es lo que hace que HU-N5 sirva
 * para encontrar una nota de la que no te acordás el título.
 *
 * RF-N6: sin búsqueda se ve un lado o el otro del archivado; **buscando se
 * busca en todo**, porque archivar saca del listado pero no del alcance de la
 * búsqueda.
 */
export const listarNotas = ({
  q,
  tag: nombreTag,
  archivadas,
}: {
  q?: string
  tag?: string
  archivadas: boolean
}): NotaEnLista[] => {
  const expresion = q ? expresionFts(q) : null

  // `n` es el alias de `note` en las dos consultas, así que el filtro sirve para
  // ambas. `exists` en vez de un join: un join por tag duplicaría filas.
  const filtroTag = nombreTag
    ? sql` and exists (
        select 1 from note_tag nt
        join tag t on t.id = nt.tag_id
        where nt.note_id = n.id and t.name = ${nombreTag}
      )`
    : sql.empty()

  const consulta = expresion
    ? sql`
        select n.id as id,
               n.title as titulo,
               snippet(note_fts, -1, '', '', '…', 20) as extracto,
               n.updated_at as "modificadaEn",
               n.archived as archivada
        from note_fts
        join note n on n.id = note_fts.rowid
        where note_fts match ${expresion}${filtroTag}
        order by rank
      `
    : sql`
        select n.id as id,
               n.title as titulo,
               substr(n.content, 1, ${LARGO_EXTRACTO}) as extracto,
               n.updated_at as "modificadaEn",
               n.archived as archivada
        from note n
        where n.archived = ${archivadas ? 1 : 0}${filtroTag}
        order by n.updated_at desc
      `

  const filas = db.all<FilaLista>(consulta)
  const tags = tagsPorNota(filas.map(({ id }) => id))

  return filas.map((fila) => ({
    ...fila,
    archivada: Boolean(fila.archivada),
    tags: tags.get(fila.id) ?? [],
  }))
}

export const obtenerNota = (id: number): Nota | null => {
  const fila = db.select().from(note).where(eq(note.id, id)).get()
  if (!fila) return null

  return {
    id: fila.id,
    titulo: fila.title,
    contenido: fila.content,
    creadaEn: fila.createdAt,
    modificadaEn: fila.updatedAt,
    archivada: fila.archived,
    tags: tagsPorNota([id]).get(id) ?? [],
  }
}

/**
 * RF-N3: los tags se crean al vuelo, así que lo que llega son nombres sueltos y
 * no ids. Se normalizan a minúscula para que "Trabajo" y "trabajo" no terminen
 * siendo dos tags distintos con dos colores distintos.
 *
 * El color no lo elige nadie: sale del nombre con `colorPorNombre`, que es
 * estable, así que el mismo tag cae siempre en el mismo color sin guardar nada
 * más ni mirar los que ya existen.
 */
const reemplazarTags = (tx: Tx, noteId: number, nombres: string[]) => {
  const normalizados = [
    ...new Set(nombres.map((nombre) => nombre.trim().toLowerCase()).filter(Boolean)),
  ]

  tx.delete(noteTag).where(eq(noteTag.noteId, noteId)).run()

  if (normalizados.length > 0) {
    tx.insert(tag)
      .values(normalizados.map((nombre) => ({ name: nombre, color: colorPorNombre(nombre) })))
      .onConflictDoNothing()
      .run()

    const filas = tx.select({ id: tag.id }).from(tag).where(inArray(tag.name, normalizados)).all()

    tx.insert(noteTag)
      .values(filas.map(({ id }) => ({ noteId, tagId: id })))
      .run()
  }

  // Un tag que se sacó de su última nota no le sirve a nadie: no aparece en el
  // filtro ni se puede volver a elegir salvo escribiéndolo, que es justo lo que
  // lo vuelve a crear. Se borra acá para que la tabla no junte basura.
  tx.delete(tag)
    .where(notExists(tx.select({ x: sql`1` }).from(noteTag).where(eq(noteTag.tagId, tag.id))))
    .run()
}

export const crearNota = ({
  titulo,
  contenido,
  tags,
}: {
  titulo: string
  contenido: string
  tags: string[]
}): Nota =>
  db.transaction((tx) => {
    const fila = tx.insert(note).values({ title: titulo, content: contenido }).returning().get()
    reemplazarTags(tx, fila.id, tags)

    return {
      id: fila.id,
      titulo: fila.title,
      contenido: fila.content,
      creadaEn: fila.createdAt,
      modificadaEn: fila.updatedAt,
      archivada: fila.archived,
      tags: tagsDeUnaNota(tx, fila.id),
    }
  })

/** Igual que `tagsPorNota` pero dentro de una transacción abierta. */
const tagsDeUnaNota = (tx: Tx, noteId: number): TagDeNota[] =>
  tx
    .select({ id: tag.id, nombre: tag.name, color: tag.color })
    .from(noteTag)
    .innerJoin(tag, eq(tag.id, noteTag.tagId))
    .where(eq(noteTag.noteId, noteId))
    .orderBy(tag.name)
    .all()

/**
 * El `PATCH` es parcial de verdad: lo que no viene, no se toca. Es lo que
 * permite que el autoguardado mande solo `contenido` cada vez que se deja de
 * escribir, sin pisar los tags ni el archivado.
 */
export const actualizarNota = (
  id: number,
  cambios: { titulo?: string; contenido?: string; archivada?: boolean; tags?: string[] },
): Nota | null =>
  db.transaction((tx) => {
    const existe = tx.select({ id: note.id }).from(note).where(eq(note.id, id)).get()
    if (!existe) return null

    const { titulo, contenido, archivada, tags } = cambios

    // `updated_at` se escribe a mano: el schema tiene `$defaultFn` para el alta
    // pero Drizzle no lo toca en un update.
    const fila = tx
      .update(note)
      .set({
        ...(titulo !== undefined && { title: titulo }),
        ...(contenido !== undefined && { content: contenido }),
        ...(archivada !== undefined && { archived: archivada }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(note.id, id))
      .returning()
      .get()

    if (tags !== undefined) reemplazarTags(tx, id, tags)

    return {
      id: fila.id,
      titulo: fila.title,
      contenido: fila.content,
      creadaEn: fila.createdAt,
      modificadaEn: fila.updatedAt,
      archivada: fila.archived,
      tags: tagsDeUnaNota(tx, id),
    }
  })

/** Borrado físico. Las filas de `note_tag` se van con la nota por el `on delete cascade`. */
export const borrarNota = (id: number): boolean =>
  db.transaction((tx) => {
    const borrada = tx.delete(note).where(eq(note.id, id)).returning({ id: note.id }).get()
    if (!borrada) return false

    tx.delete(tag)
      .where(notExists(tx.select({ x: sql`1` }).from(noteTag).where(eq(noteTag.tagId, tag.id))))
      .run()

    return true
  })

/** Los tags en uso, con cuántas notas tiene cada uno: es lo que alimenta el filtro de RF-N4. */
export const listarTags = () =>
  db
    .select({
      id: tag.id,
      nombre: tag.name,
      color: tag.color,
      notas: sql<number>`count(${noteTag.noteId})`,
    })
    .from(tag)
    .innerJoin(noteTag, eq(noteTag.tagId, tag.id))
    .groupBy(tag.id)
    .orderBy(tag.name)
    .all()
