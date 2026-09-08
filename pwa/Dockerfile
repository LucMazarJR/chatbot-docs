# Sem etapa de build: o front é HTML/CSS/JS servido estático, de propósito.
# É um protótipo de validação — `docker compose up` precisa bastar.
FROM node:24-alpine

WORKDIR /app

# As dependências mudam muito menos que o código: copiar o manifesto primeiro
# aproveita o cache de camada a cada alteração no front.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["node", "src/server.js"]
