FROM node:latest

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install -g tailwindcss

COPY . .

RUN npm run build:css

CMD [ "npm", "start" ]