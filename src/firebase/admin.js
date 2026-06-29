const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const config = require("../config");

let initError = null;
let ready = false;

function looksLikeBase64(value) {
  const s = value.trim();
  if (!s || s.startsWith("{")) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100;
}

function fixPrivateKeyNewlines(jsonText) {
  const marker = '"private_key"';
  const start = jsonText.indexOf(marker);
  if (start === -1) return jsonText;

  const colon = jsonText.indexOf(":", start);
  const openQuote = jsonText.indexOf('"', colon + 1);
  if (openQuote === -1) return jsonText;

  const endMarker = "-----END PRIVATE KEY-----";
  const endIdx = jsonText.indexOf(endMarker, openQuote);
  if (endIdx === -1) return jsonText;

  const closeQuote = jsonText.indexOf('"', endIdx + endMarker.length);
  if (closeQuote === -1) return jsonText;

  const keyBody = jsonText.slice(openQuote + 1, closeQuote);
  const fixedKey = keyBody.replace(/\r?\n/g, "\\n");
  return jsonText.slice(0, openQuote + 1) + fixedKey + jsonText.slice(closeQuote);
}

function parseServiceAccountJson(raw) {
  let text = raw.trim();

  if (text.startsWith('"') && text.endsWith('"')) {
    text = JSON.parse(text);
  }

  if (typeof text !== "string") {
    return text;
  }

  const attempts = [
    () => JSON.parse(text),
    () => JSON.parse(fixPrivateKeyNewlines(text)),
    () => {
      const compact = text.replace(/\r?\n/g, "");
      return JSON.parse(compact);
    },
    () => {
      const compact = fixPrivateKeyNewlines(text).replace(/\r?\n/g, "");
      return JSON.parse(compact);
    },
  ];

  if (looksLikeBase64(text)) {
    attempts.unshift(() => JSON.parse(Buffer.from(text.replace(/\s/g, ""), "base64").toString("utf8")));
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Invalid Firebase service account JSON (${lastError?.message || "parse failed"}). `
    + "Use FIREBASE_SERVICE_ACCOUNT_B64 from: npm run print-sa-env"
  );
}

function resolveServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8");
    return parseServiceAccountJson(json);
  }

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return parseServiceAccountJson(inlineJson);
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    return parseServiceAccountJson(fs.readFileSync(credPath, "utf8"));
  }

  const localPath = path.join(process.cwd(), "serviceAccountKey.json");
  if (fs.existsSync(localPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = localPath;
    return parseServiceAccountJson(fs.readFileSync(localPath, "utf8"));
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
          "Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_B64 (recommended) or FIREBASE_SERVICE_ACCOUNT_JSON."
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

  if (!hasEnv) {
    return { ok: false, error: "Firebase credentials not configured" };
  }

  try {
    resolveServiceAccount();
    return { ok: false, error: "Firebase not initialized yet" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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
