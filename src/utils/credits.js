const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "../storage/credits.json");

function readCredits() {
  return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
}

function writeCredits(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function addCredits(sessionId, amount) {
  const data = readCredits();
  data[sessionId] = (data[sessionId] || 0) + amount;
  writeCredits(data);
}

function consumeCredit(sessionId) {
  const data = readCredits();
  if (!data[sessionId] || data[sessionId] <= 0) {
    return false;
  }
  data[sessionId] -= 1;
  writeCredits(data);
  return true;
}

function getCredits(sessionId) {
  const data = readCredits();
  return data[sessionId] || 0;
}

module.exports = {
  addCredits,
  consumeCredit,
  getCredits,
};
