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
| `GET` | `/api/notas` | cookie | Listado, con filtro por tag y búsqueda full-text |
| `POST` | `/api/notas` | cookie | Crea una nota |
| `GET` | `/api/notas/:id` | cookie | Una nota con su contenido y sus tags |
| `PATCH` | `/api/notas/:id` | cookie | Edita **parcialmente**: lo que no viene, no se toca |
| `DELETE` | `/api/notas/:id` | cookie | Borra una nota |
| `GET` | `/api/tags` | cookie | Los tags en uso, para el filtro |

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

### Notas (RF-N1 a N6)

Los payloads van **en español**, como el resto de la API (`autenticado`, `reintentarEn`):
los nombres en inglés son de las columnas de SQLite y no salen de `src/db/`.

Una nota completa, que es lo que devuelven `POST`, `GET /:id` y `PATCH` — copiar a
mano en `web/`:

```ts
const tagSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  color: colorSchema, // los 8 slugs de src/dominio/colores.ts
})

const notaSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  contenido: z.string(),
  creadaEn: z.iso.datetime(),
  modificadaEn: z.iso.datetime(),
  archivada: z.boolean(),
  tags: z.array(tagSchema),
})
```

En el listado la nota viene sin `contenido` ni `creadaEn`, y con un `extracto` en su
lugar:

```ts
const notaEnListaSchema = z.object({
  id: z.number(),
  titulo: z.string(),
  extracto: z.string(),
  modificadaEn: z.iso.datetime(),
  archivada: z.boolean(),
  tags: z.array(tagSchema),
})
```

`GET /api/notas` → `200` con un array de `notaEnLista`. Tres parámetros, todos
opcionales:

| Param | Qué hace |
|---|---|
| `q` | Búsqueda full-text sobre título y contenido (FTS5). Ordena por relevancia y el `extracto` pasa a ser el fragmento donde apareció el término |
| `tag` | Deja solo las notas que tengan ese tag, por nombre exacto |
| `archivadas` | `true` para ver **solo** las archivadas. Por defecto, solo las no archivadas |

- **Sin `q` el orden es por fecha de modificación descendente** (RF-N4); con `q`, por
  relevancia.
- **`q` busca también en las archivadas** e ignora el parámetro `archivadas`: archivar
  saca del listado, no del alcance de la búsqueda (RF-N6). Cada resultado dice si lo
  está en `archivada`.
- Una `q` de la que no queda ningún término buscable (vacía, o solo símbolos) se trata
  como si no hubiera búsqueda.

`POST /api/notas` — todos los campos tienen default, así que `{}` crea una nota vacía:

```ts
const notaNuevaSchema = z.object({
  titulo: z.string().trim().max(200).default(''),
  contenido: z.string().max(100_000).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
})
```

`PATCH /api/notas/:id` — **los cuatro son opcionales y lo que no viene no se toca**. Es
lo que deja que el autoguardado mande solo `contenido` sin pisar los tags:

```ts
const cambiosSchema = z.object({
  titulo: z.string().trim().max(200).optional(),
  contenido: z.string().max(100_000).optional(),
  archivada: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
})
```

| Código | Cuerpo |
|---|---|
| `200` | La nota completa (`GET /:id`, `PATCH`) o el array del listado |
| `201` | La nota completa recién creada (`POST`) |
| `204` | Sin cuerpo (`DELETE`) |
| `400` | `{ error: 'Filtros inválidos' \| 'Nota inválida' \| 'Cambios inválidos' \| 'Id inválido' }` |
| `404` | `{ error: 'No encontrada' }` |

**El título puede quedar vacío a propósito.** Con autoguardado, una nota recién
empezada todavía no tiene uno, y rechazarla haría perder lo que se está escribiendo:
el "Sin título" es cosa del front.

**Los tags se mandan como nombres, no como ids** (RF-N3): se crean al vuelo los que no
existan. El backend los normaliza a minúscula y sin espacios en los extremos, para que
"Trabajo" y "trabajo" no terminen siendo dos tags con dos colores, y **el color no se
elige** — se deriva del nombre con un hash estable (`src/dominio/colores.ts`), así el
mismo tag cae siempre en el mismo color. Mandar `tags` **reemplaza** la lista entera.

Un tag que se queda sin ninguna nota se borra solo: no hay ABM de tags porque no hay
nada que administrar.

`GET /api/tags` → `200` con los tags **en uso**, ordenados por nombre:

```ts
const tagEnUsoSchema = tagSchema.extend({ notas: z.number() })
```

> **La búsqueda es FTS5**, con `remove_diacritics 2`: buscar `cafe` encuentra `café`.
> El último término se busca por prefijo, así aparecen resultados mientras se escribe.
> Lo que el usuario escribe **nunca llega crudo al `MATCH`** — `src/notas/consultas-fts.ts`
> lo parte por todo lo que no sea letra o número, porque un `:` o unas comillas sueltas
> hacen que SQLite falle en vez de no encontrar nada.

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
