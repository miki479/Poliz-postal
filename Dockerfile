# Immagine per Cloud Run: server Node + client già compilato.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
# Encoder MP4 sul server: il client resta compatibile con Expo Go.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# Solo dipendenze di produzione (include @google-cloud/firestore, esterno al bundle).
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Cloud Run imposta PORT; il server ascolta su 0.0.0.0.
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.mjs"]
