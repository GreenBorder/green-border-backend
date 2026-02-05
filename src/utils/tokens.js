const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "../storage/tokens.json");

function readTokens() {
  if (!fs.existsSync(FILE_PATH)) return {};
  return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
}

function writeTokens(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function createToken(sessionId) {
  const token = crypto.randomBytes(32).toString("hex");
  const data = readTokens();
  data[token] = sessionId;
  writeTokens(data);
  return token;
}

function getSessionIdFromToken(token) {
  const data = readTokens();
  return data[token];
}

module.exports = {
  createToken,
  getSessionIdFromToken,
};
