#!/usr/bin/env bash
# Oracle Cloud Always Free VM — install bot + PM2 + Cloudflare tunnel
set -euo pipefail

REPO="https://github.com/bushraahmedd/lifestudio-whatsapp-bot.git"
APP_DIR="$HOME/lifestudio-whatsapp-bot"

echo "=== Live Studio WhatsApp Bot — Oracle free VM setup ==="

sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
  chmod +x cloudflared
  sudo mv cloudflared /usr/local/bin/cloudflared
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git pull --ff-only || true
npm ci --omit=dev

read -r -p "Paste FIREBASE_SERVICE_ACCOUNT_JSON (one line): " FIREBASE_JSON
read -r -p "BOT_API_KEY [live-studio-wa-2026-secret-key]: " BOT_KEY
BOT_KEY=${BOT_KEY:-live-studio-wa-2026-secret-key}

mkdir -p "$APP_DIR/data/baileys_auth"

cat > "$APP_DIR/.env" <<EOF
FIREBASE_SERVICE_ACCOUNT_JSON=$FIREBASE_JSON
FIREBASE_PROJECT_ID=lifestudio-abf4b
PORT=8080
BOT_API_KEY=$BOT_KEY
WHATSAPP_PROVIDER=baileys
BAILEYS_AUTH_PATH=$APP_DIR/data/baileys_auth
OWNER_PHONE=218926128650
APP_URL=https://lifestudio-abf4b.web.app
NODE_ENV=production
EOF

pm2 delete live-studio-wa 2>/dev/null || true
pm2 delete live-studio-wa-tunnel 2>/dev/null || true

pm2 start npm --name live-studio-wa -- run start:baileys
pm2 start bash --name live-studio-wa-tunnel -- -c "cloudflared tunnel --url http://127.0.0.1:8080"
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | bash || true

echo ""
echo "=== Done ==="
echo "Bot logs:  pm2 logs live-studio-wa"
echo "Tunnel:    pm2 logs live-studio-wa-tunnel  (copy https://....trycloudflare.com)"
echo "Admin:     https://lifestudio-abf4b.web.app -> bot settings -> paste URL"
echo ""
