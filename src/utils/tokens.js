/**
 * V1 — MODE STATELESS
 *
 * Le token EST le sessionId.
 * Aucune persistance fichier (incompatible DigitalOcean).
 */

function createToken(sessionId) {
  // On retourne directement le sessionId comme token
  return sessionId;
}

function getSessionIdFromToken(token) {
  // Le token EST le sessionId
  return token || null;
}

module.exports = {
  createToken,
  getSessionIdFromToken,
};
