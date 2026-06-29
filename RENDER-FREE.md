# Deploy on Render (Free) — good for Libya 🇱🇾

Oracle is **not** available in Libya. **Render free** is the easiest cloud option.

Repo: https://github.com/bushraahmedd/lifestudio-whatsapp-bot

## One-click

1. Open https://dashboard.render.com/ → sign up (GitHub login)
2. **New** → **Blueprint**
3. Connect repo `bushraahmedd/lifestudio-whatsapp-bot`
4. Render reads `render.yaml` (free plan)

## Required secret (Environment)

| Key | Value |
|-----|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | On your PC: `cd whatsapp-bot` → `npm run print-sa-env` → paste full JSON |

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

Free Render is OK for **testing**, not reliable 24/7 WhatsApp. For real 24/7 free → Oracle VM (`FREE-DEPLOY.md`).

## Boss alerts

Configured in `render.yaml`:

- `218926128650`
- `218945068428` (0945068428)

Both get WhatsApp messages on new bookings.
