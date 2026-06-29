const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const config = require("../config");

function resolveCredential() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    try {
      return admin.credential.cert(JSON.parse(inlineJson));
    } catch (err) {
      throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${err.message}`);
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    return admin.credential.applicationDefault();
  }

  const localPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (fs.existsSync(localPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localPath;
    return admin.credential.applicationDefault();
  }

  throw new Error(
    "Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (cloud) or GOOGLE_APPLICATION_CREDENTIALS / serviceAccountKey.json (local)."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: resolveCredential(),
    projectId: config.firebaseProjectId,
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

module.exports = { admin, db, FieldValue, Timestamp };
