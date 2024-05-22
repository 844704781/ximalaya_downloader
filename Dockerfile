FROM node:20.13.1-slim

WORKDIR /app

COPY . /app

RUN npm install
#CMD ["tail", "-f", "/dev/null"]
