const fb = require("../firebase/admin");
const { getBotConfig } = require("./botState");

async function getDefaultPhotographerIds() {
  const cfg = await getBotConfig();
  return Array.isArray(cfg.defaultPhotographerIds) ? cfg.defaultPhotographerIds : [];
}

async function getPhotographersList() {
  const snap = await fb.db.collection("users").where("role", "==", "photographer").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { getDefaultPhotographerIds, getPhotographersList };
