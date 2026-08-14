# api

Backend del [proyecto personal](../documentacion/alcance-proyecto-personal.md). Node 24 + Express 5 + SQLite.

Este README es **el contrato con [`web/`](../web/README.md)** (alcance §3): toda ruta nueva se documenta acá.

> El servicio de systemd se llama `personal-api`, no `api`: la carpeta está dentro de
> `personal/`, la unit de la Pi no.

## Requisitos

- Node 24 LTS (`.nvmrc`)
- pnpm 11

## Desarrollo

```bash
pnpm install
cp .env.example .env
pnpm dev          # node --watch, sin paso de build
```

| Script | Qué hace |
|---|---|
| `pnpm dev` | Levanta el server con recarga |
| `pnpm start` | Lo mismo sin watch (lo que corre systemd) |
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

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del proceso y de la base |

`GET /api/health` responde `200` con `{ status: 'ok', uptime, db: 'ok' }`. Si el
proceso vive pero la base no responde, devuelve **`503`** con
`{ status: 'degradado', uptime, db: 'error' }`.

## Deploy

```bash
git pull
pnpm install --frozen-lockfile
sudo systemctl restart personal-api
```
