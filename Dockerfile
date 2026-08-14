# El backend no tiene paso de build: Node 24 ejecuta los .ts por type stripping.
# Las dos etapas existen solo por `better-sqlite3`, que es un binding nativo.
# Las dos usan la misma base a propósito: el node_modules compilado en `deps` se
# copia tal cual, y cambiar de base rompería la compatibilidad de glibc.

FROM node:24-slim AS deps

# `better-sqlite3` publica prebuilds para arm64, pero si no hay prebuild cae a
# compilar con node-gyp. Éstas son las herramientas que necesita ese fallback.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11

WORKDIR /app

# El pnpm-workspace.yaml va sí o sí: desde pnpm 11 es donde vive el `allowBuilds`
# que habilita el script de instalación de better-sqlite3. Sin él el paquete queda
# sin binding nativo y el arranque muere.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# --prod deja afuera drizzle-kit, vitest, biome y typescript. Las migraciones en
# runtime las corre `migrate()` de drizzle-orm, que es dependencia de producción.
RUN pnpm install --frozen-lockfile --prod


FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY drizzle ./drizzle

# DATABASE_PATH apunta acá. Se crea con el dueño correcto para que el usuario
# `node` pueda escribir el WAL aunque el directorio se monte desde el host.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

# Directo, sin pnpm de por medio: así el SIGTERM llega al proceso de Node y el
# cierre de src/index.ts alcanza a checkpointear el WAL.
CMD ["node", "src/index.ts"]
