const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const config = require("../config");

let initError = null;
let ready = false;

function parseServiceAccountJson(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  // Sometimes pasted with surrounding quotes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(JSON.parse(trimmed));
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object");
}

function resolveServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64.trim(), "base64").toString("utf8");
    return parseServiceAccountJson(json);
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return parseServiceAccountJson(inlineJson);
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    return JSON.parse(fs.readFileSync(credPath, "utf8"));
  }

  const localPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (fs.existsSync(localPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localPath;
    return JSON.parse(fs.readFileSync(localPath, "utf8"));
  }

  return null;
}

function ensureFirebase() {
  if (ready) return;
  if (initError) throw initError;

  try {
    if (!admin.apps.length) {
      const serviceAccount = resolveServiceAccount();
      if (!serviceAccount) {
        throw new Error(
          "Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_B64 (Render), or serviceAccountKey.json (local)."
        );
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebaseProjectId,
      });
    }
    ready = true;
  } catch (err) {
    initError = err;
    throw err;
  }
}

function getFirebaseStatus() {
  if (ready) return { ok: true };
  if (initError) return { ok: false, error: initError.message };
  const hasEnv =
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || !!process.env.FIREBASE_SERVICE_ACCOUNT_B64
    || fs.existsSync(path.join(process.cwd(), "serviceAccountKey.json"));
  return {
    ok: false,
    error: hasEnv ? "Firebase not initialized yet" : "Firebase credentials not configured",
  };
}

module.exports = {
  get admin() {
    ensureFirebase();
    return admin;
  },
  get db() {
    ensureFirebase();
    return admin.firestore();
  },
  get FieldValue() {
    ensureFirebase();
    return admin.firestore.FieldValue;
  },
  get Timestamp() {
    ensureFirebase();
    return admin.firestore.Timestamp;
  },
  ensureFirebase,
  getFirebaseStatus,
};
