FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev

COPY server ./server
COPY app ./app

WORKDIR /app/server
ENV PORT=3000
EXPOSE 3000

# I dati persistono qui: collega un volume a questo percorso in produzione.
VOLUME ["/app/server/data"]

CMD ["node", "src/index.js"]
