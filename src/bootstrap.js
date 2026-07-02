const { createStatusRouter } = require("./routes/status");

function mountApiRoutes(app) {
  app.use("/api", createStatusRouter());
}

async function startServices() {
  const { ensureWhatsAppStarted } = require("./whatsapp-lifecycle");
  return ensureWhatsAppStarted();
}

module.exports = { mountApiRoutes, startServices };
