/**
 * Prints only base64 for Render FIREBASE_SERVICE_ACCOUNT_B64 (safest paste).
 */
const fs = require("fs");
const path = require("path");

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const json = fs.readFileSync(keyPath, "utf8").trim();
process.stdout.write(Buffer.from(json, "utf8").toString("base64"));
