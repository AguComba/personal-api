import { describe, expect, it } from 'vitest'

// env.ts lee process.env al importarse y hace process.exit(1) si falta un
// secreto, y Vitest no carga el .env. Por eso el import es dinámico y va
// después de poblar el entorno.
process.env.PASSWORD_HASH ??= 'scrypt$16384$8$1$aabb$ccdd'
process.env.SESSION_SECRET ??= 'secreto-de-prueba-de-mas-de-treinta-y-dos-caracteres'

const { DURACION_MS, firmarToken, leerCookie, verificarToken } = await import(
  '../../src/auth/sesion.ts'
)

const enUnRato = () => Date.now() + DURACION_MS

describe('verificarToken', () => {
  it('acepta un token propio que todavía no venció', () => {
    expect(verificarToken(firmarToken(enUnRato()))).toBe(true)
  })

  it('rechaza un token vencido aunque la firma sea válida', () => {
    expect(verificarToken(firmarToken(Date.now() - 1000))).toBe(false)
  })

  it('rechaza una firma alterada', () => {
    const [payload, firma] = firmarToken(enUnRato()).split('.')
    const alterada = `${firma.slice(0, -1)}${firma.at(-1) === 'a' ? 'b' : 'a'}`

    expect(verificarToken(`${payload}.${alterada}`)).toBe(false)
  })

  it('rechaza un vencimiento estirado con la firma original', () => {
    const venceEn = enUnRato()
    const firma = firmarToken(venceEn).split('.')[1]

    expect(verificarToken(`${venceEn + 60_000}.${firma}`)).toBe(false)
  })

  it('devuelve false, sin tirar, con basura', () => {
    for (const token of [undefined, '', '.', 'sinpunto', 'a.b', `${enUnRato()}.`, '..']) {
      expect(verificarToken(token), String(token)).toBe(false)
    }
  })
})

describe('leerCookie', () => {
  const req = (cookie?: string) => ({ headers: cookie === undefined ? {} : { cookie } })

  it('encuentra la cookie entre varias', () => {
    // @ts-expect-error alcanza con headers: leerCookie no toca nada más del Request
    expect(leerCookie(req('otra=1; sesion=abc; ultima=2'), 'sesion')).toBe('abc')
  })

  it('no confunde una cookie cuyo nombre termina igual', () => {
    // @ts-expect-error idem
    expect(leerCookie(req('nosesion=abc'), 'sesion')).toBeUndefined()
  })

  it('devuelve undefined si no hay header ni cookie', () => {
    // @ts-expect-error idem
    expect(leerCookie(req(), 'sesion')).toBeUndefined()
    // @ts-expect-error idem
    expect(leerCookie(req('otra=1'), 'sesion')).toBeUndefined()
  })
})
