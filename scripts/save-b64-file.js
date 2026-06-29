/**
 * Writes base64 to b64.txt for safe copy-paste (avoids clipboard truncation).
 * Usage: npm run save-b64-file
 */
const fs = require("fs");
const path = require("path");

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
const outPath = path.join(__dirname, "..", "b64.txt");

if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const json = fs.readFileSync(keyPath, "utf8").trim();
const b64 = Buffer.from(json, "utf8").toString("base64");
fs.writeFileSync(outPath, b64, "utf8");

console.log("Saved:", outPath);
console.log("Length:", b64.length, "(must be 3184 on Render)");
console.log("Open b64.txt → Ctrl+A → Ctrl+C → paste into FIREBASE_SERVICE_ACCOUNT_B64");
