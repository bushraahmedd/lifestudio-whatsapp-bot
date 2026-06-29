# Hosting the WhatsApp bot from Libya 🇱🇾

**Oracle Cloud is not available / practical in Libya** — skip it.

## Best options for you

| Option | Cost | 24/7? | Notes |
|--------|------|-------|--------|
| **1. Render (free)** | $0 | ⚠️ Sleeps when idle | Easiest cloud — already configured → see `RENDER-FREE.md` |
| **2. Your PC + Cloudflare** | $0 | While PC is on | Works today, no signup abroad |
| **3. Libyan Spider (JPaaS)** | Trial then paid | Yes | **Server in Tripoli** — libyanspider.com |
| **4. Render Starter** | ~$7/mo | Yes | Real 24/7 if you can pay later |

---

## Option 1 — Render free (recommended cloud for Libya)

1. https://dashboard.render.com/ → sign up with GitHub  
2. **New → Blueprint** → repo `bushraahmedd/lifestudio-whatsapp-bot`  
3. Add `FIREBASE_SERVICE_ACCOUNT_JSON` (`npm run print-sa-env`)  
4. Copy Render URL → admin **إعدادات البوت**  
5. Scan QR  

⚠️ Free tier **sleeps** after ~15 min — WhatsApp may disconnect until someone opens the URL or you upgrade.

Full steps: **`RENDER-FREE.md`**

---

## Option 2 — Your PC + Cloudflare (free, works now)

```powershell
cd c:\Users\BesanCo\Desktop\life\whatsapp-bot
.\scripts\start-windows-free.ps1
```

Paste tunnel URL in admin → **إعدادات البوت**.

Keep the studio PC on (or use Task Scheduler at startup).

---

## Option 3 — Libyan Spider (local Libya)

- Website: https://libyanspider.com/jpaas/  
- Data center: **Tripoli** (+ Finland)  
- **14-day free trial**, then you pay in LYD  
- Deploy Ubuntu VPS or Docker, then run the same bot:

```bash
git clone https://github.com/bushraahmedd/lifestudio-whatsapp-bot.git
cd lifestudio-whatsapp-bot
# add serviceAccountKey.json + .env
npm ci --omit=dev
npm run start:baileys
```

Use Cloudflare tunnel on the server for HTTPS URL to admin.

---

## Option 4 — Koyeb (free tier, global signup)

May work from Libya with GitHub:

1. https://www.koyeb.com/ → sign up  
2. **Create App** → Docker → GitHub repo `lifestudio-whatsapp-bot`  
3. Dockerfile: `Dockerfile.baileys`  
4. Env vars same as `render.yaml`  
5. Free plan sleeps (cold start) — same limitation as Render  

---

## What we use Firebase for

- ✅ Website (lifestudio-abf4b.web.app)  
- ✅ Database (sessions, clients, invoices)  
- ✅ Bot settings (URL, bosses, IBAN)  
- ❌ **Not** for running the WhatsApp bot 24/7 on free tier  

See `FIREBASE-OPTIONS.md`.

---

## Boss WhatsApp alerts (configured)

- `218926128650`  
- `218945068428` (0945068428)
