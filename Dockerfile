FROM ubuntu:22.04

RUN apt-get update && \
    apt-get install -y ffmpeg nodejs npm curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "server.js"]
