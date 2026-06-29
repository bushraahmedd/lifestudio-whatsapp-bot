# Free 24/7 WhatsApp Bot (no payment)

Paid hosts (Render Starter, Railway) stay online 24/7. **Free cloud tiers sleep** → WhatsApp disconnects.  
These options cost **$0**:

| Option | 24/7? | Stable URL? | Best for |
|--------|-------|-------------|----------|
| **A — Your PC + tunnel** | Only while PC is on | Changes if tunnel restarts* | Start now, zero signup |
| **B — Oracle Cloud free VM** | Yes | Use tunnel on VM or public IP** | Real 24/7 without paying |

\* Fix: set bot URL once in admin → **إعدادات البوت** (saved in Firestore, no redeploy).  
\** HTTPS required for the live site — use Cloudflare Tunnel on the VM (free).

---

## Option A — Your Windows PC (easiest, $0)

### 1. Install Cloudflare Tunnel (one time)

```powershell
winget install Cloudflare.cloudflared
```

Or download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### 2. Start bot + tunnel

```powershell
cd c:\Users\BesanCo\Desktop\life\whatsapp-bot
.\scripts\start-windows-free.ps1
```

Copy the `https://….trycloudflare.com` URL from the tunnel window.

### 3. Set URL in admin (no rebuild)

1. Open https://lifestudio-abf4b.web.app  
2. **إعدادات البوت** → paste **رابط خادم البوت**  
3. API key: `live-studio-wa-2026-secret-key`  
4. Save → refresh **بوت واتساب** → scan QR  

### 4. Keep PC on

Bot runs only while your computer is on. For auto-start after reboot, add `start-windows-free.ps1` to Windows **Task Scheduler** (At startup).

---

## Option B — Oracle Cloud Always Free VM (true 24/7, $0)

Oracle gives a **free Linux server forever** (1–4 ARM cores, 24GB RAM total).  
Signup: https://www.oracle.com/cloud/free/  
(Some regions are full — try another region if signup fails.)

### On the VM (Ubuntu), after SSH:

```bash
curl -fsSL https://raw.githubusercontent.com/bushraahmedd/lifestudio-whatsapp-bot/master/scripts/oracle-install.sh | bash
```

The script will ask you to paste:
- Firebase JSON (`npm run print-sa-env` on your PC)
- `BOT_API_KEY` (same as admin: `live-studio-wa-2026-secret-key`)

Then it starts the bot with **PM2** + **Cloudflare quick tunnel** and prints the HTTPS URL.

Paste that URL in admin → **إعدادات البوت**.

---

## What does NOT work for free 24/7

- Render / Railway / Fly.io **free sleep** → bot goes offline  
- Localtunnel/ngrok **without your PC or VM running**  
- Plain `http://IP:8080` from the live HTTPS site (browser blocks mixed content)

---

## If the tunnel URL changes

1. Run the start script again  
2. Admin → **إعدادات البوت** → update URL → Save  
3. No `npm run build` or Firebase deploy needed
