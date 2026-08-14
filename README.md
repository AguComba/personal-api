# api

Backend del [proyecto personal](../documentacion/alcance-proyecto-personal.md). Node 24 + Express 5 + SQLite.

Este README es **el contrato con [`web/`](../web/README.md)** (alcance §3): toda ruta nueva se documenta acá.

> La imagen Docker se llama `personal-api`, no `api`: la carpeta está dentro de
> `personal/`, la imagen no.

## Requisitos

- Node 24 LTS (`.nvmrc`)
- pnpm 11

## Desarrollo

```bash
pnpm install
cp .env.example .env

pnpm hash-password >> .env      # pide la contraseña e imprime la línea PASSWORD_HASH
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

pnpm dev          # node --watch, sin paso de build
```

Sin `PASSWORD_HASH` ni `SESSION_SECRET` el proceso **no arranca**: no existe un modo
sin autenticación al que se pueda caer por accidente.

| Script | Qué hace |
|---|---|
| `pnpm dev` | Levanta el server con recarga |
| `pnpm start` | Lo mismo sin watch (lo que corre el contenedor) |
| `pnpm hash-password` | Hashea una contraseña e imprime la línea para el `.env` |
| `pnpm db:generate` | Genera la migración SQL a partir del schema de `src/db/schema.ts` |
| `pnpm db:studio` | Explorador web de la base |
| `pnpm typecheck` | `tsc --noEmit`. No emite: Node ejecuta los `.ts` directamente |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm test` | Vitest |

> El backend no tiene build. Node 24 borra los tipos en runtime, por eso los imports
> relativos llevan la extensión `.ts` explícita y `erasableSyntaxOnly` está activo:
> nada de enums, namespaces ni decoradores.

## Base de datos

SQLite en un único archivo, cuya ruta sale de `DATABASE_PATH` (por defecto
`./data/personal.sqlite`, gitignoreado). El schema completo del modelo vive en
`src/db/schema.ts` y las migraciones generadas, en `drizzle/` — **se commitean**.

Las migraciones pendientes se aplican solas al arrancar el proceso: un deploy no
tiene paso de migración aparte.

```bash
# tras cambiar src/db/schema.ts
pnpm db:generate      # revisar el .sql generado antes de commitearlo
pnpm dev              # lo aplica al arrancar
```

## Autenticación

Dos capas: la tailnet y, arriba, **una contraseña única** (RNF-S2). No hay usuarios,
ni registro, ni recuperación — hay una sola persona.

- La contraseña vive hasheada con `scrypt` en `PASSWORD_HASH`, en el `.env` y no en
  la base: el archivo SQLite se copia en cada backup.
- La sesión es una **cookie firmada sin estado**: su valor es el vencimiento más un
  HMAC-SHA256 con `SESSION_SECRET`. No hay tabla de sesiones. Dura **30 días** y no
  se renueva sola.
- **Cambiar `SESSION_SECRET` y reiniciar cierra la sesión en todos los dispositivos.**
  Es el único mecanismo de revocación, y es el que hay que usar si se pierde un celular.
- `COOKIE_SECURE` va en `false` porque la tailnet se sirve por HTTP plano; sobre HTTPS
  se pone en `true`.
- Tras 5 contraseñas incorrectas seguidas el login se bloquea 30 s, duplicando hasta
  5 min. El contador es global y en memoria: se reinicia con el proceso.

Todo lo que cuelga de `/api` requiere la cookie, **salvo `/api/health` y `/api/auth/*`**.
Una ruta protegida sin cookie válida responde `401 { error: 'No autorizado' }`, y una
ruta inexistente sin sesión también (a propósito: no deja enumerar rutas).

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/health` | pública | Estado del proceso y de la base |
| `POST` | `/api/auth/login` | pública | Inicia sesión y setea la cookie |
| `POST` | `/api/auth/logout` | pública | Borra la cookie |
| `GET` | `/api/auth/sesion` | pública | Si la cookie actual sigue valiendo |

`GET /api/health` responde `200` con `{ status: 'ok', uptime, db: 'ok' }`. Si el
proceso vive pero la base no responde, devuelve **`503`** con
`{ status: 'degradado', uptime, db: 'error' }`.

`POST /api/auth/login` — cuerpo (copiar a mano en `web/`):

```ts
const loginSchema = z.object({
  password: z.string().min(1),
})
```

| Código | Cuerpo |
|---|---|
| `200` | `{ ok: true }` + `Set-Cookie: sesion=…; HttpOnly; SameSite=Lax; Max-Age=2592000` |
| `400` | `{ error: 'Falta la contraseña' }` |
| `401` | `{ error: 'Contraseña incorrecta' }` |
| `429` | `{ error: 'Demasiados intentos', reintentarEn }` — `reintentarEn` en segundos |

`POST /api/auth/logout` → `200 { ok: true }`, siempre.

`GET /api/auth/sesion` → `200 { autenticado: boolean }`. Es pública a propósito: el
front la llama al arrancar para decidir si muestra el login, y "todavía no me logueé"
no es un error.

> La cookie es `HttpOnly` y `SameSite=Lax`: el front no la lee ni la manda a mano, la
> adjunta el navegador. En producción nginx sirve el SPA y proxea `/api` a este
> proceso, así que es same-origin y funciona sin CORS. **En desarrollo el front tiene
> que proxyear `/api` desde el dev server de Vite** para seguir siendo same-origin; si
> en cambio pega directo a `localhost:3000`, es cross-origin y la cookie no viaja.

## Docker

El repo trae su [`Dockerfile`](Dockerfile). Se construye fuera de la Pi; ahí solo se
levanta. **No hay paso de build**: Node ejecuta los `.ts` directamente.

```bash
docker build -t personal-api .
```

Tres cosas que hay que respetar al correrlo:

| Qué | Por qué |
|---|---|
| `HOST=0.0.0.0` | Con el default `127.0.0.1` el proceso solo se escucha a sí mismo y nginx no lo alcanza. Ahí dentro `0.0.0.0` no expone nada: es el namespace del contenedor |
| El volumen de datos, del uid **1000** | El contenedor corre como el usuario `node`. Sin eso no puede escribir el WAL |
| `PASSWORD_HASH` y `SESSION_SECRET` por variable de entorno | No están en la imagen y sin ellos el proceso no arranca (RNF-S2) |

La imagen del front (`personal-web`) es un nginx que sirve el bundle y proxea `/api`
hasta acá; su `nginx.conf` busca el host `api`, que tiene que resolver al arrancar.

## Red

Se entra por IP: la de la LAN estando en casa, la de la tailnet estando afuera. **Sin
dominio y sin HTTPS** (RNF-S4), y por eso `COOKIE_SECURE` va en `false`.

El router no hace port forwarding, así que nada de esto se expone a internet (RNF-S1).
Pero dentro de casa **cualquier dispositivo del wifi llega al puerto**: la contraseña
única no es una segunda capa sobre la tailnet, es la barrera.
