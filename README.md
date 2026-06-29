# Live Studio — WhatsApp Automation Bot

Free WhatsApp automation using **whatsapp-web.js** (QR login, session persistence) + **Firebase Admin** + your existing Firestore schema.

> **Do not use Firebase Functions** for this bot. Puppeteer/Chromium needs a long-running process and persistent disk for `.wwebjs_auth`.

---

## 1. Architecture

```
┌─────────────────────┐     HTTPS poll      ┌──────────────────────────┐
│  React Admin App    │◄───────────────────►│  whatsapp-bot (Node.js)  │
│  WhatsappBotStatus  │   /api/status       │  Express + whatsapp-web  │
└─────────┬───────────┘                     └────────────┬─────────────┘
          │                                              │
          │  Firestore (realtime)                        │ reads/writes
          ▼                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Firestore: sessions, invoices, finance, whatsapp_chats,            │
│             whatsapp_bot/status, bot_config/settings                  │
└─────────────────────────────────────────────────────────────────────┘
          ▲
          │  Client WhatsApp messages
          ▼
┌─────────────────────┐
│  Client phone       │
└─────────────────────┘
```

| Component | Role |
|-----------|------|
| **Standalone Node server** | Runs Chromium + WhatsApp Web session 24/7 |
| **LocalAuth** | Persists login in `.wwebjs_auth/` (mount volume on Render/Railway/VPS) |
| **Firestore `whatsapp_chats`** | Per-user conversation state machine (30 min TTL) |
| **Firestore `whatsapp_bot/status`** | `connected`, `qrCode` (data URL), `phoneNumber` for React dashboard |
| **Same `sessions` / `invoices` / `finance`** | Bot writes compatible documents; React app sees updates instantly |

### Why not Firebase Functions?

| Requirement | Functions | Standalone server |
|-------------|-----------|-------------------|
| Long-running Puppeteer | ❌ timeout / cold start | ✅ |
| Session files on disk | ❌ ephemeral | ✅ volume |
| Always-on WhatsApp | ❌ | ✅ |

**Recommended hosts:** Railway, Render (with persistent disk), Fly.io, or a small VPS (Hetzner/DigitalOcean).

---

## 2. Repository layout

```
life/
├── my-app/                          # React (existing)
│   └── src/components/
│       └── WhatsappBotStatus.js       # QR + connection widget
└── whatsapp-bot/
    ├── Dockerfile
    ├── package.json
    ├── .env.example
    └── src/
        ├── index.js                 # Express + start bot
        ├── bot.js                   # whatsapp-web.js client
        ├── config.js
        ├── firebase/admin.js
        ├── firestore/
        │   ├── availability.js      # slot engine (no double booking)
        │   ├── sessions.js
        │   ├── invoices.js          # mirrors AdminPage finance sync
        │   └── botState.js
        ├── conversation/
        │   ├── stateMachine.js
        │   └── handlers.js          # Book / Cancel / Pay / Track menus
        └── routes/status.js         # API for React
```

---

## 3. Step-by-step setup

### Step 1 — Firebase service account

1. Firebase Console → Project **lifestudio-abf4b** → Settings → Service accounts  
2. Generate new private key → save as `whatsapp-bot/serviceAccountKey.json`  
3. **Never commit** this file (already in `.gitignore`)

### Step 2 — Configure environment

```bash
cd whatsapp-bot
cp .env.example .env
# Edit OWNER_PHONE, BANK_*, BOT_API_KEY
```

Set `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`

### Step 3 — Install & run locally

```bash
npm install
npm start
```

1. Terminal prints QR → scan with WhatsApp → **Linked Devices**  
2. API: `http://localhost:8080/api/status` (header `x-api-key: YOUR_KEY`)

### Step 4 — Deploy (Docker example)

```bash
docker build -t live-studio-wa-bot .
docker run -d -p 8080:8080 \
  -v wa_auth:/app/.wwebjs_auth \
  --env-file .env \
  live-studio-wa-bot
```

On **Railway/Render**: attach a persistent volume at `/app/.wwebjs_auth`.

### Step 5 — React dashboard

In `my-app/.env`:

```env
REACT_APP_WHATSAPP_BOT_URL=https://your-bot-server.com
REACT_APP_WHATSAPP_BOT_API_KEY=same-as-BOT_API_KEY
```

Rebuild & deploy React. The **بوت واتساب** card appears on the admin home page.

### Step 6 — Firestore config (optional)

Create `bot_config/settings`:

