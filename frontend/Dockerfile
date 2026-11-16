# --- build stage: bundle the app (and Faro) with Vite --------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage: tiny Node static server ----------------------------------
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server.js"]
