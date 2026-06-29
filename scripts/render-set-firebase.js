/**
 * Set FIREBASE_SERVICE_ACCOUNT_B64 on Render and trigger redeploy.
 *
 * Usage (PowerShell):
 *   $env:RENDER_API_KEY = "rnd_..."
 *   node scripts/render-set-firebase.js
 *
 * Get API key: Render Dashboard → Account Settings → API Keys
 * Service ID: Render → live-studio-whatsapp-bot → Settings → copy Service ID (srv-...)
 */
const fs = require("fs");
const path = require("path");

const apiKey = process.env.RENDER_API_KEY;
const serviceId = process.env.RENDER_SERVICE_ID || "srv-live-studio-whatsapp-bot";

if (!apiKey) {
  console.error("Set RENDER_API_KEY (Render → Account Settings → API Keys)");
  process.exit(1);
}

const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json");
  process.exit(1);
}

const b64 = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "utf8").toString("base64");

async function renderFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function resolveServiceId() {
  if (process.env.RENDER_SERVICE_ID) return process.env.RENDER_SERVICE_ID;

  const services = await renderFetch("https://api.render.com/v1/services?limit=50");
  const list = Array.isArray(services) ? services.map((x) => x.service || x) : [];
  const match = list.find((s) => s.name === "live-studio-whatsapp-bot" || s.slug === "live-studio-whatsapp-bot");
  if (!match) {
    throw new Error("Service not found. Set RENDER_SERVICE_ID=srv-...");
  }
  return match.id;
}

async function upsertEnvVar(serviceId, key, value) {
  const existing = await renderFetch(`https://api.render.com/v1/services/${serviceId}/env-vars`);
  const vars = Array.isArray(existing) ? existing.map((x) => x.envVar || x) : [];
  const found = vars.find((v) => v.key === key);

  if (found) {
    await renderFetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${found.id}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    console.log(`Updated env: ${key}`);
    return;
  }

  await renderFetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
  console.log(`Created env: ${key}`);
}

async function deleteEnvVar(serviceId, key) {
  const existing = await renderFetch(`https://api.render.com/v1/services/${serviceId}/env-vars`);
  const vars = Array.isArray(existing) ? existing.map((x) => x.envVar || x) : [];
  const found = vars.find((v) => v.key === key);
  if (!found) return;
  await renderFetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${found.id}`, {
    method: "DELETE",
  });
  console.log(`Deleted env: ${key}`);
}

async function triggerDeploy(serviceId) {
  const deploy = await renderFetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  const id = deploy.id || deploy.deploy?.id;
  console.log("Deploy triggered:", id || "ok");
}

async function main() {
  const serviceId = await resolveServiceId();
  console.log("Service:", serviceId);

  await deleteEnvVar(serviceId, "FIREBASE_SERVICE_ACCOUNT_JSON");
  await upsertEnvVar(serviceId, "FIREBASE_SERVICE_ACCOUNT_B64", b64);
  await triggerDeploy(serviceId);

  console.log("");
  console.log("Done. Wait ~2 min then open:");
  console.log("  https://live-studio-whatsapp-bot.onrender.com/api/health");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
