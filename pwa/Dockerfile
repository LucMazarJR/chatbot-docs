# Build em estágios: a imagem final não leva o node_modules de desenvolvimento
# nem o código-fonte, só o servidor autocontido que o `output: standalone`
# produz. Sem isso, o container do protótipo passa de 1 GB.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` roda type-check e lint: um erro de tipo derruba a imagem aqui,
# antes de subir, e não em produção.
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
# Sem HOSTNAME o servidor do standalone escuta só em localhost DENTRO do
# container, e a porta publicada pelo compose responde connection refused.
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

USER node
EXPOSE 8080
CMD ["node", "server.js"]
