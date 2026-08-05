# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- build
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar só os manifestos primeiro aproveita o cache de camadas: mudar o código
# não invalida a instalação de dependências.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ------------------------------------------------------- dependências de produção
FROM node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime

# `dumb-init` como PID 1: garante que SIGTERM chegue ao Node e o desligamento
# gracioso (fechar socket do WhatsApp e Redis) realmente aconteça.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# O volume das credenciais precisa pertencer ao usuário não-root.
RUN mkdir -p /app/.sessions && chown -R node:node /app/.sessions

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
