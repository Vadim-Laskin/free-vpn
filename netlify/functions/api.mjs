// Netlify Function: Telegram-бот (webhook) + выдача ключа для мини-приложения.
// Маршруты: POST /api/bot, POST /api/key
import crypto from 'node:crypto';

const env = (name) => process.env[name];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sign = (id) =>
  crypto.createHmac('sha256', env('SECRET')).update(String(id)).digest('hex').slice(0, 24);

function isAllowed(id) {
  const list = (env('ALLOWED_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(String(id));
}

function buildLink(id) {
  const host = (env('VPN_HOST') || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const params = new URLSearchParams({
    encryption: 'none',
    security: 'tls',
    sni: host,
    fp: 'chrome',
    type: 'ws',
    host,
    path: `/ws/${id}.${sign(id)}`,
  });
  return `vless://${env('VPN_UUID')}@${host}:443?${params.toString()}#${encodeURIComponent('Free VPN')}`;
}

const configured = () =>
  ['BOT_TOKEN', 'SECRET', 'VPN_UUID', 'VPN_HOST'].every((k) => env(k));

// Проверка подписи initData из Telegram Mini App
function verifyInitData(initData) {
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(env('BOT_TOKEN')).digest();
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

async function handleKey(req) {
  if (!configured()) return json({ error: 'not_configured' }, 500);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const user = verifyInitData(body && body.initData);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!isAllowed(user.id)) return json({ error: 'forbidden' }, 403);
  return json({ link: buildLink(user.id) });
}

async function tg(method, payload) {
  return fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function handleBot(req) {
  if (!configured()) return json({ ok: false }, 500);
  if (env('WEBHOOK_SECRET') && req.headers.get('x-telegram-bot-api-secret-token') !== env('WEBHOOK_SECRET')) {
    return json({ ok: false }, 403);
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true });
  }
  const msg = update && update.message;
  if (!msg || !msg.from || msg.chat.type !== 'private') return json({ ok: true });

  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  if (!isAllowed(msg.from.id)) {
    await tg('sendMessage', { chat_id: chatId, text: 'Доступ закрыт.' });
    return json({ ok: true });
  }

  const siteUrl = env('SITE_URL') || env('URL');

  if (text.startsWith('/key')) {
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `Твой ключ (нажми, чтобы скопировать):\n\n<code>${escapeHtml(buildLink(msg.from.id))}</code>`,
    });
  } else if (siteUrl) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Привет! Нажми кнопку — там твой ключ и инструкция по подключению.\nЕщё ключ можно получить командой /key',
      reply_markup: {
        inline_keyboard: [[{ text: 'Открыть VPN', web_app: { url: siteUrl } }]],
      },
    });
  } else {
    await tg('sendMessage', { chat_id: chatId, text: 'Не задан SITE_URL. Ключ: команда /key' });
  }
  return json({ ok: true });
}

export default async (req) => {
  const { pathname } = new URL(req.url);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (pathname === '/api/key') return handleKey(req);
  if (pathname === '/api/bot') return handleBot(req);
  return json({ error: 'not_found' }, 404);
};

export const config = { path: ['/api/key', '/api/bot'] };
