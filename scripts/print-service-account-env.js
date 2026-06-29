/**
 * Prints FIREBASE_SERVICE_ACCOUNT_JSON as one line for Render/Railway env paste.
 * Usage: node scripts/print-service-account-env.js
 */
const fs = require("fs");
const path = require("path");

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const json = fs.readFileSync(keyPath, "utf8").trim();
process.stdout.write(json);
