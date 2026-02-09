FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
ENV HOST=0.0.0.0 PORT=8080 DB_PATH=/data/incidents.db
EXPOSE 8080
CMD ["bun", "dist/server/entry.mjs"]
