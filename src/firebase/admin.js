const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const config = require("../config");

let initError = null;
let ready = false;

const CREDENTIALS_PATH = process.env.FIREBASE_CREDENTIALS_PATH
  || path.join("/tmp", "firebase-service-account.json");

const EXPECTED_B64_LENGTH = 3184;

function listSecretFileCandidates() {
  const candidates = new Set();

  if (process.env.FIREBASE_SECRET_FILE) {
    candidates.add(process.env.FIREBASE_SECRET_FILE);
  }

  for (const name of [
    "serviceAccountKey.json",
    "firebase-service-account.json",
    "service-account.json",
  ]) {
    candidates.add(path.join("/etc/secrets", name));
    candidates.add(path.join(process.cwd(), name));
  }

  try {
    if (fs.existsSync("/etc/secrets")) {
      for (const name of fs.readdirSync("/etc/secrets")) {
        if (name.toLowerCase().includes(".json")) {
          candidates.add(path.join("/etc/secrets", name));
        }
      }
    }
  } catch {
    // ignore
  }

  return [...candidates];
}

function looksLikeBase64(value) {
  const s = value.trim();
  if (!s || s.startsWith("{")) return false;
  return /^[A-Za-z0-9+/=_\s-]+$/.test(s) && s.length > 100;
}

function decodeBase64(value) {
  let s = value.trim().replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
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
    () => JSON.parse(text.replace(/\r?\n/g, "")),
    () => JSON.parse(fixPrivateKeyNewlines(text).replace(/\r?\n/g, "")),
  ];

  if (looksLikeBase64(text)) {
    attempts.unshift(() => JSON.parse(decodeBase64(text)));
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
    `Invalid Firebase service account (${lastError?.message || "parse failed"}).`
  );
}

function parseB64Env(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    return parseServiceAccountJson(trimmed);
  }
  if (trimmed.length > 0 && trimmed.length < EXPECTED_B64_LENGTH - 50) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_B64 truncated (${trimmed.length}/${EXPECTED_B64_LENGTH}). `
      + "Delete it and use Secret File serviceAccountKey.json only."
    );
  }
  return parseServiceAccountJson(decodeBase64(trimmed));
}

function readSecretFile() {
  for (const filePath of listSecretFileCandidates()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      process.env.GOOGLE_APPLICATION_CREDENTIALS = filePath;
      return parseServiceAccountJson(raw);
    } catch (err) {
      console.warn(`Secret file skipped (${filePath}):`, err.message);
    }
  }
  return null;
}

function writeCredentialsFile(serviceAccount) {
  try {
    fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(serviceAccount), { mode: 0o600 });
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CREDENTIALS_PATH;
  } catch (err) {
    console.warn("Could not write credentials file:", err.message);
  }
}

function resolveServiceAccount() {
  const errors = [];

  const fromSecret = readSecretFile();
  if (fromSecret) return fromSecret;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64?.trim()) {
    try {
      return parseB64Env(b64);
    } catch (err) {
      errors.push(err.message);
    }
  }

  const isProduction = process.env.NODE_ENV === "production";
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson?.trim() && !isProduction) {
    try {
      return parseServiceAccountJson(inlineJson);
    } catch (err) {
      errors.push(err.message);
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      return parseServiceAccountJson(fs.readFileSync(credPath, "utf8"));
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (isProduction && inlineJson?.trim()) {
    errors.push("Delete broken FIREBASE_SERVICE_ACCOUNT_JSON on Render.");
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }

  return null;
}

function getCredentialHint() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const secretFiles = listSecretFileCandidates().filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  return {
    hasSecretFile: secretFiles.length > 0,
    secretFilePaths: secretFiles,
    hasB64: !!b64,
    hasJson: !!json,
    b64Length: b64?.length || 0,
    expectedB64Length: EXPECTED_B64_LENGTH,
    b64Truncated: !!b64 && b64.length < EXPECTED_B64_LENGTH - 50,
    jsonLength: json?.length || 0,
    productionIgnoresJson: process.env.NODE_ENV === "production",
  };
}

function ensureFirebase() {
  if (ready) return;
  if (initError) throw initError;

  try {
    if (!admin.apps.length) {
      const serviceAccount = resolveServiceAccount();
      if (!serviceAccount) {
        throw new Error(
          "Firebase credentials missing. Upload Secret File serviceAccountKey.json on Render."
        );
      }
      writeCredentialsFile(serviceAccount);
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
  if (initError) {
    return { ok: false, error: initError.message, hint: getCredentialHint() };
  }

  const hint = getCredentialHint();
  if (!hint.hasB64 && !hint.hasJson && !hint.hasSecretFile) {
    return {
      ok: false,
      error: "Firebase credentials not configured",
      hint,
    };
  }

  try {
    resolveServiceAccount();
    return { ok: false, error: "Firebase not initialized yet", hint };
  } catch (err) {
    return { ok: false, error: err.message, hint };
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
