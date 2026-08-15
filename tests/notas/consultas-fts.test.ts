import { describe, expect, it } from 'vitest'
import { expresionFts } from '../../src/notas/consultas-fts.ts'

// `expresionFts` es lógica pura, pero es la única de la etapa 2 donde un caso
// borde no da un resultado equivocado sino un error de SQL: FTS5 rechaza la
// consulta entera y la pantalla de búsqueda se rompe. De ahí que se teste.

describe('expresionFts', () => {
  it('busca el último token por prefijo, para encontrar mientras se escribe', () => {
    expect(expresionFts('not')).toBe('"not"*')
  })

  it('exige todos los términos y deja el prefijo solo en el último', () => {
    expect(expresionFts('hola mun')).toBe('"hola" "mun"*')
  })

  it('descarta los operadores de FTS5 en vez de pasarlos', () => {
    // Sin esto, `MATCH` los interpreta y la consulta falla o miente.
    expect(expresionFts('precios: 2026')).toBe('"precios" "2026"*')
    expect(expresionFts('gastos AND OR')).toBe('"gastos" "AND" "OR"*')
    expect(expresionFts('a NEAR/3 b')).toBe('"a" "NEAR" "3" "b"*')
  })

  it('no deja una comilla adentro de un token', () => {
    // El caso que rompería el escapado: la comilla es separador, no contenido.
    expect(expresionFts('el "libro" rojo')).toBe('"el" "libro" "rojo"*')
  })

  it('conserva letras acentuadas y ñ', () => {
    // Van al índice tal cual; los acentos los normaliza el tokenizador
    // (`remove_diacritics 2`), no esta función.
    expect(expresionFts('café mañana')).toBe('"café" "mañana"*')
  })

  it('devuelve null cuando no queda nada que buscar', () => {
    expect(expresionFts('')).toBe(null)
    expect(expresionFts('   ')).toBe(null)
    expect(expresionFts('"')).toBe(null)
    expect(expresionFts('*** ^^^ ---')).toBe(null)
  })
})
