/**
 * Ollama HTTP client — works with:
 * - Local:  http://127.0.0.1:11434
 * - Cloud:  https://ollama.com  (+ OLLAMA_API_KEY)
 * - Any remote host that speaks the Ollama API
 */

function normalizeBaseUrl(baseUrl) {
  let u = String(baseUrl || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
  // Users sometimes paste https://ollama.com/api — we always append /api/...
  if (u.endsWith("/api")) u = u.slice(0, -4);
  return u;
}

function authHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function chat({
  baseUrl,
  apiKey = "",
  model,
  messages,
  temperature = 0.4,
  timeoutMs = 45000,
  format = null,
}) {
  const root = normalizeBaseUrl(baseUrl);
  const url = `${root}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: 400,
      },
    };
    if (format) body.format = format;

    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return (data.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

async function isReachable(baseUrl, apiKey = "", timeoutMs = 4000) {
  const root = normalizeBaseUrl(baseUrl);
  const url = `${root}/api/tags`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: authHeaders(apiKey),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chat, isReachable, normalizeBaseUrl };
