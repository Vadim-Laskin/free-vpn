FROM node:20-alpine

RUN apk add --no-cache curl unzip ca-certificates \
 && mkdir -p /opt/xray \
 && curl -fsSL -o /tmp/xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip \
 && unzip /tmp/xray.zip -d /opt/xray \
 && chmod +x /opt/xray/xray \
 && rm /tmp/xray.zip

ENV XRAY_LOCATION_ASSET=/opt/xray
WORKDIR /app
COPY server.js .

CMD ["node", "server.js"]
