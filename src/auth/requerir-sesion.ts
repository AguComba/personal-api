import type { RequestHandler } from 'express'
import { haySesion } from './sesion.ts'

/**
 * Va montado en `/api` después de las rutas públicas, así que todo lo que se
 * registre debajo nace protegido: agregar una ruta nueva no requiere acordarse
 * de nada. Como efecto buscado, una ruta inexistente sin sesión da 401 y no
 * 404, que además no deja enumerar el árbol de rutas.
 */
export const requerirSesion: RequestHandler = (req, res, next) => {
  if (!haySesion(req)) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }

  next()
}
