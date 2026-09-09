FROM node:22-alpine

WORKDIR /app

# Copia package.json e instala dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código da aplicação
COPY . .

# Garante permissões na pasta data para persistência
RUN mkdir -p data

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
