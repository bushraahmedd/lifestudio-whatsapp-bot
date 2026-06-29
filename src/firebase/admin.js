const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const config = require("../config");

let initError = null;
let ready = false;

const CREDENTIALS_PATH = process.env.FIREBASE_CREDENTIALS_PATH
  || path.join("/tmp", "firebase-service-account.json");

const EXPECTED_B64_LENGTH = 3184;

const SECRET_FILE_PATHS = [
  process.env.FIREBASE_SECRET_FILE,
  "/etc/secrets/serviceAccountKey.json",
  "/etc/secrets/firebase-service-account.json",
].filter(Boolean);

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
    `Invalid Firebase service account (${lastError?.message || "parse failed"}). `
    + "On Render: delete FIREBASE_SERVICE_ACCOUNT_JSON, set FIREBASE_SERVICE_ACCOUNT_B64 only (npm run print-sa-b64)."
  );
}

function parseB64Env(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    return parseServiceAccountJson(trimmed);
  }
  if (trimmed.length > 0 && trimmed.length < EXPECTED_B64_LENGTH - 50) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_B64 looks truncated (${trimmed.length} chars, need ~${EXPECTED_B64_LENGTH}). `
      + "Easier fix: Render → Environment → Secret Files → upload serviceAccountKey.json"
    );
  }
  return parseServiceAccountJson(decodeBase64(trimmed));
}

function readSecretFile() {
  for (const filePath of SECRET_FILE_PATHS) {
    if (fs.existsSync(filePath)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = filePath;
      return parseServiceAccountJson(fs.readFileSync(filePath, "utf8"));
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
  const fromSecret = readSecretFile();
  if (fromSecret) return fromSecret;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64?.trim()) {
    return parseB64Env(b64);
  }

  const isProduction = process.env.NODE_ENV === "production";
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson?.trim() && !isProduction) {
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

  if (isProduction && inlineJson?.trim()) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON is set but broken. Delete it on Render. "
      + "Set FIREBASE_SERVICE_ACCOUNT_B64 only (npm run print-sa-b64)."
    );
  }

  return null;
}

function getCredentialHint() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64?.trim();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const secretFile = SECRET_FILE_PATHS.find((p) => fs.existsSync(p));
  return {
    hasSecretFile: !!secretFile,
    secretFilePath: secretFile || null,
    hasB64: !!b64,
    hasJson: !!json,
    b64Length: b64?.length || 0,
    expectedB64Length: EXPECTED_B64_LENGTH,
    b64Truncated: !!b64 && b64.length < EXPECTED_B64_LENGTH - 50,
    jsonLength: json?.length || 0,
    b64LooksLikeJson: !!b64?.startsWith("{"),
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
          "Firebase credentials missing. On Render set FIREBASE_SERVICE_ACCOUNT_B64 (npm run print-sa-b64)."
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
  if (!hint.hasB64 && !hint.hasJson && !hint.hasSecretFile
    && !fs.existsSync(path.join(process.cwd(), "serviceAccountKey.json"))) {
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
