# Google Cloud / Firebase — what’s free for the bot?

Your project **`lifestudio-abf4b`** is already on Firebase (Hosting + Firestore).  
Firebase **is** Google Cloud — same account, same billing.

---

## What you already use (free tier ✅)

| Service | Use | Free tier |
|---------|-----|-----------|
| **Firebase Hosting** | Admin app lifestudio-abf4b.web.app | Generous free quota |
| **Firestore** | Sessions, clients, invoices, bot settings | Free tier (read/write limits) |
| **Firebase Auth** | Login | Free |

You do **not** pay for normal studio usage on these unless you grow very large.

---

## Can the WhatsApp bot run free on Firebase / Google Cloud?

**Not on Firebase alone.**

| Service | Free? | WhatsApp bot? |
|---------|-------|----------------|
| **Cloud Functions** | Some free calls | ❌ Max ~9 min run, sleeps — no 24/7 socket |
| **Cloud Run** | Free requests/month | ⚠️ Sleeps when idle; no saved Baileys login unless you pay for disk + min instances |
| **Firebase Hosting** | Yes | ❌ Static website only, not Node bot |
| **Compute Engine (e2-micro)** | **Always Free** in 3 US regions | ✅ **Can work** like a small VPS |

So: **website + database = Firebase free**. **Bot 24/7 = needs a small VM (GCE e2-micro) or Render / PC.**

---

## Option — Google Cloud e2-micro (Always Free VM)

Google gives **one tiny Linux server free forever** (not in all countries for signup, but many Libyan users can register with a card — **not charged** if you stay in Always Free limits).

**Regions (free):** `us-west1`, `us-central1`, `us-east1` only.

### Quick setup

1. https://console.cloud.google.com/ → same Google account as Firebase  
2. Enable billing (card for verification — **e2-micro stays $0** if you use only free tier)  
3. **Compute Engine → VM instances → Create**  
   - Machine: **e2-micro**  
   - Region: **us-central1** (or us-east1 / us-west1)  
   - OS: **Ubuntu 22.04**  
   - Allow HTTP/HTTPS  
4. SSH into VM, then:

```bash
curl -fsSL https://raw.githubusercontent.com/bushraahmedd/lifestudio-whatsapp-bot/master/scripts/oracle-install.sh | bash
```

(Same script works on any Ubuntu VPS — installs Node, bot, PM2, Cloudflare tunnel.)

5. Paste Firebase JSON + API key when asked  
6. Copy tunnel URL → admin **إعدادات البوت**  
7. Scan QR  

---

## Compare for Libya

| | Firebase Hosting | Cloud Functions | Cloud Run free | GCE e2-micro free | Render free |
|--|------------------|-----------------|----------------|-------------------|-------------|
| **Cost** | $0 | $0* | $0* | $0** | $0 |
| **24/7 bot** | No | No | No | **Yes** | Sleeps |
| **Signup from Libya** | Yes | Yes | Yes | Often yes (card) | Yes |

\* Free quota, not always-on  
\*\* Must stay on e2-micro in US regions only

---

## Practical recommendation (Libya, no Oracle)

1. **Now, $0:** PC + Cloudflare tunnel (`FREE-DEPLOY.md`)  
2. **Cloud, $0:** Render free (`RENDER-FREE.md`) — sleeps sometimes  
3. **Real 24/7, $0:** Google **e2-micro** VM (this guide) — if signup works  
4. **Local Libya:** Libyan Spider Tripoli (`LIBYA-HOSTING.md`) — paid after trial  

**Keep Firebase** for the app and data. **Run the bot** on Render, GCE, PC, or Libyan VPS.

---

## Boss numbers (already set)

- `218926128650`  
- `218945068428` (0945068428)
