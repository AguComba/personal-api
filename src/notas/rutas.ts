import { type Request, Router } from 'express'
import { z } from 'zod'
import {
  actualizarNota,
  borrarNota,
  crearNota,
  listarNotas,
  listarTags,
  obtenerNota,
} from './datos.ts'

// El front copia estos esquemas a mano (el README es el contrato).

const TITULO_MAXIMO = 200
const CONTENIDO_MAXIMO = 100_000
const TAG_MAXIMO = 40
const TAGS_POR_NOTA = 20

// El título puede quedar vacío: con autoguardado, una nota recién empezada
// todavía no tiene uno, y rechazarla haría perder lo que se está escribiendo.
// El "Sin título" es cosa del front.
const tituloSchema = z.string().trim().max(TITULO_MAXIMO)
const contenidoSchema = z.string().max(CONTENIDO_MAXIMO)
const tagsSchema = z.array(z.string().trim().min(1).max(TAG_MAXIMO)).max(TAGS_POR_NOTA)

const notaNuevaSchema = z.object({
  titulo: tituloSchema.default(''),
  contenido: contenidoSchema.default(''),
  tags: tagsSchema.default([]),
})

// Todos opcionales: el `PATCH` es parcial y lo que no viene no se toca. Es lo
// que deja que el autoguardado mande solo `contenido`.
const cambiosSchema = z.object({
  titulo: tituloSchema.optional(),
  contenido: contenidoSchema.optional(),
  archivada: z.boolean().optional(),
  tags: tagsSchema.optional(),
})

const filtrosSchema = z.object({
  q: z.string().trim().max(TITULO_MAXIMO).optional(),
  tag: z.string().trim().min(1).max(TAG_MAXIMO).optional(),
  archivadas: z.stringbool().default(false),
})

const idSchema = z.coerce.number().int().positive()

const leerId = (req: Request) => idSchema.safeParse(req.params.id)

export const rutasNotas = Router()

rutasNotas.get('/', (req, res) => {
  const filtros = filtrosSchema.safeParse(req.query)
  if (!filtros.success) {
    res.status(400).json({ error: 'Filtros inválidos' })
    return
  }

  res.json(listarNotas(filtros.data))
})

rutasNotas.post('/', (req, res) => {
  const cuerpo = notaNuevaSchema.safeParse(req.body)
  if (!cuerpo.success) {
    res.status(400).json({ error: 'Nota inválida' })
    return
  }

  res.status(201).json(crearNota(cuerpo.data))
})

rutasNotas.get('/:id', (req, res) => {
  const id = leerId(req)
  if (!id.success) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const nota = obtenerNota(id.data)
  if (!nota) {
    res.status(404).json({ error: 'No encontrada' })
    return
  }

  res.json(nota)
})

rutasNotas.patch('/:id', (req, res) => {
  const id = leerId(req)
  if (!id.success) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  const cambios = cambiosSchema.safeParse(req.body)
  if (!cambios.success) {
    res.status(400).json({ error: 'Cambios inválidos' })
    return
  }

  const nota = actualizarNota(id.data, cambios.data)
  if (!nota) {
    res.status(404).json({ error: 'No encontrada' })
    return
  }

  res.json(nota)
})

rutasNotas.delete('/:id', (req, res) => {
  const id = leerId(req)
  if (!id.success) {
    res.status(400).json({ error: 'Id inválido' })
    return
  }

  if (!borrarNota(id.data)) {
    res.status(404).json({ error: 'No encontrada' })
    return
  }

  res.status(204).end()
})

// Los tags no tienen ABM propio: nacen y mueren con las notas que los usan
// (RF-N3). Lo único que hace falta leer es cuáles están en uso, para el filtro.
export const rutasTags = Router()

rutasTags.get('/', (_req, res) => {
  res.json(listarTags())
})
