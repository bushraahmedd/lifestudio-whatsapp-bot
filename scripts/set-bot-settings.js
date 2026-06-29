/**
 * Writes bot URL + API key to Firestore bot_config/settings
 * Usage: node scripts/set-bot-settings.js <tunnel-url>
 */
require("dotenv").config();
const admin = require("firebase-admin");
const path = require("path");

const botUrl = (process.argv[2] || "").replace(/\/$/, "");
const botApiKey = process.env.BOT_API_KEY || "live-studio-wa-2026-secret-key";

if (!botUrl || !botUrl.startsWith("https://")) {
  console.error("Usage: node scripts/set-bot-settings.js https://xxxx.trycloudflare.com");
  process.exit(1);
}

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
  projectId: process.env.FIREBASE_PROJECT_ID || "lifestudio-abf4b",
});

async function main() {
  await admin.firestore().doc("bot_config/settings").set(
    {
      botApiUrl: botUrl,
      botApiKey,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log("Saved bot_config/settings:");
  console.log("  botApiUrl:", botUrl);
  console.log("  botApiKey:", botApiKey);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
