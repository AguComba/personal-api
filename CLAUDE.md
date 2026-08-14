# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend del proyecto personal: una app self-hosted en una Raspberry Pi, **un solo usuario**, accesible únicamente por Tailscale. Reemplaza notas, finanzas, calendario/tareas y pomodoro con un modelo de datos común.

El proyecto se escribe en español: código, comentarios, commits y documentación.

## Documentación

Vive en `../documentacion/` (fuera de este repo). **`stack.md` es la fuente de verdad del stack**: si el alcance o el plan de implementación dicen otra cosa, manda stack.md.

| Archivo | Cuándo leerlo |
|---|---|
| `stack.md` | Antes de tocar cualquier decisión de tecnología, versión o dependencia |
| `sistema-de-diseno.md` | Solo por §3.3: `tag.color` y `category.color` guardan uno de 8 slugs, no un hex |
| `alcance-proyecto-personal.md` | Modelo de datos (§4), requerimientos RF/RNF (§5, §7) y qué está fuera de alcance (§6) |
| `plan-de-implementacion.md` | En qué etapa estamos y qué bloquea qué |
| `historias-de-usuario.md` | Las 28 HU, una por requerimiento funcional |

Estado actual: **etapa 0** (esqueleto). Las rutas son `GET /api/health` y las tres de `/api/auth`. El schema completo del modelo ya existe con su primera migración, pero todavía no hay ninguna ruta que lea o escriba datos.

## Comandos

```bash
pnpm dev                                   # node --watch, sin build
pnpm start                                 # lo que corre systemd
pnpm db:generate                           # migración a partir de src/db/schema.ts
pnpm typecheck                             # tsc --noEmit
pnpm lint                                  # biome check .
pnpm format                                # biome check --write .
pnpm test                                  # vitest run --passWithNoTests
pnpm vitest run tests/auth/sesion.test.ts -t "nombre"   # un solo test
```

Node 24 y pnpm 11, fijados en `mise.toml` y `.nvmrc`.

Los tests viven en **`tests/`, espejando la estructura de `src/`** (`src/auth/sesion.ts` → `tests/auth/sesion.test.ts`), no al lado del fuente: `src/` se lee como el mapa de lo que la app hace, y los tests intercalados lo tapan. `tests/` está en el `include` del `tsconfig.json`, así que el typecheck también los cubre.

Se testea solo la lógica de finanzas y fechas (alcance §6) más `src/auth/`; no hay E2E. El `--passWithNoTests` quedó de cuando no había ninguno.

## El backend no tiene paso de build

Node 24 ejecuta los `.ts` directamente por type stripping nativo. Es la restricción que más condiciona cómo se escribe el código acá:

- Los imports relativos llevan **extensión `.ts` explícita** (`import { createApp } from './app.ts'`).
- `erasableSyntaxOnly` está activo: **nada de enums, namespaces ni decoradores**. Es sintaxis que el runtime no puede borrar y rompería en producción.
- `verbatimModuleSyntax` está activo: los imports de tipos van con `import type`.
- `tsc` es únicamente el typecheck (`noEmit`). El deploy es `git pull` + `pnpm install --frozen-lockfile` + `systemctl restart personal-api`, sin compilar nada.

Si algún día el type stripping falla en la Pi, el fallback es agregar `tsc` al deploy — y por eso ninguna decisión del stack depende de tener un build.

## Estructura del servidor

- `createApp()` vive en `src/app.ts`, separado del `listen()` de `src/index.ts`. La app se puede montar en un test sin abrir un puerto.
- **Express 5 propaga solo los errores de handlers `async`**: no hace falta envolverlos en try/catch ni en un wrapper.
- El catch-all que sirva el SPA se escribe `app.get('/*splat', ...)`. Express 5 usa path-to-regexp 8, donde el comodín pelado `'*'` **no es una ruta válida**.
- El servicio de systemd se llama `personal-api`, no `api`.

## Configuración

`src/env.ts` valida `process.env` con Zod y hace `process.exit(1)` si falta o sobra algo. Toda variable nueva se agrega ahí **y** a `.env.example`.

`HOST` es `127.0.0.1` por defecto y en la Pi apunta a la IP de la tailnet: **nunca `0.0.0.0`** (RNF-S3). La app no expone puertos a internet.

`PASSWORD_HASH` y `SESSION_SECRET` **no tienen default a propósito**: sin ellos el proceso muere al arrancar. Un default silencioso dejaría el backend abierto, que es exactamente lo que la autenticación viene a cerrar.

## Autenticación

**RNF-S2 cambió**: la tailnet ya no es la única autorización. Ahora son dos capas — la tailnet y una contraseña única encima. Sigue sin haber usuarios, roles, registro ni recuperación.

