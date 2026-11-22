# Свой бесплатный VPN через Telegram-бота

Схема:

- **Render** (бесплатный Web Service) - сервер VLESS/WebSocket (`render/`)
- **Netlify** - бот (webhook), мини-приложение и «будильник» для Render (`netlify/`, `public/`)
- Каждому пользователю бот выдаёт персональный ключ, база данных не нужна.

Всё делается с телефона через браузер, ни карта, ни ПК не нужны.

## 1. Бот

1. В Telegram открой @BotFather → `/newbot` → получи **токен** (`BOT_TOKEN`).
2. Узнай свой Telegram ID у бота @userinfobot (понадобится как `ALLOWED_IDS`).

## 2. Секреты (придумай заранее)

- `VPN_UUID` - любой UUID, например с uuidgenerator.net
- `SECRET` - длинная случайная строка (20+ символов)
- `WEBHOOK_SECRET` - ещё одна случайная строка (только латиница и цифры)

## 3. GitHub

Создай бесплатный аккаунт и пустой репозиторий (можно приватный). Загрузи в него файлы с сохранением путей
(Add file → Create new file, в имени пиши путь вроде `render/server.js`):

```
render/Dockerfile
render/server.js
netlify/functions/api.mjs
netlify/functions/keepalive.mjs
public/index.html
netlify.toml
```

## 4. Render (сервер VPN)

1. render.com → войти через GitHub → New → **Web Service** → выбери репозиторий.
2. Language: **Docker**. **Root Directory: `render`**. Instance Type: **Free**.
3. Environment Variables: `VPN_UUID` и `SECRET` (те же значения, что выше).
4. Deploy. После сборки получишь адрес вида `имя.onrender.com` - это `VPN_HOST`.

## 5. Netlify (бот + мини-приложение)

1. netlify.com → Add new site → Import from Git → тот же репозиторий. Настройки сборки не трогай.
2. Site configuration → Environment variables, добавь:

| Переменная | Значение |
|---|---|
| `BOT_TOKEN` | токен от BotFather |
| `WEBHOOK_SECRET` | твоя строка |
| `SECRET` | **та же**, что на Render |
| `VPN_UUID` | **тот же**, что на Render |
| `VPN_HOST` | `имя.onrender.com` |
| `SITE_URL` | `https://твой-сайт.netlify.app` |
| `ALLOWED_IDS` | твой Telegram ID (несколько - через запятую) |

3. Deploys → Trigger deploy, чтобы переменные применились.

## 6. Подключить бота к Netlify

Открой в браузере (подставь свои значения):

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<сайт>.netlify.app/api/bot&secret_token=<WEBHOOK_SECRET>
```

Должно ответить `"ok":true`. Теперь напиши боту `/start`.

## 7. Подключение

Бот пришлёт кнопку «Открыть VPN» → мини-приложение покажет ключ. Скопируй его и импортируй из буфера обмена в v2rayNG / Hiddify (Android) или Streisand / V2Box (iPhone).

## Важно

- **Ограничивай доступ** через `ALLOWED_IDS`. Без этого ключ получит любой, кто найдёт бота, и лимиты кончатся.
- Бесплатный Render: ~100 ГБ трафика в месяц на всех, 750 часов работы (хватает на один сервис 24/7), скорость умеренная.
- Если сервис «спит», первое подключение идёт до минуты. Функция `keepalive` будит его каждые 10 минут.
- Отозвать пользователя: добавь его ID в переменную `BANNED_IDS` на Render (через запятую).
- Правила Render запрещают использовать сервис как прокси/VPN для чужого трафика. Аккаунт могут заблокировать, держи это как пробный вариант для себя.
- Не публикуй токены и секреты в репозитории, только в переменных окружения.
