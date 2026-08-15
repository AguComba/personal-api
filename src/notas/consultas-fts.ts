/**
 * RF-N5: traduce lo que el usuario escribió en el buscador a una expresión de
 * `MATCH` de FTS5.
 *
 * No se puede pasar el texto crudo. `MATCH` tiene sintaxis propia —`AND`, `OR`,
 * `NEAR`, `columna:`, comillas, paréntesis— y cualquiera de esos caracteres
 * sueltos hace que SQLite tire un error en vez de no encontrar nada. Buscar
 * `precios: 2026` reventaría la pantalla entera.
 *
 * La defensa es partir por todo lo que no sea letra o número: así ningún
 * carácter con significado sobrevive, y cada token se puede envolver en comillas
 * sin escapar nada, porque adentro no puede quedar una comilla.
 *
 * Al último token se le agrega `*` para que busque por prefijo, que es lo que
 * hace que los resultados aparezcan mientras se escribe: con `not` a medio
 * tipear, `"not"*` ya encuentra "notas".
 *
 * Devuelve `null` cuando no quedó nada que buscar (texto vacío, o solo símbolos):
 * el llamador lo trata como "sin búsqueda", no como una búsqueda sin resultados.
 */
export const expresionFts = (consulta: string): string | null => {
  const tokens = consulta.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (tokens.length === 0) return null

  return tokens
    .map((token, i) => (i === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(' ')
}
