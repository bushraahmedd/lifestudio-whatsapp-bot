/**
 * Seed default packages into Firestore `packages` collection.
 * Run: node scripts/seed-packages.js
 */
require("dotenv").config();
const { ensureFirebase } = require("../src/firebase/admin");
const { DEFAULT_PACKAGES } = require("../src/firestore/packages");

async function main() {
  ensureFirebase();
  const fb = require("../src/firebase/admin");
  const col = fb.db.collection("packages");
  const existing = await col.limit(1).get();
  if (!existing.empty) {
    console.log("packages collection already has data — skipping seed.");
    process.exit(0);
  }
  for (const pkg of DEFAULT_PACKAGES) {
    await col.add({ ...pkg, createdAt: fb.FieldValue.serverTimestamp() });
    console.log("Added:", pkg.label);
  }
  console.log("Done seeding packages.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
