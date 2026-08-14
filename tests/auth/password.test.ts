import { describe, expect, it } from 'vitest'
import { hashearPassword, verificarPassword } from '../../src/auth/password.ts'

// Excepción a "se testea solo finanzas y fechas": es lógica pura y es el único
// lugar donde un bug silencioso deja el backend abierto sin que se note a mano.
describe('verificarPassword', () => {
  it('acepta la contraseña con la que se generó el hash', async () => {
    const hash = await hashearPassword('un secreto cualquiera')

    expect(await verificarPassword('un secreto cualquiera', hash)).toBe(true)
  })

  it('rechaza cualquier otra contraseña', async () => {
    const hash = await hashearPassword('un secreto cualquiera')

    expect(await verificarPassword('un secreto cualquierA', hash)).toBe(false)
    expect(await verificarPassword('', hash)).toBe(false)
    expect(await verificarPassword('un secreto cualquiera ', hash)).toBe(false)
  })

  it('usa un salt distinto en cada hash', async () => {
    const uno = await hashearPassword('misma')
    const otro = await hashearPassword('misma')

    expect(uno).not.toBe(otro)
    expect(await verificarPassword('misma', otro)).toBe(true)
  })

  it('devuelve false, sin tirar, con un hash malformado', async () => {
    const malformados = [
      '',
      'texto plano',
      'scrypt$16384$8$1$solo-cuatro-campos',
      'bcrypt$16384$8$1$aabb$ccdd',
      'scrypt$0$8$1$aabb$ccdd',
      'scrypt$noesnumero$8$1$aabb$ccdd',
      'scrypt$16384$8$1$$',
      'scrypt$3$8$1$aabb$ccdd', // N no es potencia de dos: scrypt tira adentro
    ]

    for (const hash of malformados) {
      expect(await verificarPassword('lo que sea', hash), hash).toBe(false)
    }
  })
})
