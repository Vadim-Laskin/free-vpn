'use strict';
// Render-сервис: принимает WebSocket-подключения, проверяет персональный токен
// в пути (/ws/<telegram_id>.<подпись>) и передаёт трафик во внутренний Xray (VLESS).

const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '10000', 10);
const XRAY_PORT = parseInt(process.env.XRAY_PORT || '10085', 10);
const XRAY_BIN = process.env.XRAY_BIN || '/opt/xray/xray';
const UUID = process.env.VPN_UUID;
const SECRET = process.env.SECRET;
const BANNED = new Set(
  (process.env.BANNED_IDS || '').split(',').map((s) => s.trim()).filter(Boolean)
);

if (!UUID || !SECRET) {
  console.error('Нужны переменные окружения VPN_UUID и SECRET');
  process.exit(1);
}

const sign = (id) =>
  crypto.createHmac('sha256', SECRET).update(String(id)).digest('hex').slice(0, 24);

function tokenOk(url) {
  const m = /^\/ws\/(\d{1,20})\.([0-9a-f]{24})$/.exec((url || '').split('?')[0]);
  if (!m || BANNED.has(m[1])) return false;
  const expected = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// ---- Xray ----
const xrayConfig = {
  log: { loglevel: 'warning' },
  inbounds: [
    {
      listen: '127.0.0.1',
      port: XRAY_PORT,
      protocol: 'vless',
      settings: { clients: [{ id: UUID }], decryption: 'none' },
      streamSettings: { network: 'ws', wsSettings: { path: '/ws' } },
    },
  ],
  outbounds: [
    { protocol: 'freedom', tag: 'direct' },
    { protocol: 'blackhole', tag: 'block' },
  ],
  routing: {
    rules: [
      // не пускаем во внутреннюю сеть Render и на почтовый порт (спам)
      { type: 'field', ip: ['geoip:private'], outboundTag: 'block' },
      { type: 'field', port: '25', outboundTag: 'block' },
    ],
  },
};

if (XRAY_BIN !== 'none') {
  const cfgPath = '/tmp/xray-config.json';
  fs.writeFileSync(cfgPath, JSON.stringify(xrayConfig));
  const xray = spawn(XRAY_BIN, ['run', '-config', cfgPath], {
    stdio: 'inherit',
    env: { ...process.env, XRAY_LOCATION_ASSET: process.env.XRAY_LOCATION_ASSET || '/opt/xray' },
  });
  xray.on('exit', (code) => {
    console.error('xray завершился с кодом', code);
    process.exit(1);
  });
}

// ---- Входной сервер ----
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

server.on('upgrade', (req, socket, head) => {
  if (!tokenOk(req.url)) {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  const up = net.connect(XRAY_PORT, '127.0.0.1');
  const close = () => {
    socket.destroy();
    up.destroy();
  };
  up.on('error', close);
  socket.on('error', close);
  up.on('close', close);
  socket.on('close', close);

  up.on('connect', () => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
    let headers = 'GET /ws HTTP/1.1\r\n';
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    up.write(headers + '\r\n');
    if (head && head.length) up.write(head);
    socket.pipe(up);
    up.pipe(socket);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('listening on', PORT));
