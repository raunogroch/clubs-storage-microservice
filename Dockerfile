FROM node:24-alpine

WORKDIR /usr/src/app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json ./
COPY pnpm-lock.yaml  ./

RUN pnpm install

COPY . .

EXPOSE 3005