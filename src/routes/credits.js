const express = require("express");
const { getCredits } = require("../utils/credits");
const { getSessionIdFromToken } = require("../utils/tokens");

const router = express.Router();

/**
 * GET /credits
 * Retourne le nombre de crédits restants pour le token courant
 */
router.get("/", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(403).json({ error: "token manquant" });
  }

  const sessionId = getSessionIdFromToken(token);
  if (!sessionId) {
    return res.status(403).json({ error: "token invalide" });
  }

  const credits = getCredits(sessionId);

  res.json({ credits });
});

module.exports = router;
