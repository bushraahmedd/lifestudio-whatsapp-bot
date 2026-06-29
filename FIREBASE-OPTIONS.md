# Firebase & 24/7 hosting

## What Firebase already does for you

| Service | Your app | Good for WhatsApp bot? |
|---------|----------|------------------------|
| **Firebase Hosting** | React admin at lifestudio-abf4b.web.app | ✅ Website only |
| **Firestore** | Sessions, invoices, clients, bot settings | ✅ Database |
| **Cloud Functions** | Short HTTP/cron jobs | ❌ Not always-on; timeouts; no long WhatsApp socket |

The **WhatsApp bot must run 24/7** with a **saved login** (Baileys). That is a long-running Node process — not what Cloud Functions are for.

## Can the bot run “on Firebase”?

**Not on the free Firebase plan as a always-on server.**

Options in the same Google/Firebase project:

1. **Cloud Run** (paid, ~$5–15/mo) — run `Dockerfile.baileys`, but session files need a volume (extra setup).
2. **Compute Engine VM** in GCP — similar to Oracle free VM, usually paid.
3. **Oracle Cloud Always Free** — $0, best free 24/7 (see `FREE-DEPLOY.md`).

## Recommendation

- **Website + data** → Firebase (already done)
- **Libya + free cloud** → **Render free** (`RENDER-FREE.md`) or **PC + Cloudflare**
- **Libya + paid local** → **Libyan Spider** Tripoli VPS (`LIBYA-HOSTING.md`)
- ~~Oracle free~~ → not available in Libya

Bot settings (URL, API key, boss phones, IBAN) stay in **Firestore** `bot_config/settings` — no redeploy needed when they change.
