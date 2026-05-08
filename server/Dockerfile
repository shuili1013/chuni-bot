FROM node:20-bookworm-slim AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-noto-cjk fonts-noto-cjk-extra ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

CMD ["node", "src/index.js"]