```json
{
  "ownerPhone": "218926128650",
  "greeting": "مرحباً بك في لايف استوديو 📸",
  "packages": [
    { "id": "wedding", "label": "زفاف", "price": 2500 },
    { "id": "portrait", "label": "بورتريه", "price": 800 },
    { "id": "event", "label": "مناسبة", "price": 1500 }
  ],
  "bank": {
    "name": "مصرف ليبيا المركزي",
    "accountName": "لايف استوديو",
    "accountNumber": "1234567890",
    "note": "أرسل صورة الإيصال بعد التحويل"
  }
}
```

---

## 4. Bot conversation flow (state machine)

```
MAIN_MENU
  1 → BOOK: pick date → time → package → name → location → payment type → confirm
      → creates session (status: tentative) + invoice + finance row
      → notifies owner
  2 → CANCEL: pick session → confirm → status cancelled
  3 → RESCHEDULE: pick session → new date/time
  4 → PAY: pick invoice → bank transfer or cash → await receipt image
  5 → TRACK: show workflowStage / downloadUrl
  0 → back to menu (any time)
```

State stored in `whatsapp_chats/{chatId}` with 30-minute expiry.

---

## 5. Firestore fields added by bot

### `sessions` (new / extended)

| Field | Value |
|-------|--------|
| `status` | `tentative` (bot booking), then admin confirms → `in_progress` |
| `bookingSource` | `"whatsapp"` |
| `workflowStage` | `booked` → `editing` → `ready` → `delivered` (for follow-ups) |
| `downloadUrl` | optional link when photos ready |

### `invoices`

| Field | Value |
|-------|--------|
| `sessionId` | links to session |
| `bookingSource` | `"whatsapp"` |

Finance sync uses the **same logic** as `AdminPage.buildFinanceRow` / `syncFinanceForInvoice`.

---

## 6. Owner notifications

Every book / cancel / reschedule / payment proof calls `notifyOwner()` → WhatsApp message to `OWNER_PHONE` (`218926128650` in your app).

---

## 7. Client follow-up (workflow)

When admin updates a session in Firestore:

```js
await updateDoc(doc(db, "sessions", sessionId), {
  workflowStage: "ready",
  downloadUrl: "https://..."
});
```

The bot listener auto-messages the client's `clientPhone`.

**Stages:** `booked`, `editing`, `ready`, `delivered`

---

## 8. Security checklist

- [ ] Protect `/api/status` with `BOT_API_KEY` (already implemented)
- [ ] Firestore rules: deny client writes to `whatsapp_bot`, `whatsapp_chats`
- [ ] Run bot server on private network or IP allowlist if possible
- [ ] **Unofficial API risk:** WhatsApp may ban numbers that automate heavily — use a dedicated studio line

---

## 9. React admin: confirm tentative bookings

Bot creates `status: "tentative"`. In admin **الجلسات**, assign photographers and change status to `in_progress` when confirmed.

Optional: add filter for `tentative` + `bookingSource === "whatsapp"` in `AdminPage.js`.

---

## 10. Troubleshooting

| Issue | Fix |
|-------|-----|
| QR keeps appearing | Ensure persistent volume for `.wwebjs_auth` |
| Chromium crash on Linux | Use provided `Dockerfile` deps |
| Double bookings | `availability.js` checks `sessions` where `status !== cancelled` |
| React can't reach bot | CORS enabled; set `REACT_APP_WHATSAPP_BOT_URL` |
| Invoice not on calendar | Calendar reads `sessions` by `date` — bot creates session with same date |

---

## 11. Baileys provider (implemented)

Default: `WHATSAPP_PROVIDER=baileys` — no Chromium, production-ready.

| Provider | Env | Docker |
|----------|-----|--------|
| **Baileys** | `WHATSAPP_PROVIDER=baileys` | `Dockerfile.baileys` |
| whatsapp-web.js | `WHATSAPP_PROVIDER=webjs` | `Dockerfile` |

Session path: `.baileys_auth/` — mount volume at `/data/baileys_auth` on Railway/Render.

## 12. Photographer assignment (implemented)

- **إعدادات البوت** on admin home → default photographers → `bot_config/settings`
- **تأكيد حجز واتساب** (✓) on tentative sessions in الجلسات
- Bot auto-sends WhatsApp mission to each photographer's `phone` when status → `in_progress`

## 13. Deploy

See **DEPLOY.md** for Railway, Render, and Docker Compose steps.

---

## API reference

### `GET /api/health`

Public health check.

### `GET /api/status`

Headers: `x-api-key: <BOT_API_KEY>`

```json
{
  "connected": true,
  "qrCode": null,
  "phoneNumber": "218926128650",
  "message": "متصل"
}
```

When disconnected, `qrCode` is a `data:image/png;base64,...` URL for the React widget.
