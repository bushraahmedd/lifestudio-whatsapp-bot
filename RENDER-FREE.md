# Deploy on Render (Free) — good for Libya 🇱🇾

Oracle is **not** available in Libya. **Render free** is the easiest cloud option.

Repo: https://github.com/bushraahmedd/lifestudio-whatsapp-bot

## One-click

1. Open https://dashboard.render.com/ → sign up (GitHub login)
2. **New** → **Blueprint**
3. Connect repo `bushraahmedd/lifestudio-whatsapp-bot`
4. Render reads `render.yaml` (free plan)

## Required secret (Environment) — MUST add or bot won't connect

Pick **one** option in Render → **live-studio-whatsapp-bot** → **Environment**:

### Option A — Secret File (easiest, recommended)

1. **Delete** env var `FIREBASE_SERVICE_ACCOUNT_B64` if set
2. Scroll to **Secret Files** → **Add Secret File**
3. Filename: `serviceAccountKey.json`
4. Upload the file from your PC: `whatsapp-bot/serviceAccountKey.json`
5. Save → redeploy

### Option B — Base64 env var

1. On PC:
   ```powershell
   cd c:\Users\BesanCo\Desktop\life\whatsapp-bot
   npm run save-b64-file
   ```
2. Open `b64.txt` → **Ctrl+A** → **Ctrl+C** (full line, **3184** characters)
3. Render → Environment → `FIREBASE_SERVICE_ACCOUNT_B64` → paste → Save

**Truncated paste** (`b64Length` 3108 instead of 3184) causes `Unterminated string` errors.

**If deploy shows "failed" or service won't start:**
1. Open Render → **live-studio-whatsapp-bot** → **Logs**
2. Build failed → usually out of memory (fixed: we skip Puppeteer now)
3. Deploy OK but crashes → missing/invalid Firebase secret above
4. After adding env → **Manual Deploy**

Test after deploy: open `https://YOUR-SERVICE.onrender.com/api/health`  
You should see `"ok": true` and `"firebase": { "ok": true }`.


Other variables are set in `render.yaml` (boss phones, API key, etc.).

## After deploy

1. Copy Render URL, e.g. `https://live-studio-whatsapp-bot.onrender.com`
2. Admin → **إعدادات البوت** → paste URL + API key `live-studio-wa-2026-secret-key` → Save
3. Open **بوت واتساب** → scan QR (WhatsApp → Linked Devices)

## Free plan limits (important)

| Issue | What happens |
|-------|----------------|
| **Sleeps** | After ~15 min idle, service stops → WhatsApp disconnects |
| **No persistent disk** | After restart/deploy you may need to **scan QR again** |
| **Wake** | First request after sleep takes 30–60 seconds |

Free Render is OK for **testing**. For real **24/7** in Libya → **Libyan Spider** (Tripoli) or **Render Starter** ~$7/mo — see `LIBYA-HOSTING.md`.

## Boss alerts

Configured in `render.yaml`:

- `218926128650`
- `218945068428` (0945068428)

Both get WhatsApp messages on new bookings.
