/**
 * Update bot_config/settings in Firestore
 * Usage: node scripts/update-bot-config.js
 */
require("dotenv").config();
const admin = require("firebase-admin");
const path = require("path");

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
  projectId: process.env.FIREBASE_PROJECT_ID || "lifestudio-abf4b",
});

const BOSS_PHONES = ["218926128650", "218945068428"];

async function main() {
  await admin.firestore().doc("bot_config/settings").set(
    {
      bossPhones: BOSS_PHONES,
      ownerPhone: "218926128650",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  console.log("Updated bot_config/settings:");
  console.log("  bossPhones:", BOSS_PHONES.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
