# syntax=docker/dockerfile:1
# Backend image: the API, and (with a different command) the rating-sync worker.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 5000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
