# Deploy WhatsApp Bot

**No budget?** See **[FREE-DEPLOY.md](./FREE-DEPLOY.md)** — PC + Cloudflare tunnel ($0) or Oracle free VM ($0).

Paid 24/7 hosting (Render ~$7/mo) below.

## Paid — Render (Starter ~$7/mo)

### 1. Push code to GitHub

Repo: `lifestudio-whatsapp-bot` (whatsapp-bot folder only).

### 2. Create service on Render

1. Go to [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
2. Connect the GitHub repo
3. Render reads `render.yaml` (Docker + 1GB disk at `/data/baileys_auth`)

### 3. Set secrets in Render → Environment

| Variable | Value |
|----------|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON from Firebase (one line). Local: `npm run print-sa-env` |
| `BOT_API_KEY` | Same secret you use in React (`REACT_APP_WHATSAPP_BOT_API_KEY`) |
| `OWNER_PHONE` | `218926128650` |
| `APP_URL` | `https://lifestudio-abf4b.web.app` |

Optional: `BANK_ACCOUNT_NUMBER`, bank name, work hours (see `.env.example`).

### 4. Deploy & copy URL

After deploy, copy the public URL, e.g. `https://live-studio-whatsapp-bot.onrender.com`.

### 5. Update React app

In `my-app/.env`:

```
REACT_APP_WHATSAPP_BOT_URL=https://live-studio-whatsapp-bot.onrender.com
REACT_APP_WHATSAPP_BOT_API_KEY=<same-as-BOT_API_KEY>
```

Then:

```bash
cd my-app
npm run build
firebase deploy --only hosting
```

### 6. Connect WhatsApp

Open https://lifestudio-abf4b.web.app → admin home → **بوت واتساب** → scan QR.

Set default photographers in **إعدادات البوت**.

---

## Option B — Railway

1. `npm i -g @railway/cli` → `railway login`
2. From `whatsapp-bot/`: `railway init` → `railway up`
3. Variables (dashboard):
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste JSON (`npm run print-sa-env`)
   - `BOT_API_KEY`, `OWNER_PHONE`, `FIREBASE_PROJECT_ID=lifestudio-abf4b`
   - `WHATSAPP_PROVIDER=baileys`
   - `BAILEYS_AUTH_PATH=/data/baileys_auth`
   - `APP_URL=https://lifestudio-abf4b.web.app`
4. **Volume** mounted at `/data/baileys_auth` (required)
5. Copy Railway public URL → React `.env` → rebuild hosting

---

## Option C — Docker on VPS

```bash
cp .env.example .env
# Add serviceAccountKey.json
docker compose up -d --build
```

---

## Provider switch

| Env | Use case |
|-----|----------|
| `WHATSAPP_PROVIDER=baileys` | Production (512MB+ RAM, no Chromium) |
| `WHATSAPP_PROVIDER=webjs` | Local dev only |

## Health check

`GET /api/health` — public  
`GET /api/status` — header `x-api-key: BOT_API_KEY`
