# WhatsApp QR not showing on Render?

Render **free** (512MB RAM) often **cannot run Baileys** — the server stays up but WhatsApp never starts (no QR).

## Best option for Libya: run bot on your PC

### 1) Start the bot
```powershell
cd c:\Users\BesanCo\Desktop\life\whatsapp-bot
npm run start:baileys
```
Wait until you see QR in the terminal OR keep step 2 open.

### 2) Start HTTPS tunnel (new PowerShell window)
```powershell
cloudflared tunnel --url http://localhost:8080
```
Copy the `https://....trycloudflare.com` URL.

### 3) Save URL in admin app
https://lifestudio-abf4b.web.app → **إعدادات البوت** → paste tunnel URL → Save

### 4) Scan QR
**بوت واتساب** → scan QR (or scan from terminal).

---

## Keep PC bot reachable (optional)

- Leave PC on + bot running
- UptimeRobot can ping your tunnel URL every 5 min (if tunnel stays same session)
- Or use `scripts/start-windows-free.ps1` (bot + tunnel together)

---

## If you must use Render

- Upgrade to **Render Starter** ($7/mo) — more RAM
- Or accept re-scanning QR after each deploy

Render URL for API-only health: `https://live-studio-whatsapp-bot.onrender.com/api/health`
