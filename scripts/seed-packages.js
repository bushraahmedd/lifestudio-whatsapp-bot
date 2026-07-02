/**
 * Sync official studio packages to Firestore.
 * Run: node scripts/seed-packages.js
 * Force update all: node scripts/seed-packages.js --force
 */
require("dotenv").config();
const { ensureFirebase } = require("../src/firebase/admin");
const { DEFAULT_PACKAGES } = require("../src/firestore/packages");

async function main() {
  const force = process.argv.includes("--force");
  ensureFirebase();
  const fb = require("../src/firebase/admin");
  const col = fb.db.collection("packages");

  if (!force) {
    const existing = await col.limit(1).get();
    if (!existing.empty) {
      console.log("packages already exist — run with --force to update all prices.");
      process.exit(0);
    }
  }

  for (const pkg of DEFAULT_PACKAGES) {
    const { id, ...data } = pkg;
    await col.doc(id).set(
      { ...data, updatedAt: fb.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log("Synced:", pkg.label, `— ${pkg.price} د.ل`);
  }
  console.log(`Done — ${DEFAULT_PACKAGES.length} packages synced.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
