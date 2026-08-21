# Build
FROM node:24-alpine AS builder

WORKDIR /app

# O lockfile do projeto é o do bun, mas a imagem oficial do Node não tem bun.
# O package-lock.json também está versionado, então o build usa npm — o
# resultado é o mesmo bundle.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# O TanStack Start compila com o Nitro para .output/. Não é um build só de
# arquivos: as server functions precisam de um processo Node rodando, então não
# dá para servir isso com nginx.
#
# NITRO_PRESET é obrigatório aqui. O @lovable.dev/vite-tanstack-config usa
# Cloudflare Workers como alvo padrão, e o .output/server/index.mjs sai como um
# Worker: rodado com `node`, ele encerra na hora, com código 0 e sem log
# nenhum. O container só ficava reiniciando em silêncio.
ENV NITRO_PRESET=node-server
RUN npm run build

# Execução
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Só o .output: ele já traz as dependências que o servidor precisa, embutidas
# pelo Nitro. Copiar node_modules inteiro dobraria a imagem à toa.
COPY --from=builder /app/.output ./.output

# O Nitro escuta nesta porta; o mapeamento para o host fica no compose.
EXPOSE 3000

# Sem usuário root: se alguém escapar do processo, escapa como `node`.
USER node

CMD ["node", ".output/server/index.mjs"]
