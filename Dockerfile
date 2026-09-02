# Stage 1 — builder
##############################
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Native build deps for argon2. Present only in the builder stage,
# so they never reach the final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm through Node's built-in corepack.
RUN corepack enable

# Install ALL deps (incl. dev) first — this layer is cached
# and only re-runs when the manifest or lockfile changes.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the source.
COPY . .

# 1) Generate the Prisma client — the `prisma-client` generator emits
#    TypeScript into src/generated/prisma.
# 2) `nest build` then compiles the app AND that generated client to dist/.
RUN pnpm prisma generate \
    && pnpm build

# Strip dev dependencies so only prod deps are carried to the runner.
# NOTE: this requires `prisma` to be listed under "dependencies"
# (not devDependencies) so the CLI survives for `migrate deploy`.
RUN pnpm prune --prod


# Stage 2 — runner
##############################
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the pruned prod node_modules, the compiled output, and the
# files the Prisma CLI needs at release time (schema + migrations + config).
COPY --from=builder /app/node_modules     ./node_modules
COPY --from=builder /app/dist             ./dist
COPY --from=builder /app/prisma           ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json     ./package.json

# Run as the image's built-in non-root user.
USER node

# Render injects PORT at runtime; the app reads process.env.PORT.
EXPOSE 3000
CMD ["node", "dist/main.js"]