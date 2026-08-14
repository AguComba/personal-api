# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Backend del proyecto personal: una app self-hosted en una Raspberry Pi, **un solo usuario**, accesible únicamente por Tailscale. Reemplaza notas, finanzas, calendario/tareas y pomodoro con un modelo de datos común.

El proyecto se escribe en español: código, comentarios, commits y documentación.

## Documentación

Vive en `../documentacion/` (fuera de este repo). **`stack.md` es la fuente de verdad del stack**: si el alcance o el plan de implementación dicen otra cosa, manda stack.md.

| Archivo | Cuándo leerlo |
|---|---|
| `stack.md` | Antes de tocar cualquier decisión de tecnología, versión o dependencia |
| `alcance-proyecto-personal.md` | Modelo de datos (§4), requerimientos RF/RNF (§5, §7) y qué está fuera de alcance (§6) |
| `plan-de-implementacion.md` | En qué etapa estamos y qué bloquea qué |
| `historias-de-usuario.md` | Las 28 HU, una por requerimiento funcional |

Estado actual: **etapa 0** (esqueleto). La única ruta es `GET /api/health`; no hay base de datos ni schema todavía.

## Comandos

```bash
pnpm dev                                   # node --watch, sin build
pnpm start                                 # lo que corre systemd
pnpm typecheck                             # tsc --noEmit
pnpm lint                                  # biome check .
pnpm format                                # biome check --write .
pnpm test                                  # vitest run --passWithNoTests
pnpm vitest run src/x.test.ts -t "nombre"  # un solo test
```

Node 24 y pnpm 11, fijados en `mise.toml` y `.nvmrc`. Todavía no hay ningún test escrito: por eso `--passWithNoTests`. Se testea solo la lógica de finanzas y fechas (alcance §6); no hay E2E.

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

`HOST` es `127.0.0.1` por defecto y en la Pi apunta a la IP de la tailnet: **nunca `0.0.0.0`** (RNF-S3). La app no expone puertos a internet y no tiene autenticación — la pertenencia a la tailnet es la autorización.

## SQLite, Drizzle y datos

Nada de esto existe todavía en el código; es cómo hay que escribirlo cuando llegue.

**Pragmas al abrir la conexión**, antes de cualquier query:

```
journal_mode = WAL
foreign_keys = ON       -- sin esto las FK del schema son decorativas y SQLite no avisa
busy_timeout = 5000
synchronous = NORMAL
```

**FTS5** — la tabla virtual y sus triggers **no se declaran en el schema TS**. Se crean con `drizzle-kit generate --custom`, que deja un `.sql` vacío ya registrado en el journal de migraciones donde se escribe el DDL a mano, y se consultan con el template `sql` de Drizzle. Como el diff se hace contra el schema TS, ninguna migración futura intenta corregirlas.

**`link`** — la tabla de relación genérica (`source_type`, `source_id`, `target_type`, `target_id`) es polimórfica y sin foreign keys. Va en el schema normal: Drizzle no exige declarar relaciones.

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
