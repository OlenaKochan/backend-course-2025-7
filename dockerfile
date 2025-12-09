# Dockerfile (простий, для розробки з nodemon)
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

# Для розробки — використати nodemon (dev dependency)
CMD ["npm", "run", "dev"]