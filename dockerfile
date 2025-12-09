FROM node:18

WORKDIR /usr/src/app

# копіюємо package
COPY package*.json ./
RUN npm ci

# копіюємо решту коду
COPY . .

# створимо кеш директорію
RUN mkdir -p ./cache

EXPOSE 8888

CMD ["npm", "run", "dev"]