Todo vive en `src/auth/` y **no usa ninguna dependencia**: `node:crypto` alcanza (stack.md §7, pregunta 3). No entran `express-session`, `cookie-parser`, `passport`, `jose`, `bcrypt` ni `argon2`.

- `password.ts` — `scrypt` con los parámetros embebidos en el hash (`scrypt$N$r$p$salt$hash`), así subirlos mañana no invalida el hash de hoy. Comparación con `timingSafeEqual`.
- `sesion.ts` — la sesión **no tiene estado**: la cookie es su propio vencimiento firmado con HMAC-SHA256. No hay tabla de sesiones y no hace falta ninguna. Revocar todo = rotar `SESSION_SECRET` y reiniciar.
- `requerir-sesion.ts` — va montado en `src/app.ts` como `app.use('/api', requerirSesion)` **después** de las rutas públicas. Es lo que hace que **toda ruta nueva de `/api` nazca protegida sin acordarse de nada**. Lo público (health, `/api/auth/*`) se registra arriba de esa línea; lo demás, abajo.
- El guard se monta en `/api` y no en la app entera para que el futuro catch-all del SPA sirva el HTML sin sesión: el login tiene que poder cargar.
- `rutas.ts` — el freno a la fuerza bruta es un contador global en memoria. Global porque hay un solo usuario; en memoria porque perderlo en un reinicio no vale una tabla.

`password.ts` y `sesion.ts` son la excepción a "se testea solo finanzas y fechas": son lógica pura y el único punto donde un bug silencioso deja el backend abierto sin que se note probando a mano.

## SQLite, Drizzle y datos

- `src/db/index.ts` abre la conexión y exporta el singleton `db` (Drizzle) y el `sqlite` crudo. **Los cuatro pragmas se aplican ahí, antes de cualquier query** — `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`. Sin `foreign_keys = ON` las FK del schema son decorativas y SQLite no avisa.
- `src/db/schema.ts` tiene el modelo completo del alcance §4: las 8 tablas, `link` incluida aunque recién se use en la etapa 5.
- `src/db/migrar.ts` expone `migrarDb()`, que `src/index.ts` llama **antes del `listen()`**. No hay paso de migración en el deploy.
- `drizzle/` son las migraciones generadas y **se commitean**. Biome las ignora a propósito: las escribe drizzle-kit y reformatearlas rompe el lint en cada `db:generate`.

El schema se cambia siempre en el `.ts` y después `pnpm db:generate`; nunca al revés ni editando una migración ya aplicada.

**Enums**: `account.type` y `category.kind` van como `text({ enum: [...] })`. Un `enum` de TS no compila acá (`erasableSyntaxOnly`) y además Drizzle no emite `CHECK`: la restricción es de tipos, no de la base.

**FTS5** — todavía no existe; va con el módulo de notas. La tabla virtual y sus triggers **no se declaran en el schema TS**: se crean con `drizzle-kit generate --custom`, que deja un `.sql` vacío ya registrado en el journal de migraciones donde se escribe el DDL a mano, y se consultan con el template `sql` de Drizzle. Como el diff se hace contra el schema TS, ninguna migración futura intenta corregirlas.

**`link`** — la tabla de relación genérica (`source_type`, `source_id`, `target_type`, `target_id`) es polimórfica y sin foreign keys, con un índice por cada extremo porque los vínculos se leen en los dos sentidos.

**Convenciones de datos** (alcance §4):

- Los montos son **enteros en centavos**. Nunca `float`.
- Las fechas son texto ISO 8601, timezone fija `America/Argentina/Cordoba`.
- Los borrados son físicos, salvo notas y tareas, que usan `archived` / soft delete.

## El README es el contrato con `web/`

Los tipos no se comparten por código: el front **copia a mano** los esquemas Zod. Por eso toda ruta nueva se documenta en `README.md` en el mismo cambio que la agrega.

## Dependencias

Antes de instalar cualquier cosa que no esté en `stack.md`, las cuatro preguntas de su §7: ¿resuelve un RF/RNF o es comodidad?, ¿cuánto suma a la RAM (RNF-2: < 200 MB)?, ¿se escribe en menos de 100 líneas propias?, ¿sobrevive a que su autor la abandone?

`stack.md` §6 lista lo ya descartado con su motivo — TypeORM, Prisma, Kysely, Fastify, Hono, NestJS, Postgres, Meilisearch. No se reabre ninguna sin un motivo nuevo.

`pnpm-workspace.yaml` **no es un monorepo**: existe solo porque desde pnpm 11 es el lugar de `allowBuilds`, que habilita los scripts de instalación de `better-sqlite3` (binding nativo) y `esbuild`. Sin eso, `better-sqlite3` queda inservible.

Lint y formato son **Biome**, no ESLint ni Prettier: comillas simples, sin punto y coma, ancho 100.
