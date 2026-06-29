/**
 * Prints Firebase credentials for Render/Railway env vars.
 * Usage: npm run print-sa-env
 */
const fs = require("fs");
const path = require("path");

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const json = fs.readFileSync(keyPath, "utf8").trim();
const b64 = Buffer.from(json, "utf8").toString("base64");

console.log("--- Option A: FIREBASE_SERVICE_ACCOUNT_JSON (paste one line below) ---");
console.log(json);
console.log("");
console.log("--- Option B: FIREBASE_SERVICE_ACCOUNT_B64 (easier on Render) ---");
console.log(b64);
