FROM node:boron

MAINTAINER vincentchan <hci.vincentchan@gmail.com>

RUN mkdir -p /usr/src/app
RUN mkdir -p /data/log
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN npm install

ENV PORT 8388
ENV SERVER_ADDRESS "0.0.0.0"
ENV METHOD "aes-256-cfb"
ENV PASSWORD "shadowsocks-over-websocket"
ENV WEB_CONCURRENCY 1
ENV LOG_LEVEL info
ENV LOG_FILE ""

EXPOSE $PORT

CMD node server.js --server-address $SERVER_ADDRESS --server-port $PORT --password $PASSWORD --method $METHOD --log-file $LOG_FILE --log-level $LOG_LEVEL