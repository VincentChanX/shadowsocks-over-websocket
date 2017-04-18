FROM node:boron

MAINTAINER vincentchan <hci.vincentchan@gmail.com>

RUN mkdir -p /usr/src/app
RUN mkdir -p /data/log
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN npm install

ENV IS_LOCAL 0

ENV LOCAL_PORT 1080
ENV LOCAL_ADDRESS 0.0.0.0
ENV SERVER_PORT 8388
ENV SERVER_ADDRESS 0.0.0.0
ENV METHOD aes-256-cfb
ENV PASSWORD shadowsocks-over-websocket

ENV WEB_CONCURRENCY 1
ENV LOG_LEVEL info
ENV LOG_FILE ""

#EXPOSE $SERVER_PORT $LOCAL_PORT

CMD echo "CONFIG:\r\nIS_LOCAL=$IS_LOCAL\r\nLOCAL=$LOCAL_ADDRESS:$LOCAL_PORT\r\nSERVER=$SERVER_ADDRESS:$SERVER_PORT\r\nMETHOD=$METHOD\r\nPASSWORD=$PASSWORD\r\nLOG_LEVEL=$LOG_LEVEL\r\nLOG_FILE=$LOG_FILE\r\nWEB_CONCURRENCY=$WEB_CONCURRENCY";if [ $IS_LOCAL -eq 0 ]; then node server.js --server-address $SERVER_ADDRESS --server-port $SERVER_PORT --password $PASSWORD --method $METHOD --log-file $LOG_FILE --log-level $LOG_LEVEL; else node local.js --server-address $SERVER_ADDRESS --server-port $SERVER_PORT --password $PASSWORD --method $METHOD --log-file $LOG_FILE --log-level $LOG_LEVEL --local-port $LOCAL_PORT --local-address $LOCAL_ADDRESS; fi