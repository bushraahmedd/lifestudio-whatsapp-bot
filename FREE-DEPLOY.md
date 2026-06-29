# Free 24/7 WhatsApp Bot (no payment)

> **In Libya?** Oracle is **not** available — use **`LIBYA-HOSTING.md`** instead.

Paid hosts (Render Starter) stay online 24/7. **Free cloud tiers sleep** → WhatsApp may disconnect.

| Option | 24/7? | Best for |
|--------|-------|----------|
| **A — Your PC + Cloudflare tunnel** | While PC is on | Start now, $0 |
| **B — Render free** | ⚠️ Sleeps when idle | Cloud without Oracle → `RENDER-FREE.md` |
| ~~Oracle free VM~~ | — | **Not for Libya** |

---

## Option A — Your Windows PC (easiest, $0)

### 1. Install Cloudflare Tunnel (one time)

```powershell
winget install Cloudflare.cloudflared
```

### 2. Start bot + tunnel

```powershell
cd c:\Users\BesanCo\Desktop\life\whatsapp-bot
.\scripts\start-windows-free.ps1
```

### 3. Set URL in admin

1. https://lifestudio-abf4b.web.app → **إعدادات البوت**  
2. Paste tunnel URL + API key `live-studio-wa-2026-secret-key`  
3. Save → scan QR in **بوت واتساب**

---

## Option B — Render free (Libya-friendly)

See **`RENDER-FREE.md`** — connect GitHub repo, paste Firebase JSON, done.

---

## If the tunnel URL changes

Admin → **إعدادات البوت** → update URL → Save (no redeploy).
