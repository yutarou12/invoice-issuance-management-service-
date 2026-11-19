FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
# 書類画像の日本語描画用。ブラウザ用フォントはビルド成果物に同梱する。
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 DATA_DIR=/app/data PORT=3000
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
