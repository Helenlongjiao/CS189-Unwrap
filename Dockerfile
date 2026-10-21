FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY sdk/package.json sdk/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY sdk sdk
RUN npm run build -w sdk

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY sdk/package.json sdk/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev
COPY --from=build /app/sdk/dist sdk/dist
COPY server server
COPY test-site test-site
COPY docker/start.mjs docker/start.mjs
EXPOSE 4000 5173 5174 5175 5176 5177
CMD ["node", "docker/start.mjs"]
