# Estágio de build para compilar dependências nativas (better-sqlite3)
FROM node:22-slim AS builder
WORKDIR /app

# Instala ferramentas necessárias para compilar C++ no node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock* ./
RUN yarn install --production --frozen-lockfile

# Estágio final (produção)
FROM node:22-slim
WORKDIR /app

# Copia as dependências construídas
COPY --from=builder /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

# Garante que a pasta data exista
RUN mkdir -p data

EXPOSE 3000

CMD ["node", "gabot_ofertas.js"]
