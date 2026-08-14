import { z } from 'zod'

/**
 * Los colores de `tag.color` y `category.color` son una lista cerrada de slugs,
 * no hex libres (documentacion/sistema-de-diseno.md).
 *
 * El motivo es el modo oscuro: un hex elegido sobre fondo blanco se apaga sobre
 * zinc-950 y no hay forma de arreglarlo sin recalcularlo. Guardando el slug, el
 * front decide el valor por tema.
 *
 * `as const` y no un enum de TS: `erasableSyntaxOnly` no dejaría pasar el enum.
 */
export const COLORES = [
  'rojo',
  'ambar',
  'verde',
  'teal',
  'azul',
  'violeta',
  'rosa',
  'gris',
] as const

export const colorSchema = z.enum(COLORES)

export type Color = z.infer<typeof colorSchema>

/**
 * RF-N3: los tags se crean al vuelo al escribirlos, así que nadie elige el
 * color. Se deriva del nombre para que el mismo tag caiga siempre en el mismo
 * color, sin guardar nada más ni consultar los que ya existen.
 *
 * Es un djb2 recortado: no necesita ser criptográfico, solo estable.
 */
export const colorPorNombre = (nombre: string): Color => {
  let hash = 5381
  for (let i = 0; i < nombre.length; i++) {
    hash = (hash * 33 + nombre.charCodeAt(i)) % 0xffffffff
  }

  return COLORES[hash % COLORES.length]
}
