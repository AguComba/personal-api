import { hashearPassword } from './password.ts'

/**
 * `pnpm hash-password` — imprime la línea de PASSWORD_HASH lista para pegar en
 * el .env. No importa env.ts a propósito: ese módulo hace process.exit(1) si
 * falta PASSWORD_HASH, y este script existe justo para cuando todavía falta.
 */
const leerOculto = (prompt: string) =>
  new Promise<string>((resolve) => {
    const stdin = process.stdin
    process.stderr.write(prompt)

    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()

    let texto = ''

    const terminar = () => {
      stdin.off('data', alRecibir)
      if (stdin.isTTY) stdin.setRawMode(false)
      stdin.pause()
      process.stderr.write('\n')
      resolve(texto)
    }

    const alRecibir = (chunk: string) => {
      for (const caracter of chunk) {
        if (caracter === '\n' || caracter === '\r' || caracter === '\u0004') return terminar()
        if (caracter === '\u0003') process.exit(1) // ctrl-c
        if (caracter === '\u007f') {
          texto = texto.slice(0, -1) // backspace
        } else {
          texto += caracter
        }
      }
    }

    stdin.on('data', alRecibir)
    stdin.on('end', terminar)
  })

const password = await leerOculto('Contraseña: ')

if (password.length === 0) {
  console.error('La contraseña no puede estar vacía.')
  process.exit(1)
}

if (process.stdin.isTTY) {
  if ((await leerOculto('Repetir: ')) !== password) {
    console.error('Las contraseñas no coinciden.')
    process.exit(1)
  }
}

// El hash va a stdout y las instrucciones a stderr, para poder hacer
// `pnpm hash-password >> .env` sin que se cuele el texto de ayuda.
console.log(`PASSWORD_HASH=${await hashearPassword(password)}`)

process.stderr.write(
  '\nPegá esa línea en el .env. Si SESSION_SECRET todavía está vacío:\n' +
    '  openssl rand -hex 32\n',
)
